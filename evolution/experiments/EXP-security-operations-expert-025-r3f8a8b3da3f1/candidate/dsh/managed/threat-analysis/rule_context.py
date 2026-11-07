"""只读规则收集器；不调用模型、规则写入或SOC规则校验。
预算为调用前软截止，调用内超时由独立gateway(timeout=15)约束。
"""
from __future__ import annotations

import copy
import hashlib
import json
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from rule_evidence import prepare_rule_evidence

SCHEMA_VERSION = 'soc.rule-optimization-context/1'
BUILDER_VERSION = '20261102.4-evidence-scope'
MAX_CALLS, MAX_SECONDS, MAX_PAGES, MAX_DETAILS = 64, 120, 100000, 24
CONTEXT_LIMIT = 59000
TOOLS = {
    'hits': ('ai_soc_correlate', 'get_correlate_incident_rule_hits'),
    'hit': ('ai_soc_correlate', 'get_incident_rule_hits_by_hit_id'),
    'window': ('ai_soc_correlate', 'get_correlate_rule_by_rule_id'),
    'reasoning': ('ai_soc_correlate', 'get_correlate_reasoning_rules_definition'),
    'alert': ('ai_soc_detect', 'get_detect_alert_by_alert_id'),
    'detection': ('ai_soc_detect', 'get_detect_rule_by_rule_id'),
}


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def content_digest(value):
    return hashlib.sha256(json_bytes(value)).hexdigest()


def parse_json(value):
    if not isinstance(value, str):
        return value
    def pairs(rows):
        result = {}
        for key, item in rows:
            if key in result:
                raise ValueError('duplicate JSON key')
            result[key] = item
        return result
    def invalid(value):
        raise ValueError('invalid JSON constant')
    parsed = json.loads(value, object_pairs_hook=pairs, parse_constant=invalid)
    json_bytes(parsed)
    return parsed


def first(row, *keys):
    return next((row[k] for k in keys if row.get(k) not in (None, '')), None)


def identifier(value):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError('ID must be a lossless string or integer, never float')
    result = str(value)
    if not result or result != result.strip():
        raise ValueError('empty or padded ID')
    return result


def unwrap(response):
    result = response.get('result')
    if (str(response.get('status', '')).lower() not in {'ok', 'success'}
            or response.get('status_code') not in (None, 200, '200')
            or not isinstance(result, dict) or result.get('code') not in (200, '200')
            or response.get('isError') or result.get('isError') or result.get('_truncated')):
        raise ValueError('unsuccessful, unverified or truncated MCP response')
    return result.get('data')


def association_identity(hit):
    rid = identifier(hit.get('ruleId'))
    kind = str(hit.get('ruleType') or '').upper()
    if rid.startswith('reasoning:'):
        query = rid[len('reasoning:'):]
        if not query.isdigit() or int(query) <= 0 or kind not in {'', 'REASONING'}:
            raise ValueError('conflicting reasoning identity')
        family = 'reasoning'
    elif ':' not in rid and kind in {'THRESHOLD', 'SEQUENCE', 'JOIN', 'RATE', 'ABSENCE', 'LATERAL_MOVEMENT'}:
        family, query = 'window', rid
    elif ':' not in rid and kind == 'REASONING' and rid.isdigit() and int(rid) > 0:
        family, query = 'reasoning', rid
    else:
        raise ValueError('unproven rule family or namespace; no bare-ID probing')
    version = first(hit, 'ruleVersion', 'version')
    version = identifier(version) if version is not None else None
    snapshot = hit.get('ruleSnapshot')
    boundary = version or ('snapshot:' + content_digest(snapshot) if snapshot else 'hit:' + identifier(hit.get('hitId')))
    identity = {'category': 'association', 'family': family, 'id': rid, 'version': version, 'name': hit.get('ruleName')}
    return identity, query, (family, rid, boundary)


def alert_references(value):
    value = parse_json(value)
    if isinstance(value, dict):
        value = first(value, 'items', 'alerts') or []
    if not isinstance(value, list):
        raise ValueError('alert references must be an array')
    result = []
    for item in value:
        row = dict(item) if isinstance(item, dict) else {'alertId': item}
        row['alertId'] = identifier(first(row, 'alertId', 'alert_id', 'id'))
        result.append(row)
    return result


def detection_identity(alert, reference):
    rid = identifier(first(alert, 'rule_id', 'ruleId') or first(reference, 'ruleId', 'rule_id'))
    source = str(alert.get('source') or reference.get('source') or '')
    ocsf = alert.get('ocsf') or {}
    metadata = (ocsf.get('metadata') or {}) if isinstance(ocsf, dict) else {}
    product = metadata.get('product') if isinstance(metadata, dict) else {}
    product = str(product.get('name') or '') if isinstance(product, dict) else ''
    tags = [metadata.get('labels', []), metadata.get('tags', [])] if isinstance(metadata, dict) else []
    soc_tag = isinstance(metadata, dict) and metadata.get('soc.origin') == 'detect'
    for rows in tags:
        for tag in rows if isinstance(rows, list) else []:
            soc_tag = soc_tag or tag == 'soc.origin:detect' or (isinstance(tag, dict) and tag.get('name') == 'soc.origin' and tag.get('value') == 'detect')
    label = (source + ' ' + product).lower()
    if rid.lower().startswith('edr:') or 'wazuh' in label or 'edr' in label:
        return None, {'id': rid, 'source': source, 'product': product, 'reason': 'EXTERNAL_DETECTION_RULE'}
    if (not soc_tag and source.lower() not in {'detect', 'soc', 'soc detect', 'soc detection', 'ai-soc-detect', 'ai_soc_detect'}) or ':' in rid:
        raise ValueError('SOC detection ownership or namespace unconfirmed')
    version = first(alert, 'ruleVersion', 'rule_version') or first(reference, 'ruleVersion', 'rule_version')
    version = identifier(version) if version is not None else None
    return {'category': 'detection', 'family': 'detection', 'id': rid, 'source': source,
            'version': version, 'name': first(alert, 'ruleName', 'rule_name')}, None


def detection_definition_check(data, requested_rule_id):
    """仅核对定义身份和JSON载体完整性，不验证DSL或执行效果。"""
    result = {'identity_status': 'unverified', 'completeness': 'incomplete', 'rule_type': None, 'errors': []}
    if not isinstance(data, dict):
        result['errors'].append('DEFINITION_OBJECT_MISSING')
        return result
    try:
        if identifier(data.get('ruleId')) != identifier(requested_rule_id):
            raise ValueError('different business ruleId')
        result['identity_status'] = 'verified'
    except ValueError:
        result['errors'].append('BUSINESS_RULE_ID_MISSING_OR_MISMATCH')
    kind = data.get('ruleType')
    result['rule_type'] = kind
    fields = {'SINGLE_EVENT': 'conditionJson', 'THRESHOLD': 'conditionJson', 'DISTINCT_COUNT': 'conditionJson',
              'SIGMA': 'conditionJson', 'SEQUENCE': 'sequenceJson', 'FREQUENCY': 'frequencyConfig',
              'ABSENCE': 'absenceConfig', 'RATE': 'conditionJson'}
    field = fields.get(kind) if isinstance(kind, str) else None
    if field is None:
        result['completeness'] = 'unknown'
        result['errors'].append('RULE_TYPE_UNSUPPORTED_OR_MISSING')
        return result
    value = data.get(field)
    if kind == 'SIGMA':
        if not isinstance(value, str) or not value.strip():
            result['errors'].append('SIGMA_CONDITION_YAML_MISSING')
    else:
        try:
            parsed = parse_json(value)
            if not isinstance(parsed, (dict, list)) or not parsed:
                raise ValueError('empty or scalar JSON definition')
        except (ValueError, TypeError):
            result['errors'].append(field + ':JSON_BODY_MISSING_OR_INVALID')
    if kind == 'RATE':
        for key in ('rateCount', 'rateWindowSeconds'):
            if data.get(key) in (None, ''):
                result['errors'].append(key + ':MISSING')
    if not result['errors']:
        result['completeness'] = 'complete'
    return result


def build_evidence_index(base_result, hits, alert_mapping):
    """仅白名单事实ID、真实hitId与案内映射alertId，不遍历规则正文。"""
    def valid_id(value):
        try:
            return identifier(value)
        except ValueError:
            return None
    facts = base_result.get('verified_facts', []) if isinstance(base_result, dict) else []
    fact_ids = {valid_id(row.get('id')) for row in facts if isinstance(row, dict)} if isinstance(facts, list) else set()
    hit_ids = {valid_id(row.get('hitId')) for row in hits if isinstance(row, dict)}
    fact_ids.discard(None)
    hit_ids.discard(None)
    alert_ids = set()
    for row in alert_mapping:
        if not isinstance(row, dict) or not isinstance(row.get('sources'), list):
            continue
        anchored = any(source == 'incident' or (isinstance(source, str) and source.startswith('hit:') and source[4:] in hit_ids) for source in row['sources'])
        aid = valid_id(row.get('alertId'))
        if anchored and aid is not None:
            alert_ids.add(aid)
    return {'policy': 'verified_fact_ids_and_collected_hit_ids_and_incident_mapped_alert_ids_only',
            'verified_fact_ids': sorted(fact_ids), 'hit_ids': sorted(hit_ids), 'alert_ids': sorted(alert_ids),
            'allowed_evidence_refs': sorted(fact_ids | hit_ids | alert_ids)}


class Collector:
    def __init__(self, incident_id, gateway, output):
        self.incident_id, self.gateway, self.output = incident_id, gateway, output
        self.started, self.calls = time.monotonic(), 0
        self.gaps, self.ledger, self.pages = [], [], []
        self.exhausted, self.incident, self.evidence_time_range = False, None, None

    def gap(self, code, stage, source, message):
        row = {'id': 'RG%05d' % (len(self.gaps) + 1), 'code': code, 'stage': stage, 'source': str(source), 'message': str(message)}
        self.gaps.append(row)
        return row['id']

    def save(self, name, value):
        path = self.output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(json_bytes(value) + b'\n')
        return str(path)

    def call(self, operation, arguments):
        if self.calls >= MAX_CALLS or time.monotonic() - self.started >= MAX_SECONDS:
            if not self.exhausted:
                self.gap('COLLECTION_BUDGET', 'collection', operation, {'calls': self.calls, 'max_calls': MAX_CALLS, 'max_seconds': MAX_SECONDS})
            self.exhausted = True
            return None
        self.calls += 1
        cid = 'RC%06d' % self.calls
        resource, name = TOOLS[operation]
        row = {'call_id': cid, 'tool': name, 'key_arguments': arguments,
               'argument_sources': {k: 'frozen incident/rule-hit identity' for k in arguments},
               'output_domain': 'rule_context', 'audit': {'resource': resource, 'exact_tool': resource + '__' + name}}
        self.ledger.append(row)
        started = time.monotonic()
        try:
            result = self.gateway.invoke(call_id=cid, resource=resource, tool_name=resource + '__' + name, arguments=arguments)
            row['audit']['raw_response_file'] = self.save('raw/' + cid + '.json', result.response)
            row['gateway_outcome'] = str(getattr(result.outcome, 'value', result.outcome))
            data = unwrap(result.response)
            row.update(status='success_empty' if data in (None, {}, []) else 'success_with_data')
            return data
        except Exception as error:
            row['status'] = 'failed'
            row['error_type'] = type(error).__name__
            self.gap('CALL_FAILED', operation, cid, type(error).__name__)
            return None
        finally:
            row['latency_ms'] = round((time.monotonic() - started) * 1000)

    def frozen(self, fusion_dir):
        root = Path(fusion_dir).resolve()
        ledger = parse_json((root / 'call-ledger.audit.json').read_text(encoding='utf-8'))
        incident, alerts = None, {}
        for entry in ledger:
            tool, args = entry.get('tool'), entry.get('key_arguments', {})
            if tool not in {'get_correlate_incident_by_incident_id', 'get_detect_alert_by_alert_id'}:
                continue
            if tool.startswith('get_correlate') and args.get('incidentId') != self.incident_id:
                continue
            if entry.get('status') not in {'success_with_data', 'success_empty'}:
                continue
            try:
                raw = Path(entry['audit']['raw_response_file'])
                raw = raw if raw.is_absolute() else root / raw
                if not raw.resolve().is_relative_to(root) or not raw.is_file():
                    raw = root / 'raw' / raw.name
                if not raw.resolve().is_relative_to(root):
                    raise ValueError('frozen raw path escapes fusion directory')
                data = unwrap(response := parse_json(raw.read_text(encoding='utf-8')))
                if not isinstance(data, dict) or not data:
                    raise ValueError('missing frozen object')
                own = copy.deepcopy(entry)
                own['reused'] = True
                own['audit']['raw_response_file'] = self.save('raw/F%06d.json' % (len(self.ledger) + 1), response)
                self.ledger.append(own)
                if tool.startswith('get_correlate'):
                    if incident is not None and content_digest(incident) != content_digest(data):
                        raise ValueError('conflicting frozen incident snapshots')
                    incident = data
                else:
                    aid = identifier(args.get('alertId'))
                    if aid in alerts and content_digest(alerts[aid]) != content_digest(data):
                        raise ValueError('conflicting frozen alert snapshots')
                    alerts[aid] = data
            except Exception as error:
                self.gap('FROZEN_RECEIPT_INVALID', 'reuse', entry.get('call_id'), type(error).__name__)
        self.incident = incident
        snapshot_file = root / 'five-source-output.json'
        if snapshot_file.is_file():
            snapshot = parse_json(snapshot_file.read_text(encoding='utf-8'))
            if snapshot.get('unified_event_id') == self.incident_id:
                self.evidence_time_range = snapshot.get('event_snapshot', {}).get('time_range')
        return incident, alerts

    def hits(self):
        hits, seen, totals = [], set(), set()
        expected = None
        for page in range(1, MAX_PAGES + 1):
            data = self.call('hits', {'incidentId': self.incident_id, 'pageNum': page, 'pageSize': 50})
            if not isinstance(data, dict) or not isinstance(data.get('rows'), list):
                self.gap('HIT_PAGE_UNAVAILABLE', 'association', page, 'rows unavailable; not an empty collection')
                break
            rows = data['rows']
            try:
                total = data['total']
                if isinstance(total, bool) or not isinstance(total, (int, str)) or not str(total).isdigit():
                    raise ValueError('invalid total')
                total = int(total)
                totals.add(total)
                expected = max(totals)
            except (KeyError, ValueError):
                self.gap('HIT_TOTAL_INVALID', 'association', page, 'stable total required')
                break
            duplicates = 0
            for hit in rows:
                try:
                    hid = identifier(hit.get('hitId'))
                    if hit.get('incidentId') not in (None, self.incident_id):
                        raise ValueError('foreign incident hit')
                    if hid in seen:
                        duplicates += 1
                        continue
                    seen.add(hid)
                    hits.append(hit)
                except (AttributeError, ValueError):
                    self.gap('HIT_ID_INVALID', 'association', page, 'missing, lossy or foreign identity')
            self.pages.append({'pageNum': page, 'pageSize': 50, 'count': len(rows), 'total': total,
                               'duplicates': duplicates, 'collected_at': datetime.now(timezone.utc).isoformat()})
            if duplicates or len(rows) > 50 or data.get('pageNum', page) not in (page, str(page)):
                self.gap('HIT_PAGE_INTEGRITY', 'association', page, 'duplicate, oversized or wrong-order page')
            if len(rows) != min(50, max(total - (page - 1) * 50, 0)):
                self.gap('HIT_PAGE_SIZE_MISMATCH', 'association', page, 'short/extra page against reported total')
            if not rows or page * 50 >= expected:
                break
        if len(totals) != 1 or expected != len(seen):
            self.gap('HIT_COLLECTION_INCOMPLETE', 'association', 'pages', {'totals': sorted(totals), 'unique_hits': len(seen)})
        return hits


def compact_hit_detail(value):
    if isinstance(value, dict):
        return {k: compact_hit_detail(v) for k, v in value.items()
                if k not in {'raw', 'raw_data', 'raw_event', 'rawData', 'rawEvent', 'timelineStep', 'ruleSnapshot'}}
    return [compact_hit_detail(v) for v in value] if isinstance(value, list) else value


def reduce_context(context, omissions, phase):
    """每轮跨所有目标缩减同类内容；永不删除规则身份行，不执行源规则。"""
    changed = False
    previous_count = context.get('model_budget_boundary', {}).get('omitted_component_count', 0)
    initial_omissions = len(omissions)
    for field in ('association_rules', 'detection_rules', 'excluded_rules'):
        for index, row in enumerate(context.get(field, [])):
            if not isinstance(row, dict):
                continue
            path = field + '/' + str(index)
            code = None
            elements = []
            if phase == 0:
                for number, snapshot in enumerate(row.get('definition_snapshot', [])):
                    if isinstance(snapshot, dict) and 'content' in snapshot:
                        snapshot.pop('content')
                        source_paths = snapshot.get('source_audit_paths') or ['rule-context.audit.json#/' + path + '/definition_snapshot/' + str(number)]
                        snapshot['content_audit'] = [v + '/content' for v in source_paths]
                        elements.extend(snapshot['content_audit'])
                        changed, code = True, 'HISTORICAL_BODY_IN_AUDIT'
            elif phase == 1 and len(row.get('alert_evidence', [])) > 1:
                removed = row['alert_evidence'].pop()
                elements.append({'source_alert_id': removed.get('source_alert_id'), 'source_audit_path': removed.get('source_audit_path')})
                row.setdefault('alert_evidence_budget', {})['sample_reduction'] = True
                row['alert_evidence_budget']['remaining_samples'] = len(row['alert_evidence'])
                changed, code = True, 'ALERT_SAMPLE_MODEL_BUDGET'
            elif phase == 2:
                for number, hit in enumerate(row.get('representative_hits', [])):
                    detail = hit.get('detail') if isinstance(hit, dict) else None
                    if isinstance(detail, dict) and set(detail) - {'kind', 'ruleId', 'version', 'evidenceStatus', 'alerts'}:
                        hit['detail'] = {k: copy.deepcopy(v) for k, v in detail.items()
                                         if k in {'kind', 'ruleId', 'version', 'evidenceStatus', 'alerts'}}
                        hit['detail_audit'] = 'rule-context.audit.json#/' + path + '/representative_hits/' + str(number) + '/detail'
                        hit['projection_status'] = 'identity_and_alert_links_only'
                        changed, code = True, 'HIT_DETAIL_MODEL_BUDGET'
            elif phase == 3:
                for sample in row.get('alert_evidence', []):
                    values = sample.get('fields') if isinstance(sample, dict) else None
                    if isinstance(values, dict) and values:
                        key = next(reversed(values))
                        value = values.pop(key)
                        sample['projection_status'] = 'partial'
                        elements.append({'source_alert_id': sample.get('source_alert_id'),
                            'source_audit_path': sample.get('source_audit_path'),
                            'field_path': key, 'value_sha256': content_digest(value)})
                        info = sample.setdefault('model_input_budget', {'omitted_field_count': 0})
                        info['omitted_field_count'] += 1
                        info['status'] = 'source_fields_not_fully_projected'
                        info['source_audit_path'] = sample.get('source_audit_path')
                        changed, code = True, 'ALERT_FIELD_MODEL_BUDGET'
            elif phase == 5 and isinstance(row.get('current_definition'), dict):
                current = row['current_definition']
                if 'content' in current:
                    current.pop('content')
                    current['content_audit'] = 'rule-context.audit.json#/' + path + '/current_definition/content'
                    current['projection_status'] = 'definition_not_in_model_due_to_budget'
                    changed, code = True, 'CURRENT_BODY_MODEL_BUDGET'
            if code is not None:
                omissions.append({'source': path, 'code': code, 'identity': copy.deepcopy(row.get('identity')),
                                  'omitted_elements': elements,
                                  'meaning': '仅本次模型未包含完整内容，不能推断原始材料不存在'})
                row.setdefault('projection_boundary', {})['model_budget_reduced'] = True
                if isinstance(row.get('evidence_scope'), dict):
                    scope = row['evidence_scope']
                    scope.setdefault('initial_projection', {k: copy.deepcopy(scope.get(k)) for k in (
                        'alert_ids', 'selected_alert_count', 'rule_evidence_utf8_bytes', 'sampling_status')})
                    actual = [v.get('source_alert_id') for v in row.get('alert_evidence', []) if isinstance(v, dict)]
                    scope.update(alert_ids=actual, model_projected_alert_ids=actual, selected_alert_count=len(actual),
                        rule_evidence_utf8_bytes=len(json_bytes(row.get('alert_evidence', []))),
                        sampling_status='partial' if actual else 'unavailable')
                    scope['final_model_projection_reduced'] = True
    if phase == 4 and isinstance(context.get('threat_judgement'), dict) and not context['threat_judgement'].get('audit_ref'):
        original = context['threat_judgement']
        context['threat_judgement'] = {k: copy.deepcopy(original[k]) for k in ('unified_event_id', 'verdict', 'confidence_score') if k in original}
        context['threat_judgement'].update(audit_ref='rule-context.audit.json#/threat_judgement',
                                          projection_status='reference_details_not_in_model_due_to_budget')
        omissions.append({'source': 'threat_judgement', 'code': 'BASE_REFERENCE_MODEL_BUDGET'})
        changed = True
    if changed:
        context['collection_status'] = 'failed' if context.get('collection_status') == 'failed' else 'partial'
        context['model_budget_boundary'] = {'omitted_component_count': previous_count + len(omissions) - initial_omissions,
            'audit_reference': 'rule-context.audit.json', 'source_absence_not_proven': True,
            'target_identity_rows_preserved': True}
    return changed


def project_context(audit, limit=CONTEXT_LIMIT):
    prepared = prepare_rule_evidence(audit)
    context = {k: copy.deepcopy(audit[k]) for k in ('schema_version', 'builder_version', 'incident_id',
               'collected_at', 'input_digest', 'threat_judgement', 'evidence_time_range', 'collection_status')}
    context.update(association_rules=[], detection_rules=[], excluded_rules=[], collection_gaps=copy.deepcopy(audit['collection_gaps']),
                   counts=copy.deepcopy(audit['counts']), gate_reason=audit.get('gate_reason'),
                   allowed_evidence_refs=copy.deepcopy(audit.get('evidence_index', {}).get('allowed_evidence_refs', [])),
                   global_collection_gaps=prepared['global_collection_gaps'],
                   unassigned_collection_gaps=prepared['unassigned_collection_gaps'],
                   gap_attribution_policy='only_target_scoped_gaps_identify_affected_rule_or_alert; global_is_coverage_only')
    omitted = []
    # 先保所有目标，而不是将排在后面的检测规则从模型输入中整行删掉。
    for field in ('association_rules', 'detection_rules', 'excluded_rules'):
        for row_index, row in enumerate(prepared[field]):
            row_path = field + '/' + str(row_index)
            candidate = copy.deepcopy(row)
            current = candidate.get('current_definition', {})
            if (current.get('identity_status') == 'conflict'
                    or (field == 'detection_rules' and current.get('completeness_check', {}).get('identity_status') != 'verified')):
                current.pop('content', None)
                current['content_audit'] = 'rule-context.audit.json#/' + row_path + '/current_definition/content'
            if 'representative_hits' in candidate:
                candidate['representative_hits'] = [{'hitId': h['hitId'], 'detail': compact_hit_detail({k: v for k, v in h['detail'].items()
                    if k in {'kind', 'ruleId', 'version', 'evidenceStatus', 'alerts', 'reasoning', 'evaluation', 'evaluationPath', 'bindings', 'evidenceRefs'}})}
                    for h in candidate['representative_hits']]
            if 'definition_snapshot' in candidate:
                snapshots = {}
                for snapshot_index, snapshot in enumerate(candidate['definition_snapshot']):
                    key = (snapshot.get('version'), snapshot['sha256'])
                    entry = snapshots.setdefault(key, {**snapshot, 'hitIds': [], 'source_audit_paths': []})
                    entry['hitIds'].append(snapshot['hitId'])
                    entry['source_audit_paths'].append('rule-context.audit.json#/' + row_path + '/definition_snapshot/' + str(snapshot_index))
                candidate['definition_snapshot'] = list(snapshots.values())
            if 'refs' in candidate:
                candidate['refs_total_count'] = len(candidate['refs'])
                candidate['refs_sampled'] = len(candidate['refs']) > 3
                original_refs = candidate['refs']
                selected = []
                if field == 'detection_rules':
                    actual_ids = {v.get('source_alert_id') for v in candidate.get('alert_evidence', []) if isinstance(v, dict)}
                    selected = [ref for ref in original_refs if isinstance(ref, dict) and ref.get('alertId') in actual_ids]
                elif field == 'association_rules':
                    actual_hits = {v.get('hitId') for v in candidate.get('representative_hits', []) if isinstance(v, dict)}
                    selected = [ref for ref in original_refs if isinstance(ref, str) and ref in actual_hits]
                # 样本只决定原可信refs中的保留顺序，不产生新ID或信任scope自报。
                selected = selected[:3]
                for ref in original_refs:
                    if len(selected) >= 3:
                        break
                    if ref not in selected:
                        selected.append(copy.deepcopy(ref))
                candidate['refs'] = selected
                candidate['refs_sampled'] = len(selected) < len(original_refs)
                candidate['refs_audit'] = 'rule-context.audit.json#/' + row_path + '/refs'
            context[field].append(candidate)
            scope = candidate.get('evidence_scope', {})
            if scope.get('sampling_status') not in (None, 'complete') and context['collection_status'] not in {'failed', 'not_applicable'}:
                context['collection_status'] = 'partial'
    # 为targets及模型运行说明保留余量；最终60000口径另以系统+用户内容精确核对。
    for phase in range(6):
        while len(json_bytes(context)) > limit - 10000:
            if not reduce_context(context, omitted, phase):
                break
    if len(json_bytes(context)) >= limit:
        raise ValueError('context identity skeleton exceeds UTF-8 budget; no targets silently removed')
    return context, omitted


def _collect(c, base, fusion_dir):
    incident, cached_alerts = c.frozen(fusion_dir)
    if not incident:
        raise ValueError('frozen incident receipt unavailable')
    refs = {}
    def add_refs(rows, source):
        for row in alert_references(rows):
            aid = row['alertId']
            current = refs.setdefault(aid, {'reference': row, 'sources': []})
            old_rule, new_rule = first(current['reference'], 'ruleId', 'rule_id'), first(row, 'ruleId', 'rule_id')
            if old_rule and new_rule and str(old_rule) != str(new_rule):
                c.gap('ALERT_RULE_REFERENCE_CONFLICT', 'detection', aid, 'participating-alert references disagree on rule identity')
            if source not in current['sources']:
                current['sources'].append(source)
    add_refs(first(incident, 'contributingAlertsJson', 'contributing_alerts_json', 'contributingAlerts') or [], 'incident')
    count = incident.get('contributingAlertCount')
    if count is None or str(count) != str(len(refs)) or any(incident.get(k) for k in ('contributingAlertsTruncated', 'alertsTruncated', '_truncated')):
        c.gap('ALERT_REFERENCE_INCOMPLETE', 'detection', 'incident', {'declared': count, 'referenced': len(refs)})
    hits = c.hits()
    groups = {}
    for hit in hits:
        try:
            ident, query, key = association_identity(hit)
            group = groups.setdefault(key, {'identity': ident, 'query_id': query, 'refs': [], 'definition_snapshot': [], 'observed': {'hit_count': 0, 'details_read': 0}})
            group['refs'].append(identifier(hit['hitId']))
            group['observed']['hit_count'] += 1
            if ident['version'] is None:
                c.gap('HIT_VERSION_UNKNOWN', 'association', hit['hitId'], 'unknown versions merge only with identical frozen snapshot digest')
        except ValueError as error:
            c.gap('RULE_IDENTITY_UNRESOLVED', 'association', hit.get('hitId'), str(error))
    families = defaultdict(list)
    for group in groups.values():
        families[group['identity']['family']].append(group)
    slots = [group for i in range(max((len(v) for v in families.values()), default=0)) for family in sorted(families) for group in families[family][i:i + 1]]
    details, definitions = 0, {}
    for sample in range(3):
        for group in slots:
            if sample >= len(group['refs']) or details >= MAX_DETAILS or c.exhausted:
                continue
            hid = group['refs'][sample]
            data = c.call('hit', {'incidentId': c.incident_id, 'hitId': hid})
            details += 1
            if not isinstance(data, dict):
                continue
            actual_version = first(data, 'version', 'ruleVersion')
            if (data.get('ruleId') not in (None, group['identity']['id']) or data.get('incidentId') not in (None, c.incident_id)
                    or data.get('hitId') not in (None, hid) or (group['identity']['version'] is not None and actual_version is not None and str(actual_version) != group['identity']['version'])):
                c.gap('HIT_DETAIL_IDENTITY_CONFLICT', 'association', hid, 'detail identity differs from hit index')
                continue
            if data.get('evidenceStatus') not in (None, 'COMPLETE'):
                c.gap('HIT_EVIDENCE_INCOMPLETE', 'association', hid, data.get('evidenceStatus'))
            group['observed']['details_read'] += 1
            group.setdefault('representative_hits', []).append({'hitId': hid, 'detail': data})
            if isinstance(data.get('ruleSnapshot'), dict):
                snapshot = data['ruleSnapshot']
                group['definition_snapshot'].append({'hitId': hid, 'version': first(data, 'version', 'ruleVersion'), 'sha256': content_digest(snapshot), 'content': snapshot})
            else:
                c.gap('HIT_SNAPSHOT_MISSING', 'association', hid, 'historical rule body unavailable')
            try:
                add_refs(data.get('alerts', []), 'hit:' + hid)
            except ValueError:
                c.gap('HIT_ALERTS_INVALID', 'detection', hid, 'invalid participating-alert references')
    if count is not None and str(count) != str(len(refs)):
        c.gap('ALERT_REFERENCE_INCOMPLETE', 'detection', 'event/hit union', {'declared': count, 'union': len(refs)})
    for group in slots:
        observed = group['observed']
        observed['details_are_sampled'] = observed['details_read'] < observed['hit_count']
        if observed['details_read'] < min(3, observed['hit_count']):
            c.gap('HIT_DETAIL_BUDGET_OR_FAILURE', 'association', group['identity']['id'], dict(observed))
        family, query = group['identity']['family'], group.pop('query_id')
        key = (family, query)
        if key not in definitions:
            data = c.call(family, {'ruleId': query})
            definitions[key] = {'source': 'current_definition', 'endpoint': TOOLS[family][1], 'version': first(data, 'version', 'ruleVersion') if isinstance(data, dict) else None,
                                'sha256': content_digest(data), 'content': data}
            required = 'bodyJson' if family == 'reasoning' else {'THRESHOLD': 'conditionJson', 'SEQUENCE': 'sequenceJson', 'JOIN': 'joinJson'}.get(str(data.get('ruleType'))) if isinstance(data, dict) else None
            if not isinstance(data, dict) or not data or (required and data.get(required) in (None, '')):
                c.gap('RULE_DEFINITION_INCOMPLETE', 'association', query, 'full current definition unavailable')
        group['current_definition'] = definitions[key]
        current = definitions[key]['content']
        if isinstance(current, dict):
            actual_id = first(current, 'ruleId', 'id')
            if actual_id is not None and str(actual_id) not in {query, group['identity']['id']}:
                definitions[key]['identity_status'] = 'conflict'
                c.gap('DEFINITION_IDENTITY_CONFLICT', 'association', query, 'current endpoint returned another ID')
            group['identity']['name'] = group['identity']['name'] or current.get('name')
            if current.get('ruleType') in {'RATE', 'ABSENCE', 'LATERAL_MOVEMENT'}:
                c.gap('HISTORICAL_RULE_TYPE', 'association', query, 'migration constraint; not a currently creatable rule type')
            for field in ('bodyJson', 'conditionJson', 'sequenceJson', 'joinJson'):
                if current.get(field) is None:
                    continue
                try:
                    body = parse_json(current[field])
                    if isinstance(body, dict) and str(body.get('schema') or body.get('schemaVersion') or '').startswith('soc.correlation.scenario-draft/'):
                        c.gap('NON_EXECUTABLE_DRAFT', 'association', query, 'scenario draft is not executable scenario content')
                    if '"ruleMatch"' in json_bytes(body).decode('utf-8'):
                        c.gap('RULEMATCH_DEPENDENCY_NOT_EXPANDED', 'association', query, 'existing reference retained; dependency-version closure not established')
                except (ValueError, TypeError):
                    c.gap('DEFINITION_JSON_INVALID', 'association', query + '/' + field, 'claimed JSON body cannot be parsed')
    detection, excluded, alert_audit = {}, [], []
    for aid, reference in refs.items():
        alert = cached_alerts.get(aid)
        ref = reference['reference']
        if alert is None and not str(first(ref, 'ruleId', 'rule_id') or '').lower().startswith('edr:') and not c.exhausted:
            alert = c.call('alert', {'alertId': aid})
        alert = alert if isinstance(alert, dict) else {}
        alert_audit.append({'alertId': aid, 'detail': alert, 'snapshot_source': 'frozen_fusion' if aid in cached_alerts else 'rule_stage_query', **reference})
        if first(alert, 'alertId', 'alert_id', 'id') not in (None, aid):
            c.gap('ALERT_IDENTITY_CONFLICT', 'detection', aid, 'detail returned another alert')
            continue
        actual_rule, referenced_rule = first(alert, 'ruleId', 'rule_id'), first(ref, 'ruleId', 'rule_id')
        if actual_rule and referenced_rule and str(actual_rule) != str(referenced_rule):
            c.gap('ALERT_RULE_REFERENCE_CONFLICT', 'detection', aid, 'alert detail differs from frozen reference')
        try:
            ident, exclusion = detection_identity(alert, ref)
            if exclusion:
                excluded.append({**exclusion, 'alertId': aid, 'refs': reference['sources']})
                continue
            boundary = ident['version'] or 'snapshot:' + content_digest(alert)
            key = (ident['source'], ident['id'], boundary)
            group = detection.setdefault(key, {'identity': ident, 'refs': [], 'observed': {'alert_count': 0}})
            group['refs'].append({'alertId': aid, 'sources': reference['sources']})
            group['observed']['alert_count'] += 1
            if ident['version'] is None:
                c.gap('DETECTION_VERSION_UNKNOWN', 'detection', aid, 'current definition does not recover historical version')
        except (ValueError, AttributeError):
            c.gap('DETECTION_OWNERSHIP_UNRESOLVED', 'detection', aid, 'source, namespace or lossless rule ID unavailable')
    for group in detection.values():
        rid = group['identity']['id']
        key = ('detection', rid)
        if key not in definitions:
            data = c.call('detection', {'ruleId': rid})
            check = detection_definition_check(data, rid)
            definitions[key] = {'source': 'current_definition', 'endpoint': TOOLS['detection'][1], 'version': first(data, 'version', 'ruleVersion') if isinstance(data, dict) else None,
                                'sha256': content_digest(data), 'content': data, 'completeness_check': check}
            if check['identity_status'] != 'verified':
                c.gap('DEFINITION_IDENTITY_CONFLICT', 'detection', rid, 'exact business ruleId required; database id is not an alias')
            if check['completeness'] != 'complete':
                c.gap('RULE_DEFINITION_INCOMPLETE', 'detection', rid, check)
        group['current_definition'] = definitions[key]
    for group in [*groups.values(), *detection.values()]:
        current_version, hit_version = group['current_definition']['version'], group['identity']['version']
        boundary = {'current_version': current_version, 'hit_version': hit_version, 'historical_version_not_reused': True}
        if current_version in (None, ''):
            c.gap('CURRENT_VERSION_UNKNOWN', group['identity']['category'], group['identity']['id'], boundary)
        elif hit_version is not None and str(current_version) != str(hit_version):
            c.gap('CURRENT_HIT_VERSION_DIFFERENT', group['identity']['category'], group['identity']['id'], boundary)
    return list(groups.values()), list(detection.values()), excluded, hits, alert_audit, 'collect'


def build_rule_context(incident_id, base_result, fusion_dir, gateway, output_dir) -> dict:
    c, audit = None, {}
    try:
        incident_id = identifier(incident_id)
        output = Path(output_dir).resolve()
        names = ('rule-context.audit.json', 'rule-optimization-context.json', 'rule-call-ledger.audit.json', 'projection-omissions.json')
        if any((output / name).exists() for name in names):
            raise FileExistsError('refusing to overwrite rule-context artifacts')
        output.mkdir(parents=True, exist_ok=True)
        c = Collector(incident_id, gateway, output)
        base = parse_json(json_bytes(base_result).decode('utf-8'))
        audit = {'schema_version': SCHEMA_VERSION, 'builder_version': BUILDER_VERSION, 'incident_id': incident_id,
                 'collected_at': datetime.now(timezone.utc).isoformat(), 'input_digest': content_digest(base),
                 'threat_judgement': {k: copy.deepcopy(base[k]) for k in ('unified_event_id', 'verdict', 'primary_claim', 'verified_facts', 'key_claims', 'counter_evidence', 'uncertainty_notes', 'secondary_findings', 'confidence_score') if k in base},
                 'evidence_time_range': None, 'collection_status': 'ready',
                 'association_rules': [], 'detection_rules': [], 'excluded_rules': [], 'counts': {}}
        fast = set(base) == {'verdict', 'matches'} or base.get('analysis_type') == 'fast_classification'
        if fast:
            audit['collection_status'], audit['gate_reason'] = 'not_applicable', 'FAST_CLASSIFICATION'
        else:
            if base.get('unified_event_id') != incident_id or 'verified_facts' not in base:
                raise ValueError('full frozen base result does not match incident')
            association, detection, excluded, hits, alerts, gate = _collect(c, base, fusion_dir)
            audit.update(association_rules=association, detection_rules=detection, excluded_rules=excluded, hit_index=hits, event_alert_rule_mapping=alerts)
            if gate == 'not_applicable' or (not association and not detection and not c.gaps):
                audit['collection_status'], audit['gate_reason'] = 'not_applicable', 'NO_SOC_RULE_CANDIDATES'
            audit['counts'] = {'hit_rows': sum(p['count'] for p in c.pages), 'unique_hits': len(hits),
                'duplicate_hit_rows': sum(p['duplicates'] for p in c.pages), 'association_rule_identities': len(association),
                'association_repeated_hits_collapsed': sum(g['observed']['hit_count'] - 1 for g in association),
                'detection_rule_identities': len(detection), 'detection_repeated_refs_collapsed': sum(g['observed']['alert_count'] - 1 for g in detection),
                'excluded_alerts': len(excluded), 'invoke_calls': c.calls, 'details_are_not_full_path_distribution': True}
    except Exception as error:
        if c is None:
            return {'collection_status': 'failed', 'collection_gaps': [{'id': 'RG_SETUP', 'code': 'SETUP_FAILED', 'stage': 'setup', 'source': 'builder', 'message': type(error).__name__}], 'rule_optimization_context': None, 'artifacts': {}, 'evidence_index': {}, 'allowed_evidence_refs': []}
        c.gap('BUILDER_FAILED', 'builder', incident_id, type(error).__name__)
        audit['collection_status'] = 'failed'
    try:
        if not c.exhausted and (c.calls >= MAX_CALLS or time.monotonic() - c.started >= MAX_SECONDS):
            c.gap('COLLECTION_BUDGET', 'collection', 'finalize', {'calls': c.calls, 'elapsed_seconds': round(time.monotonic() - c.started, 3)})
        audit['collection_gaps'] = c.gaps
        if c.gaps and audit['collection_status'] not in {'failed', 'not_applicable'}:
            audit['collection_status'] = 'partial'
        elif c.gaps and audit['collection_status'] == 'not_applicable':
            audit['collection_status'] = 'partial'
        audit['pages'], audit['call_ledger'] = c.pages, c.ledger
        audit['frozen_incident'], audit['evidence_time_range'] = c.incident, c.evidence_time_range
        audit['frozen_base_result'] = base if 'base' in locals() else None
        audit['evidence_index'] = build_evidence_index(audit['frozen_base_result'], audit.get('hit_index', []), audit.get('event_alert_rule_mapping', []))
        c.save('rule-context.audit.json', audit)
        context, omissions = project_context(audit)
        audit['collection_status'] = context['collection_status']
        audit['projection_omissions'] = omissions
        artifacts = {'audit': c.save('rule-context.audit.json', audit), 'context': c.save('rule-optimization-context.json', context),
                     'ledger': c.save('rule-call-ledger.audit.json', c.ledger), 'omissions': c.save('projection-omissions.json', omissions)}
        return {'collection_status': context['collection_status'], 'collection_gaps': context['collection_gaps'],
                'rule_optimization_context': context, 'context_utf8_bytes': len(json_bytes(context)),
                'artifacts': artifacts, 'counts': audit['counts'], 'evidence_index': audit['evidence_index'],
                'allowed_evidence_refs': audit['evidence_index']['allowed_evidence_refs']}
    except Exception as error:
        gap = c.gap('AUDIT_OR_PROJECTION_FAILED', 'finalize', 'builder', type(error).__name__)
        return {'collection_status': 'failed', 'collection_gaps': c.gaps, 'rule_optimization_context': None,
                'artifacts': {}, 'diagnostic_gap_ref': gap, 'evidence_index': audit.get('evidence_index', {}),
                'allowed_evidence_refs': audit.get('evidence_index', {}).get('allowed_evidence_refs', [])}
