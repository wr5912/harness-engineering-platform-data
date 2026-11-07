"""纯业务规则门槛；无模型/MCP调用，不读取基础机械校验或模型自报的例外。"""
from __future__ import annotations

import copy
import math

DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.75
_VERDICTS = {'误报', '可疑', '真实告警'}
_ANOMALY_CODES = {'REDUNDANT_EVIDENCE_REUSE', 'UNRELATED_ENTITY_MIXING', 'RULE_DESIGN_MISMATCH'}


def _unit_number(value):
    # JSON数值只接受真正的int/float；bool、字符串、NaN/Infinity均不得偷转。
    return type(value) in (int, float) and 0 <= value <= 1 and math.isfinite(value)


def _nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def _gap(code, source, message):
    return {'id': 'gate-' + code.lower().replace('_', '-'), 'code': code,
            'stage': 'business_gate', 'source': source, 'message': message}


def _review_exceptions(review_context):
    """调用方必须在宿主可信边界组装此私有参数；base_result绝不作为来源。

    人工请求须有user/authorized_task来源及原生引用；异常须为已取得的具体
    证据复用、实体混入或设计不符，普通重复命中计数/自由文本不构成例外。
    此处结构检查不代替宿主对用户身份、任务授权、事件绑定的核验。
    """
    if not isinstance(review_context, dict):
        return [], []
    reasons, sources = [], []
    request = review_context.get('explicit_rule_review_source')
    if (review_context.get('explicit_rule_review_requested') is True
            and isinstance(request, dict) and request.get('kind') in ('user', 'authorized_task')
            and _nonempty(request.get('reference'))):
        reasons.append('EXPLICIT_RULE_REVIEW_REQUESTED')
        sources.append({'kind': request['kind'], 'reference': request['reference']})
    anomalies = review_context.get('observed_rule_anomalies')
    if isinstance(anomalies, list):
        for row in anomalies:
            if (not isinstance(row, dict) or not isinstance(row.get('code'), str)
                    or row['code'] not in _ANOMALY_CODES
                    or not _nonempty(row.get('source')) or not _nonempty(row.get('message'))
                    or not isinstance(row.get('evidence_refs'), list) or not row['evidence_refs']
                    or not all(_nonempty(ref) for ref in row['evidence_refs'])):
                continue
            if 'OBSERVED_RULE_ANOMALY' not in reasons:
                reasons.append('OBSERVED_RULE_ANOMALY')
            sources.append({key: copy.deepcopy(row[key])
                            for key in ('code', 'source', 'evidence_refs', 'message')})
    return reasons, sources


def evaluate_gate(base_result, *, route='five_source', threshold=0.75, review_context=None):
    """只按真实可用结论、分数及可信宿主私有例外返回内部门槛记录。

    不接收/读取base_validation；不修改任何输入。缺业务值不猜结论或补0。
    review_context不能从基础模型输出、工具参数或用户预设结论直接复制。
    """
    gate = {'gate_status': 'undetermined', 'reason_codes': [],
            'low_confidence_threshold': threshold if _unit_number(threshold) else None,
            'collection_gaps': [], 'review_sources': []}
    if route == 'fast_classification':
        gate.update(gate_status='not_applicable', reason_codes=['FAST_CLASSIFICATION'])
        return gate
    if route != 'five_source':
        gate['reason_codes'] = ['ANALYSIS_ROUTE_UNDETERMINED']
        gate['collection_gaps'].append(_gap('ANALYSIS_ROUTE_UNDETERMINED', 'route',
                                            '未取得可确认的完整研判路由，不能自动进入规则分析。'))
        return gate
    if not _unit_number(threshold):
        gate['reason_codes'] = ['LOW_CONFIDENCE_THRESHOLD_INVALID']
        gate['collection_gaps'].append(_gap('LOW_CONFIDENCE_THRESHOLD_INVALID', 'rule-review-policy.json',
                                            '低置信度阈值必须为[0,1]内的有限数值；未采用隐式转换或替代阈值。'))
        return gate
    exceptions, sources = _review_exceptions(review_context)
    gate['review_sources'] = sources
    if not isinstance(base_result, dict):
        gate['collection_gaps'].append(_gap('BASE_RESULT_UNAVAILABLE', 'base_result',
                                            '没有可用的基础结果容器；不伪造结论、分数或成功结果。'))
        gate['reason_codes'] = ['BUSINESS_INPUT_UNDETERMINED']
        return gate
    else:
        verdict = base_result.get('verdict')
        score = base_result.get('confidence_score')
        if not isinstance(verdict, str) or verdict not in _VERDICTS:
            gate['collection_gaps'].append(_gap('VERDICT_UNAVAILABLE', 'base_result.verdict',
                                                '结论缺失或无法辨认，未自动归为可疑。'))
        if not _unit_number(score):
            gate['collection_gaps'].append(_gap('CONFIDENCE_UNAVAILABLE', 'base_result.confidence_score',
                                                '置信度缺失或不是[0,1]内有限数值，未按0或字符串转换处理。'))
    if exceptions:
        gate.update(gate_status='collect', reason_codes=exceptions)
        return gate
    # 误报/可疑本身已满足业务门槛，分数非触发依赖；缺分数仅保留真实缺口。
    if verdict == '误报':
        gate.update(gate_status='collect', reason_codes=['FALSE_POSITIVE'])
    elif verdict == '可疑':
        gate.update(gate_status='collect', reason_codes=['SUSPICIOUS'])
    elif gate['collection_gaps']:
        gate['reason_codes'] = ['BUSINESS_INPUT_UNDETERMINED']
    elif score < threshold:
        gate.update(gate_status='collect', reason_codes=['LOW_CONFIDENCE_TRUE_POSITIVE'])
    else:
        gate.update(gate_status='skipped', reason_codes=['TRUE_POSITIVE_AT_OR_ABOVE_THRESHOLD'])
    return gate
