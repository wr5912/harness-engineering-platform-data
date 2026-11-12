"""经本轮 MCP bridge 完成 SOC 状态写回，报告制品保留在本地运行目录。"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import re
import stat
from pathlib import Path

from mcp_gateway import classify_response, extract_result_data
from fusion_contract import CallOutcome

LIMIT = 1048576
VALIDATION_STATUSES = {'passed', 'passed_with_warnings', 'failed', 'not_applicable_fast_classification'}


def build_writeback(run, report_html):
    raw = run['result']
    verdict = raw.get('verdict')
    if verdict not in ('误报', '真实告警', '可疑'):
        raise ValueError('verdict cannot be mapped to SOC')
    validation = run.get('validation', {}).get('status')
    if validation not in VALIDATION_STATUSES:
        raise ValueError('validationStatus cannot be mapped to SOC')
    if run['status'] != 'completed':
        raise ValueError('incomplete judgement requires SOC fail interface')
    if len(report_html.encode('utf-8')) > LIMIT:
        raise ValueError('reportHtml exceeds 1048576 UTF-8 bytes')
    fast = run['route'] == 'fast_classification'
    summary = f"事件 {run['incident_id']}，{'快速' if fast else '完整'}研判结论：{verdict}。"
    if fast:
        summary += f"命中 {len(raw.get('matches', []))} 条名单记录；依据名单规则生成，未进行完整行为研判。"
    else:
        reasoning = raw.get('reasoning_summary')
        detail = reasoning if isinstance(reasoning, str) else ''
        suffix = '模型输出校验未通过，需人工复核。' if validation == 'failed' else ''
        # 生成独立短摘要，超出时使用固定概述；原文全部保留在 resultJson 和报告。
        summary += (detail if len(summary + detail + suffix) <= 500 else '完整研判依据与建议见报告。') + suffix
    if len(summary) > 500:
        raise ValueError('summary exceeds 500 Unicode code points')
    confidence = None if fast else raw.get('confidence_score')
    if confidence is not None and (isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1):
        raise ValueError('confidence cannot be mapped to SOC')
    result_json = copy.deepcopy({k: v for k, v in run.items() if k != 'delivery'})
    result_json['schema_version'] = '1.0'
    if len(json.dumps(result_json, ensure_ascii=False).encode('utf-8')) > LIMIT:
        raise ValueError('resultJson exceeds 1048576 UTF-8 bytes')
    body = {'runId': run['run_id'], 'route': run['route'], 'llmInvoked': run['llm_invoked'],
            'verdict': verdict, 'validationStatus': validation,
            'summary': summary, 'reportHtml': report_html, 'resultJson': result_json,
            'schemaVersion': '1.0', 'agentName': 'threat-analysis'}
    if confidence is not None:
        body['confidence'] = confidence
    if run.get('model'):
        body['model'] = run['model']
    return body


class SocWriteError(RuntimeError):
    def __init__(self, code=None, error_type=None, business_message=None):
        super().__init__('SOC judgement MCP request failed')
        self.code = code
        self.error_type = error_type
        self.business_message = business_message


class SocJudgementClient:
    # 与只读取证入口分开，只能读取待研判列表并执行三个已确认的写入工具。
    TOOLS = {
        'pending': 'ai_soc_correlate__get_correlate_incident_judge_pending',
        'claim': 'ai_soc_correlate__create_incident_judgement_claim',
        'result': 'ai_soc_correlate__update_incident_judgement_result',
        'fail': 'ai_soc_correlate__create_correlate_incident_judgement_fail',
    }

    def __init__(self, gateway, output):
        self.gateway = gateway
        self.output = Path(output)

    def invoke(self, operation, arguments):
        name = self.TOOLS[operation]
        # 请求在网络调用前保存；同一 judgementId/runId 可用原请求重试，不重跑研判。
        self.output.mkdir(parents=True, exist_ok=True)
        (self.output / f'soc-{operation}-request.json').write_text(
            json.dumps(arguments, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        response = self.gateway.invoke_trusted(
            resource='ai_soc_correlate', tool_name=name, arguments=arguments)
        (self.output / f'soc-{operation}-response.json').write_text(
            json.dumps(response, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if not isinstance(response, dict):
            raise SocWriteError()
        if classify_response(response) not in (CallOutcome.SUCCESS_WITH_DATA, CallOutcome.SUCCESS_EMPTY):
            inner = response.get('result')
            code = inner.get('code', response.get('status_code')) if isinstance(inner, dict) else response.get('status_code')
            message = inner.get('msg') or inner.get('message') if isinstance(inner, dict) else None
            raise SocWriteError(code, response.get('error_type'), message if isinstance(message, str) else None)
        return extract_result_data(response)

    def claim(self, incident_id):
        data = self.invoke('claim', {'incidentId': incident_id})
        if not isinstance(data, dict) or not isinstance(data.get('judgementId'), str) or not data['judgementId']:
            raise ValueError('SOC claim missing judgementId')
        return data

    def pending(self, page_size=100):
        if isinstance(page_size, bool) or not isinstance(page_size, int) or not 1 <= page_size <= 100:
            raise ValueError('pending page size must be between 1 and 100')
        return self.invoke('pending', {'pageNum': 1, 'pageSize': page_size,
                                       'previewPriority': False})

    def write(self, operation, judgement_id, body):
        error = None
        for attempt in range(1, 3):
            try:
                data = self.invoke(operation, {'judgementId': judgement_id, 'body': body})
                # judgementId/runId 保持不变，响应丢失时可由 SOC 幂等重放。
                return {'status': 'saved', 'judgement_id': judgement_id, 'attempts': attempt,
                        'replayed': isinstance(data, dict) and data.get('replayed') is True}
            except Exception as caught:
                error = caught
        state = {'status': 'failed', 'error_type': type(error).__name__, 'attempts': 2}
        if isinstance(error, SocWriteError):
            state['code'] = error.code
        return state


def build_failure_writeback(run):
    # 只传阶段与错误类别，避免异常文本带出连接凭据；详细证据留在本地运行目录。
    body = {'runId': run['run_id'], 'errorType': run.get('error_type', run['status']),
            'error': f"{run['status']}: {run.get('error_type', 'no deliverable result')}",
            'resultJson': copy.deepcopy({k: v for k, v in run.items() if k != 'delivery'}),
            'agentName': 'threat-analysis'}
    if run.get('model'):
        body['model'] = run['model']
    return body


def persist(run, report_html, gateway):
    """确认 runner 已保存的同次 HTML；gateway 仅定位本地取证目录，不调用 MCP。"""
    states = {'summary': {'status': 'not_configured'}}
    try:
        revision = run.get('report_revision')
        if type(revision) is not int or revision < 1:
            raise ValueError('missing trusted report business revision')
        run_id, incident_id = run['run_id'], run['incident_id']
        if not isinstance(run_id, str) or not re.fullmatch(
                r'run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', run_id):
            raise ValueError('invalid run ID')
        if not isinstance(incident_id, str) or not re.fullmatch(r'INC-\d{8}-\d{6}', incident_id):
            raise ValueError('invalid incident ID')
        content = report_html.encode('utf-8')
        if len(content) > LIMIT:
            raise ValueError('reportHtml exceeds 1048576 UTF-8 bytes')
        # build_gateway 的 raw_directory 固定为本次 output/fusion/raw；不从模型取路径。
        raw = Path(gateway.raw_directory).absolute()
        output = raw.parent.parent
        if raw.name != 'raw' or raw.parent.name != 'fusion' or output.name != run_id:
            raise ValueError('report directory does not match trusted run')
        if output.resolve(strict=True) != output:
            raise ValueError('report directory must not contain symbolic links')
        descriptor = os.open(output / 'report.html', os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, 'rb') as handle:
            info = os.fstat(handle.fileno())
            if not stat.S_ISREG(info.st_mode) or info.st_size > LIMIT:
                raise ValueError('report is not a bounded regular file')
            saved = handle.read(LIMIT + 1)
            if saved != content:
                raise ValueError('saved report differs from generated HTML')
            os.fchmod(handle.fileno(), 0o600)
        states['report'] = {'status': 'saved', 'storage': 'local', 'id': run_id,
                            'relative_path': 'report.html',
                            'file_name': incident_id + '-' + run_id + '.html',
                            'content_type': 'text/html', 'size_bytes': len(saved),
                            'sha256': hashlib.sha256(saved).hexdigest()}
        # 下载地址由实例 Host 核对本地制品后生成，不猜远端地址或暴露服务器路径。
    except Exception as error:
        states['report'] = {'status': 'failed', 'storage': 'local',
                            'error_type': type(error).__name__}
        if isinstance(error, ValueError):
            states['report']['error'] = str(error)
    return states
