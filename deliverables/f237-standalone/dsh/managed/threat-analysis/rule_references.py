"""按已读条件载体选择规范参考；规范例不冒充本案观测或SOC表达合同。"""
from __future__ import annotations

import copy
import hashlib
import json

_EXCERPT = "netsh interface show interface [name=]string\nnetsh interface portproxy show all\n"
_REFERENCE = {
    'reference_id': 'reference_document:' + hashlib.sha256(_EXCERPT.encode('utf-8')).hexdigest(),
    'kind': 'command_syntax_reference',
    'publisher': 'Microsoft Learn / MicrosoftDocs',
    'source_url': 'https://raw.githubusercontent.com/MicrosoftDocs/windowsserverdocs/refs/heads/main/WindowsServerDocs/administration/windows-commands/netsh-interface.md',
    'retrieved_date': '2026-11-04',
    'excerpt': _EXCERPT,
    'excerpt_sha256': hashlib.sha256(_EXCERPT.encode('utf-8')).hexdigest(),
    'origin_boundary': '官方规范语法摘录，不是本案已观测命令或已发生漏报，也不是预写的候选规则。',
    'applicability': '供使用既有process.name与cmd_line条件的Windows网络枚举规则核对当前覆盖；是否有问题仍须结合实际定义与识别目标。',
    'expression_boundary': '不授予新字段、操作符或规则写入能力；新增表达沿已读SOC载体。摘录未单独确认省略名称参数、命令缩写、所有Windows版本及命令执行结果。',
    'effect_boundary': '规范中的只读查询不证明本案行为良性或获授权。扩覆盖可能增加正常运维噪声，不声称实际误漏报数量、收益或部署安全。',
}


def _uses_netsh_conditions(native):
    value = native.get('conditionJson')
    if not isinstance(value, str):
        return False
    try:
        tree = json.loads(value)
    except (TypeError, ValueError):
        return False
    stack, visited, executable, command = [tree], 0, False, False
    while stack and visited < 2048:
        node = stack.pop()
        visited += 1
        if isinstance(node, list):
            stack.extend(node)
        elif isinstance(node, dict):
            leaf = node.get('leaf')
            if isinstance(leaf, dict):
                values = leaf.get('value')
                if (leaf.get('field') == 'ocsf.process.name' and leaf.get('op') == 'MATCHES_ANY'
                        and isinstance(values, list) and any(isinstance(v, str) and 'netsh' in v.lower() for v in values)):
                    executable = True
                if leaf.get('field') == 'ocsf.process.cmd_line' and leaf.get('op') == 'COMMAND_MATCHES':
                    command = True
            stack.extend(v for v in node.values() if isinstance(v, (dict, list)))
    return executable and command


def annotate_reference_context(context, targets):
    """引用只绑定适用的当前目标；每次重新冻结后重附并由主流程计入最终预算。"""
    keys = []
    for key, target in targets.items():
        native, identity = target.get('native_config'), target.get('identity', {})
        if (identity.get('category') != 'detection' or not isinstance(native, dict)
                or not _uses_netsh_conditions(native)):
            continue
        keys.append(key)
        refs = target.get('allowed_evidence_refs')
        if isinstance(refs, list) and _REFERENCE['reference_id'] not in refs:
            refs.append(_REFERENCE['reference_id'])
    if keys:
        context['rule_reference_documents'] = [{**copy.deepcopy(_REFERENCE), 'target_keys': sorted(keys)}]
    else:
        context.pop('rule_reference_documents', None)
