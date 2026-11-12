"""严格低置信度门槛；只读业务值，不调用模型/MCP，不接收人工例外。"""
from __future__ import annotations

import math
import re

DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.75
_VERDICTS = {'误报', '可疑', '真实告警'}


def _unit_number(value):
    return type(value) in (int, float) and 0 <= value <= 1 and math.isfinite(value)


def _gap(code, source, message):
    return {'id': 'gate-' + code.lower().replace('_', '-'), 'code': code,
            'stage': 'business_gate', 'source': source, 'message': message}


def evaluate_gate(base_result, *, route='five_source', threshold=.75,
                  incident_id=None, source_confirmed=False, source_gap=None):
    """完整来源和本案身份必须由真实冻结材料确认；不读取基础validation。"""
    gate = {'gate_status': 'undetermined', 'reason_codes': [],
            'low_confidence_threshold': threshold if _unit_number(threshold) else None,
            'collection_gaps': []}
    if route == 'fast_classification':
        gate.update(gate_status='not_applicable', reason_codes=['FAST_CLASSIFICATION'])
        return gate

    def missing(code, source, message):
        gate['collection_gaps'].append(_gap(code, source, message))

    if route != 'five_source':
        missing('ANALYSIS_ROUTE_UNDETERMINED', 'route', '未确认五源完整研判路由。')
    if source_confirmed is not True:
        message = (source_gap if isinstance(source_gap, str) and source_gap.strip()
                   else '未能与本案同轮冻结五源及原字节摘要核对来源。')
        missing('FROZEN_SOURCE_UNCONFIRMED', 'frozen_five_source', message)
    valid_identity = (isinstance(incident_id, str)
                      and re.fullmatch(r'INC-\d{8}-\d{6}', incident_id) is not None)
    if not valid_identity:
        missing('INCIDENT_ID_UNAVAILABLE', 'incident_id', '缺少唯一合法事件身份，未补造事件ID。')
    if not _unit_number(threshold):
        missing('LOW_CONFIDENCE_THRESHOLD_INVALID', 'rule-review-policy.json',
                '低置信度阈值不是[0,1]内有限数值，未隐式转换或改用替代值。')
    if not isinstance(base_result, dict):
        missing('BASE_RESULT_UNAVAILABLE', 'base_result', '没有可核对的基础结果容器。')
    else:
        actual = base_result.get('unified_event_id')
        if not valid_identity or not isinstance(actual, str) or actual != incident_id:
            missing('BASE_INCIDENT_UNCONFIRMED', 'base_result.unified_event_id',
                    '基础结果事件身份缺失或与本案不符，未补写身份。')
        verdict, score = base_result.get('verdict'), base_result.get('confidence_score')
        if not isinstance(verdict, str) or verdict not in _VERDICTS:
            missing('VERDICT_UNAVAILABLE', 'base_result.verdict', '结论缺失或非法，未自动归为可疑。')
        if not _unit_number(score):
            missing('CONFIDENCE_UNAVAILABLE', 'base_result.confidence_score',
                    '置信度不是[0,1]内有限真数值，未将bool、字符串或空值转为分数。')
    if gate['collection_gaps']:
        gate['reason_codes'] = [row['code'] for row in gate['collection_gaps']]
        return gate
    if score < threshold:
        gate.update(gate_status='collect', reason_codes=['LOW_CONFIDENCE_FULL_ANALYSIS'])
    else:
        gate.update(gate_status='skipped', reason_codes=['CONFIDENCE_AT_OR_ABOVE_THRESHOLD'])
    return gate
