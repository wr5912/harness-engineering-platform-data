"""按需静态校验元规则bodyJson；不注册全局适配器、不执行或回写规则。

工具调用只复用本Run原Collector及其64次/120秒软截止；gateway的15秒边界
由既有宿主保持。这里的accepted仅覆盖bodyJson，不覆盖完整候选或业务效果。
"""
from __future__ import annotations

import copy
import hashlib
import time
from collections import Counter

from rule_context import MAX_CALLS, MAX_SECONDS

RESOURCE = 'ai_soc_correlate'
TOOL = 'validate_correlate_reasoning_rules'
EXACT_TOOL = RESOURCE + '__' + TOOL
VALIDATION_SCOPE = 'soc_rule_body_format'
CONTRACT_ID = 'observed-input-contract:ai-soc-correlate/validate_correlate_reasoning_rules'
_OBSERVED_BODY_SHA256 = 'f94227718c4b87af9604187e612c7a39979c319e8c44cecf51e63a14c363543b'
_OBSERVED_DEFINITION_SHA256 = '02236cd83a7082de29f26fb22663a911a3fb9dcbd68e53018d72ddda825ba3fa'
_MANAGEMENT_RECEIPT = '7dcb95c8-82ed-4be1-990a-0801891c0bfc'


def _reasoning_target(target):
    identity = target.get('identity') if isinstance(target, dict) else None
    return (isinstance(identity, dict) and identity.get('category') == 'association'
            and identity.get('family') == 'reasoning')


def _body_hash(body):
    return hashlib.sha256(body.encode('utf-8')).hexdigest()


def _capability():
    # 返回全新的JSON元数据；可调用对象仅存在于每Run的adapters()返回值。
    return {
        'validation_scope': VALIDATION_SCOPE, 'validated_parts': ['bodyJson'],
        'contract_status': 'provided_body_only', 'contract_id': CONTRACT_ID,
        'connection_status': 'configured_unverified', 'status': 'not_run',
        'invocation': 'on_nonempty_reasoning_candidate_after_binding_checks',
        'body_carrier': 'native_nonempty_string_only',
        'budget_policy': 'same_collector_calls_and_original_soft_deadline',
        'complete_rule_format_status': 'unverified', 'effect_status': 'not_evaluated',
        'boundary_note': '已核宿主可按需校验元规则bodyJson；不代表本次已调用、完整候选格式通过或规则执行，不是候选生成前置条件。',
        'field_reference_boundary': '原始业务叶不自动成为DSL字段；新增raw/OCSF路径、谓词或表达仍需真实依据。',
    }


def annotate_targets(targets):
    """只给已冻结目标附精简能力事实；每次预算缩减后重冻结也须重新调用。"""
    if not isinstance(targets, dict):
        raise TypeError('冻结目标必须是对象')
    for target in targets.values():
        if not isinstance(target, dict):
            raise TypeError('冻结目标条目必须是对象')
        if not _reasoning_target(target):
            target['soc_schema_status'] = 'not_provided'
            target['soc_body_validation'] = {
                'validation_scope': VALIDATION_SCOPE, 'validated_parts': [],
                'contract_status': 'not_provided', 'connection_status': 'not_configured',
                'status': 'not_applicable', 'skip_reason': 'target_family_not_covered',
                'complete_rule_format_status': 'unverified',
            }
            continue
        target['soc_schema_status'] = 'partial_body_contract_configured_complete_rule_unverified'
        metadata = _capability()
        native = target.get('native_config')
        body = native.get('bodyJson') if isinstance(native, dict) else None
        try:
            body_sha = _body_hash(body) if isinstance(body, str) else None
        except UnicodeError:
            body_sha = None
        if body_sha == _OBSERVED_BODY_SHA256:
            # 仅相同原body字节可引用此前管理侧回执；不扩推其他当前定义或新候选。
            metadata['existing_expression_reference'] = {
                'source': 'same_current_body_bytes_only', 'body_sha256': body_sha,
                'predicate': '告警证据', 'boolean_operators': ['AND', 'OR'],
                'leaf_operators': ['IN', 'EQ', 'NOT_IN'],
                'fields': ['_reasoning.tactic', '_reasoning.tactic_source',
                           '_reasoning.technique', '_reasoning.technique_parent'],
                'not_a_general_dsl_or_field_catalog': True,
            }
            metadata['prior_management_body_validation'] = {
                'source': 'prior_management_call_not_this_run',
                'proposal_id': _MANAGEMENT_RECEIPT,
                'body_sha256': _OBSERVED_BODY_SHA256,
                'prior_definition_sha256': _OBSERVED_DEFINITION_SHA256,
                'definition_sha_matches_prior': target.get('current_content_sha256') == _OBSERVED_DEFINITION_SHA256,
                'valid': True, 'executable': True, 'engine': 'ForwardChainingEngine',
                'coverage': 'same_original_body_only_not_new_candidate_or_outer_rule',
                'this_run_validation_status': 'not_run',
            }
        target['soc_body_validation'] = metadata
    return targets


class ReasoningBodyValidator:
    """局部适配器及独立审计；构造本类不调用工具，也不重置Collector。"""

    def __init__(self, collector):
        self.collector = collector
        self.ledger_start = len(collector.ledger)
        self.records = []

    def adapters(self):
        # association包含其他家族，宿主dispatch和validate()都必须核families。
        return {'association': {
            'contract_confirmed': True, 'contract_version': CONTRACT_ID,
            'contract_id_is_observed_not_server_version': True,
            'connected': True, 'connection_status': 'configured_unverified',
            'read_only': True, 'families': ['reasoning'],
            'validation_scope': VALIDATION_SCOPE, 'validated_parts': ['bodyJson'],
            'complete_rule_format_status': 'unverified', 'validate': self.validate,
        }}

    def annotate_targets(self, targets):
        return annotate_targets(targets)

    def _budget(self):
        elapsed = max(0.0, time.monotonic() - self.collector.started)
        return {
            'max_calls': MAX_CALLS, 'calls_used': self.collector.calls,
            'remaining_calls': max(0, MAX_CALLS - self.collector.calls),
            'max_seconds': MAX_SECONDS, 'elapsed_seconds': round(elapsed, 3),
            'remaining_seconds': round(max(0.0, MAX_SECONDS - elapsed), 3),
            'call_start_soft_deadline': True,
            'model_wait_does_not_reset_collector_deadline': True,
        }

    def _base_record(self, target):
        identity = target.get('identity') if isinstance(target, dict) else None
        return {
            'scope': VALIDATION_SCOPE, 'validation_scope': VALIDATION_SCOPE,
            'validated_parts': ['bodyJson'], 'status': 'unverified',
            'validation_status': 'not_run', 'business_status_confirmed': False,
            'contract_status': 'provided_body_only', 'contract_id': CONTRACT_ID,
            'complete_rule_format_status': 'unverified', 'effect_status': 'not_evaluated',
            'connection_status': 'configured_unverified', 'invoked': False,
            'target_key': target.get('target_key') if isinstance(target, dict) else None,
            'target_identity': copy.deepcopy(identity) if isinstance(identity, dict) else {},
            'candidate_body_sha256': None, 'receipt': {},
        }

    def _finish(self, record):
        record['budget_after'] = self._budget()
        self.records.append(copy.deepcopy(record))
        return record

    def validate(self, *, candidate, target):
        record = self._base_record(target)
        if not _reasoning_target(target):
            record.update(contract_status='not_provided', validated_parts=[],
                          skip_reason='target_family_not_covered',
                          reason='本适配器仅覆盖association/reasoning元规则正文，未调用其他家族。')
            return self._finish(record)
        body = candidate.get('bodyJson') if isinstance(candidate, dict) else None
        if not isinstance(body, str) or not body.strip():
            record.update(skip_reason='body_carrier_not_covered',
                          reason='候选未提供本合同覆盖的非空字符串bodyJson；未转换、补造载体或作SOC拒绝。')
            return self._finish(record)
        try:
            record['candidate_body_sha256'] = _body_hash(body)
        except UnicodeError:
            record.update(skip_reason='body_carrier_not_covered',
                          reason='候选bodyJson不能原样表示为UTF-8；未修补载体或调用接口。')
            return self._finish(record)
        record['budget_before'] = self._budget()
        if (self.collector.exhausted or self.collector.calls >= MAX_CALLS
                or time.monotonic() - self.collector.started >= MAX_SECONDS):
            record.update(skip_reason='budget_exhausted',
                          reason='原Collector共享调用数或调用前软截止预算已耗尽，正文未校验；保留未验草案。')
            return self._finish(record)
        before_calls, before_ledger = self.collector.calls, len(self.collector.ledger)
        data, caught = None, None
        try:
            # 不添加ruleId或元数据，不转换字符串，不执行/采用compiledBodyJson。
            data = self.collector.call('reasoning_validate', {'body': {'bodyJson': body}})
        except Exception as error:
            caught = type(error).__name__
        added = self.collector.ledger[before_ledger:]
        rows = [row for row in added if isinstance(row, dict) and row.get('tool') == TOOL]
        entry = rows[-1] if len(rows) == 1 else None
        invoked = self.collector.calls > before_calls
        record['invoked'] = invoked
        if isinstance(entry, dict):
            audit = entry.get('audit') if isinstance(entry.get('audit'), dict) else {}
            record.update(call_id=entry.get('call_id'),
                          raw_response_audit=audit.get('raw_response_file'),
                          gateway_outcome=entry.get('gateway_outcome'))
            record['receipt'] = {
                'call_id': entry.get('call_id'), 'tool': entry.get('tool'),
                'resource': audit.get('resource'), 'exact_tool': audit.get('exact_tool'),
                'raw_response_audit': audit.get('raw_response_file'),
                'candidate_body_sha256': record['candidate_body_sha256'],
            }
        if not invoked and caught is None and (
                self.collector.exhausted or self.collector.calls >= MAX_CALLS
                or time.monotonic() - self.collector.started >= MAX_SECONDS):
            record.update(skip_reason='budget_exhausted',
                          reason='调用前原共享预算耗尽，接口未调用，正文保持未验。')
            return self._finish(record)
        audit = entry.get('audit') if isinstance(entry, dict) and isinstance(entry.get('audit'), dict) else {}
        confirmed_source = (
            invoked and self.collector.calls == before_calls + 1 and len(rows) == 1
            and audit.get('resource') == RESOURCE and audit.get('exact_tool') == EXACT_TOOL
            and entry.get('status') == 'success_with_data'
            and isinstance(audit.get('raw_response_file'), str) and bool(audit['raw_response_file'])
        )
        if caught is not None or not confirmed_source or not isinstance(data, dict):
            record.update(status='error', validation_status='error',
                          failure_scope='validator_transport_or_receipt',
                          connection_status='attempted_unverified' if invoked else 'configured_unverified',
                          reason='元规则正文静态校验调用或回执处理失败，未取得可核对结果；不据此认定候选不合法。')
            if caught is not None:
                record['error_type'] = caught
            elif isinstance(entry, dict) and entry.get('error_type'):
                record['error_type'] = entry['error_type']
            return self._finish(record)
        record['connection_status'] = 'connected'
        record['receipt']['data'] = copy.deepcopy(data)
        valid, executable = data.get('valid'), data.get('executable')
        if valid is False:
            record.update(status='rejected', validation_status='rejected',
                          business_status_confirmed=True, rejection_scope=VALIDATION_SCOPE,
                          reason='元规则正文静态校验器明确返回data.valid=false；具体原回执已保留，不推造错误字段。')
        elif valid is True and executable is True:
            record.update(status='accepted', validation_status='accepted',
                          business_status_confirmed=True,
                          reason='当前校验器接受本候选bodyJson并标记executable；未验证完整候选外层，也未执行规则。')
        else:
            record.update(status='error', validation_status='error',
                          failure_scope='validator_receipt_inconsistent',
                          reason='正文校验回执缺少严格布尔valid=true及executable=true，或状态不一致；不能认定接受或候选不合法。')
        return self._finish(record)

    def snapshot(self):
        # ledger还可能含F复用行或其他收集行，仅导出新校验操作，不改冻结采集审计。
        ledger = [copy.deepcopy(row) for row in self.collector.ledger[self.ledger_start:]
                  if isinstance(row, dict) and row.get('tool') == TOOL and not row.get('reused')]
        counts = Counter(row['status'] for row in self.records)
        return {
            'scope': VALIDATION_SCOPE, 'configured': True, 'families': ['reasoning'],
            'validated_parts': ['bodyJson'], 'contract_status': 'provided_body_only',
            'status': 'unverified', 'complete_rule_format_status': 'unverified',
            'effect_status': 'not_evaluated', 'budget': self._budget(),
            'attempted_calls': sum(row['invoked'] for row in self.records),
            'accepted_body_count': counts.get('accepted', 0),
            'rejected_body_count': counts.get('rejected', 0),
            'error_count': counts.get('error', 0),
            'unverified_skip_count': counts.get('unverified', 0),
            'records': copy.deepcopy(self.records), 'validation_call_ledger': ledger,
            'ledger_is_post_collection_validation_only': True,
            'no_rule_save_reload_execution_or_compiled_replacement': True,
        }
