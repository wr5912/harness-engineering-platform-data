"""DSH 工具入口；基础研判冻结后独立生成规则建议，最后统一交付。"""
from __future__ import annotations

import contextlib
import copy
import hashlib
import io
import json
import os
import re
import signal
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import evidence_collection
from mcp_gateway import McpGateway, extract_result_data
from model_inference import run_inference
from result_delivery import build_delivery, failure_markdown
from result_storage import persist, build_writeback, build_failure_writeback, SocJudgementClient, SocWriteError

ROOT = Path(__file__).resolve().parent
ANALYSIS_TIMEOUT_SECONDS = 30 * 60


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def checkpoint(output, result):
    temporary = output / 'result.json.tmp'
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(output / 'result.json')


def build_gateway(config, raw_directory):
    runtime = config['connections']['runtime']
    return McpGateway(
        bridge_url=runtime['bridgeUrl'], bridge_key=runtime['bridgeKey'],
        raw_directory=Path(raw_directory),
    )


def _private_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def _private_digest(value):
    return hashlib.sha256(_private_text(value).encode('utf-8')).hexdigest()


def _write_private(path, value):
    """只写独立本地制品；唯一临时文件避免不同写者共用同名tmp。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(_private_text(value) + '\n', encoding='utf-8')
    temporary.replace(path)


def _check_suggestions(suggestions):
    fields = {'rule_content', 'impact_scope', 'cannot_optimize_reason'}
    if not isinstance(suggestions, list):
        raise ValueError('rule suggestions must be an array')
    for row in suggestions:
        if (not isinstance(row, dict) or set(row) != fields
                or not isinstance(row['impact_scope'], str) or not row['impact_scope'].strip()):
            raise ValueError('rule suggestions require the exact three fields and nonempty impact scope')
        content = row['rule_content']
        reason = row['cannot_optimize_reason']
        if content is None:
            if not isinstance(reason, str) or not reason.strip():
                raise ValueError('null rule content requires a nonempty cannot-optimize reason')
        elif not isinstance(content, dict) or not content or reason is not None:
            raise ValueError('nonempty rule object requires a null cannot-optimize reason')
    _private_text(suggestions)


def _rule_diagnostics(message):
    return [{'rule_content': None,
             'impact_scope': '无法评估；未执行规则变更，基础研判保持不变。',
             'cannot_optimize_reason': message}]


def _rule_failure(result, code, message):
    """业务上只替换已有基础容器内的建议；不伪造缺失的result。"""
    if isinstance(result.get('result'), dict):
        result['result']['rule_optimization_suggestions'] = _rule_diagnostics(message)
    return {'status': 'failed', 'error_type': code, 'reason': message}


def _rule_gate_settings():
    """Candidate内独立policy为唯一阈值配置，不扩展Node大配置Schema。"""
    import math
    try:
        policy = read_json(ROOT / 'rule-review-policy.json')
        if not isinstance(policy, dict) or set(policy) != {'low_confidence_threshold'}:
            raise ValueError('invalid rule review policy')
        threshold = policy['low_confidence_threshold']
        if type(threshold) not in (int, float) or not 0 <= threshold <= 1 or not math.isfinite(threshold):
            raise ValueError('invalid finite rule review threshold')
        return {'route': 'five_source', 'low_confidence_threshold': threshold}
    except (OSError, ValueError, TypeError):
        # 配置不可读/结构错误时不能悄然使用另一阈值放行。
        return {'route': 'five_source', 'low_confidence_threshold': None,
                'policy_error': '规则门槛policy不可读或结构错误；未使用替代阈值。'}


def _trusted_rule_review_context(context, result):
    """只接收宿主专用ruleReviewContext封套，不从基础模型或其他配置字段猜例外。

    Node适配器须先核对真实原生user/授权任务，再生成trusted_host、incident_id、
    run_id、review_context；未接入默认空。绑定字段只防串案，宿主不得从模型
    自报标志、普通工具参数或事件中自由文本复制此可信封套。
    """
    empty = {'explicit_rule_review_requested': False, 'observed_rule_anomalies': [],
             'source_status': 'unavailable',
             'source_gap': '宿主未传递本事件/运行绑定的可信规则专项请求或既得异常metadata；未启用可信例外。'}
    if (not isinstance(context, dict) or context.get('trusted_host') is not True
            or context.get('incident_id') != result['incident_id']
            or context.get('run_id') != result['run_id']
            or not isinstance(context.get('review_context'), dict)):
        return empty
    context = context['review_context']
    safe = {key: copy.deepcopy(context[key]) for key in
            ('explicit_rule_review_requested', 'explicit_rule_review_source', 'observed_rule_anomalies')
            if key in context}
    try:
        _private_text(safe)
    except (TypeError, ValueError):
        return empty
    safe['source_status'] = 'host_bound'
    gap = context.get('source_gap')
    if isinstance(gap, str) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,95}', gap):
        safe['source_gap'] = gap  # 仅保留宿主受控诊断码，绑定成功不等于已取得人工例外。
    return safe


def _rule_gate_inputs(result, config):
    from rule_gate import evaluate_gate
    settings = _rule_gate_settings()
    settings['route'] = result.get('route')
    review = _trusted_rule_review_context(config.get('ruleReviewContext'), result)
    gate = evaluate_gate(result.get('result'), route=settings['route'],
                         threshold=settings['low_confidence_threshold'], review_context=review)
    return settings, review, gate


def _attach_rule_stage(result, output, config):
    # 快速分支只留本地门槛记录：不获取规则/交付锁、不加载优化模块、不新增调用或字段。
    if result.get('route') == 'fast_classification':
        try:
            settings, review, gate = _rule_gate_inputs(result, config)
            _write_private(output / 'rules' / 'business-gate.json',
                           {'gate': gate, 'gate_settings': settings, 'review_context': review})
        except Exception:
            # 门槛审计不可写/模块装配不完整亦不得破坏原快速研判合同。
            pass
        return None
    # 与cleanup共享锁；Host停止原进程后OS释放锁，cleanup再读取一致快照。
    # 如原进程仍运行，cleanup必须等待，不能在模型仍可能提交时并行改写。
    try:
        with _terminal_guard(output):
            if _terminal_started(output):
                _reuse_terminal_result(result, output)
                return {'status': 'aborted', 'reason': '已有终态请求，未重新进入规则阶段。'}
            # 已持锁且无终态请求，先保存纯基础完成状态，再写冻结/审计。
            checkpoint(output, result)
            return _attach_rule_stage_locked(result, output, config)
    except Exception as error:
        if _terminal_started(output):
            _reuse_terminal_result(result, output)
            return {'status': 'aborted', 'reason': '已有终态请求，未覆盖原结果。'}
        runtime = _rule_failure(result, 'RULE_STAGE_LOCK_FAILED',
                                '规则阶段未能安全启动（' + type(error).__name__ + '）；未生成优化规则。')
        try:
            checkpoint(output, result)
        except OSError:
            runtime['checkpoint_status'] = 'failed'
        return runtime


def _attach_rule_stage_locked(result, output, config):
    base_run = copy.deepcopy({k: v for k, v in result.items() if k != 'delivery'})
    base = copy.deepcopy(base_run.get('result'))
    has_base = isinstance(base, dict)
    private_only = not has_base
    audit = {'run_id': result['run_id'], 'incident_id': result['incident_id'], 'state': 'started'}
    audit_path = output / 'rules' / 'runner-state.json'
    try:
        settings, review, gate = _rule_gate_inputs(result, config)
        audit.update(gate=gate, gate_settings=settings, review_context=review)
        analysis_gate = gate
        if not has_base and gate['gate_status'] == 'undetermined':
            # 原基础门槛仍为undetermined；真实专项仅在独立私有分支分析，不伪造基础result。
            from rule_gate import evaluate_gate
            independent_gate = evaluate_gate({}, route=settings['route'],
                                             threshold=settings['low_confidence_threshold'], review_context=review)
            if independent_gate['gate_status'] == 'collect':
                analysis_gate = independent_gate
                audit['independent_review_gate'] = independent_gate
        if has_base:
            try:
                audit['base_sha256'] = _private_digest(base_run)
            except (ValueError, TypeError):
                # 基础含非有限值等不安全内容，不以序列化失败重新拦截业务collect。
                private_only = True
                audit.update(base_snapshot_unavailable=True,
                             base_snapshot_reason='BASE_RESULT_NOT_JSON_SAFE')
        else:
            audit.update(base_snapshot_unavailable=True,
                         base_snapshot_reason='BASE_RESULT_CONTAINER_UNAVAILABLE')
        if private_only:
            audit['delivery_scope'] = 'private_only'
        _write_private(output / 'rules' / 'business-gate.json',
                       {key: audit[key] for key in ('run_id', 'incident_id', 'base_sha256', 'gate',
                                                   'gate_settings', 'review_context', 'independent_review_gate',
                                                   'base_snapshot_unavailable', 'base_snapshot_reason', 'delivery_scope')
                        if key in audit})
        # 只有可安全冻结的完整原包络才写快照；绝不为独立分析补造摘要或基础字段。
        if not private_only:
            _write_private(output / 'base-analysis-result.json', base_run)
        _write_private(audit_path, audit)
        checkpoint(output, result)
        if analysis_gate['gate_status'] in ('skipped', 'not_applicable'):
            # 在创建规则gateway或读取模型配置之前结束，无新增MCP/模型调用。
            suggestions, runtime = [], {'status': gate['gate_status'], 'gate': gate}
        elif analysis_gate['gate_status'] == 'undetermined':
            messages = '；'.join(row['message'] for row in gate['collection_gaps'])
            suggestions = _rule_diagnostics('无法判断规则优化业务触发条件：' + messages)
            runtime = {'status': 'undetermined', 'gate': gate}
        else:
            # 惰性导入：模块缺失/装配失败也只影响规则阶段。没有基础容器时仅产私有制品。
            from rule_optimization import run_rule_optimization
            def rule_gateway_factory():
                gateway = build_gateway(config, output / 'rules' / 'raw')
                gateway.timeout = 15
                return gateway
            model_config = config['analysisModel']
            validation_reference = copy.deepcopy(result.get('validation', {}))
            try:
                _private_text(validation_reference)
            except (ValueError, TypeError):
                # 原校验对象仍原样保留；不可安全运输的私有副本不污染子runtime。
                validation_reference = None
                audit['base_validation_snapshot_unavailable'] = True
            suggestions, runtime = run_rule_optimization(
                incident_id=result['incident_id'], base_result=copy.deepcopy(base) if has_base else {},
                fusion_dir=output / 'fusion', gateway=rule_gateway_factory, output_dir=output / 'rules',
                model_config=model_config, api_key=os.environ.get(model_config.get('apiKeyEnv', '')) or None,
                base_validation=validation_reference,
                rule_review_context=review, gate_settings=settings)
        _check_suggestions(suggestions)
        if not isinstance(runtime, dict):
            raise ValueError('rule runtime must remain a private object')
        if private_only:
            runtime.update(base_snapshot_unavailable=True, delivery_scope='private_only')
        _private_text(runtime)
        failed_json = isinstance(runtime.get('json_validation'), dict) and runtime['json_validation'].get('status') == 'fail'
        if runtime.get('status') in ('failed', 'blocked') or failed_json:
            if not suggestions or any(row['rule_content'] is not None or not row['cannot_optimize_reason'] for row in suggestions):
                raise ValueError('failed rule stage requires three-field diagnostics, not empty or candidate output')
        _write_private(output / 'rules' / 'runner-final-suggestions.json', suggestions)
        if has_base and not private_only:
            merged = copy.deepcopy(base)
            merged['rule_optimization_suggestions'] = suggestions
            result['result'] = merged
        # 先提交原业务结果（失败状态亦保持），最后才置父审计完成；不相信子runtime先completed。
        checkpoint(output, result)
        audit.update(state='finished', suggestions_sha256=_private_digest(suggestions), runtime=runtime)
        _write_private(audit_path, audit)
        return runtime
    except Exception as error:
        message = '规则阶段未完成（' + type(error).__name__ + '）；未生成可交付优化规则。'
        if has_base and not private_only:
            result['result'] = copy.deepcopy(base)
            runtime = _rule_failure(result, 'RULE_STAGE_ISOLATED', message)
        else:
            # 无法绑定基础快照的独立路径即使失败也只写私有诊断，原业务值完全不动。
            runtime = {'status': 'failed', 'error_type': 'RULE_STAGE_ISOLATED', 'reason': message,
                       'base_snapshot_unavailable': True, 'delivery_scope': 'private_only'}
        suggestions = _rule_diagnostics(runtime['reason'])
        try:
            _write_private(output / 'rules' / 'runner-final-suggestions.json', suggestions)
            checkpoint(output, result)
            audit.update(state='finished', suggestions_sha256=_private_digest(suggestions), runtime=runtime)
            _write_private(audit_path, audit)
        except OSError:
            runtime['checkpoint_status'] = 'failed'
        return runtime


def _recover_early_rule_skip(result, output):
    """补齐新版skip已落盘、但冻结/父审计尚未落盘的窄取消窗口。"""
    audit_path = output / 'rules' / 'runner-state.json'
    if (audit_path.exists() or result.get('status') != 'completed'
            or result.get('route') != 'five_source' or not isinstance(result.get('result'), dict)):
        return None
    try:
        record = read_json(output / 'rules' / 'business-gate.json')
        current_base = copy.deepcopy({k: v for k, v in result.items() if k not in ('delivery', 'cleanup_attempted')})
        if (not isinstance(record, dict) or record.get('run_id') != result['run_id']
                or record.get('incident_id') != result['incident_id']
                or record.get('base_sha256') != _private_digest(current_base)
                or not isinstance(record.get('gate'), dict)
                or record['gate'].get('gate_status') not in ('skipped', 'not_applicable')):
            return None
        # 只用摘要已匹配的当前已持久化基础，不采用未绑定快照或重算当前policy。
        runtime = {'status': record['gate']['gate_status'], 'gate': record['gate']}
        _write_private(output / 'base-analysis-result.json', current_base)
        _write_private(output / 'rules' / 'runner-final-suggestions.json', [])
        result['result']['rule_optimization_suggestions'] = []
        checkpoint(output, result)
        record.update(state='finished', suggestions_sha256=_private_digest([]), runtime=runtime)
        _write_private(audit_path, record)
        return runtime
    except (OSError, ValueError, TypeError):
        return None


def _recover_rule_stage(result, output):
    """只恢复本版独立冻结基准；旧格式/已完成历史记录不做迁移。"""
    early_skip = _recover_early_rule_skip(result, output)
    if early_skip is not None:
        return early_skip
    audit_path = output / 'rules' / 'runner-state.json'
    # 独立路径没有可绑定基础快照；只识别本事件/运行的私有标记并保留当前基础。
    # 无论规则是否已完成，取消均不合并私有建议、不采用快照或补跑模型。
    for path in (audit_path, output / 'rules' / 'business-gate.json'):
        try:
            private_record = read_json(path)
        except (OSError, ValueError, TypeError):
            continue
        if (isinstance(private_record, dict) and private_record.get('run_id') == result['run_id']
                and private_record.get('incident_id') == result['incident_id']
                and private_record.get('base_snapshot_unavailable') is True
                and private_record.get('delivery_scope') == 'private_only'):
            return {'status': 'private_only', 'base_snapshot_unavailable': True,
                    'reason': '基础无安全可绑定快照；私有规则制品未合并，保留当前基础及原交付合同。'}
    try:
        base_run = read_json(output / 'base-analysis-result.json')
        if (not isinstance(base_run, dict) or base_run.get('status') != 'completed'
                or base_run.get('route') != 'five_source'
                or base_run.get('run_id') != result['run_id']
                or base_run.get('incident_id') != result['incident_id']
                or base_run.get('judgement_id') != result['judgement_id']
                or not isinstance(base_run.get('result'), dict)):
            raise ValueError('unbound or legacy base snapshot')
        base_digest = _private_digest(base_run)
    except (OSError, ValueError, TypeError):
        if audit_path.exists() and result.get('status') == 'completed' and isinstance(result.get('result'), dict):
            return _rule_failure(result, 'RULE_BASE_CHECKPOINT_UNAVAILABLE',
                                 '规则基准制品不可用；保留现有已完成基础，未生成可交付优化规则。')
        return None
    audit = None
    try:
        audit = read_json(audit_path)
    except (OSError, ValueError, TypeError):
        pass
    trusted_base = (isinstance(audit, dict) and audit.get('run_id') == result['run_id']
                    and audit.get('incident_id') == result['incident_id']
                    and isinstance(audit.get('base_sha256'), str) and audit['base_sha256'] == base_digest)
    if not trusted_base:
        # 审计缺失、损坏、身份/摘要未绑定时，只可保留当前已持久化基础。
        # 不得clear业务run后采用未验证的base_run，即使其表面身份相同。
        if result.get('status') == 'completed' and isinstance(result.get('result'), dict):
            return _rule_failure(result, 'RULE_BASE_CHECKPOINT_UNTRUSTED',
                                 '规则独立审计缺失或未与基础快照绑定；保留当前基础，未采用该快照或生成优化规则。')
        return None
    try:
        suggestions = read_json(output / 'rules' / 'runner-final-suggestions.json')
        _check_suggestions(suggestions)
        if (audit.get('state') != 'finished'
                or audit.get('suggestions_sha256') != _private_digest(suggestions)
                or _private_digest(result.get('result', {}).get('rule_optimization_suggestions'))
                   != audit['suggestions_sha256']):
            raise ValueError('rule result was not committed before cancellation')
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        suggestions = None
    cleanup_attempted = result.get('cleanup_attempted')
    result.clear()
    result.update(copy.deepcopy(base_run))
    if cleanup_attempted:
        result['cleanup_attempted'] = True
    if (suggestions is None and isinstance(audit.get('gate'), dict)
            and audit['gate'].get('gate_status') in ('skipped', 'not_applicable')):
        # 新版已绑定门槛明确跳过时，即使取消发生在最终数组提交之前也只恢复空数组。
        # 不重新判断当前policy、不调用模型，不把未触发误报成阶段故障。
        suggestions = []
        result['result']['rule_optimization_suggestions'] = suggestions
        runtime = {'status': audit['gate']['gate_status'], 'gate': audit['gate']}
    elif suggestions is None:
        runtime = _rule_failure(result, 'RULE_STAGE_ABORTED',
                                '规则阶段被中止或提交审计不完整；保留已冻结基础，未生成可交付优化规则。')
    else:
        result['result']['rule_optimization_suggestions'] = suggestions
        runtime = audit.get('runtime') if isinstance(audit.get('runtime'), dict) else {}
    # 无父完成标记/摘要不一致时仅诊断，不重新执行模型或静默采用子模块的成功状态。
    suggestions = result['result']['rule_optimization_suggestions']
    _write_private(output / 'rules' / 'runner-final-suggestions.json', suggestions)
    checkpoint(output, result)
    audit.update(state='finished', base_sha256=base_digest,
                 suggestions_sha256=_private_digest(suggestions), runtime=runtime)
    _write_private(audit_path, audit)
    return runtime


@contextlib.contextmanager
def _terminal_guard(output):
    """Linux业务实例内共享锁；进程结束自动释放，不用遗留锁目录猜测存活。"""
    import fcntl
    with (output / '.terminal-delivery.lock').open('a', encoding='utf-8') as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _terminal_started(output):
    return any((output / f'soc-{operation}-request.json').exists() for operation in ('result', 'fail'))


def _reuse_terminal_result(result, output):
    """只读已有终态制品，不重发、不迁移或清洗历史Run。"""
    try:
        saved = read_json(output / 'result.json')
        if (saved.get('run_id') == result['run_id']
                and saved.get('judgement_id') == result['judgement_id']):
            result.clear()
            result.update(saved)
    except (OSError, ValueError, AttributeError):
        pass
    result.setdefault('delivery', {'status': 'unknown',
                      'markdown': '研判已中止；SOC终态请求已发出，请按原运行核验结果。\n\n运行 ID：' + result['run_id']})


def _write_summary(client, result, body):
    if result.get('route') != 'five_source':
        return client.write('result', result['judgement_id'], body)
    # 完整链路按原route选单次invoke，绝不依赖已移除的业务元数据。
    if _terminal_started(client.output):
        return {'status': 'unknown', 'judgement_id': result['judgement_id'], 'attempts': 1,
                'error_type': 'TerminalRequestAlreadyStarted'}
    try:
        data = client.invoke('result', {'judgementId': result['judgement_id'], 'body': body})
        return {'status': 'saved', 'judgement_id': result['judgement_id'], 'attempts': 1,
                'replayed': isinstance(data, dict) and data.get('replayed') is True}
    except Exception as error:
        code = error.code if isinstance(error, SocWriteError) else None
        state = {'status': 'failed' if code in (400, 401, 403, 404, 409, 422) else 'unknown',
                 'error_type': type(error).__name__, 'attempts': 1, 'judgement_id': result['judgement_id']}
        if code is not None:
            state['code'] = code
        return state


def _finish_completed(result, output, client, gateway, *, _terminal_locked=False):
    if result.get('route') == 'five_source' and not _terminal_locked:
        try:
            with _terminal_guard(output):
                if _terminal_started(output):
                    _reuse_terminal_result(result, output)
                    return
                _finish_completed(result, output, client, gateway, _terminal_locked=True)
                checkpoint(output, result)
        except Exception as error:
            result['delivery'] = {'status': 'failed', 'error_type': type(error).__name__,
                                  'markdown': '研判已完成，但交付内容未完成。\n\n运行 ID：' + result['run_id']}
        return
    analyzed_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
    try:
        delivery = build_delivery(result, analyzed_at=analyzed_at)
        (output / 'report.html').write_text(delivery['report_html'], encoding='utf-8')
        storage = {}
        try:
            writeback = build_writeback(result, delivery['report_html'])
            (output / 'writeback.json').write_text(json.dumps(writeback, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            storage['summary'] = _write_summary(client, result, writeback)
        except Exception as error:
            state = {'status': 'failed', 'error_type': type(error).__name__}
            if isinstance(error, ValueError):
                state['error'] = str(error)
            (output / 'writeback-error.json').write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
            storage['summary'] = state
        storage['report'] = persist(result, delivery['report_html'], gateway)['report']
        delivery = build_delivery(result, storage=storage, analyzed_at=analyzed_at)
        (output / 'summary.json').write_text(json.dumps(delivery['summary'], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        (output / 'summary.md').write_text(delivery['markdown'], encoding='utf-8')
        (output / 'report.html').write_text(delivery.pop('report_html'), encoding='utf-8')
        result['delivery'] = delivery
    except Exception as error:
        result['delivery'] = {'status': 'failed', 'error_type': type(error).__name__,
                              'markdown': '研判已完成，但阅读内容生成失败。\n\n运行 ID：' + result['run_id']}


def _analyze(incident_id, output_root, config, cancel_analysis_deadline=None, run_id=None):
    if not re.fullmatch(r'INC-\d{8}-\d{6}', incident_id):
        raise ValueError('invalid incident ID')
    run_id = run_id or 'run-' + str(uuid.uuid4())
    if not re.fullmatch(r'run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', run_id):
        raise ValueError('invalid run ID')
    output = Path(output_root) / run_id
    output.mkdir(parents=True)
    # 本次原生 run_id 对应唯一一份不可变报告；首次业务修订在运行创建时冻结，非模型或插件版本。
    result = {'schema_version': '1.0', 'model': None, 'incident_id': incident_id, 'run_id': run_id,
              'report_revision': 1, 'status': 'claim_failed', 'llm_invoked': False}
    client = None
    try:
        gateway = build_gateway(config, output / 'fusion' / 'raw')
        client = SocJudgementClient(gateway, output)
        claim = client.claim(incident_id)
        result['judgement_id'] = claim['judgementId']
        result['status'] = 'evidence_failed'
        checkpoint(output, result)
        args = evidence_collection.parse_args([
            '--incident-id', incident_id,
            '--output-dir', str(output / 'fusion'),
            '--list-timezone', 'Asia/Shanghai',
        ], require_bridge=False)
        # 原入口的路径输出不是模型输入，也不混入工具 JSON。
        with contextlib.redirect_stdout(io.StringIO()):
            fusion = evidence_collection.run(args, gateway=gateway)
        manifest = read_json(fusion / 'manifest.json')
        result['route'] = manifest['route']
        ledger = fusion / 'call-ledger.audit.json'
        if ledger.exists():
            calls = read_json(ledger)
            result['mcp_calls'] = len(calls)
            result['mcp_failures'] = sum(row['status'] == 'failed' for row in calls)
        if manifest['route'] == 'fast_classification':
            result.update(status='completed', validation={'status': 'not_applicable_fast_classification'},
                          result=read_json(fusion / 'fast-classification-output.json'))
        else:
            frozen = fusion / 'five-source-output.json'
            result['input_sha256'] = hashlib.sha256(frozen.read_bytes()).hexdigest()
            try:
                model_config = config['analysisModel']
                model_base_url = model_config['baseURL']
                model_name = model_config['model']
                if not model_base_url or not model_name:
                    raise ValueError('missing analysis model configuration')
                result['llm_invoked'] = True
                result['model'] = model_name
                verdict = run_inference(
                    five_source=read_json(frozen),
                    system_prompt=(ROOT / 'prompts/threat-analysis-system.txt').read_text(encoding='utf-8'),
                    base_url=model_base_url, model=model_name,
                    api_key=os.environ.get(model_config.get('apiKeyEnv', '')) or None,
                    output_dir=output / 'model', timeout=300, temperature=0.1,
                )
                result.update(status='completed', result=verdict)
            except Exception as error:
                result.update(status='model_failed', error_type=type(error).__name__)
            metadata_path = output / 'model/request-metadata.json'
            if metadata_path.exists():
                metadata = read_json(metadata_path)
                result['model'] = metadata.get('response_model') or metadata.get('model')
            validation_path = output / 'model/validation.json'
            if validation_path.exists():
                validation = read_json(validation_path)
                # 校验结果由代码提供，与模型原文分开交付。
                result['validation'] = {k: validation[k] for k in ('status', 'warnings', 'error_type') if k in validation}
                if validation['status'] == 'failed':
                    result['status'] = 'contract_failed'
                    result['validation']['error'] = validation.get('error')
    except Exception as error:
        result['error_type'] = type(error).__name__
        if isinstance(error, SocWriteError):
            result['error_code'] = error.code
            result['business_message'] = error.business_message
    # 原基础30分钟预算结束；规则另有64次/120秒采集及120秒模型预算。
    # 两者仍受Host手动36分钟/自动45分钟整体截止约束。
    if cancel_analysis_deadline is not None:
        cancel_analysis_deadline()
    # 仅最小后置接线：失败的五源结果也记录业务门槛；没有result时不伪造业务容器。
    # 阶段0–1取证/推理/机械校验以及原失败交付合同均保持原样。
    if result['status'] == 'completed' or result.get('route') == 'five_source':
        _attach_rule_stage(result, output, config)
    if result['status'] == 'completed':
        _finish_completed(result, output, client, gateway)
    else:
        result['delivery'] = {'status': 'not_generated', 'markdown': failure_markdown(result)}
        if result.get('judgement_id'):
            state = client.write('fail', result['judgement_id'], build_failure_writeback(result))
            result['delivery']['storage'] = {'summary': state}
            result['delivery']['markdown'] += '\nSOC 失败状态回写：' + ('已保存' if state['status'] == 'saved' else '保存失败') + '\n'
    checkpoint(output, result)
    return result


def analyze(incident_id, output_root, config, run_id=None):
    """Give base analysis 30 minutes, then reserve time for rules and writeback."""
    if not hasattr(signal, 'SIGALRM'):
        return _analyze(incident_id, output_root, config, run_id=run_id)

    def deadline_exceeded(_signum, _frame):
        raise TimeoutError('threat analysis exceeded 30 minute deadline')

    previous_handler = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, deadline_exceeded)
    previous_timer = signal.alarm(ANALYSIS_TIMEOUT_SECONDS)
    def cancel_analysis_deadline():
        signal.alarm(0)
    try:
        return _analyze(incident_id, output_root, config, cancel_analysis_deadline, run_id)
    finally:
        cancel_analysis_deadline()
        signal.signal(signal.SIGALRM, previous_handler)
        if previous_timer > 0:
            signal.alarm(previous_timer)


def pending(output_root, config, page_size=100):
    output = Path(output_root) / 'automation'
    gateway = build_gateway(config, output / 'mcp-raw')
    client = SocJudgementClient(gateway, output)
    try:
        return {'schema_version': '1.0', 'data': client.pending(page_size)}
    except Exception as error:
        return {'schema_version': '1.0', 'error': {
            'type': getattr(error, 'error_type', None) or type(error).__name__,
            'status_code': getattr(error, 'code', None)}}


def cleanup(run_id, output_root, config):
    """仅从私有审计恢复本版中止阶段；不重跑、不迁移已完成历史Run。"""
    if not re.fullmatch(r'run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}', run_id):
        raise ValueError('invalid run ID')
    output = Path(output_root) / run_id
    try:
        result = read_json(output / 'result.json')
    except FileNotFoundError:
        claim = extract_result_data(read_json(output / 'soc-claim-response.json'))
        incident = read_json(output / 'soc-claim-request.json')['incidentId']
        result = {'schema_version': '1.0', 'run_id': run_id, 'incident_id': incident,
                  'judgement_id': claim['judgementId'], 'status': 'evidence_failed', 'llm_invoked': False, 'model': None}
    if result.get('run_id') != run_id or not result.get('judgement_id'):
        raise ValueError('missing bound claim identity')
    if result.get('cleanup_attempted'):
        return result
    # 只读识别旧版污染包络；无终态时也不迁移、清洗或发送这些历史数据。
    if not _terminal_started(output) and any(key in result for key in ('rule_optimization', 'base_result_sha256')):
        return result
    lock = output / '.cleanup-lock'
    try:
        lock.mkdir()
    except FileExistsError:
        return read_json(output / 'result.json')
    try:
        with _terminal_guard(output):
            # 与正常完整交付串行后再回读，避免用旧checkpoint覆盖已发请求的结果。
            if (output / 'result.json').exists():
                fresh = read_json(output / 'result.json')
                if fresh.get('run_id') != run_id or fresh.get('judgement_id') != result['judgement_id']:
                    raise ValueError('cleanup identity changed')
                result = fresh
            if result.get('cleanup_attempted'):
                return result
            if _terminal_started(output):
                _reuse_terminal_result(result, output)
                return result
            if any(key in result for key in ('rule_optimization', 'base_result_sha256')):
                return result
            result['cleanup_attempted'] = True
            stage = None if result.get('route') == 'fast_classification' else _recover_rule_stage(result, output)
            gateway = build_gateway(config, output / 'fusion/raw')
            client = SocJudgementClient(gateway, output)
            if result.get('status') == 'completed' and isinstance(result.get('result'), dict):
                if result.get('route') == 'five_source' and stage is None:
                    # 当前基础已完成但父审计未提交，只修改当前建议；不采用未绑定快照。
                    _rule_failure(result, 'RULE_STAGE_UNCOMMITTED',
                                  '规则阶段未完成或审计尚未提交；保留当前基础，未生成可交付优化规则。')
                checkpoint(output, result)
                _finish_completed(result, output, client, gateway, _terminal_locked=True)
                checkpoint(output, result)
                return result
            result.update(status='evidence_failed', error_type='AbortError')
            checkpoint(output, result)
            state = client.write('fail', result['judgement_id'], build_failure_writeback(result))
            result['delivery'] = {'status': 'not_generated', 'storage': {'summary': state},
                                  'markdown': failure_markdown(result) + '\nSOC 失败状态回写：' + ('已保存' if state['status'] == 'saved' else '保存失败') + '\n'}
            checkpoint(output, result)
            return result
    finally:
        lock.rmdir()


if __name__ == '__main__':
    root = Path(os.environ['DSH_HOME']) / 'threat-analysis'
    configuration = json.loads(os.environ['THREAT_ANALYSIS_CONFIG'])
    if sys.argv[1:] == ['--pending']:
        result = pending(root, configuration)
    elif sys.argv[1:2] == ['--cleanup'] and len(sys.argv) == 3:
        result = cleanup(sys.argv[2], root, configuration)
    else:
        run_id = sys.argv[3] if len(sys.argv) == 4 and sys.argv[2] == '--run-id' else None
        result = analyze(sys.argv[1], root, configuration, run_id)
    print(json.dumps(result, ensure_ascii=False))
