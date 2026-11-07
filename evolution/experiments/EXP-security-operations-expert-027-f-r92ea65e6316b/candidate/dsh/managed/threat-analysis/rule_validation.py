"""自然语言建议的确定性护栏与私有来源绑定；不校验或执行SOC规则正文。

这些检查不能证明全部语义正确。事实断言、条件性方向和影响边界仍须按
本案原始材料复核；不追加模型裁决，不用关键词命中冒充业务通过。
"""
from __future__ import annotations

import re
import unicodedata

from rule_response import PRIVATE_FIELDS, PUBLIC_FIELDS, RuleError, canonical, digest, extract_response

LEVELS = {'检测规则', '关联规则'}
DOMAINS = {'graph', 'edr_detail', 'asset', 'threat_intel', 'history'}
_PLACEHOLDERS = {'暂无建议', '无建议', '没有建议', '没有优化建议', '暂无优化建议', '取证失败',
                 '无法优化', '无法生成建议', '待确认', '提高准确率', '结合上下文', '增加白名单', '优化规则'}
_DECLARATION_KEYS = {'ruleid', 'rule_id', 'rule_ids', 'rulename', 'rule_name', 'ruletype',
                     'rule_type', 'event_type', 'eventtype', 'claim_type', 'verdict',
                     'confidence_score', 'data_completeness', 'classification', 'attack_stage',
                     'technique', 'technique_name'}


def _key(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value)).casefold().rstrip('。；;！!')


def _nonempty(value):
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (dict, list)):
        return bool(value)
    return True  # 数字0与布尔false也是已经返回的原值，不隐式当作缺失。


def validate_public_suggestions(suggestions):
    """严格断言已采纳的最终三字段数组；候选项的独立取舍由validate_suggestions完成。"""
    if not isinstance(suggestions, list) or len(suggestions) > 2:
        raise RuleError('suggestion_contract', 'INVALID_ARRAY', '建议必须是最多两项的数组。')
    seen = set()
    for index, row in enumerate(suggestions):
        if not isinstance(row, dict) or set(row) != set(PUBLIC_FIELDS):
            raise RuleError('suggestion_contract', 'INVALID_ITEM_FIELDS',
                            '建议项必须且只能含rule_level、suggestion、impact_scope。', item_index=index)
        if not isinstance(row['rule_level'], str) or row['rule_level'] not in LEVELS:
            raise RuleError('suggestion_contract', 'INVALID_RULE_LEVEL',
                            '层级必须单独取检测规则或关联规则。', item_index=index)
        for field in ('suggestion', 'impact_scope'):
            text = row[field]
            if not isinstance(text, str) or not text.strip():
                raise RuleError('suggestion_contract', 'EMPTY_TEXT',
                                '建议及影响范围必须是非空自然语言字符串。', item_index=index, field=field)
            if _key(text) in {_key(value) for value in _PLACEHOLDERS}:
                raise RuleError('suggestion_quality', 'PLACEHOLDER_TEXT',
                                '无建议、故障诊断或泛化口号不能作为一项建议。', item_index=index, field=field)
        direction = _key(row['suggestion'])
        if direction in seen:
            raise RuleError('suggestion_quality', 'DUPLICATE_SUGGESTION',
                            '同一具体方向重复出现，未截取或合并模型内容。', item_index=index)
        seen.add(direction)
    try:
        canonical(suggestions).encode('utf-8')
    except (TypeError, ValueError, UnicodeError, RecursionError) as error:
        raise RuleError('suggestion_contract', 'UNSAFE_PUBLIC_VALUES',
                        '建议不能无损保存为标准UTF-8 JSON。') from error
    return suggestions


def _resolve_pointer(context, pointer):
    if not isinstance(pointer, str) or not pointer.startswith('/') or re.search(r'~(?![01])', pointer):
        raise RuleError('evidence_traceability', 'INVALID_POINTER', '引用必须是合法的绝对JSON pointer。')
    tokens = [token.replace('~1', '/').replace('~0', '~') for token in pointer[1:].split('/')]
    current = context
    for token in tokens:
        if isinstance(current, dict) and token in current:
            current = current[token]
        elif isinstance(current, list) and re.fullmatch(r'0|[1-9][0-9]*', token):
            try:
                index = int(token)
            except ValueError as error:
                raise RuleError('evidence_traceability', 'UNRESOLVED_POINTER',
                                '引用数组下标超出可解析范围。') from error
            if index >= len(current):
                raise RuleError('evidence_traceability', 'UNRESOLVED_POINTER', '引用数组下标不存在。')
            current = current[index]
        else:
            raise RuleError('evidence_traceability', 'UNRESOLVED_POINTER', '引用不指向本次上下文的真实原值。')
    if not _nonempty(current):
        raise RuleError('evidence_traceability', 'EMPTY_EVIDENCE', '空值或空容器不能作为建议依据。')
    return tokens, current


def _has_business_value(value, field=None):
    # 迭代遍历已解析的JSON，避免深层业务值使单条校验递归溢出而连坐其他项。
    pending = [(value, field)]
    while pending:
        current, key = pending.pop()
        if isinstance(key, str) and key.casefold() in _DECLARATION_KEYS:
            continue
        if isinstance(current, dict):
            pending.extend((item, child_key) for child_key, item in current.items())
        elif isinstance(current, list):
            pending.extend((item, key) for item in current)
        elif _nonempty(current):
            return True
    return False


def validate_suggestions(content, context, audit):
    """先核对同案封套，再逐项独立验收非空五源引用与三字段；不连坐其他合格项。"""
    audit = {} if audit is None else audit
    extraction = audit.setdefault('response_extraction', {})
    value = extract_response(content, extraction)
    expected = context.get('incident_id') if isinstance(context, dict) else None
    frozen = context.get('five_source') if isinstance(context, dict) else None
    if (not isinstance(expected, str) or re.fullmatch(r'INC-\d{8}-\d{6}', expected) is None
            or not isinstance(frozen, dict) or frozen.get('unified_event_id') != expected):
        raise RuleError('event_binding', 'UNCONFIRMED_CONTEXT_EVENT', '上下文尚未绑定真实同案五源。')
    if (not isinstance(value, dict) or set(value) not in (
            {'incident_id', 'items'}, {'incident_id', 'items', 'no_suggestion_reason'})
            or value.get('incident_id') != expected or not isinstance(value.get('items'), list)):
        raise RuleError('event_binding', 'INVALID_ENVELOPE',
                        '响应须绑定同一incident_id及items，额外仅允许私有no_suggestion_reason。')
    rows, public, checks = value['items'], [], []
    audit['items'] = checks
    if len(rows) > 2:
        raise RuleError('suggestion_contract', 'TOO_MANY_ITEMS', '模型返回超过两项，未静默截断。')
    reason = value.get('no_suggestion_reason')
    if not rows:
        if (not isinstance(reason, dict) or set(reason) != {'kind', 'detail'}
                or not isinstance(reason.get('kind'), str)
                or reason['kind'] not in {'data_insufficient', 'no_rule_issue', 'no_safe_adjustment'}
                or not isinstance(reason.get('detail'), str) or not reason['detail'].strip()
                or re.search(r'[\u3400-\u9fff]', reason['detail']) is None
                or _key(reason['detail']) in {_key(item) for item in _PLACEHOLDERS
                                               | {'数据不足', '无问题', '没有合理改法'}}):
            raise RuleError('analysis_reason', 'MISSING_SPECIFIC_EMPTY_REASON',
                            '空建议须给私有合法原因类别及具体中文说明；未猜造原因或标正常完成。')
        audit['analysis_reason'] = {'origin': 'model_reported_reference',
                                    'independent_ground_truth': False,
                                    'kind': reason['kind'], 'detail': reason['detail']}
    elif reason is not None:
        raise RuleError('analysis_reason', 'UNEXPECTED_NONEMPTY_REASON',
                        '已有建议时no_suggestion_reason只能省略或为null。')
    for index, row in enumerate(rows):
        records, business, current_ref = [], False, None
        try:
            if not isinstance(row, dict) or set(row) != PRIVATE_FIELDS:
                raise RuleError('suggestion_contract', 'INVALID_PRIVATE_FIELDS',
                                '私有建议须为新三字段及evidence_refs，不接受旧合同或其他字段。')
            projected = {field: row[field] for field in PUBLIC_FIELDS}
            validate_public_suggestions([projected])
            refs = row['evidence_refs']
            if (not isinstance(refs, list) or not refs or any(not isinstance(ref, str) for ref in refs)
                    or len(refs) != len(set(refs))):
                raise RuleError('evidence_traceability', 'INVALID_EVIDENCE_REFS',
                                '每项必须有互异且可回查的来源引用。')
            for ref in refs:
                current_ref = ref
                tokens, source = _resolve_pointer(context, ref)
                is_business = (len(tokens) >= 4 and tokens[:2] == ['five_source', 'enriched_context']
                               and tokens[2] in DOMAINS
                               and not any(token.casefold() in _DECLARATION_KEYS for token in tokens[3:])
                               and _has_business_value(source, tokens[-1]))
                business = business or is_business
                records.append({'pointer': ref, 'value_sha256': digest(source), 'business_evidence': is_business})
            current_ref = None
            if not business:
                raise RuleError('evidence_traceability', 'NO_FIVE_SOURCE_BUSINESS_EVIDENCE',
                                '不能仅用基础归纳、门槛、规则声明标签或空组织域背书。')
            # 只与已经通过的项检查重复；失败项不能占用后续合格项的方向。
            validate_public_suggestions(public + [projected])
        except RuleError as error:
            failure = {**error.record(), 'item_index': index}
            if current_ref is not None:
                failure.setdefault('pointer', current_ref)
            checks.append({'item_index': index, 'status': 'fail',
                           'evidence_refs': records, 'failure': failure})
            continue
        checks.append({'item_index': index, 'status': 'pass',
                       'public_index': len(public), 'evidence_refs': records})
        public.append(projected)
    accepted = [item['item_index'] for item in checks if item['status'] == 'pass']
    rejected = [item['item_index'] for item in checks if item['status'] == 'fail']
    audit['projection'] = {
        'scope': 'natural_language_suggestions',
        'status': 'fail' if rows and not public else 'partial' if rejected else 'pass',
        'candidate_count': len(rows), 'accepted_count': len(accepted), 'rejected_count': len(rejected),
        'accepted_item_indices': accepted, 'rejected_item_indices': rejected,
        'public_fields': list(PUBLIC_FIELDS), 'values_preserved': True,
        'semantic_review': 'requires_case_evidence_review_not_fully_automated',
    }
    if rows and not public:
        raise RuleError('suggestion_validation', 'ALL_ITEMS_REJECTED',
                        '所有候选建议均未通过逐条校验，具体索引与拒因保留在私有审计中；不冒充合理无建议。')
    # 对已采纳数组作最终不变量断言，不重新筛选、修补或重排内容。
    validate_public_suggestions(public)
    return public
