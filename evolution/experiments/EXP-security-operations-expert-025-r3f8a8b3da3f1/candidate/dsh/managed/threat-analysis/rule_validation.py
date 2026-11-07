"""三字段运输校验与 SOC 内部适配位置；没有默认外部调用或自造 Schema。"""
from __future__ import annotations

import copy
from rule_candidates import build_frozen_targets, check_candidate_binding
from rule_response import (PRIVATE_FIELDS, PUBLIC_FIELDS, RuleError, canonical,
                           diagnostic_suggestions, extract_response, strict_json)

# 仅可信宿主可注入经确认的只读适配器；不从模型、业务结果或MCP目录建立此表。
SOC_VALIDATION_ADAPTERS = {}
DESCRIPTION_FIELDS = {'description', 'comment', 'title', 'label', 'name'}
# 仅识别已知根级展示/数据库审计变化，不是SOC可改字段或完整性Schema。
NON_SUBSTANTIVE_ROOT_FIELDS = DESCRIPTION_FIELDS | {
    'createdAt', 'updatedAt', 'createTime', 'updateTime', 'created_at', 'updated_at',
    'create_time', 'update_time', 'createdBy', 'updatedBy', 'createBy', 'updateBy'}


def _comparison(value, root=False):
    if isinstance(value, str) and value.lstrip().startswith(('{', '[')):
        try:
            value = strict_json(value)
        except RuleError:
            return value  # 内部原生文本没有SOC合同，不借通用JSON解析器认定其非法。
    if isinstance(value, dict):
        return {k: _comparison(v) for k, v in value.items()
                if not (root and k in NON_SUBSTANTIVE_ROOT_FIELDS)}
    if isinstance(value, list):
        return [_comparison(v) for v in value]
    return value


def check_change(candidate, target):
    original = target['native_config']
    if canonical(_comparison(candidate, True)) == canonical(_comparison(original, True)):
        raise RuleError('candidate_substance', 'NO_SUBSTANTIVE_CHANGE',
                        '候选没有实质变更，仅原样返回、JSON排版、根级描述润色或数据库审计元数据变化。')
    # 对明确的局部补丁载体拒绝；不据数据库记录键集定义完整规则Schema。
    if (isinstance(candidate.get('op'), str)
            and candidate['op'] in {'add', 'remove', 'replace', 'move', 'copy', 'test'}
            and isinstance(candidate.get('path'), str) and candidate['path'].startswith('/')
            and set(candidate) <= {'op', 'path', 'value', 'from'}):
        raise RuleError('candidate_carrier', 'PATCH_NOT_COMPLETE_RULE', '候选只有修改路径补丁，不是完整规则对象。')
    return {'scope': 'candidate_substance', 'status': 'unknown',
            'observed_content_change': True, 'logic_validation': 'unverified',
            'completeness_validation': 'unverified_without_soc_contract',
            'reason': '本地仅排除明确无变更；字段映射、结构及原生文本变化不冒充SOC语义通过。'}


def validate_soc(candidate, target, adapters=None):
    """内部hook合同不等于SOC接口合同；默认绝不执行任何外部调用。"""
    adapter = (SOC_VALIDATION_ADAPTERS if adapters is None else adapters).get(target['identity'].get('category'))
    record = {'scope': 'soc_rule_format', 'status': 'unverified',
              'contract_status': 'not_provided', 'connection_status': 'not_connected'}
    if adapter is None:
        return record
    if not isinstance(adapter, dict) or adapter.get('contract_confirmed') is not True or not adapter.get('contract_version'):
        return {**record, 'adapter_status': 'contract_not_confirmed'}
    record.update(contract_status='provided', contract_version=adapter['contract_version'])
    if adapter.get('connected') is not True or not callable(adapter.get('validate')):
        return record
    if adapter.get('read_only') is not True:
        return {**record, 'adapter_status': 'read_only_not_confirmed'}
    record['connection_status'] = 'connected'
    try:
        receipt = adapter['validate'](candidate=copy.deepcopy(candidate), target=copy.deepcopy(target))
    except Exception as error:
        return {**record, 'status': 'error', 'error_type': type(error).__name__,
                'reason': '已接入的SOC格式校验适配器未取得可核对回执。'}
    if (not isinstance(receipt, dict) or receipt.get('business_status_confirmed') is not True
            or receipt.get('status') not in ('accepted', 'rejected') or not receipt.get('receipt')):
        return {**record, 'status': 'error', 'reason': 'SOC适配器回执缺少真实业务状态确认，不能凭传输成功认定通过。'}
    if receipt['status'] == 'rejected' and (not isinstance(receipt.get('reason'), str) or not receipt['reason'].strip()):
        return {**record, 'status': 'error', 'reason': 'SOC拒绝回执未包含可核对的具体字段或接口原因。'}
    return {**record, **copy.deepcopy(receipt), 'scope': 'soc_rule_format'}


def validate_suggestions(content, context, targets=None, audit=None, soc_adapters=None):
    """先校验全体绑定，再投影原值；真实SOC拒绝另产显式null诊断，不修补模型值。"""
    audit = {} if audit is None else audit
    extraction = audit.setdefault('response_extraction', {})
    value = extract_response(content, extraction)
    if not isinstance(value, dict) or set(value) != {'items'} or not isinstance(value['items'], list):
        raise RuleError('candidate_carrier', 'INVALID_ENVELOPE', '响应提取成功，但缺少唯一items数组运输封套。')
    targets = build_frozen_targets(context) if targets is None else targets
    seen, items = set(), value['items']
    checks = []
    audit['items'] = checks
    for row in items:
        if not isinstance(row, dict) or set(row) != PRIVATE_FIELDS:
            raise RuleError('candidate_carrier', 'INVALID_ITEM_FIELDS', '候选运输条目不是约定的五字段对象。')
        key = row['target_key']
        if not isinstance(key, str) or key not in targets or key in seen:
            raise RuleError('target_correspondence', 'UNKNOWN_OR_DUPLICATE_TARGET', '候选对应未知或重复的冻结来源目标。')
        seen.add(key)
        target, refs = targets[key], row['evidence_refs']
        if (not isinstance(refs, list) or any(not isinstance(ref, str) for ref in refs)
                or len(refs) != len(set(refs)) or not set(refs) <= set(target['allowed_evidence_refs'])):
            raise RuleError('evidence_traceability', 'UNBOUND_EVIDENCE', '候选证据引用不是该目标的已读来源，或存在重复。')
        scope, reason, candidate = (row[field] for field in ('impact_scope', 'cannot_optimize_reason', 'rule_content'))
        if not isinstance(scope, str) or not scope.strip():
            raise RuleError('candidate_carrier', 'EMPTY_IMPACT_SCOPE', '影响范围必须是非空说明字符串。')
        check = {'target_key': key, 'evidence_refs': copy.deepcopy(refs)}
        if candidate is None:
            if not isinstance(reason, str) or not reason.strip():
                raise RuleError('candidate_carrier', 'MISSING_NULL_REASON', '无候选正文时必须说明具体无法优化原因。')
            check['candidate_status'] = 'not_generated'
        else:
            if not isinstance(candidate, dict) or not candidate or reason is not None:
                raise RuleError('candidate_carrier', 'INVALID_PUBLIC_VALUES', '候选须为非空JSON对象，且不能同时给出无法优化原因。')
            if not refs:
                raise RuleError('evidence_traceability', 'MISSING_CANDIDATE_EVIDENCE', '非空候选没有该目标可追溯的规则或事件依据。')
            check['binding'] = check_candidate_binding(candidate, target)
            check['change'] = check_change(candidate, target)
            check['candidate_status'] = 'unverified_draft'
        checks.append(check)
    if seen != set(targets):
        raise RuleError('target_correspondence', 'MISSING_TARGET', '模型遗漏已知冻结目标，不能将未分析视作无需优化。')
    public = []
    for row, check in zip(items, checks):
        projected = {field: copy.deepcopy(row[field]) for field in PUBLIC_FIELDS}
        if row['rule_content'] is not None:
            receipt = validate_soc(row['rule_content'], targets[row['target_key']], soc_adapters)
            check['soc_validation'] = receipt
            if receipt['status'] in ('rejected', 'error'):
                prefix = 'SOC规则格式明确拒绝：' if receipt['status'] == 'rejected' else 'SOC规则校验接口处理失败：'
                projected = diagnostic_suggestions([], prefix + receipt['reason'],
                    {row['target_key']: targets[row['target_key']]})[0]
                check['candidate_status'] = 'rejected' if receipt['status'] == 'rejected' else 'validation_failed'
        public.append(projected)
    audit['projection'] = {'scope': 'local_json', 'status': 'pass',
                           'public_fields': list(PUBLIC_FIELDS), 'values_preserved': True,
                           'soc_rejections_are_explicit_diagnostics': True}
    return public
