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
BUILDER_VERSION = '20261103.7-soc-body-validation'
MAX_CALLS, MAX_SECONDS, MAX_PAGES, MAX_DETAILS = 64, 120, 100000, 24
CONTEXT_LIMIT = 59000
TOOLS = {
    'hits': ('ai_soc_correlate', 'get_correlate_incident_rule_hits'),
    'hit': ('ai_soc_correlate', 'get_incident_rule_hits_by_hit_id'),
    'window': ('ai_soc_correlate', 'get_correlate_rule_by_rule_id'),
    'reasoning': ('ai_soc_correlate', 'get_correlate_reasoning_rules_definition'),
    'alert': ('ai_soc_detect', 'get_detect_alert_by_alert_id'),
    'detection': ('ai_soc_detect', 'get_detect_rule_by_rule_id'),
    'reasoning_validate': ('ai_soc_correlate', 'validate_correlate_reasoning_rules'),
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
    identity = {'category': 'association', 'family': family, 'id': query, 'name': hit.get('ruleName')}
    return identity, query, (family, query)


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
    # 这是已确认SOC归属的规范命名空间，不改写alert或当前定义的原source字段。
    return {'category': 'detection', 'family': 'detection', 'id': rid, 'source': 'ai_soc_detect',
            'source_label': source, 'name': first(alert, 'ruleName', 'rule_name')}, None


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
        if operation == 'reasoning_validate':
            row['argument_sources'] = {'body': 'bound_model_candidate_bodyJson'}
            row['output_domain'] = 'soc_rule_body_validation'
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


class ContextBudgetError(ValueError):
    """最小规则、真实证据与反证无法容纳时明确失败，不删除目标凑预算。"""
    def __init__(self, message, omissions):
        super().__init__(message)
        self.omissions = copy.deepcopy(omissions)


def strip_rule_history(value):
    """只丢弃附带的旧规则正文；原始回执仍由Collector.call/frozen原样保存。"""
    if isinstance(value, dict):
        return {k: strip_rule_history(v) for k, v in value.items()
                if str(k).replace('_', '').lower() not in {'rulesnapshot', 'definitionsnapshot'}}
    return [strip_rule_history(v) for v in value] if isinstance(value, list) else value


def collected_observation(value):
    # 仅去掉观察对象顶层的规则版本元数据，不解释/改写真实求值内的字段和值。
    result = strip_rule_history(value)
    if isinstance(result, dict):
        for key in ('version', 'ruleVersion', 'rule_version'):
            result.pop(key, None)
    return result


def association_id_matches(value, identity):
    if value is None:
        return True
    try:
        actual = identifier(value)
    except ValueError:
        return False
    allowed = {identity['id']}
    if identity['family'] == 'reasoning':
        allowed.add('reasoning:' + identity['id'])
    return actual in allowed


def compact_hit_detail(value):
    if isinstance(value, dict):
        return {k: compact_hit_detail(v) for k, v in value.items()
                if k not in {'raw', 'raw_data', 'raw_event', 'rawData', 'rawEvent'}
                and str(k).replace('_', '').lower() not in {'rulesnapshot', 'definitionsnapshot'}}
    return [compact_hit_detail(v) for v in value] if isinstance(value, list) else value


def compact_excluded_rules(rows):
    """外部规则不是候选；案内相关真实告警证据仍由关联规则的alert_evidence保留。"""
    groups = {}
    for index, row in enumerate(rows):
        key = tuple(row.get(k) for k in ('id', 'source', 'product', 'reason'))
        group = groups.setdefault(key, {k: copy.deepcopy(row.get(k)) for k in ('id', 'source', 'product', 'reason')})
        group.setdefault('alert_count', 0)
        group['alert_count'] += 1
        ids = group.setdefault('alert_ids_sample', [])
        if row.get('alertId') not in ids and len(ids) < 3:
            ids.append(row.get('alertId'))
        paths = group.setdefault('source_audit_paths', [])
        if len(paths) < 3:
            paths.append('rule-context.audit.json#/excluded_rules/' + str(index))
        group['source_audit_count'] = group['alert_count']
        group['projection_status'] = 'excluded_source_summary_not_target_evidence'
    return list(groups.values())


def _substantive_evidence_paths(values):
    """非空原值优先；False/0是实际值，根告警/规则身份壳不冒充业务材料。"""
    identity_paths = {'/alertId', '/alert_id', '/id', '/source', '/ruleId', '/rule_id', '/ruleName', '/rule_name'}
    return [path for path, value in values.items()
            if path not in identity_paths and value is not None and value not in ('', {}, [])]


def _protected_evidence_fields(values):
    """保护已有的求值/进程/绑定对象代表；只选择真实路径，不合成字段或求值。"""
    substantive = _substantive_evidence_paths(values)
    # 求值可能已按叶子投影，不能只留下_reasoning的名称而裁掉全部真实求值。
    protected = {path for path in substantive if '/_reasoning' in path}
    syscheck = '/triggering_event/raw/syscheck/'
    object_paths = {syscheck + field for field in ('path', 'value_name', 'value_type', 'event', 'mode', 'changed_attributes')}
    win_event = '/triggering_event/raw/data/win/eventdata/'
    object_paths.update(win_event + field for field in ('commandLine', 'image', 'targetFilename', 'user', 'processId',
        'parentImage', 'parentCommandLine', 'parentProcessId', 'parentUser', 'utcTime', 'creationUtcTime'))
    object_paths.update({'/ocsf/device', '/ocsf/device/ip', '/ocsf/device/hostname'})
    protected.update(path for path in substantive if path in object_paths or path.startswith(syscheck + 'changed_attributes/'))
    for marker in ('/process', '/actor', '/device', '/evidences', '/finding_info'):
        matching = [path for path in substantive if marker in path]
        if matching:
            # 优先已有命令/对象原值；None/空数组不占用该类别的保护名额。
            matching.sort(key=lambda path: (not path.endswith('/cmd_line'),
                not path.endswith(('/name', '/path', '/uid', '/ip')), path))
            protected.add(matching[0])
    if substantive:
        protected.add(substantive[0])
    elif values:
        # 仅防止已有身份行被裁空，不将此兜底标为已保留实际业务证据。
        protected.add(next(iter(values)))
    return protected


def _refresh_evidence_scope(row):
    scope = row.get('evidence_scope')
    if not isinstance(scope, dict):
        return
    actual = [v.get('source_alert_id') for v in row.get('alert_evidence', []) if isinstance(v, dict)]
    scope.update(alert_ids=actual, model_projected_alert_ids=actual, selected_alert_count=len(actual),
        rule_evidence_utf8_bytes=len(json_bytes(row.get('alert_evidence', []))),
        sampling_status='partial' if actual else 'unavailable')
    scope['final_model_projection_reduced'] = True


def reduce_context(context, omissions, phase):
    """六阶段兼容：先排除/重复展开，再降样本/非核心字段；保留定义、求值、反证。"""
    changed = False
    previous_count = context.get('model_budget_boundary', {}).get('omitted_component_count', 0)
    initial_omissions = len(omissions)
    for field in ('association_rules', 'detection_rules'):
        for index, row in enumerate(context.get(field, [])):
            if not isinstance(row, dict):
                continue
            path = field + '/' + str(index)
            code, elements = None, []
            if phase == 0:
                # 不裁真实字段；重复的说明和遗漏路径可按原审计位置追踪。
                scope = row.get('evidence_scope')
                if isinstance(scope, dict) and 'boundary_note' in scope:
                    scope.pop('boundary_note')
                    elements.append('evidence_scope/boundary_note')
                for number, sample in enumerate(row.get('alert_evidence', [])):
                    info = sample.get('omissions') if isinstance(sample, dict) else None
                    if isinstance(info, dict) and info.get('paths'):
                        info['unlisted_count'] = info.get('unlisted_count', 0) + len(info['paths'])
                        info['paths'] = []
                        info['paths_audit'] = sample.get('source_audit_path')
                        elements.append('alert_evidence/' + str(number) + '/omissions/paths')
                for gap in row.get('scoped_collection_gaps', []):
                    if isinstance(gap, dict) and 'scope_note' in gap:
                        gap.pop('scope_note')
                        elements.append({'gap_id': gap.get('id'), 'component': 'repeated_scope_note'})
                if elements:
                    changed, code = True, 'REPEATED_METADATA_MODEL_BUDGET'
            elif phase == 1 and len(row.get('representative_hits', [])) > 1:
                hits = row['representative_hits']
                metadata = {'kind', 'ruleId', 'ruleType', 'ruleName', 'incidentId', 'hitId', 'evidenceStatus', 'alerts',
                            'timestamp', 'createdAt', 'updatedAt', 'hitTime', 'matchedAt'}
                evaluation_keys = {'reasoning', 'evaluation', 'evaluationPath', 'requiredTrace', 'bindings', 'evidenceRefs'}
                useful = [i for i, hit in enumerate(hits) if isinstance(hit, dict)
                          and any(key in evaluation_keys and value not in (None, '', {}, [])
                                  for key, value in hit.get('detail', {}).items())]
                if not useful:
                    useful = [i for i, hit in enumerate(hits) if isinstance(hit, dict)
                              and any(key not in metadata and value not in (None, '', {}, [])
                                      for key, value in hit.get('detail', {}).items())]
                removable = [i for i in range(len(hits)) if len(useful) != 1 or i != useful[0]]
                removed = hits.pop(removable[-1])
                elements.append({'hitId': removed.get('hitId'), 'source_audit_path': removed.get('source_audit_path')})
                row.setdefault('hit_evidence_budget', {}).update(sample_reduction=True,
                    remaining_samples=len(hits), actual_evaluation_preserved=bool(useful))
                if isinstance(row.get('evidence_scope'), dict):
                    row['evidence_scope'].update(model_projected_hit_ids=[hit.get('hitId') for hit in hits],
                        model_projected_hit_count=len(hits), sampling_status='partial', final_model_projection_reduced=True)
                changed, code = True, 'HIT_SAMPLE_MODEL_BUDGET'
            elif phase == 2 and len(row.get('alert_evidence', [])) > 1:
                # 优先保留有非身份字段的样本；不将有实际材料的目标裁成空fields。
                samples = row['alert_evidence']
                useful = [i for i, sample in enumerate(samples) if isinstance(sample, dict)
                          and _substantive_evidence_paths(sample.get('fields', {}))]
                removable = [i for i in range(len(samples)) if len(useful) != 1 or i != useful[0]]
                removed = samples.pop(removable[-1])
                elements.append({'source_alert_id': removed.get('source_alert_id'), 'source_audit_path': removed.get('source_audit_path')})
                row.setdefault('alert_evidence_budget', {}).update(sample_reduction=True, remaining_samples=len(samples))
                changed, code = True, 'ALERT_SAMPLE_MODEL_BUDGET'
            elif phase == 3:
                for sample in row.get('alert_evidence', []):
                    values = sample.get('fields') if isinstance(sample, dict) else None
                    if not isinstance(values, dict) or not values:
                        continue
                    protected = _protected_evidence_fields(values)
                    keys = [key for key in reversed(values) if key not in protected]
                    if not keys:
                        continue
                    key = keys[0]
                    value = values.pop(key)
                    sample['projection_status'] = 'partial'
                    elements.append({'source_alert_id': sample.get('source_alert_id'),
                        'source_audit_path': sample.get('source_audit_path'),
                        'field_path': key, 'value_sha256': content_digest(value)})
                    info = sample.setdefault('model_input_budget', {'omitted_field_count': 0})
                    info['omitted_field_count'] += 1
                    info.update(status='source_fields_not_fully_projected', source_audit_path=sample.get('source_audit_path'),
                                nonempty_actual_fields_preserved=bool(_substantive_evidence_paths(values)))
                    changed, code = True, 'ALERT_FIELD_MODEL_BUDGET'
            # phase 5有意不裁当前正文、最后真实求值或基础反证；最小材料超限时失败。
            if code is not None:
                omissions.append({'source': path, 'code': code, 'identity': copy.deepcopy(row.get('identity')),
                                  'omitted_elements': elements,
                                  'meaning': '仅本次模型未包含完整内容，不能推断原始材料不存在'})
                row.setdefault('projection_boundary', {})['model_budget_reduced'] = True
                if phase in (2, 3):
                    _refresh_evidence_scope(row)
    if phase == 0:
        excluded = context.get('excluded_rules', [])
        if any(isinstance(row, dict) and ('alert_evidence' in row or 'evidence_scope' in row) for row in excluded):
            context['excluded_rules'] = compact_excluded_rules(excluded)
            omissions.append({'source': 'excluded_rules', 'code': 'EXCLUDED_REDUNDANT_EVIDENCE_MODEL_BUDGET',
                'audit_reference': 'rule-context.audit.json#/excluded_rules',
                'meaning': '保留排除来源与告警计数；相关告警在实际关联目标内保留，不把排除项当候选证据'})
            changed = True
    if phase == 4 and isinstance(context.get('threat_judgement'), dict):
        original = context['threat_judgement']
        removed = [key for key in ('key_claims', 'secondary_findings') if key in original]
        if removed:
            for key in removed:
                original.pop(key)
            original['reference_audit'] = 'rule-context.audit.json#/threat_judgement'
            original['projection_status'] = 'secondary_model_summaries_omitted_facts_counter_evidence_uncertainty_preserved'
            omissions.append({'source': 'threat_judgement', 'code': 'BASE_REDUNDANT_SUMMARIES_MODEL_BUDGET',
                              'omitted_elements': removed})
            changed = True
    if changed:
        context['collection_status'] = 'failed' if context.get('collection_status') == 'failed' else 'partial'
        context['model_budget_boundary'] = {'omitted_component_count': previous_count + len(omissions) - initial_omissions,
            'audit_reference': 'rule-context.audit.json', 'source_absence_not_proven': True,
            'target_identity_rows_preserved': True, 'current_definitions_preserved': True,
            'actual_evaluation_and_counter_evidence_preserved': True}
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
                   gap_attribution_policy='only_target_scoped_gaps_identify_affected_rule_or_alert; global_is_coverage_only',
                   evidence_projection_policy='actual_source_values_only; omitted_or_sampled_is_not_absent; excluded_sources_are_not_targets')
    omitted = []
    # 排除来源只摘要一次，不能在压缩目标真实证据前反复展开外部告警。
    context['excluded_rules'] = compact_excluded_rules(prepared['excluded_rules'])
    if prepared['excluded_rules']:
        omitted.append({'source': 'excluded_rules', 'code': 'EXCLUDED_REDUNDANT_EVIDENCE_MODEL_BUDGET',
            'audit_reference': 'rule-context.audit.json#/excluded_rules',
            'original_alert_rows': len(prepared['excluded_rules']), 'projected_source_groups': len(context['excluded_rules']),
            'meaning': '外部来源按已知身份聚合，不是SOC候选；完整原始告警与排除原因仍在审计，相关证据按实际关联目标保留'})
        context['excluded_source_projection'] = {'original_alert_rows': len(prepared['excluded_rules']),
            'source_groups': len(context['excluded_rules']), 'audit_reference': 'rule-context.audit.json#/excluded_rules',
            'not_target_evidence': True}
        context['model_budget_boundary'] = {'omitted_component_count': len(omitted),
            'audit_reference': 'rule-context.audit.json', 'source_absence_not_proven': True,
            'target_identity_rows_preserved': True, 'current_definitions_preserved': True,
            'actual_evaluation_and_counter_evidence_preserved': True}
    # 所有SOC目标保留身份、当前正文、实际求值/告警和具体不完整说明。
    for field in ('association_rules', 'detection_rules'):
        for row_index, row in enumerate(prepared[field]):
            row_path = field + '/' + str(row_index)
            # 当前定义保持完整原文与摘要一致；只对命中/告警观察去旧正文。
            candidate = copy.deepcopy(row)
            candidate.get('identity', {}).pop('version', None)
            current = candidate.get('current_definition', {})
            current.pop('version', None)
            if (current.get('identity_status') == 'conflict'
                    or (field == 'detection_rules' and current.get('completeness_check', {}).get('identity_status') != 'verified')):
                current.pop('content', None)
                current['content_audit'] = 'rule-context.audit.json#/' + row_path + '/current_definition/content'
                current['projection_status'] = 'definition_identity_unverified_not_for_candidate'
            if 'representative_hits' in candidate:
                for number, hit in enumerate(candidate['representative_hits']):
                    detail = hit.get('detail', {})
                    hit['detail'] = compact_hit_detail(collected_observation(detail))
                    hit['source_audit_path'] = 'rule-context.audit.json#/' + row_path + '/representative_hits/' + str(number) + '/detail'
                    # 摘要对应上面的派生审计detail，不冒称原始raw_response完整摘要。
                    hit['source_detail_sha256'] = content_digest(detail)
                    if hit['detail'] != detail:
                        hit['projection_status'] = 'actual_evaluation_preserved_non_analysis_payload_in_audit'
            if 'refs' in candidate:
                candidate['refs_total_count'] = len(candidate['refs'])
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
    # 原49000预留与59000上限不增加；最终60000由系统+用户内容精确核对。
    for phase in range(6):
        while len(json_bytes(context)) > limit - 10000:
            if not reduce_context(context, omitted, phase):
                break
    size = len(json_bytes(context))
    if size > limit - 10000:
        boundary = context.setdefault('model_budget_boundary', {'omitted_component_count': len(omitted),
            'audit_reference': 'rule-context.audit.json', 'target_identity_rows_preserved': True})
        boundary.update(soft_goal_unmet=True, soft_goal_utf8_bytes=limit - 10000,
                        final_effective_input_budget_check='rule_optimization._analyze')
        size = len(json_bytes(context))
    if size >= limit:
        raise ContextBudgetError('minimum current definitions, identities, actual evidence and counter-evidence need %d UTF-8 bytes; context limit=%d, soft goal=%d; no targets silently removed' % (size, limit, limit - 10000), omitted)
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
    hits = [collected_observation(hit) for hit in c.hits()]
    groups = {}
    for hit in hits:
        try:
            ident, query, key = association_identity(hit)
            group = groups.setdefault(key, {'identity': ident, 'query_id': query, 'refs': [], 'observed': {'hit_count': 0, 'details_read': 0, 'rule_ids': []}})
            group['refs'].append(identifier(hit['hitId']))
            group['observed']['hit_count'] += 1
            if hit['ruleId'] not in group['observed']['rule_ids']:
                group['observed']['rule_ids'].append(hit['ruleId'])
        except ValueError as error:
            c.gap('RULE_IDENTITY_UNRESOLVED', 'association', hit.get('hitId'), str(error))
    families = defaultdict(list)
    for group in groups.values():
        families[group['identity']['family']].append(group)
    slots = [group for i in range(max((len(v) for v in families.values()), default=0)) for family in sorted(families) for group in families[family][i:i + 1]]
    # 未建立可核的逐命中语义分类，不把索引timelineStep猜成详情中的求值结构。
    # 只按每个真实规则组原refs取首/中/尾；不改全量refs、不宣称类型或时间覆盖。
    detail_selections = {}
    for key, group in groups.items():
        size = len(group['refs'])
        positions = sorted({0, size // 2, size - 1}) if size else []
        selection = {'strategy': 'index_span_fallback', 'selected_positions': positions,
                     'semantic_type_coverage': 'unverified', 'temporal_coverage': 'unverified'}
        detail_selections[key] = {'selected_ids': [group['refs'][i] for i in positions], 'selection': selection}
        group['observed']['detail_selection'] = copy.deepcopy(selection)
    details, definitions = 0, {}
    for sample in range(3):
        for group in slots:
            key = (group['identity']['family'], group['identity']['id'])
            selected_ids = detail_selections[key]['selected_ids']
            if sample >= len(selected_ids) or details >= MAX_DETAILS or c.exhausted:
                continue
            hid = selected_ids[sample]
            data = c.call('hit', {'incidentId': c.incident_id, 'hitId': hid})
            details += 1
            if not isinstance(data, dict):
                continue
            if (not association_id_matches(data.get('ruleId'), group['identity']) or data.get('incidentId') not in (None, c.incident_id)
                    or data.get('hitId') not in (None, hid)):
                c.gap('HIT_DETAIL_IDENTITY_CONFLICT', 'association', hid, 'detail identity differs from hit index')
                continue
            if data.get('evidenceStatus') not in (None, 'COMPLETE'):
                c.gap('HIT_EVIDENCE_INCOMPLETE', 'association', hid, data.get('evidenceStatus'))
            group['observed']['details_read'] += 1
            group.setdefault('representative_hits', []).append({'hitId': hid, 'detail': collected_observation(data),
                'source_call_id': c.ledger[-1]['call_id'], 'raw_response_audit': c.ledger[-1]['audit'].get('raw_response_file')})
            try:
                add_refs(data.get('alerts', []), 'hit:' + hid)
            except ValueError:
                c.gap('HIT_ALERTS_INVALID', 'detection', hid, 'invalid participating-alert references')
    if count is not None and str(count) != str(len(refs)):
        c.gap('ALERT_REFERENCE_INCOMPLETE', 'detection', 'event/hit union', {'declared': count, 'union': len(refs)})
    group_positions = {key: index for index, key in enumerate(groups)}
    for group in slots:
        observed = group['observed']
        observed['details_are_sampled'] = observed['details_read'] < observed['hit_count']
        if observed['details_read'] < min(3, observed['hit_count']):
            c.gap('HIT_DETAIL_BUDGET_OR_FAILURE', 'association', group['identity']['id'], dict(observed))
        family, query = group['identity']['family'], group.pop('query_id')
        key = (family, query)
        if key not in definitions:
            data = c.call(family, {'ruleId': query})
            definitions[key] = {'source': 'current_definition', 'endpoint': TOOLS[family][1],
                                'collected_at': datetime.now(timezone.utc).isoformat(),
                                'sha256': content_digest(data), 'content': data}
            required = 'bodyJson' if family == 'reasoning' else {'THRESHOLD': 'conditionJson', 'SEQUENCE': 'sequenceJson', 'JOIN': 'joinJson'}.get(str(data.get('ruleType'))) if isinstance(data, dict) else None
            if not isinstance(data, dict) or not data or (required and data.get(required) in (None, '')):
                c.gap('RULE_DEFINITION_INCOMPLETE', 'association', query, 'full current definition unavailable')
        group['current_definition'] = definitions[key]
        current = definitions[key]['content']
        if isinstance(current, dict):
            actual_id = first(current, 'ruleId', 'id')
            if not association_id_matches(actual_id, group['identity']):
                definitions[key]['identity_status'] = 'conflict'
                c.gap('DEFINITION_IDENTITY_CONFLICT', 'association', query, 'current endpoint returned another ID')
            else:
                definitions[key]['identity_status'] = 'verified' if actual_id is not None else 'unverified'
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
                        definitions[key].setdefault('dependency_boundaries', []).append({
                            'marker': 'ruleMatch', 'source_body_field': field, 'status': 'reference_contract_unconfirmed',
                            'source_audit_path': 'rule-context.audit.json#/association_rules/' + str(group_positions[key]) + '/current_definition/content/' + field,
                            'meaning': '仅发现原文标记；未猜引用字段、目标家族、参数或新工具，未完成依赖当前定义补读'})
                        c.gap('RULEMATCH_DEPENDENCY_NOT_EXPANDED', 'association', query,
                              'ruleMatch marker present; reference identity/family/argument contract unconfirmed; current dependency definition not read; only this target affected')
                except (ValueError, TypeError):
                    c.gap('DEFINITION_JSON_INVALID', 'association', query + '/' + field, 'claimed JSON body cannot be parsed')
    detection, excluded, alert_audit = {}, [], []
    for aid, reference in refs.items():
        alert = cached_alerts.get(aid)
        ref = reference['reference']
        if alert is None and not str(first(ref, 'ruleId', 'rule_id') or '').lower().startswith('edr:') and not c.exhausted:
            alert = c.call('alert', {'alertId': aid})
        alert = alert if isinstance(alert, dict) else {}
        # 原告警详情及引用保留完整审计对象；入模投影由prepare_rule_evidence负责。
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
            key = (ident['source'], ident['id'])
            group = detection.setdefault(key, {'identity': ident, 'refs': [], 'observed': {'alert_count': 0, 'source_labels': []}})
            group['refs'].append({'alertId': aid, 'sources': reference['sources']})
            group['observed']['alert_count'] += 1
            if ident['source_label'] not in group['observed']['source_labels']:
                group['observed']['source_labels'].append(ident['source_label'])
        except (ValueError, AttributeError):
            c.gap('DETECTION_OWNERSHIP_UNRESOLVED', 'detection', aid, 'source, namespace or lossless rule ID unavailable')
    for group in detection.values():
        rid = group['identity']['id']
        key = ('detection', group['identity']['source'], rid)
        if key not in definitions:
            data = c.call('detection', {'ruleId': rid})
            check = detection_definition_check(data, rid)
            definitions[key] = {'source': 'current_definition', 'endpoint': TOOLS['detection'][1],
                                'collected_at': datetime.now(timezone.utc).isoformat(),
                                'sha256': content_digest(data), 'content': data, 'completeness_check': check}
            if check['identity_status'] != 'verified':
                c.gap('DEFINITION_IDENTITY_CONFLICT', 'detection', rid, 'exact business ruleId required; database id is not an alias')
            if check['completeness'] != 'complete':
                c.gap('RULE_DEFINITION_INCOMPLETE', 'detection', rid, check)
        group['current_definition'] = definitions[key]
    return list(groups.values()), list(detection.values()), excluded, hits, alert_audit, 'collect'


def build_rule_context(incident_id, base_result, fusion_dir, gateway, output_dir, *, collector=None) -> dict:
    c, audit = None, {}
    try:
        incident_id = identifier(incident_id)
        output = Path(output_dir).resolve()
        names = ('rule-context.audit.json', 'rule-optimization-context.json', 'rule-call-ledger.audit.json', 'projection-omissions.json')
        if any((output / name).exists() for name in names):
            raise FileExistsError('refusing to overwrite rule-context artifacts')
        # 保持c=None直到既有制品拒绝护栏通过，注入对象不能让旧Run落入finalize写入。
        if collector is not None and (not isinstance(collector, Collector)
                or collector.incident_id != incident_id or collector.gateway is not gateway
                or Path(collector.output).resolve() != output):
            raise ValueError('collector does not belong to this incident, gateway and output')
        output.mkdir(parents=True, exist_ok=True)
        c = collector if collector is not None else Collector(incident_id, gateway, output)
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
        budget_failure = isinstance(error, ContextBudgetError)
        gap = c.gap('CONTEXT_BUDGET' if budget_failure else 'AUDIT_OR_PROJECTION_FAILED', 'finalize', 'builder',
                    str(error) if budget_failure else type(error).__name__)
        if budget_failure:
            audit.update(collection_status='failed', collection_gaps=c.gaps, projection_omissions=error.omissions)
            try:
                c.save('rule-context.audit.json', audit)
            except Exception:
                c.gap('AUDIT_OR_PROJECTION_FAILED', 'finalize', 'builder', 'budget failure audit could not be updated')
        retained = {'audit': str(c.output / 'rule-context.audit.json')} if (c.output / 'rule-context.audit.json').is_file() else {}
        return {'collection_status': 'failed', 'collection_gaps': c.gaps, 'rule_optimization_context': None,
                'artifacts': retained, 'diagnostic_gap_ref': gap, 'evidence_index': audit.get('evidence_index', {}),
                'allowed_evidence_refs': audit.get('evidence_index', {}).get('allowed_evidence_refs', [])}
