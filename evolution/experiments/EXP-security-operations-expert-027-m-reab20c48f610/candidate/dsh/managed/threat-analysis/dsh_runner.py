"""DSH工具入口；冻结基础后按严格低置信门槛填充自然语言建议。"""
from __future__ import annotations

import contextlib
import copy
import hashlib
import html
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
RULE_STAGE_SCHEMA = 'rule-suggestions-runner/1'


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def checkpoint(output, result):
    temporary = output / 'result.json.tmp'
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(output / 'result.json')


def build_gateway(config, raw_directory):
    runtime = config['connections']['runtime']
    return McpGateway(bridge_url=runtime['bridgeUrl'], bridge_key=runtime['bridgeKey'],
                      raw_directory=Path(raw_directory))


def _private_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def _private_digest(value):
    return hashlib.sha256(_private_text(value).encode('utf-8')).hexdigest()


def _write_private(path, value):
    """独立本地制品；唯一临时文件，业务包络中不挂载规则运行状态。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(_private_text(value) + '\n', encoding='utf-8')
    temporary.replace(path)


def _check_suggestions(suggestions):
    from rule_validation import validate_public_suggestions
    validate_public_suggestions(suggestions)
    _private_text(suggestions)


def _rule_failure(result, code, message):
    if isinstance(result.get('result'), dict):
        result['result']['rule_optimization_suggestions'] = []
    return {'status': 'failed', 'error_type': code, 'reason': message}


def _empty_base_suggestions(result, output):
    """只投影建议占位；原始回执和原基础校验保持，不补造基础容器。"""
    base = result.get('result')
    if result.get('route') != 'five_source' or not isinstance(base, dict):
        return
    present = 'rule_optimization_suggestions' in base
    original = base.get('rule_optimization_suggestions')
    if not present or original != []:
        record = {'schema_version': RULE_STAGE_SCHEMA, 'run_id': result['run_id'],
                  'incident_id': result['incident_id'], 'field_present': present,
                  'original_type': type(original).__name__, 'projected_value': [],
                  'raw_source': 'model/model-analysis-output.json',
                  'base_validation_preserved': True}
        try:
            _private_text(original)
            record['original_value'] = copy.deepcopy(original)
        except (ValueError, TypeError, UnicodeError):
            record['original_value_status'] = 'not_json_safe_see_raw_source'
        _write_private(output / 'rules' / 'base-suggestion-projection.json', record)
    base['rule_optimization_suggestions'] = []


def _rule_gate_settings():
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
        return {'route': 'five_source', 'low_confidence_threshold': None,
                'policy_error': '规则门槛policy不可读或结构错误；未使用替代阈值。'}


def _rule_gate_inputs(result, output):
    from rule_gate import evaluate_gate
    settings = _rule_gate_settings()
    settings['route'] = result.get('route')
    source, confirmed = {'status': 'not_applicable'}, False
    if settings['route'] == 'five_source':
        try:
            from rule_optimization import load_frozen_five_source
            _frozen, source = load_frozen_five_source(
                result['incident_id'], output / 'fusion', result.get('input_sha256'))
            confirmed = True
        except Exception as error:
            from rule_response import RuleError
            source = {'status': 'unconfirmed', 'reason': str(error) if isinstance(error, RuleError)
                      else '冻结五源来源核验失败（' + type(error).__name__ + '）。'}
    gate = evaluate_gate(result.get('result'), route=settings['route'],
                         threshold=settings['low_confidence_threshold'],
                         incident_id=result['incident_id'], source_confirmed=confirmed,
                         source_gap=source.get('reason'))
    return settings, source, gate


def _new_rule_run(result, output):
    """仅识别本案绑定的新版私有标记；单个标记缺失不升级为历史迁移。"""
    for name in ('run-contract.json', 'runner-state.json', 'runner-failure.json', 'business-gate.json'):
        try:
            record = read_json(output / 'rules' / name)
        except (OSError, ValueError, TypeError):
            continue
        if (isinstance(record, dict) and record.get('schema_version') == RULE_STAGE_SCHEMA
                and record.get('run_id') == result['run_id']
                and record.get('incident_id') == result['incident_id']):
            return True
    return False


def _attach_rule_stage(result, output, config):
    if result.get('route') == 'fast_classification':
        try:
            settings, source, gate = _rule_gate_inputs(result, output)
            _write_private(output / 'rules' / 'business-gate.json',
                           {'schema_version': RULE_STAGE_SCHEMA, 'run_id': result['run_id'],
                            'incident_id': result['incident_id'], 'gate': gate,
                            'gate_settings': settings, 'source': source})
        except Exception:
            pass
        return None
    try:
        with _terminal_guard(output):
            if _terminal_started(output):
                _reuse_terminal_result(result, output)
                return {'status': 'aborted', 'reason': '已有终态请求，未重入建议阶段。'}
            _empty_base_suggestions(result, output)
            checkpoint(output, result)
            _write_private(output / 'rules' / 'run-contract.json',
                           {'schema_version': RULE_STAGE_SCHEMA, 'run_id': result['run_id'],
                            'incident_id': result['incident_id']})
            return _attach_rule_stage_locked(result, output, config)
    except Exception as error:
        if _terminal_started(output):
            _reuse_terminal_result(result, output)
            return {'status': 'aborted', 'reason': '已有终态请求，未覆盖原结果。'}
        runtime = _rule_failure(result, 'RULE_STAGE_SETUP_FAILED',
                                '规则建议未能安全启动（' + type(error).__name__ + '）。')
        try:
            _write_private(output / 'rules' / 'runner-failure.json',
                           {'schema_version': RULE_STAGE_SCHEMA, 'run_id': result['run_id'],
                            'incident_id': result['incident_id'], 'runtime': runtime})
            checkpoint(output, result)
        except OSError:
            runtime['checkpoint_status'] = 'failed'
        return runtime


def _attach_rule_stage_locked(result, output, config):
    base_run = copy.deepcopy({k: v for k, v in result.items() if k != 'delivery'})
    base = copy.deepcopy(base_run.get('result'))
    has_base, private_only = isinstance(base, dict), not isinstance(base, dict)
    audit = {'schema_version': RULE_STAGE_SCHEMA, 'run_id': result['run_id'],
             'incident_id': result['incident_id'], 'state': 'started'}
    audit_path = output / 'rules' / 'runner-state.json'
    try:
        settings, source, gate = _rule_gate_inputs(result, output)
        audit.update(gate=gate, gate_settings=settings, source=source)
        if has_base:
            try:
                audit['base_sha256'] = _private_digest(base_run)
            except (ValueError, TypeError, UnicodeError):
                private_only = True
                audit.update(base_snapshot_unavailable=True, base_snapshot_reason='BASE_RESULT_NOT_JSON_SAFE')
        else:
            audit.update(base_snapshot_unavailable=True, base_snapshot_reason='BASE_RESULT_CONTAINER_UNAVAILABLE')
        if private_only:
            audit['delivery_scope'] = 'private_only'
        _write_private(output / 'rules' / 'business-gate.json', audit)
        if not private_only:
            _write_private(output / 'base-analysis-result.json', base_run)
        _write_private(audit_path, audit)
        checkpoint(output, result)
        if gate['gate_status'] != 'collect':
            runtime = {'status': gate['gate_status'], 'gate': gate, 'llm_invoked': False}
            if gate['gate_status'] == 'undetermined':
                runtime['reason'] = '；'.join(row['message'] for row in gate['collection_gaps'])
            suggestions = []
        else:
            from rule_optimization import run_rule_optimization
            model_config = config['analysisModel']
            validation_reference = copy.deepcopy(result.get('validation', {}))
            try:
                _private_text(validation_reference)
            except (ValueError, TypeError):
                validation_reference = None
            suggestions, runtime = run_rule_optimization(
                incident_id=result['incident_id'], base_result=copy.deepcopy(base),
                fusion_dir=output / 'fusion', output_dir=output / 'rules',
                model_config=model_config, api_key=os.environ.get(model_config.get('apiKeyEnv', '')) or None,
                base_validation=validation_reference, gate_settings=settings,
                expected_input_sha256=result.get('input_sha256'))
        _check_suggestions(suggestions)
        if not isinstance(runtime, dict):
            raise ValueError('rule runtime must remain a private object')
        if private_only:
            runtime.update(base_snapshot_unavailable=True, delivery_scope='private_only')
        _private_text(runtime)
        failed_json = isinstance(runtime.get('json_validation'), dict) and runtime['json_validation'].get('status') == 'fail'
        if (runtime.get('status') in ('failed', 'blocked', 'undetermined', 'skipped', 'not_applicable')
                or failed_json) and suggestions:
            raise ValueError('failed or untriggered rule stage cannot deliver suggestions')
        _write_private(output / 'rules' / 'runner-final-suggestions.json', suggestions)
        if has_base and not private_only:
            merged = copy.deepcopy(base)
            merged['rule_optimization_suggestions'] = suggestions
            result['result'] = merged
        checkpoint(output, result)
        audit.update(state='finished', suggestions_sha256=_private_digest(suggestions), runtime=runtime)
        _write_private(audit_path, audit)
        return runtime
    except Exception as error:
        message = '规则建议未完成（' + type(error).__name__ + '）；未交付建议，基础结果及原校验保持。'
        if has_base and not private_only:
            result['result'] = copy.deepcopy(base)
        runtime = _rule_failure(result, 'RULE_STAGE_ISOLATED', message)
        if private_only:
            runtime.update(base_snapshot_unavailable=True, delivery_scope='private_only')
        try:
            _write_private(output / 'rules' / 'runner-final-suggestions.json', [])
            checkpoint(output, result)
            audit.update(state='finished', suggestions_sha256=_private_digest([]), runtime=runtime)
            _write_private(audit_path, audit)
        except OSError:
            runtime['checkpoint_status'] = 'failed'
        return runtime


def _recover_rule_stage(result, output):
    """只恢复新版已绑定快照；旧记录不迁移，不补跑模型或重算当前阈值。"""
    if not _new_rule_run(result, output):
        return {'status': 'legacy_read_only'}
    audit_path = output / 'rules' / 'runner-state.json'
    audit = None
    for path in (audit_path, output / 'rules' / 'business-gate.json'):
        try:
            record = read_json(path)
        except (OSError, ValueError, TypeError):
            continue
        if (isinstance(record, dict) and record.get('schema_version') == RULE_STAGE_SCHEMA
                and record.get('run_id') == result['run_id']
                and record.get('incident_id') == result['incident_id']):
            audit = record
            break
    if audit is not None and audit.get('base_snapshot_unavailable') is True:
        return {'status': 'private_only', 'base_snapshot_unavailable': True,
                'reason': '无安全可绑定基础快照；保留基础失败与私有记录，未合并建议。'}
    gate_status = audit.get('gate', {}).get('gate_status') if isinstance(audit, dict) else None
    try:
        base_path = output / 'base-analysis-result.json'
        if not base_path.exists() and gate_status in ('skipped', 'not_applicable', 'undetermined'):
            current_base = copy.deepcopy({k: v for k, v in result.items() if k not in ('delivery', 'cleanup_attempted')})
            if audit.get('base_sha256') == _private_digest(current_base):
                _write_private(base_path, current_base)
        base_run = read_json(base_path)
        if (not isinstance(base_run, dict) or base_run.get('status') != 'completed'
                or base_run.get('route') != 'five_source'
                or base_run.get('run_id') != result['run_id']
                or base_run.get('incident_id') != result['incident_id']
                or base_run.get('judgement_id') != result['judgement_id']
                or not isinstance(base_run.get('result'), dict)):
            raise ValueError('unbound base snapshot')
        base_digest = _private_digest(base_run)
        if not isinstance(audit, dict) or audit.get('base_sha256') != base_digest:
            raise ValueError('untrusted base snapshot')
    except (OSError, ValueError, TypeError):
        return _rule_failure(result, 'RULE_BASE_CHECKPOINT_UNTRUSTED',
                             '基础快照或审计无法核对；保留当前基础，未采用快照或交付建议。')
    try:
        suggestions = read_json(output / 'rules' / 'runner-final-suggestions.json')
        _check_suggestions(suggestions)
        if (audit.get('state') != 'finished'
                or audit.get('suggestions_sha256') != _private_digest(suggestions)
                or _private_digest(result.get('result', {}).get('rule_optimization_suggestions'))
                   != audit['suggestions_sha256']):
            raise ValueError('suggestions were not committed')
        runtime = audit.get('runtime') if isinstance(audit.get('runtime'), dict) else {}
        if runtime.get('status') in ('failed', 'blocked', 'undetermined', 'skipped', 'not_applicable') and suggestions:
            raise ValueError('unusable committed suggestions')
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        suggestions = None
    cleanup_attempted = result.get('cleanup_attempted')
    result.clear()
    result.update(copy.deepcopy(base_run))
    if cleanup_attempted:
        result['cleanup_attempted'] = True
    if suggestions is None and gate_status in ('skipped', 'not_applicable', 'undetermined'):
        suggestions = []
        runtime = {'status': gate_status, 'gate': audit['gate'], 'llm_invoked': False}
    elif suggestions is None:
        suggestions = []
        runtime = _rule_failure(result, 'RULE_STAGE_ABORTED',
                                '建议阶段被中止或提交审计不完整；保留冻结基础，未补跑或采用未提交建议。')
    result['result']['rule_optimization_suggestions'] = suggestions
    _write_private(output / 'rules' / 'runner-final-suggestions.json', suggestions)
    checkpoint(output, result)
    audit.update(state='finished', suggestions_sha256=_private_digest(suggestions), runtime=runtime)
    _write_private(audit_path, audit)
    return runtime


def _rule_notice(result, output, *, partial_only=False):
    """状态说明走既有交付文字；拒收原文、索引与证据引用保持私有。"""
    for name in ('runner-state.json', 'runner-failure.json'):
        try:
            record = read_json(output / 'rules' / name)
            if (record.get('schema_version') != RULE_STAGE_SCHEMA
                    or record.get('run_id') != result['run_id']
                    or record.get('incident_id') != result['incident_id']):
                continue
            runtime = record.get('runtime', {})
            if partial_only and (runtime.get('status') != 'partial_success'
                                 or runtime.get('delivery_scope') == 'private_only'):
                continue
            if runtime.get('status') in ('failed', 'blocked', 'undetermined'):
                reason = runtime.get('reason')
                if not isinstance(reason, str) or not reason.strip():
                    reason = '建议阶段未形成可交付结果，具体失败见本次运行记录。'
                return '规则建议说明：' + reason + ' 基础研判及原校验未因建议阶段改变。'
            if runtime.get('delivery_scope') == 'private_only':
                return '规则建议未合入：基础快照无法安全绑定，未伪造成功结果。'
            if runtime.get('status') == 'partial_success':
                candidate = runtime.get('candidate_count')
                accepted = runtime.get('accepted_count')
                rejected = runtime.get('rejected_count')
                rejected_items = runtime.get('rejected_items')
                if (type(candidate) is int and type(accepted) is int and type(rejected) is int
                        and 1 <= candidate <= 2 and accepted > 0 and rejected > 0
                        and accepted + rejected == candidate
                        and isinstance(rejected_items, list) and len(rejected_items) == rejected
                        and all(isinstance(item, dict) for item in rejected_items)):
                    by_code = {'EMPTY_EVIDENCE': '来源证据为空',
                               'DUPLICATE_SUGGESTION': '建议方向重复',
                               'EXECUTABLE_RULE_BODY': '包含不允许的可执行内容',
                               'PLACEHOLDER_TEXT': '建议或影响范围只是占位内容'}
                    by_scope = {'evidence_traceability': '来源引用不满足要求',
                                'suggestion_contract': '条目字段不符合合同',
                                'suggestion_quality': '条目内容未通过质量检查'}
                    reasons = list(dict.fromkeys(by_code.get(item.get('code'),
                        by_scope.get(item.get('scope'), '未通过条目校验')) for item in rejected_items))
                    detail = (f'本轮{candidate}条候选建议部分采纳：保留{accepted}条，拒收{rejected}条。'
                              + '拒收原因：' + '；'.join(reasons) + '。')
                else:
                    detail = '建议阶段记录为部分成功，但计数或拒收记录无法核对，请核对本次运行制品。'
                return ('规则建议说明：' + detail + ' 保留项仍须按本案证据复核，未执行规则修改。'
                        + ' 基础研判及原校验未因建议阶段改变。')
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    return None


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
        partial_notice = _rule_notice(result, output, partial_only=True)
        partial_report_html = None
        delivery = build_delivery(result, analyzed_at=analyzed_at)
        if partial_notice:
            partial_report_html = delivery['report_html'].replace(
                '</main></body></html>',
                '<p class="section-note">' + html.escape(partial_notice, quote=True)
                + '</p></main></body></html>', 1)
            delivery['report_html'] = partial_report_html
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
        if partial_report_html is not None:
            delivery['report_html'] = partial_report_html
        notice = _rule_notice(result, output)
        if notice:
            delivery['markdown'] += '\n\n' + notice + '\n'
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
                result['validation'] = {k: validation[k] for k in ('status', 'warnings', 'error_type') if k in validation}
                if validation['status'] == 'failed':
                    result['status'] = 'contract_failed'
                    result['validation']['error'] = validation.get('error')
                    parsed_path = output / 'model/model-analysis-output.json'
                    if parsed_path.exists():
                        # 保留原兼容交付：completed不代表原校验通过。
                        parsed = read_json(parsed_path)
                        if isinstance(parsed, dict):
                            result.update(status='completed', result=parsed)
                            result.pop('error_type', None)
    except Exception as error:
        result['error_type'] = type(error).__name__
        if isinstance(error, SocWriteError):
            result['error_code'] = error.code
            result['business_message'] = error.business_message
    # 基础仍为30分钟；后置不新增取证，模型沿用120秒单次预算。
    # Host手动36分钟/自动45分钟整体截止与原交付保护保持。
    if cancel_analysis_deadline is not None:
        cancel_analysis_deadline()
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
    """只恢复本版中止运行；不重跑或迁移已完成历史Run。"""
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
    if result.get('route') == 'five_source' and not _new_rule_run(result, output):
        return result
    if not _terminal_started(output) and any(key in result for key in ('rule_optimization', 'base_result_sha256')):
        return result
    lock = output / '.cleanup-lock'
    try:
        lock.mkdir()
    except FileExistsError:
        return read_json(output / 'result.json')
    try:
        with _terminal_guard(output):
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
                    _rule_failure(result, 'RULE_STAGE_UNCOMMITTED',
                                  '建议阶段未提交；保留当前基础，未采用未绑定快照或建议。')
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
