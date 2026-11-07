"""仅从既有审计对象投影规则证据及缺口；不读取文件、不调用外部能力。

原始路径和值不改写，历史命中与当前定义不合并。本模块的采样元信息不授予
候选引用权限；总上下文与有效模型输入预算由调用方独立执行。
"""
from __future__ import annotations

import copy
import hashlib
import json
from collections import Counter

MAX_ALERT_SAMPLES = 3
MAX_RULE_EVIDENCE_BYTES = 8000
MAX_SCAN_NODES = 4096
AUDIT_NAME = 'rule-context.audit.json'
_RULE_ARRAYS = ('association_rules', 'detection_rules', 'excluded_rules')
_GLOBAL_CODES = frozenset({
    'COLLECTION_BUDGET', 'HIT_PAGE_UNAVAILABLE', 'HIT_TOTAL_INVALID',
    'HIT_ID_INVALID', 'HIT_PAGE_INTEGRITY', 'HIT_PAGE_SIZE_MISMATCH',
    'HIT_COLLECTION_INCOMPLETE', 'ALERT_REFERENCE_INCOMPLETE',
    'CONTEXT_BUDGET', 'GAP_DETAILS_IN_AUDIT', 'FROZEN_RECEIPT_INVALID',
    'SETUP_FAILED', 'BUILDER_FAILED', 'AUDIT_OR_PROJECTION_FAILED',
})
_RAW_KEYS = frozenset({
    'raw', 'rawdata', 'rawevent', 'fulllog', 'rawlog', 'rawlogs',
})
_SENSITIVE_KEYS = frozenset({
    'password', 'passwd', 'secret', 'clientsecret', 'token', 'accesstoken',
    'refreshtoken', 'apikey', 'authorization', 'cookie', 'cookies',
    'credential', 'credentials', 'privatekey', 'session', 'sessions',
    'home', 'dshhome',
})
_PRIORITY = {key: rank for rank, key in enumerate((
    'alertId', 'alert_id', 'source', 'ruleId', 'rule_id', 'tactic', 'technique',
    '_reasoning', 'triggering_event', 'ocsf', 'process', 'cmd_line', 'name',
    'file', 'path', 'actor', 'device', 'evidences', 'finding_info',
    'attacks', 'analytic', 'metadata', 'src_endpoint', 'dst_endpoint',
))}
_EXPECTED_PATHS = (
    '/triggering_event/ocsf/process', '/triggering_event/ocsf/actor',
    '/triggering_event/ocsf/device', '/ocsf/evidences',
    '/ocsf/finding_info', '/_reasoning',
)


def _bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode('utf-8')


def _digest(value):
    return hashlib.sha256(_bytes(value)).hexdigest()


def _id(value):
    if type(value) is int:
        return str(value)
    if isinstance(value, str) and value and value == value.strip():
        return value
    return None


def _obj(value):
    return value if isinstance(value, dict) else {}


def _array(value):
    return value if isinstance(value, list) else []


def _pointer(parent, key):
    return parent + '/' + str(key).replace('~', '~0').replace('/', '~1')


def _at(value, pointer):
    for part in pointer.split('/')[1:]:
        part = part.replace('~1', '/').replace('~0', '~')
        if not isinstance(value, dict) or part not in value:
            return False, None
        value = value[part]
    return True, value


def _blocked(key):
    normalized = str(key).lower().replace('_', '').replace('-', '')
    if normalized in _RAW_KEYS:
        return 'raw_log_not_projected'
    if normalized in {'message', 'desc'}:
        return 'free_text_not_projected'
    if normalized in _SENSITIVE_KEYS:
        return 'sensitive_container_not_projected'
    return None


def _alert_refs(value):
    """仅解析收集器已支持的引用载体，不执行或解释规则正文。"""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return []
    if isinstance(value, dict):
        value = value.get('items', value.get('alerts', []))
    result = []
    for row in _array(value):
        if isinstance(row, dict):
            candidates = [row[k] for k in ('alertId', 'alert_id', 'id') if k in row]
            ids = [_id(item) for item in candidates]
            aid = ids[0] if ids and all(item == ids[0] for item in ids) else None
        else:
            aid = _id(row)
        if aid is not None and aid not in result:
            result.append(aid)
    return result


def _incident_matches(value, incident_id):
    return all(_id(value[key]) == incident_id for key in ('incidentId', 'incident_id')
               if key in value and value[key] is not None)


def _case_matches(audit):
    incident_id = _id(audit.get('incident_id'))
    frozen = _obj(audit.get('frozen_incident'))
    # 已核冻结对象的业务事件字段是 incidentId；数据库 id 不是其别名。
    return (incident_id is not None and bool(frozen)
            and _id(frozen.get('incidentId')) == incident_id
            and _incident_matches(frozen, incident_id))


def _mapping_index(audit):
    """同一告警的不同详情或身份冲突均关闭附着，不优选其中一份。"""
    indexed, failures = {}, {}
    incident_id = _id(audit.get('incident_id'))
    for index, mapping in enumerate(_array(audit.get('event_alert_rule_mapping'))):
        mapping = _obj(mapping)
        aid = _id(mapping.get('alertId'))
        if aid is None:
            continue
        detail = _obj(mapping.get('detail'))
        explicit = [detail[k] for k in ('alertId', 'alert_id') if k in detail]
        if not explicit and 'id' in detail:
            explicit = [detail['id']]
        reference = _obj(mapping.get('reference'))
        reference_ids = [reference[k] for k in ('alertId', 'alert_id') if k in reference]
        problem = None
        if not _case_matches(audit):
            problem = 'incident_identity_unconfirmed'
        elif not _incident_matches(mapping, incident_id) or not _incident_matches(detail, incident_id):
            problem = 'foreign_incident_detail'
        elif not detail or not explicit:
            problem = 'detail_alert_identity_missing'
        elif any(_id(value) != aid for value in explicit + reference_ids):
            problem = 'detail_alert_identity_conflict'
        try:
            sha = _digest(detail)
        except (TypeError, ValueError, OverflowError, RecursionError, UnicodeError):
            sha, problem = None, 'detail_not_json_serializable'
        if problem is not None:
            failures[aid] = problem
            continue
        if aid in indexed and indexed[aid]['sha256'] != sha:
            failures[aid] = 'conflicting_detail_snapshots'
            continue
        indexed.setdefault(aid, {'detail': detail, 'sha256': sha,
                                 'path': '/event_alert_rule_mapping/' + str(index) + '/detail'})
    for aid in failures:
        indexed.pop(aid, None)
    return indexed, failures


def _identity(row, category):
    identity = _obj(row.get('identity'))
    rid = _id(identity.get('id')) if category != 'excluded' else _id(row.get('id'))
    rule_ids = {rid} if rid is not None else set()
    if identity.get('family') == 'reasoning' and rid and rid.startswith('reasoning:'):
        query_id = rid[len('reasoning:'):]
        if query_id:
            rule_ids.add(query_id)
    return identity, rule_ids


def _row_scope(audit, row, category):
    identity, rule_ids = _identity(row, category)
    own_alerts, linked_alerts, own_hits, source_hits, sampled_hits = [], [], [], [], []
    incident_id = _id(audit.get('incident_id'))
    if category == 'association':
        own_hits = [_id(item) for item in _array(row.get('refs')) if _id(item) is not None]
        for hit in _array(row.get('representative_hits')):
            hit = _obj(hit)
            hid, detail = _id(hit.get('hitId')), _obj(hit.get('detail'))
            if hid is None or hid not in own_hits or not _incident_matches(detail, incident_id):
                continue
            if detail.get('hitId') is not None and _id(detail['hitId']) != hid:
                continue
            if detail.get('ruleId') is not None and _id(detail['ruleId']) not in rule_ids:
                continue
            version = detail.get('version', detail.get('ruleVersion'))
            if identity.get('version') is not None and version is not None and _id(version) != _id(identity['version']):
                continue
            if hid not in sampled_hits:
                sampled_hits.append(hid)
            # 仅使用该目标自身命中的实际 alerts；不从 reasoning 文本猜告警。
            for aid in _alert_refs(detail.get('alerts')):
                if aid not in linked_alerts:
                    linked_alerts.append(aid)
        source_hits = list(own_hits)
    elif category == 'detection':
        own_alerts = _alert_refs(row.get('refs'))
        for ref in _array(row.get('refs')):
            for source in _array(_obj(ref).get('sources')):
                if isinstance(source, str) and source.startswith('hit:') and _id(source[4:]):
                    source_hits.append(source[4:])
    else:
        aid = _id(row.get('alertId'))
        own_alerts = [aid] if aid is not None else []
        for source in _array(row.get('refs')):
            if isinstance(source, str) and source.startswith('hit:') and _id(source[4:]):
                source_hits.append(source[4:])
    return {'category': category, 'identity': identity, 'rule_ids': rule_ids,
            'own_alerts': list(dict.fromkeys(own_alerts)), 'linked_alerts': linked_alerts,
            'own_hits': list(dict.fromkeys(own_hits)), 'sampled_hits': sampled_hits,
            'source_hits': list(dict.fromkeys(source_hits))}


def _atoms(detail):
    """优先完整小子树，其余逐叶有界采样；所有路径仍指向原对象。"""
    atoms, omitted, scanned, stopped = [], [], 0, False

    def safe_tree(value):
        if isinstance(value, dict):
            return all(not _blocked(key) and safe_tree(item) for key, item in value.items())
        return all(safe_tree(item) for item in value) if isinstance(value, list) else True

    def walk(value, path):
        nonlocal scanned, stopped
        if stopped:
            return
        scanned += 1
        if scanned > MAX_SCAN_NODES:
            omitted.append({'path': '', 'reason': 'scan_budget_unvisited_remainder'})
            stopped = True
            return
        name = path.rsplit('/', 1)[-1]
        atomic = name in {'actor', 'device', '_reasoning'}
        if atomic and isinstance(value, (dict, list)) and len(_bytes(value)) <= 1400 and safe_tree(value):
            atoms.append((path, value))
        elif isinstance(value, dict) and value:
            for key in sorted(value, key=lambda key: (_PRIORITY.get(key, 100), key)):
                reason = _blocked(key)
                if reason:
                    omitted.append({'path': _pointer(path, key), 'reason': reason})
                else:
                    walk(value[key], _pointer(path, key))
                if stopped:
                    break
        elif isinstance(value, list) and value:
            for index, item in enumerate(value):
                walk(item, _pointer(path, index))
                if stopped:
                    break
        else:
            atoms.append((path, value))

    def rank(item):
        path = item[0]
        if path in {'/alertId', '/alert_id', '/source', '/ruleId', '/rule_id', '/tactic', '/technique'} or path.startswith(('/tactic/', '/technique/')):
            return 0
        if path.startswith('/triggering_event/ocsf/process/') and path.endswith(('/cmd_line', '/name', '/file/path')) and '/parent_process/' not in path:
            return 1
        if path.startswith('/_reasoning'):
            return 2
        if path.startswith('/triggering_event/ocsf/actor'):
            return 3
        if path.startswith('/triggering_event/ocsf/device'):
            return 4
        if path.startswith('/ocsf/finding_info/'):
            return 5
        if path.startswith('/ocsf/evidences/') and ('/process/' in path or path.endswith(('/actor', '/device'))):
            return 6
        if '/metadata/' in path or path.endswith('/class_uid'):
            return 8
        return 10

    walk(detail, '')
    atoms.sort(key=rank)
    return atoms, omitted, stopped


def _omission_summary(rows, max_paths=8):
    """路径清单本身也有界；未列明部分回查同一详情及其摘要。"""
    paths, size = [], 0
    for row in rows:
        cost = len(_bytes(row))
        if len(paths) < max_paths and size + cost <= 600:
            paths.append(copy.deepcopy(row))
            size += cost
    return {'count': len(rows), 'paths': paths, 'unlisted_count': len(rows) - len(paths),
            'reason_counts': dict(sorted(Counter(row['reason'] for row in rows).items()))}


def _sample(aid, source, limit):
    detail = source['detail']
    atoms, omitted, stopped = _atoms(detail)
    sample = {'source_alert_id': aid, 'source_audit_path': AUDIT_NAME + '#' + source['path'],
              'source_detail_sha256': source['sha256'], 'fields': {},
              'missing_paths': [path for path in _EXPECTED_PATHS if not _at(detail, path)[0]],
              'projection_status': 'partial', 'scan_limit_reached': stopped,
              'omissions': _omission_summary(omitted)}
    # 预留遗漏目录空间；预算针对完整样本封装，不截断任何字符串。
    for path, value in atoms:
        sample['fields'][path] = copy.deepcopy(value)
        if len(_bytes(sample)) > limit - 800:
            del sample['fields'][path]
            omitted.append({'path': path, 'reason': 'evidence_byte_budget'})
    sample['omissions'] = _omission_summary(omitted)
    sample['projection_status'] = 'partial' if omitted else 'complete'
    while len(_bytes(sample)) > limit and sample['omissions']['paths']:
        sample['omissions']['paths'].pop()
        sample['omissions']['unlisted_count'] += 1
    while len(_bytes(sample)) > limit and sample['fields']:
        path = next(reversed(sample['fields']))
        del sample['fields'][path]
        omitted.append({'path': path, 'reason': 'evidence_byte_budget'})
        sample['omissions'] = _omission_summary(omitted, max_paths=0)
        sample['projection_status'] = 'partial'
    return sample if sample['fields'] and len(_bytes(sample)) <= limit else None


def _add_evidence(row, scope, indexed, failures, case_ok, row_path):
    candidates = scope['own_alerts'] + scope['linked_alerts']
    available, omitted = [], []
    for aid in candidates:
        reason = failures.get(aid)
        if not case_ok:
            reason = 'incident_identity_unconfirmed'
        if aid not in indexed and reason is None:
            reason = 'alert_detail_not_collected'
        if reason:
            omitted.append({'path': aid, 'reason': reason})
        else:
            available.append(aid)
    selected = available[:MAX_ALERT_SAMPLES]
    omitted.extend({'path': aid, 'reason': 'alert_sample_limit'} for aid in available[MAX_ALERT_SAMPLES:])
    limit = (MAX_RULE_EVIDENCE_BYTES - 2 - MAX_ALERT_SAMPLES) // max(1, len(selected))
    evidence = []
    for aid in selected:
        sample = _sample(aid, indexed[aid], limit)
        if sample is None:
            omitted.append({'path': aid, 'reason': 'evidence_metadata_or_values_over_budget'})
        else:
            evidence.append(sample)
    # 固定每样本份额加列表分隔符，保证整个 alert_evidence 不超过规则预算。
    row['alert_evidence'] = evidence
    actual = [sample['source_alert_id'] for sample in evidence]
    hit_sampled = len(scope['sampled_hits']) < len(scope['own_hits'])
    partial = bool(omitted) or hit_sampled or any(sample['projection_status'] != 'complete' for sample in evidence)
    row['evidence_scope'] = {
        'alert_ids': actual, 'hit_ids': scope['source_hits'][:MAX_ALERT_SAMPLES],
        'owned_hit_ids': scope['own_hits'][:MAX_ALERT_SAMPLES],
        'hit_ids_total_count': len(scope['source_hits']),
        'owned_hit_ids_total_count': len(scope['own_hits']),
        'hit_ids_are_sampled': len(scope['source_hits']) > MAX_ALERT_SAMPLES,
        'owned_hit_ids_are_sampled': len(scope['own_hits']) > MAX_ALERT_SAMPLES,
        'hit_ids_audit_path': AUDIT_NAME + '#' + row_path + '/refs',
        'candidate_alert_count': len(candidates),
        'collected_detail_count': len(available), 'selected_alert_count': len(actual),
        'owned_alert_count': len(scope['own_alerts']), 'linked_alert_count': len(scope['linked_alerts']),
        'hit_count': len(scope['own_hits']), 'sampled_hit_count': len(scope['sampled_hits']),
        'hit_details_are_sampled': hit_sampled,
        'sampling_status': 'unavailable' if not evidence else ('partial' if partial else 'complete'),
        'rule_evidence_utf8_bytes': len(_bytes(evidence)), 'rule_evidence_byte_limit': MAX_RULE_EVIDENCE_BYTES,
        'omitted_alerts': _omission_summary(omitted),
        'boundary_note': '仅覆盖该行真实引用及所属命中的实际告警；路径缺失和抽样不表示事实不存在，亦不验证当前规则。',
    }


def _gap_source(gap, ledger, incident_id):
    """仅核对真源ID及既有调用参数；绝不搜索 message 的相似文本。"""
    source, code = _id(gap.get('source')), gap.get('code')
    stage = gap.get('stage')
    if code == 'CALL_FAILED' and source in ledger:
        entry = _obj(ledger[source])
        args = _obj(entry.get('key_arguments'))
        if args.get('incidentId') is not None and _id(args['incidentId']) != incident_id:
            return None, None, stage, False
        tool = entry.get('tool')
        provenance = _obj(entry.get('audit'))
        expected_resource = ('ai_soc_detect' if tool in {'get_detect_alert_by_alert_id', 'get_detect_rule_by_rule_id'}
                             else 'ai_soc_correlate')
        if provenance.get('resource') != expected_resource:
            return None, None, stage, False
        exact = provenance.get('exact_tool')
        if exact is not None and exact != expected_resource + '__' + str(tool):
            return None, None, stage, False
        if tool == 'get_correlate_incident_rule_hits':
            return None, None, stage, True
        if tool == 'get_detect_alert_by_alert_id':
            return _id(args.get('alertId')), 'alert', 'detection', False
        if tool == 'get_incident_rule_hits_by_hit_id':
            return _id(args.get('hitId')), 'hit', 'association', False
        if tool in {'get_correlate_rule_by_rule_id', 'get_correlate_reasoning_rules_definition'}:
            return _id(args.get('ruleId')), 'rule', 'association', False
        if tool == 'get_detect_rule_by_rule_id':
            return _id(args.get('ruleId')), 'rule', 'detection', False
        return None, None, stage, False
    if code == 'DEFINITION_JSON_INVALID' and source and '/' in source:
        rid, field = source.rsplit('/', 1)
        if field in {'bodyJson', 'conditionJson', 'sequenceJson', 'joinJson'}:
            return rid, 'rule', stage, False
    if code == 'HIT_DETAIL_BUDGET_OR_FAILURE':
        return source, 'rule', 'association', False
    if isinstance(code, str) and (code.startswith('ALERT_') or code.startswith('DETECTION_')):
        kind = 'alert'
    elif isinstance(code, str) and code.startswith('HIT_'):
        kind = 'hit'
    elif isinstance(code, str) and (code.startswith(('RULE_', 'DEFINITION_', 'CURRENT_'))
                                    or code in {'HISTORICAL_RULE_TYPE', 'NON_EXECUTABLE_DRAFT', 'RULEMATCH_DEPENDENCY_NOT_EXPANDED'}):
        kind = 'rule'
    else:
        kind = None
    return source, kind, stage, False


def _attribute(source, kind, stage, scope):
    if source is None:
        return None
    if kind in (None, 'alert'):
        if source in scope['own_alerts']:
            return 'own_alert', [source]
        if source in scope['linked_alerts']:
            return 'linked_alert_only', [source]
    if kind in (None, 'hit') and source in scope['own_hits']:
        return 'own_rule', list(scope['linked_alerts'])
    if kind in (None, 'rule') and source in scope['rule_ids']:
        category = scope['category']
        if stage == 'association' and category != 'association':
            return None
        if stage == 'detection' and category == 'association':
            return None
        return 'own_rule', list(scope['own_alerts'] + scope['linked_alerts'])
    return None


def prepare_rule_evidence(audit) -> dict:
    """返回三个富化规则数组及全局/未归属的既有缺口副本。

    不返回原始告警映射、全量日志或 HOME，不修改 audit。全局覆盖不足不会
    复制为每条规则错误；关联告警缺口明确保持 linked_alert_only 边界。
    """
    if not isinstance(audit, dict):
        raise TypeError('审计输入必须是对象')
    result = {field: copy.deepcopy(_array(audit.get(field))) for field in _RULE_ARRAYS}
    result.update(global_collection_gaps=[], unassigned_collection_gaps=[])
    indexed, failures = _mapping_index(audit)
    case_ok = _case_matches(audit)
    rows = []
    for field, category in zip(_RULE_ARRAYS, ('association', 'detection', 'excluded')):
        for index, row in enumerate(result[field]):
            if not isinstance(row, dict):
                continue
            scope = _row_scope(audit, row, category)
            _add_evidence(row, scope, indexed, failures, case_ok, '/' + field + '/' + str(index))
            row['scoped_collection_gaps'] = []
            rows.append((row, scope))
    ledger = {}
    for entry in _array(audit.get('call_ledger')):
        if isinstance(entry, dict) and _id(entry.get('call_id')):
            call_id = _id(entry['call_id'])
            if call_id not in ledger:
                ledger[call_id] = entry
            elif ledger[call_id] != entry:
                ledger[call_id] = None
    notes = {
        'own_rule': '来自本规则身份或其所属命中；不自动证明当前定义错误。',
        'own_alert': '来自本规则实际所属告警；不自动证明当前定义错误。',
        'linked_alert_only': '仅为关联告警的证据缺口，不能归因为本规则当前定义冲突。',
    }
    for original in _array(audit.get('collection_gaps')):
        if not isinstance(original, dict):
            result['unassigned_collection_gaps'].append(copy.deepcopy(original))
            continue
        source, kind, stage, global_call = _gap_source(original, ledger, _id(audit.get('incident_id')))
        if original.get('code') in _GLOBAL_CODES or global_call:
            gap = copy.deepcopy(original)
            gap.update(attribution='global_coverage', affected_alert_ids=[],
                       scope_note='仅说明全局收集、分页、预算或来源覆盖不足，不指认具体规则错误。')
            result['global_collection_gaps'].append(gap)
            continue
        # 仅有规则ID不能选择历史行；message 字符串不充当版本或行锚点。
        if kind == 'rule' and case_ok:
            matched_rows = sum(_attribute(source, kind, stage, scope) is not None
                               for _, scope in rows)
            if matched_rows > 1:
                gap = copy.deepcopy(original)
                gap.update(attribution='unassigned', affected_alert_ids=[],
                           attribution_reason='version_or_row_anchor_missing',
                           matched_rule_row_count=matched_rows,
                           scope_note='规则真源ID匹配多个历史行，缺少可靠版本或行锚点；未解析message猜归属，未复制为各版本own_rule缺口。')
                result['unassigned_collection_gaps'].append(gap)
                continue
        assigned = False
        for row, scope in rows:
            match = _attribute(source, kind, stage, scope) if case_ok else None
            if match is None:
                continue
            attribution, affected = match
            gap = copy.deepcopy(original)
            gap.update(attribution=attribution, affected_alert_ids=affected,
                       scope_note=notes[attribution])
            row['scoped_collection_gaps'].append(gap)
            assigned = True
        if not assigned:
            gap = copy.deepcopy(original)
            gap.update(attribution='unassigned', affected_alert_ids=[],
                       scope_note='真源ID未能与该案规则、所属命中或实际告警唯一对应，未扩散归属。')
            result['unassigned_collection_gaps'].append(gap)
    return result
