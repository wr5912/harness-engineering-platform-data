"""仅投影既有规则建议段；新协议严格三字段，旧记录只读兼容。"""
import html
import json
import re


_FIELDS = {'rule_content', 'impact_scope', 'cannot_optimize_reason'}


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
    """同一合法JSON正文用于Markdown/HTML；围栏长度避免数据提前闭合。"""
    content = json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)
    fence = '`' * max(3, 1 + max((len(s) for s in re.findall(r'`+', content)), default=0))
    view.markdown.append(fence + 'json\n' + content + '\n' + fence)
    view.html_block('<pre><code class="language-json">' + html.escape(content, quote=True) + '</code></pre>')


def _render_legacy(view, row, index):
    """仅展示历史形状；不产生转换后的业务对象，不改写历史记录。"""
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


def render_rule_suggestions(view, suggestions):
    """只在调用方既有规则建议段展示；不读取run或运行态，不添加状态段。"""
    if not isinstance(suggestions, list):
        view.field('规则建议', '字段不是数组，请核对规则建议原始制品。')
        return
    if not suggestions:
        view.field('规则建议', '本轮未列出规则优化建议。')
        return
    for index, row in enumerate(suggestions, 1):
        if not isinstance(row, dict):
            view.field(f'建议 {index}', '建议项不是对象，请核对规则建议原始制品。')
            continue
        if not (_FIELDS & set(row)):
            _render_legacy(view, row, index)
            continue
        if (set(row) != _FIELDS or not isinstance(row.get('impact_scope'), str)
                or not (row.get('rule_content') is None or isinstance(row.get('rule_content'), dict))
                or not (row.get('cannot_optimize_reason') is None
                        or isinstance(row.get('cannot_optimize_reason'), str))):
            view.field(f'建议 {index}', '三字段建议结构异常，请核对原始制品；未转换或补造规则内容。')
            continue
        view.field(f'建议 {index}', '规则优化建议（仅供审阅，未执行规则变更）')
        view.field('规则正文', '如下 JSON（null 表示未生成优化规则）')
        try:
            _json_block(view, row['rule_content'])
        except (TypeError, ValueError, RecursionError):
            view.field('规则正文', '无法安全序列化为JSON，请核对原始制品。')
        view.field('影响范围', row['impact_scope'])
        view.field('无法优化原因', row['cannot_optimize_reason'] if row['cannot_optimize_reason'] is not None else 'null')
