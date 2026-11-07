"""冻结本次当前定义目标及来源绑定；这是业务追溯边界，不是 SOC 候选 Schema。"""
from __future__ import annotations

import copy
from rule_response import RuleError, canonical, digest


def identifier(value):
    if type(value) is int:
        return str(value)
    if isinstance(value, str) and value and value == value.strip():
        return value
    raise ValueError('业务身份缺失、带空白或不是无损字符串/整数')


def project_rule_reference(base_result, incident_id):
    """适配读取器结构，不修复基础输出；错案/无锚点归纳不附着到本案。"""
    source = base_result if isinstance(base_result, dict) else {}
    actual = source.get('unified_event_id')
    matched = isinstance(actual, str) and actual == incident_id
    projected = {'unified_event_id': incident_id, 'verified_facts': [], '_rule_reference_only': True}
    audit = {'scope': 'rule_reference_projection', 'reference_only': True,
             'source_event_status': 'matched' if matched else ('missing' if actual is None else 'mismatch'),
             'task_incident_id': incident_id, 'source_event_id': actual if isinstance(actual, (str, int)) else None,
             'source_event_id_type': type(actual).__name__, 'facts_status': 'unavailable',
             'retained_fields': [], 'omitted_fields': {}, 'base_result_modified': False,
             'structural_anchor_is_not_model_fact': True}
    try:
        audit['original_base_sha256'] = digest(base_result)
    except (TypeError, ValueError, OverflowError, RecursionError, UnicodeError):
        audit['original_base_sha256'] = None
        audit['original_snapshot_status'] = 'not_json_serializable_reference_only'
    fields = ('verdict', 'confidence_score', 'primary_claim', 'key_claims',
              'counter_evidence', 'uncertainty_notes', 'secondary_findings')
    for field in fields:
        if field not in source:
            continue
        if not matched:
            audit['omitted_fields'][field] = 'source_event_not_confirmed'
            continue
        try:
            digest(source[field])
        except (TypeError, ValueError, OverflowError, RecursionError, UnicodeError):
            audit['omitted_fields'][field] = 'not_json_serializable'
            continue
        projected[field] = copy.deepcopy(source[field])
        audit['retained_fields'].append(field)
    facts = source.get('verified_facts')
    if matched and isinstance(facts, list):
        for index, row in enumerate(facts):
            try:
                if not isinstance(row, dict):
                    raise ValueError('fact reference is not an object')
                digest(row)
            except (TypeError, ValueError, OverflowError, RecursionError, UnicodeError):
                audit['omitted_fields']['verified_facts/' + str(index)] = 'unusable_reference'
                continue
            projected['verified_facts'].append(copy.deepcopy(row))
        retained = len(projected['verified_facts'])
        status = ('available_reference_not_independent_fact_verification' if retained == len(facts)
                  else 'partial_reference' if retained else 'unavailable_unusable_fact_array')
        audit.update(facts_status=status, original_fact_count=len(facts), retained_fact_count=retained)
    else:
        audit['omitted_fields']['verified_facts'] = 'source_event_not_confirmed' if not matched else 'missing_or_not_array'
    return projected, audit


def _source_identity(identity):
    claimed = identifier(identity.get('id'))
    if identity.get('category') == 'association' and identity.get('family') == 'reasoning':
        claimed = claimed[len('reasoning:'):] if claimed.startswith('reasoning:') else claimed
        if not claimed.isascii() or not claimed.isdigit() or int(claimed) <= 0:
            raise ValueError('reasoning规则业务ID不是已确认命名空间内的正整数ID')
    if not claimed:
        raise ValueError('规则业务ID缺失')
    return claimed


def _own_refs(row, trusted, incident_id):
    refs = set()
    for ref in row.get('refs', []):
        value = ref.get('alertId') if isinstance(ref, dict) else ref
        if isinstance(value, str) and value in trusted:
            refs.add(value)
    # 关联证据只能沿已有规则行refs→真实代表hit→alerts，不能信新投影自报的scope扩权。
    identity = row.get('identity', {})
    if identity.get('category') != 'association':
        return refs
    try:
        claimed = _source_identity(identity)
    except ValueError:
        return refs
    rule_ids = {claimed}
    if identity.get('family') == 'reasoning':
        rule_ids.add('reasoning:' + claimed)
    own_hits = {v for v in row.get('refs', []) if isinstance(v, str) and v in trusted}
    for hit in row.get('representative_hits', []):
        if not isinstance(hit, dict) or hit.get('hitId') not in own_hits:
            continue
        detail, hid = hit.get('detail'), hit['hitId']
        if not isinstance(detail, dict):
            continue
        try:
            if any(identifier(detail[key]) != incident_id for key in ('incidentId', 'incident_id')
                   if detail.get(key) is not None):
                continue
            if detail.get('hitId') is not None and identifier(detail['hitId']) != hid:
                continue
            if detail.get('ruleId') is not None and identifier(detail['ruleId']) not in rule_ids:
                continue
        except ValueError:
            continue
        alerts = detail.get('alerts', [])
        for item in alerts if isinstance(alerts, list) else []:
            try:
                if isinstance(item, dict):
                    values = [identifier(item[key]) for key in ('alertId', 'alert_id', 'id') if key in item]
                    value = values[0] if values and all(v == values[0] for v in values) else None
                else:
                    value = identifier(item)
            except ValueError:
                continue
            if value is not None and value in trusted:
                refs.add(value)
    return refs


def _definition_boundary(identity, current, native, category):
    reasons = []
    if identity.get('category') != category or not identity.get('family'):
        reasons.append('来源规则类别或家族身份未确认')
    if category == 'detection' and not identity.get('source'):
        reasons.append('检测规则SOC来源身份缺失')
    if current.get('source') != 'current_definition' or current.get('identity_status') == 'conflict':
        reasons.append('完整定义来源未确认或与目标身份冲突')
    if not isinstance(native, dict) or not native:
        return reasons + ['该目标完整当前定义没有进入冻结模型输入']
    if current.get('sha256') != digest(native):
        reasons.append('该目标冻结定义内容摘要不一致')
    try:
        field = 'ruleId' if 'ruleId' in native or category == 'detection' else 'id'
        claimed = _source_identity(identity)
        observed_ids = {claimed}
        if identity.get('category') == 'association' and identity.get('family') == 'reasoning':
            observed_ids.add('reasoning:' + claimed)
        if identifier(native.get(field)) not in observed_ids:
            reasons.append('完整定义的业务ID与案内来源目标不一致')
    except ValueError:
        reasons.append('完整定义缺少可无损核对的业务ID，不能凭说明猜测目标')
    # 只检查已核对读取合同的实际正文缺失；未知类型/legacy错误不构成Schema禁产。
    kind = native.get('ruleType') if isinstance(native.get('ruleType'), str) else None
    body = None
    if category == 'association':
        body = 'bodyJson' if identity.get('family') == 'reasoning' else {
            'THRESHOLD': 'conditionJson', 'SEQUENCE': 'sequenceJson', 'JOIN': 'joinJson'}.get(kind)
    elif category == 'detection':
        body = {'SINGLE_EVENT': 'conditionJson', 'THRESHOLD': 'conditionJson',
                'DISTINCT_COUNT': 'conditionJson', 'SIGMA': 'conditionJson',
                'SEQUENCE': 'sequenceJson', 'FREQUENCY': 'frequencyConfig',
                'ABSENCE': 'absenceConfig', 'RATE': 'conditionJson'}.get(kind)
    if body and (native.get(body) in (None, '', {}, []) or
                 (isinstance(native.get(body), str) and not native[body].strip())):
        reasons.append('该目标当前完整定义实际缺少已核对读取合同要求的' + body + '正文')
    if category == 'detection' and kind == 'RATE':
        for field in ('rateCount', 'rateWindowSeconds'):
            if native.get(field) in (None, ''):
                reasons.append('该目标当前定义实际缺少已核对读取参数' + field)
    check = current.get('completeness_check') or {}
    if isinstance(check, dict) and check.get('identity_status') == 'conflict':
        reasons.append('当前定义的来源身份存在明确冲突')
    # 原completeness.errors仍保留在context，不能替代上面的真实ID/原文核对。
    return reasons


def build_frozen_targets(context):
    trusted = set(context.get('allowed_evidence_refs', []))
    targets, identities = {}, {}
    for array, category in (('association_rules', 'association'), ('detection_rules', 'detection')):
        for index, row in enumerate(context.get(array, [])):
            if not isinstance(row, dict):
                raise RuleError('target_correspondence', 'SOURCE_ROW_INVALID', '冻结规则来源条目不是对象，无法绑定目标。')
            identity = copy.deepcopy(row.get('identity')) if isinstance(row.get('identity'), dict) else {}
            # 冻结的是当前业务身份；可选版本元信息留在当前定义，不作为目标或候选条件。
            identity.pop('version', None)
            identity.pop('ruleVersion', None)
            try:
                identity['id'] = _source_identity(identity)
            except ValueError:
                pass  # 保留真实无效身份供逐目标诊断，不补造ID。
            current = row.get('current_definition') if isinstance(row.get('current_definition'), dict) else {}
            native = current.get('content')
            observed_sha = digest(native) if isinstance(native, dict) else None
            declared_sha = current.get('sha256')
            valid_sha = isinstance(declared_sha, str) and len(declared_sha) == 64 and all(c in '0123456789abcdef' for c in declared_sha)
            # 以本轮已记录当前定义摘要区分来源；真实正文缺失仍只影响本目标can_generate。
            content_sha = declared_sha if valid_sha else observed_sha
            source = {k: copy.deepcopy(identity.get(k)) for k in ('category', 'family', 'id', 'source')}
            anchor = canonical(source)
            key = 'target:' + digest({'source': source, 'content': content_sha,
                                     'unresolved': None if source.get('id') and content_sha else [array, index]})
            target = targets.setdefault(key, {'target_key': key, 'identity': copy.deepcopy(identity),
                'current_content_sha256': content_sha, 'source_paths': [],
                'native_config': copy.deepcopy(native), 'allowed_evidence_refs': [],
                'evidence_context_paths': [], 'hit_evidence_context_paths': [],
                'scoped_gap_context_paths': [], 'blocked_reasons': [], 'can_generate': False,
                'source_identity': source, 'soc_schema_status': 'not_provided'})
            path = array + '/' + str(index)
            target['source_paths'].append(path + '/current_definition/content')
            # 只指向本目标上下文，不重复复制定义或证据；实际求值与告警原字段分别读取。
            target['evidence_context_paths'].append(path + '/alert_evidence')
            if category == 'association':
                target['hit_evidence_context_paths'].append(path + '/representative_hits')
            target['scoped_gap_context_paths'].append(path + '/scoped_collection_gaps')
            refs = set(target['allowed_evidence_refs']) | _own_refs(row, trusted, context.get('incident_id'))
            if content_sha and observed_sha == content_sha and isinstance(native, dict) and native:
                refs.add('current_definition:' + content_sha)
            target['allowed_evidence_refs'] = sorted(refs)
            target['blocked_reasons'] = sorted(set(target['blocked_reasons'] +
                _definition_boundary(identity, current, native, category)))
            identities.setdefault(anchor, set()).add(key)
    for keys in identities.values():
        if len(keys) > 1:
            for key in keys:
                targets[key]['blocked_reasons'].append('同一来源业务身份出现不同当前定义内容，需先核实本次定义来源与摘要')
    for target in targets.values():
        target['can_generate'] = not target['blocked_reasons']
    return targets


def check_candidate_binding(candidate, target):
    if not target['can_generate']:
        raise RuleError('target_correspondence', 'SOURCE_TARGET_INCOMPLETE',
                        '该目标无法形成可靠来源绑定：' + '；'.join(target['blocked_reasons']))
    original, claimed = target['native_config'], _source_identity(target['identity'])
    for field in ('ruleId', 'rule_id', 'id'):
        if field not in candidate:
            continue  # 私有冻结target_key提供绑定；SOC合同可能不要求正文携带ID。
        expected = original[field] if field in original else claimed
        try:
            actual = identifier(candidate[field])
            valid = actual == identifier(expected)
            # 已证实的reasoning命名空间双向用于业务ID，不套给数据库id。
            if field != 'id' and not valid and target['source_identity'].get('family') == 'reasoning':
                aliases = {claimed, 'reasoning:' + claimed}
                valid = identifier(expected) in aliases and actual in aliases
        except ValueError:
            valid = False
        if not valid:
            raise RuleError('target_correspondence', 'CANDIDATE_ID_CONFLICT',
                            '候选携带的身份字段' + field + '与冻结来源不一致，未补写或更换身份。')
    if 'source' in candidate:
        source = original.get('source', target['identity'].get('source'))
        if source is None or candidate['source'] != source:
            raise RuleError('target_correspondence', 'CANDIDATE_SOURCE_CONFLICT', '候选改变或伪造了原规则来源身份。')
    return {'scope': 'target_correspondence', 'status': 'pass',
            'binding': 'frozen_source_target_key_and_observed_ids',
            'candidate_identity_mapping': 'unverified_without_soc_contract'}
