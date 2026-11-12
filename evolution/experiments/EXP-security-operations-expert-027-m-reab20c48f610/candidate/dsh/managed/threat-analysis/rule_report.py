"""投影既有建议段；新版显示自然语言，旧合同仅只读展示，不转换或回写。"""
import html
import json
import re


_FIELDS = {'rule_level', 'suggestion', 'impact_scope'}
_LEGACY_FIELDS = {'rule_content', 'impact_scope', 'cannot_optimize_reason'}
_LEVELS = {'检测规则', '关联规则'}


def _text(value):
    if value is None:
        return '未提供'
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, RecursionError):
        return '字段无法安全展示，请核对规则建议原始制品。'


def _json_block(view, value):
    """仅为历史JSON形状保留原值；不用于新建议，不产生转换对象。"""
    content = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)
    fence = '`' * max(3, 1 + max((len(s) for s in re.findall(r'`+', content)), default=0))
    view.markdown.append(fence + 'json\n' + content + '\n' + fence)
    view.html_block('<pre><code class="language-json">' + html.escape(content, quote=True) + '</code></pre>')


def _render_legacy(view, row, index):
    """仅展示历史嵌套rule形状；不改写、重新选择或升级为本轮建议。"""
    rule = row.get('rule')
    diagnostic = 'rule' in row and rule is None
    view.field(f'建议 {index}', '历史规则阶段诊断' if diagnostic else '历史规则优化建议')
    if isinstance(rule, dict):
        view.table(['类别/层级', '家族', '规则 ID', '版本', '名称'],
                   [[_text(rule.get('category') or rule.get('level')), _text(rule.get('family')),
                     _text(rule.get('id')), _text(rule.get('version')), _text(rule.get('name'))]])
    for label, key in (('建议状态', 'status'), ('具体问题', 'problem'), ('优化建议', 'suggestion'),
                       ('证据引用', 'evidence_refs'), ('缺口引用', 'gap_refs'),
                       ('候选修改', 'candidate_changes'), ('待验证影响', 'expected_impact')):
        if key in row:
            view.field(label, _text(row[key]))


def _valid_new(row):
    return (isinstance(row, dict) and set(row) == _FIELDS
            and isinstance(row['rule_level'], str) and row['rule_level'] in _LEVELS
            and all(isinstance(row[key], str) and row[key].strip()
                    for key in ('suggestion', 'impact_scope')))


def render_rule_suggestions(view, suggestions):
    """只显示同一数组；不读取运行状态、推理、补字段或截取历史记录。"""
    if not isinstance(suggestions, list):
        view.field('规则建议', '字段不是数组，请核对规则建议原始制品。')
        return
    if not suggestions:
        view.field('规则建议', '本轮未列出规则优化建议；不据此认定规则无需优化或建议阶段成功。')
        return
    if any(isinstance(row, dict) and 'rule_level' in row for row in suggestions):
        if len(suggestions) > 2 or not all(_valid_new(row) for row in suggestions):
            view.field('规则建议', '自然语言建议结构或数量异常，请核对原始制品；未转换、补造或重新选择建议。')
            return
        for row in suggestions:
            view.field('规则层级', row['rule_level'])
            view.field('优化建议', row['suggestion'])
            view.field('影响范围', row['impact_scope'])
        return
    for index, row in enumerate(suggestions, 1):
        if not isinstance(row, dict):
            view.field(f'建议 {index}', '建议项不是对象，请核对规则建议原始制品。')
            continue
        if set(row) == _LEGACY_FIELDS:
            if (not isinstance(row['impact_scope'], str)
                    or not (row['rule_content'] is None or isinstance(row['rule_content'], dict))
                    or not (row['cannot_optimize_reason'] is None
                            or isinstance(row['cannot_optimize_reason'], str))):
                view.field(f'建议 {index}', '历史三字段建议结构异常，请核对原始制品；未转换或补造规则内容。')
                continue
            try:
                view.field('历史规则建议', '以下为旧合同原值，仅供历史阅读。')
                _json_block(view, row)
            except (TypeError, ValueError, RecursionError):
                view.field('规则建议', '无法安全序列化历史三字段JSON，请核对原始制品。')
        elif ('rule' in row and not ({'rule_level', 'rule_content', 'cannot_optimize_reason'} & set(row))
              and (row['rule'] is None or isinstance(row['rule'], dict))):
            _render_legacy(view, row, index)
        else:
            view.field(f'建议 {index}', '建议键集合无法识别，请核对原始制品；未按历史合同猜测或转换。')
