"""响应提取与严格 JSON；只移除唯一完整传输围栏，不修补业务值。"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

PUBLIC_FIELDS = ('rule_content', 'impact_scope', 'cannot_optimize_reason')
PRIVATE_FIELDS = set(PUBLIC_FIELDS) | {'target_key', 'evidence_refs'}


class RuleError(ValueError):
    def __init__(self, scope, code, message, **details):
        super().__init__(message)
        self.scope, self.code, self.details = scope, code, details

    def record(self):
        return {'scope': self.scope, 'status': 'fail', 'code': self.code,
                'reason': str(self), **self.details}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def dump(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise RuleError('response_extraction', 'DUPLICATE_KEY', '模型响应含重复JSON键，无法唯一提取。')
            result[key] = value
        return result
    def invalid(_value):
        raise RuleError('response_extraction', 'NON_FINITE_NUMBER', '模型响应含非标准或非有限数值。')
    try:
        value = json.loads(text, object_pairs_hook=pairs, parse_constant=invalid)
        canonical(value).encode('utf-8')  # 拒绝溢出数及无法无损落盘的孤立代理码，不改业务值。
        return value
    except json.JSONDecodeError as error:
        raise RuleError('response_extraction', 'JSON_PARSE_ERROR',
                        '模型响应提取失败：JSON不完整或语法错误。',
                        line=error.lineno, column=error.colno, offset=error.pos) from error
    except UnicodeError as error:
        raise RuleError('response_extraction', 'INVALID_UNICODE', '模型响应提取失败：含不能无损保存为UTF-8的字符。') from error
    except (OverflowError, RecursionError) as error:
        raise RuleError('response_extraction', 'JSON_LIMIT', '模型响应提取失败：数值或嵌套超出可解析范围。') from error
    except ValueError as error:
        if isinstance(error, RuleError):
            raise
        raise RuleError('response_extraction', 'NON_FINITE_NUMBER', '模型响应含溢出或非有限数值。') from error


def extract_response(content, audit=None):
    if not isinstance(content, str):
        raise RuleError('response_extraction', 'CONTENT_NOT_TEXT', '模型响应提取失败：未返回文本内容。')
    body, method = content.strip(), 'direct_json'
    if body.startswith('```'):
        match = re.fullmatch(r'```json[ \t]*\r?\n([\s\S]*?)\r?\n```', body)
        if not match or re.search(r'(?m)^[ \t]*```', match.group(1)):
            raise RuleError('response_extraction', 'AMBIGUOUS_FENCE', '模型响应提取失败：不是全文唯一完整的json代码块。')
        body, method = match.group(1), 'single_json_fence'
    value = strict_json(body)
    if audit is not None:
        audit.update(scope='response_extraction', status='pass', method=method,
                     raw_sha256=hashlib.sha256(content.encode('utf-8')).hexdigest(),
                     extracted_sha256=hashlib.sha256(body.encode('utf-8')).hexdigest())
    return value


def diagnostic_suggestions(gaps, message, targets=None):
    """显式失败结果，不修补非法模型候选；已知目标逐项保留。"""
    labels = []
    for target in (targets or {}).values():
        identity = target.get('identity', {})
        labels.append(str(identity.get('category', '规则')) + '/' + str(identity.get('id', '身份未确认')))
    return [{'rule_content': None,
             'impact_scope': (label + '：' if label else '') + '本次未形成可交付的规则审阅草案。',
             'cannot_optimize_reason': message} for label in (labels or [''])]
