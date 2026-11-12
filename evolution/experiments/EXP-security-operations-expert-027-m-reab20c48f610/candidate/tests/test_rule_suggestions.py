"""新版规则建议的受控单元回归源；所有模型与业务数据均为显式Mock。

本测试不连接SOC/MCP/真实模型，不证明实际装载、真实建议质量或端到端效果。
此文件由管理助手编写但未执行；运行须由获准的测试入口另行办理。
"""
from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1] / 'dsh/managed/threat-analysis'
sys.path.insert(0, str(ROOT))

from rule_gate import evaluate_gate  # noqa: E402
from rule_optimization import load_frozen_five_source, run_rule_optimization  # noqa: E402
from rule_response import RuleError, extract_response, strict_json  # noqa: E402
from rule_validation import validate_public_suggestions, validate_suggestions  # noqa: E402
import dsh_runner  # noqa: E402

INCIDENT = 'INC-20261106-000901'
OTHER = 'INC-20261106-000902'
POLICY = {'route': 'five_source', 'low_confidence_threshold': .75}
REF = '/five_source/enriched_context/edr_detail/records/0/session_id'


def base(verdict='误报', score=.74):
    return {'unified_event_id': INCIDENT, 'verdict': verdict, 'confidence_score': score,
            'verified_facts': [{'fact': 'Mock会话A与会话B的记录被同一事件容器接纳。'}],
            'counter_evidence': [], 'uncertainty_notes': 'Mock未核实会话间稳定绑定。',
            'rule_optimization_suggestions': []}


def five_source():
    return {'unified_event_id': INCIDENT, 'event_snapshot': {'judgement_target': {
                'claim_type': 'MOCK_RELATION', 'anchor_rule': {'id': 'mock-r1', 'name': 'Mock关联'}}},
            'enriched_context': {
                'graph': {'rule_id': 'mock-r1', 'rule_ids': ['mock-r1'], 'event_type': 'MOCK_RELATION',
                          'classification_only': {'rule_id': 'mock-r1', 'event_type': 'MOCK_RELATION'}},
                'edr_detail': {'records': [{'session_id': 'mock-session-a', 'process_guid': 'mock-p1'},
                                           {'session_id': 'mock-session-b', 'process_guid': 'mock-p2'}]},
                'asset': {'importance': 0, 'authorized': False},
                'threat_intel': {}, 'history': {'records': []}},
            'data_completeness': .4}


def context():
    return {'incident_id': INCIDENT, 'five_source': five_source(), 'base_reference': base()}


def item(direction='Mock记录来自不同会话，建议核查关联是否按同一会话绑定，避免仅凭同主机混合归因。'):
    return {'rule_level': '关联规则', 'suggestion': direction,
            'impact_scope': '涉及本案同主机会话组合；收紧绑定可能遗漏跨会话攻击，真实规则当前条件及总体效果未验证。',
            'evidence_refs': [REF]}


def envelope(items, reason=None):
    value = {'incident_id': INCIDENT, 'items': items}
    if reason is not None:
        value['no_suggestion_reason'] = reason
    return json.dumps(value, ensure_ascii=False)


def empty_reason(kind='data_insufficient'):
    return {'kind': kind, 'detail': 'Mock仅有会话标识及缺失历史，尚无当前规则条件或实际求值可确认具体规则问题。'}


def write_frozen(root, frozen=None, manifest=None):
    root.mkdir(parents=True, exist_ok=True)
    data = json.dumps(five_source() if frozen is None else frozen, ensure_ascii=False).encode('utf-8') + b'\n'
    (root / 'five-source-output.json').write_bytes(data)
    (root / 'manifest.json').write_text(json.dumps(
        {'incident_id': INCIDENT, 'route': 'five_source', 'five_source_file': 'five-source-output.json'}
        if manifest is None else manifest), encoding='utf-8')
    return hashlib.sha256(data).hexdigest()


class StrictRuleGateTest(unittest.TestCase):
    def test_all_three_verdicts_share_strict_boundary(self):
        for verdict in ('误报', '可疑', '真实告警'):
            for score, expected in ((.74, 'collect'), (.75, 'skipped'), (.9, 'skipped')):
                with self.subTest(verdict=verdict, score=score):
                    result = evaluate_gate(base(verdict, score), incident_id=INCIDENT, source_confirmed=True)
                    self.assertEqual(result['gate_status'], expected)
                    self.assertEqual(result['low_confidence_threshold'], .75)

    def test_invalid_values_identity_and_unconfirmed_source(self):
        for score in (True, False, '0.74', None, float('nan'), float('inf'), -.1, 1.1, [], {}):
            with self.subTest(score=score):
                self.assertEqual(evaluate_gate(base(score=score), incident_id=INCIDENT,
                                               source_confirmed=True)['gate_status'], 'undetermined')
        for threshold in (True, '0.75', None, float('nan'), float('inf'), -1, 2):
            with self.subTest(threshold=threshold):
                self.assertEqual(evaluate_gate(base(), incident_id=INCIDENT, source_confirmed=True,
                                               threshold=threshold)['gate_status'], 'undetermined')
        for actual in (None, OTHER):
            row = base()
            row['unified_event_id'] = actual
            self.assertEqual(evaluate_gate(row, incident_id=INCIDENT,
                                           source_confirmed=True)['gate_status'], 'undetermined')
        self.assertEqual(evaluate_gate(base(), incident_id=INCIDENT)['gate_status'], 'undetermined')
        result = evaluate_gate(base(), incident_id=INCIDENT, source_gap='Mock冻结输入摘要缺失。')
        self.assertTrue(any(gap['message'] == 'Mock冻结输入摘要缺失。' for gap in result['collection_gaps']))
        self.assertEqual(evaluate_gate(base(), incident_id=INCIDENT, source_confirmed=True,
                                       route='unknown')['gate_status'], 'undetermined')

    def test_validation_and_self_reported_exceptions_do_not_control_gate(self):
        row = base(score=.9)
        row.update(validation={'status': 'failed'}, explicit_rule_review_requested=True,
                   observed_rule_anomalies=[{'code': 'UNRELATED_ENTITY_MIXING'}])
        before = copy.deepcopy(row)
        self.assertEqual(evaluate_gate(row, incident_id=INCIDENT,
                                       source_confirmed=True)['gate_status'], 'skipped')
        row['confidence_score'] = .74
        self.assertEqual(evaluate_gate(row, incident_id=INCIDENT,
                                       source_confirmed=True)['gate_status'], 'collect')
        self.assertEqual(before['validation'], row['validation'])
        self.assertEqual(evaluate_gate(None, route='fast_classification')['gate_status'], 'not_applicable')


class FrozenSourceTest(unittest.TestCase):
    def test_same_raw_bytes_and_all_domains_can_be_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            frozen = five_source()
            frozen['enriched_context'] = {key: {} for key in frozen['enriched_context']}
            sha = write_frozen(root, frozen)
            actual, audit = load_frozen_five_source(INCIDENT, root, sha)
            self.assertEqual(actual, frozen)
            self.assertTrue(audit['source_confirmed'])
            self.assertEqual(set(audit['domain_states'].values()), {'empty'})
            self.assertEqual(audit['input_sha256'], sha)
            with self.assertRaises(RuleError):
                load_frozen_five_source(INCIDENT, root, None)
            (root / 'five-source-output.json').write_bytes((root / 'five-source-output.json').read_bytes() + b' ')
            with self.assertRaises(RuleError):
                load_frozen_five_source(INCIDENT, root, sha)

    def test_wrong_manifest_or_actual_event_or_domain_is_rejected(self):
        mutations = [lambda data: data.update(unified_event_id=OTHER),
                     lambda data: data.update(event_snapshot=None),
                     lambda data: data['enriched_context'].pop('history')]
        for mutate in mutations:
            with self.subTest(mutate=mutate), tempfile.TemporaryDirectory() as directory:
                frozen = five_source()
                mutate(frozen)
                sha = write_frozen(Path(directory), frozen)
                with self.assertRaises(RuleError):
                    load_frozen_five_source(INCIDENT, directory, sha)
        for manifest in ({'route': 'five_source'}, {'incident_id': OTHER, 'route': 'five_source'},
                         {'incident_id': INCIDENT, 'route': 'fast_classification'}):
            with self.subTest(manifest=manifest), tempfile.TemporaryDirectory() as directory:
                sha = write_frozen(Path(directory), manifest=manifest)
                with self.assertRaises(RuleError):
                    load_frozen_five_source(INCIDENT, directory, sha)


class NaturalSuggestionContractTest(unittest.TestCase):
    def test_empty_reason_is_private_model_reference(self):
        for kind in ('data_insufficient', 'no_rule_issue', 'no_safe_adjustment'):
            audit = {}
            self.assertEqual(validate_suggestions(envelope([], empty_reason(kind)), context(), audit), [])
            self.assertEqual(audit['analysis_reason']['origin'], 'model_reported_reference')
            self.assertFalse(audit['analysis_reason']['independent_ground_truth'])
        for reason in (None, {}, {'kind': 'unknown', 'detail': 'Mock原因未知。'},
                       {'kind': 'data_insufficient', 'detail': '数据不足'}):
            with self.subTest(reason=reason), self.assertRaises(RuleError):
                validate_suggestions(envelope([], reason), context(), {})

    def test_two_distinct_items_may_share_level_and_public_is_exact_three_fields(self):
        audit = {}
        rows = [item(), item('Mock两个进程标识没有稳定父子关系，建议核查关联是否仅因时间相近就串为同一行为链。')]
        result = validate_suggestions(envelope(rows), context(), audit)
        self.assertEqual(len(result), 2)
        self.assertEqual({row['rule_level'] for row in result}, {'关联规则'})
        self.assertTrue(all(set(row) == {'rule_level', 'suggestion', 'impact_scope'} for row in result))
        self.assertTrue(all(row['suggestion'] == source['suggestion'] for row, source in zip(result, rows)))
        self.assertEqual(validate_public_suggestions(result), result)

    def test_package_errors_reject_before_individual_adoption(self):
        good_json = json.dumps(item(), ensure_ascii=False)
        duplicate_item = good_json[:-1] + ',"suggestion":"Mock重复JSON键"}'
        bad = [
            ('not json', 'JSON_PARSE_ERROR'),
            ('{"incident_id":' + json.dumps(INCIDENT) + ',"items":[' + good_json + ','
             + duplicate_item + ']}', 'DUPLICATE_KEY'),
            ('{"incident_id":' + json.dumps(INCIDENT) + ',"incident_id":'
             + json.dumps(OTHER) + ',"items":[]}', 'DUPLICATE_KEY'),
            ('{"incident_id":' + json.dumps(INCIDENT) + ',"items":[],"extra":NaN}', 'NON_FINITE_NUMBER'),
            (json.dumps({'items': [item()]}), 'INVALID_ENVELOPE'),
            (json.dumps({'incident_id': OTHER, 'items': [item()]}), 'INVALID_ENVELOPE'),
            (json.dumps({'incident_id': INCIDENT, 'items': {}}), 'INVALID_ENVELOPE'),
            (json.dumps({'incident_id': INCIDENT, 'items': [item()], 'extra': True}), 'INVALID_ENVELOPE'),
            (envelope([item()], empty_reason()), 'UNEXPECTED_NONEMPTY_REASON'),
            (envelope([item(), dict(item(), evidence_refs=[]), item('Mock第三个具体方向。')]), 'TOO_MANY_ITEMS'),
        ]
        for text, code in bad:
            with self.subTest(code=code):
                audit = {}
                with self.assertRaises(RuleError) as caught:
                    validate_suggestions(text, context(), audit)
                self.assertEqual(caught.exception.code, code)
                self.assertFalse(any(row.get('status') == 'pass' for row in audit.get('items', [])))

    def test_good_and_bad_items_are_independent_in_both_orders(self):
        good = item()
        public = {key: good[key] for key in ('rule_level', 'suggestion', 'impact_scope')}
        invalid = [
            ({'rule_content': {}}, 'INVALID_PRIVATE_FIELDS'),
            (None, 'INVALID_PRIVATE_FIELDS'),
            (dict(item(), unexpected=True), 'INVALID_PRIVATE_FIELDS'),
            (dict(item(), rule_level='检测规则和关联规则'), 'INVALID_RULE_LEVEL'),
            (dict(item(), suggestion=''), 'EMPTY_TEXT'),
            (dict(item(), suggestion='暂无建议'), 'PLACEHOLDER_TEXT'),
            (dict(item(), evidence_refs=[]), 'INVALID_EVIDENCE_REFS'),
            (dict(item(), evidence_refs=['/missing']), 'UNRESOLVED_POINTER'),
            (dict(item(), evidence_refs=['/five_source/enriched_context/history/records']), 'EMPTY_EVIDENCE'),
        ]
        for bad, code in invalid:
            for accepted_index in (0, 1):
                with self.subTest(code=code, accepted_index=accepted_index):
                    rows = [good, bad] if accepted_index == 0 else [bad, good]
                    before, source, audit = copy.deepcopy(rows), context(), {}
                    source_before = copy.deepcopy(source)
                    result = validate_suggestions(envelope(rows), source, audit)
                    self.assertEqual(result, [public])
                    self.assertEqual(validate_public_suggestions(result), result)
                    self.assertEqual(rows, before)
                    self.assertEqual(source, source_before)
                    rejected_index = 1 - accepted_index
                    projection = audit['projection']
                    self.assertEqual(projection['status'], 'partial')
                    self.assertEqual((projection['candidate_count'], projection['accepted_count'],
                                      projection['rejected_count']), (2, 1, 1))
                    self.assertEqual(projection['accepted_item_indices'], [accepted_index])
                    self.assertEqual(projection['rejected_item_indices'], [rejected_index])
                    self.assertEqual([row['item_index'] for row in audit['items']], [0, 1])
                    self.assertEqual(audit['items'][accepted_index]['status'], 'pass')
                    self.assertEqual(audit['items'][accepted_index]['public_index'], 0)
                    failure = audit['items'][rejected_index]['failure']
                    self.assertEqual((failure['code'], failure['item_index']), (code, rejected_index))
                    self.assertTrue(failure['reason'].strip())
                    self.assertNotIn('analysis_reason', audit)

    def test_all_rejected_keeps_each_failure_and_is_not_legitimate_empty(self):
        rows = [dict(item(), evidence_refs=[]), dict(item(), suggestion='暂无建议')]
        audit = {}
        with self.assertRaises(RuleError) as caught:
            validate_suggestions(envelope(rows), context(), audit)
        self.assertEqual(caught.exception.code, 'ALL_ITEMS_REJECTED')
        self.assertEqual(audit['projection']['status'], 'fail')
        self.assertEqual((audit['projection']['accepted_count'], audit['projection']['rejected_count']), (0, 2))
        self.assertEqual([row['item_index'] for row in audit['items']], [0, 1])
        self.assertEqual([row['failure']['code'] for row in audit['items']],
                         ['INVALID_EVIDENCE_REFS', 'PLACEHOLDER_TEXT'])
        self.assertNotIn('analysis_reason', audit)

    def test_duplicate_only_rejects_later_successful_candidate(self):
        good, audit = item(), {}
        public = {key: good[key] for key in ('rule_level', 'suggestion', 'impact_scope')}
        self.assertEqual(validate_suggestions(envelope([good, copy.deepcopy(good)]), context(), audit), [public])
        self.assertEqual(audit['projection']['accepted_item_indices'], [0])
        self.assertEqual(audit['items'][1]['failure']['code'], 'DUPLICATE_SUGGESTION')
        audit = {}
        self.assertEqual(validate_suggestions(
            envelope([dict(good, evidence_refs=['/missing']), good]), context(), audit), [public])
        self.assertEqual(audit['projection']['accepted_item_indices'], [1])
        self.assertEqual(audit['projection']['rejected_item_indices'], [0])

    def test_deep_invalid_field_and_oversize_index_do_not_escape_item_isolation(self):
        # 明确合成边界数据；不用deepcopy复制非法深层容器，也不执行其中内容。
        deep = 'Mock非字符串字段的叶值'
        for _ in range(500):
            deep = [deep]
        huge_ref = '/five_source/enriched_context/edr_detail/records/' + '9' * 5000 + '/session_id'
        bad_rows = [(dict(item(), **{field: deep}),
                     'INVALID_RULE_LEVEL' if field == 'rule_level' else 'EMPTY_TEXT')
                    for field in ('rule_level', 'suggestion', 'impact_scope')]
        bad_rows.append((dict(item(), evidence_refs=[huge_ref]), 'UNRESOLVED_POINTER'))
        good = item()
        public = {key: good[key] for key in ('rule_level', 'suggestion', 'impact_scope')}
        for bad, code in bad_rows:
            for accepted_index in (0, 1):
                with self.subTest(code=code, accepted_index=accepted_index):
                    rows = [good, bad] if accepted_index == 0 else [bad, good]
                    audit = {}
                    self.assertEqual(validate_suggestions(envelope(rows), context(), audit), [public])
                    self.assertEqual(audit['projection']['accepted_item_indices'], [accepted_index])
                    self.assertEqual(audit['items'][1 - accepted_index]['failure']['code'], code)
                    self.assertEqual(audit['items'][1 - accepted_index]['failure']['item_index'], 1 - accepted_index)

    def test_deep_business_evidence_is_checked_without_recursive_traversal(self):
        source = context()
        deep = 'Mock已返回的进程上下文事实'
        for _ in range(500):
            deep = [deep]
        source['five_source']['enriched_context']['edr_detail']['records'][0]['deep_context'] = deep
        ref = '/five_source/enriched_context/edr_detail/records/0/deep_context'
        row, audit = dict(item(), evidence_refs=[ref]), {}
        result = validate_suggestions(envelope([row]), source, audit)
        self.assertEqual(result, [{key: row[key] for key in ('rule_level', 'suggestion', 'impact_scope')}])
        self.assertTrue(audit['items'][0]['evidence_refs'][0]['business_evidence'])

    def test_final_public_array_still_rejects_bad_or_duplicate_items(self):
        public = {key: item()[key] for key in ('rule_level', 'suggestion', 'impact_scope')}
        for rows in ([public, dict(public, rule_level='非法层级')], [public, dict(public)],
                     [dict(public, evidence_refs=[REF])], [public, public, public]):
            with self.subTest(rows=rows), self.assertRaises(RuleError):
                validate_public_suggestions(rows)

    def test_text_shape_does_not_reject_suggestion_or_scope(self):
        # 仅验证不再按词形拒收；这些字符串不因此成为生成阶段的业务正例。
        # “只提供自然语言优化建议”由生成提示约束，不另设内容检测器。
        bodies = ('本案记录了WMI查询 select * from win32_cdromdrive，建议核查对应证据字段。',
                  '```sql\nSELECT * FROM alerts;\n```', 'DELETE FROM alerts;',
                  'CREATE RULE mock_rule;', 'UPDATE alerts SET count = 2;',
                  '{"conditionJson":{"count":2}}', '说明中引用 {"bodyJson":{"count":2}}。',
                  'detection:\n  selection:\n    event_id: 1', '正则表达式: ^cmd.*$')
        for field in ('suggestion', 'impact_scope'):
            for body in bodies:
                with self.subTest(field=field, body=body):
                    row, audit = dict(item(), **{field: body}), {}
                    result = validate_suggestions(envelope([row]), context(), audit)
                    self.assertEqual(result, [{key: row[key] for key in ('rule_level', 'suggestion', 'impact_scope')}])
                    self.assertEqual(audit['projection']['status'], 'pass')

    def test_invalid_empty_and_declaration_only_references_are_rejected(self):
        for refs in ([], [REF, REF], ['/missing'], ['five_source.edr_detail'],
                     ['/five_source/enriched_context/history/records'],
                     ['/five_source/enriched_context/graph/rule_id'],
                     ['/five_source/enriched_context/graph/rule_ids/0'],
                     ['/five_source/enriched_context/graph/classification_only'],
                     ['/base_reference/uncertainty_notes'],
                     ['/five_source/enriched_context/edr_detail/records/00/session_id'],
                     ['/five_source/enriched_context/edr_detail/records/0/no~2key']):
            with self.subTest(refs=refs), self.assertRaises(RuleError):
                validate_suggestions(envelope([dict(item(), evidence_refs=refs)]), context(), {})
        for ref in ('/five_source/enriched_context/asset/importance',
                    '/five_source/enriched_context/asset/authorized'):
            self.assertEqual(len(validate_suggestions(envelope([dict(item(), evidence_refs=[ref])]), context(), {})), 1)

    def test_strict_json_and_unique_fence_do_not_repair_responses(self):
        good = envelope([item()])
        self.assertEqual(extract_response('```json\n' + good + '\n```'), json.loads(good))
        for text in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":1e999}',
                     '说明\n' + good, '```json\n' + good + '\n```\n```json\n{}\n```'):
            with self.subTest(text=text), self.assertRaises(RuleError):
                extract_response(text)
        with self.assertRaises(RuleError):
            strict_json('{"x":"\ud800"}')


class MockPostStageTest(unittest.TestCase):
    def run_mock(self, root, model_content, row=None, frozen=None, settings=None, failing=False):
        fusion = root / 'fusion'
        sha = write_frozen(fusion, frozen)
        calls = []

        def transport(endpoint, payload, api_key, timeout):
            calls.append((endpoint, payload, timeout))
            if failing:
                raise TimeoutError('Mock模型超时，不连接任何真实服务。')
            return {'choices': [{'message': {'content': model_content}}]}

        source = base() if row is None else row
        before = copy.deepcopy(source)
        result, runtime = run_rule_optimization(incident_id=INCIDENT, base_result=source,
            fusion_dir=fusion, output_dir=root / 'rules', model_config={'model': 'mock-only', 'baseURL': 'http://mock.invalid/v1'},
            transport=transport, gate_settings=POLICY if settings is None else settings,
            expected_input_sha256=sha, base_validation={'status': 'failed'})
        self.assertEqual(source, before)
        return result, runtime, calls

    def test_success_is_one_call_reuses_five_source_and_does_not_adopt_old_base_suggestions(self):
        with tempfile.TemporaryDirectory() as directory:
            root, row = Path(directory), base()
            row['rule_optimization_suggestions'] = [{'rule': {'id': 'old'}, 'suggestion': '旧基础建议不得采用'}]
            result, runtime, calls = self.run_mock(root, envelope([item()]), row=row)
            self.assertEqual(len(result), 1)
            self.assertEqual(runtime['model_calls'], 1)
            self.assertEqual(runtime['new_mcp_calls'], 0)
            self.assertEqual(calls[0][2], 120)
            self.assertEqual(calls[0][1]['temperature'], .1)
            sent = json.loads(calls[0][1]['messages'][1]['content'])
            self.assertEqual(sent['five_source'], five_source())
            self.assertNotIn('rule_optimization_suggestions', sent['base_reference'])
            self.assertTrue(runtime['artifacts_committed'])
            frozen_bytes = (root / 'rules/rule-final-suggestions.json').read_bytes()
            again, state = run_rule_optimization(incident_id=INCIDENT, base_result=row,
                fusion_dir=root / 'fusion', output_dir=root / 'rules', model_config={}, gate_settings=POLICY)
            self.assertEqual(again, [])
            self.assertEqual(state['failure']['code'], 'EXISTING_RULE_ARTIFACTS')
            self.assertEqual((root / 'rules/rule-final-suggestions.json').read_bytes(), frozen_bytes)

    def test_empty_analysis_and_model_validation_failures_remain_distinct(self):
        scenarios = [(envelope([], empty_reason()), False, 'completed'),
                     (envelope([]), False, 'failed'), ('not json', False, 'failed'),
                     (envelope([dict(item(), rule_content={})]), False, 'failed'),
                     (envelope([item()]), True, 'failed')]
        for content, failing, expected in scenarios:
            with self.subTest(content=content, failing=failing), tempfile.TemporaryDirectory() as directory:
                row = base()
                row['rule_optimization_suggestions'] = [{'rule_content': {'old': True},
                    'impact_scope': '旧候选', 'cannot_optimize_reason': None}]
                result, state, calls = self.run_mock(Path(directory), content, row=row, failing=failing)
                self.assertEqual(result, [])
                self.assertEqual(state['status'], expected)
                self.assertEqual(len(calls), 1)
                if expected == 'completed':
                    self.assertEqual(state['analysis_reason']['kind'], 'data_insufficient')
                    self.assertEqual(state['analysis_reason']['origin'], 'model_reported_reference')
                else:
                    self.assertIn('failure', state)

    def test_partial_success_preserves_base_and_commits_only_valid_suggestions(self):
        # 全部为合成Mock；没有真实模型、SOC、MCP或实例HOME依赖。
        good = item()
        bad = dict(item(), evidence_refs=['/missing'])
        expected = [{key: good[key] for key in ('rule_level', 'suggestion', 'impact_scope')}]
        for accepted_index in (0, 1):
            with self.subTest(accepted_index=accepted_index), tempfile.TemporaryDirectory() as directory:
                root, source = Path(directory), base()
                source['rule_optimization_suggestions'] = [{'rule': {'id': 'mock-old'}, 'suggestion': 'Mock基础旧建议不得采用'}]
                before = copy.deepcopy(source)
                rows = [good, bad] if accepted_index == 0 else [bad, good]
                result, state, calls = self.run_mock(root, envelope(rows), row=source)
                self.assertEqual(source, before)
                self.assertEqual(result, expected)
                self.assertEqual(validate_public_suggestions(result), result)
                self.assertEqual(state['status'], 'partial_success')
                self.assertEqual(state['json_validation']['status'], 'partial')
                self.assertEqual((state['candidate_count'], state['accepted_count'], state['rejected_count']), (2, 1, 1))
                self.assertEqual(state['accepted_item_indices'], [accepted_index])
                self.assertEqual(state['rejected_item_indices'], [1 - accepted_index])
                self.assertEqual(len(state['rejected_items']), 1)
                self.assertEqual(state['rejected_items'][0]['code'], 'UNRESOLVED_POINTER')
                self.assertEqual(state['suggestion_count'], 1)
                self.assertEqual(state['model_calls'], 1)
                self.assertEqual(state['new_mcp_calls'], 0)
                self.assertTrue(state['base_validation_kept_separate'])
                self.assertTrue(state['artifacts_committed'])
                self.assertEqual(len(calls), 1)
                sent = json.loads(calls[0][1]['messages'][1]['content'])
                self.assertEqual(sent['five_source'], five_source())
                self.assertNotIn('rule_optimization_suggestions', sent['base_reference'])
                self.assertNotIn('analysis_reason', state)
                final_path = root / 'rules/rule-final-suggestions.json'
                self.assertEqual(json.loads(final_path.read_text(encoding='utf-8')), result)
                audit = json.loads((root / 'rules/rule-validation.private.json').read_text(encoding='utf-8'))
                self.assertEqual(audit['projection']['status'], 'partial')
                self.assertEqual(audit['projection']['accepted_item_indices'], [accepted_index])
                self.assertEqual(audit['items'][1 - accepted_index]['failure']['code'], 'UNRESOLVED_POINTER')
                saved = final_path.read_bytes()
                again, repeated = run_rule_optimization(incident_id=INCIDENT, base_result=source,
                    fusion_dir=root / 'fusion', output_dir=root / 'rules', model_config={}, gate_settings=POLICY)
                self.assertEqual(again, [])
                self.assertEqual(repeated['failure']['code'], 'EXISTING_RULE_ARTIFACTS')
                self.assertEqual(final_path.read_bytes(), saved)

    def test_all_rejected_runtime_differs_from_legitimate_empty(self):
        cases = [(envelope([dict(item(), unexpected=True), dict(item(), evidence_refs=['/missing'])]),
                  'failed', 2, 2), (envelope([], empty_reason()), 'completed', 0, 0)]
        for content, status, candidates, rejected in cases:
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                result, state, calls = self.run_mock(root, content)
                self.assertEqual(result, [])
                self.assertEqual(state['status'], status)
                self.assertEqual((state['candidate_count'], state['accepted_count'], state['rejected_count']),
                                 (candidates, 0, rejected))
                self.assertEqual(len(calls), 1)
                audit = json.loads((root / 'rules/rule-validation.private.json').read_text(encoding='utf-8'))
                self.assertEqual(json.loads((root / 'rules/rule-final-suggestions.json').read_text(encoding='utf-8')), [])
                if status == 'failed':
                    self.assertEqual(state['failure']['code'], 'ALL_ITEMS_REJECTED')
                    self.assertEqual(state['json_validation']['status'], 'fail')
                    self.assertEqual(audit['projection']['status'], 'fail')
                    self.assertEqual([row['status'] for row in audit['items']], ['fail', 'fail'])
                    self.assertEqual([row['failure']['code'] for row in audit['items']],
                                     ['INVALID_PRIVATE_FIELDS', 'UNRESOLVED_POINTER'])
                    self.assertNotIn('analysis_reason', state)
                    self.assertNotIn('analysis_reason', audit)
                else:
                    self.assertEqual(state['json_validation']['status'], 'pass')
                    self.assertEqual(audit['items'], [])
                    self.assertEqual(state['analysis_reason']['kind'], 'data_insufficient')
                    self.assertFalse(state['analysis_reason']['independent_ground_truth'])

    def test_package_failure_never_delivers_valid_prefix(self):
        for content, code in ((json.dumps({'incident_id': OTHER, 'items': [item()]}), 'INVALID_ENVELOPE'),
                              (envelope([item(), dict(item(), evidence_refs=[]), item()]), 'TOO_MANY_ITEMS')):
            with self.subTest(code=code), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                result, state, calls = self.run_mock(root, content)
                self.assertEqual(result, [])
                self.assertEqual(state['status'], 'failed')
                self.assertEqual(state['failure']['code'], code)
                self.assertEqual(state['json_validation']['status'], 'fail')
                self.assertEqual(len(calls), 1)
                self.assertEqual(json.loads((root / 'rules/rule-final-suggestions.json').read_text(encoding='utf-8')), [])

    def test_only_manifest_and_frozen_source_are_read_and_audits_never_enter_model(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fusion = root / 'fusion'
            fusion.mkdir()
            for name in ('data-completeness.audit.json', 'fusion.audit.json', 'call-ledger.audit.json'):
                (fusion / name).write_text('DO_NOT_READ_AUDIT_OR_SENSITIVE_TEXT', encoding='utf-8')
            source_reads = []
            original_read_bytes = Path.read_bytes

            def read_frozen_only(path):
                self.assertEqual(path.parent, fusion)
                self.assertIn(path.name, {'manifest.json', 'five-source-output.json'})
                source_reads.append(path.name)
                return original_read_bytes(path)

            with patch.object(Path, 'read_bytes', new=read_frozen_only), \
                    patch.object(Path, 'read_text', side_effect=AssertionError('禁止补读其他源文本')):
                result, runtime, calls = self.run_mock(root, envelope([], empty_reason()))
            self.assertEqual(result, [])
            self.assertEqual(runtime['status'], 'completed')
            self.assertCountEqual(source_reads, ['manifest.json', 'five-source-output.json'])
            sent = json.loads(calls[0][1]['messages'][1]['content'])
            self.assertEqual(set(sent), {'incident_id', 'five_source', 'base_reference'})
            self.assertEqual(sent['five_source'], five_source())
            self.assertEqual(runtime['model_input_omissions'], 'none_frozen_five_source_reused')
            self.assertNotIn('DO_NOT_READ_AUDIT_OR_SENSITIVE_TEXT', json.dumps(sent))

    def test_skipped_undetermined_and_oversize_do_not_call_model(self):
        scenarios = [(base(score=.75), five_source(), POLICY, 'skipped'),
                     (base(score='0.74'), five_source(), POLICY, 'undetermined'),
                     (base(), five_source(), {}, 'undetermined')]
        huge = five_source()
        huge['enriched_context']['edr_detail']['large_mock_evidence'] = '证据' * 40000
        scenarios.append((base(), huge, POLICY, 'failed'))
        for row, frozen, settings, expected in scenarios:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                result, state, calls = self.run_mock(Path(directory), envelope([item()]), row=row,
                                                      frozen=frozen, settings=settings)
                self.assertEqual(result, [])
                self.assertEqual(state['status'], expected)
                self.assertFalse(state['llm_invoked'])
                self.assertEqual(calls, [])


class RunnerAuditIsolationTest(unittest.TestCase):
    RUN_ID = 'run-11111111-1111-4111-8111-111111111111'

    def test_new_rule_audit_io_cannot_prevent_claim_evidence_or_fast_delivery(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            fast = {'verdict': '误报', 'matches': [{'source': 'alert_whitelist', 'entry_id': 'mock-entry',
                    'entity_value': '192.0.2.1', 'evidence_refs': ['mock-alert'],
                    'list_version': None, 'queried_at': '2026-11-06T07:00:00Z'}]}

            def collect(_args, gateway):
                fusion = root / self.RUN_ID / 'fusion'
                fusion.mkdir(parents=True)
                (fusion / 'manifest.json').write_text(json.dumps({'route': 'fast_classification'}), encoding='utf-8')
                (fusion / 'fast-classification-output.json').write_text(json.dumps(fast), encoding='utf-8')
                return fusion

            client = MagicMock()
            client.claim.return_value = {'judgementId': 'mock-judge'}
            with patch.object(dsh_runner, 'build_gateway', return_value=object()), \
                    patch.object(dsh_runner, 'SocJudgementClient', return_value=client), \
                    patch.object(dsh_runner.evidence_collection, 'run', side_effect=collect) as evidence, \
                    patch.object(dsh_runner, '_write_private', side_effect=OSError('Mock新增建议审计不可写')), \
                    patch.object(dsh_runner, 'run_inference') as infer, \
                    patch.object(dsh_runner, '_finish_completed') as finish:
                result = dsh_runner._analyze(INCIDENT, root, {}, run_id=self.RUN_ID)
            client.claim.assert_called_once_with(INCIDENT)
            evidence.assert_called_once()
            infer.assert_not_called()
            finish.assert_called_once()
            client.write.assert_not_called()
            self.assertEqual(result['status'], 'completed')
            self.assertEqual(result['route'], 'fast_classification')
            self.assertEqual(result['validation'], {'status': 'not_applicable_fast_classification'})
            self.assertEqual(result['result'], fast)
            self.assertFalse(result['llm_invoked'])
            self.assertFalse((root / self.RUN_ID / 'rules/run-contract.json').exists())

    def test_contract_write_failure_follows_completed_base_checkpoint_and_is_recoverably_isolated(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            result = {'run_id': self.RUN_ID, 'incident_id': INCIDENT, 'judgement_id': 'mock-judge',
                      'route': 'five_source', 'status': 'completed', 'llm_invoked': True,
                      'result': base(), 'validation': {'status': 'failed', 'error': 'Mock原机械格式失败'}}
            original = copy.deepcopy(result)
            writer = dsh_runner._write_private
            checkpoints_before_contract = []

            def private_write(path, value):
                if path.name == 'run-contract.json':
                    try:
                        saved = dsh_runner.read_json(output / 'result.json')
                    except OSError:
                        saved = None
                    checkpoints_before_contract.append(saved)
                    raise OSError('Mock只有新版run-contract标记写入失败')
                return writer(path, value)

            with patch.object(dsh_runner, '_write_private', side_effect=private_write), \
                    patch.object(dsh_runner, '_attach_rule_stage_locked') as stage:
                runtime = dsh_runner._attach_rule_stage(result, output, {})
            stage.assert_not_called()
            self.assertEqual(checkpoints_before_contract, [original])
            self.assertEqual(runtime['error_type'], 'RULE_STAGE_SETUP_FAILED')
            self.assertEqual(result, original)
            self.assertEqual(dsh_runner.read_json(output / 'result.json'), original)
            self.assertFalse((output / 'rules/run-contract.json').exists())
            self.assertTrue((output / 'rules/runner-failure.json').exists())
            self.assertTrue(dsh_runner._new_rule_run(result, output))
            recovered = dsh_runner._recover_rule_stage(result, output)
            self.assertEqual(recovered['status'], 'failed')
            self.assertEqual(result, original)

    def test_partial_stage_changes_only_suggestions_and_recovery_does_not_regenerate(self):
        good = item()
        public = [{key: good[key] for key in ('rule_level', 'suggestion', 'impact_scope')}]
        runtime = {'status': 'partial_success', 'json_validation': {'status': 'partial'},
                   'candidate_count': 2, 'accepted_count': 1, 'rejected_count': 1,
                   'accepted_item_indices': [1], 'rejected_item_indices': [0],
                   'rejected_items': [{'item_index': 0, 'code': 'UNRESOLVED_POINTER',
                                       'reason': 'Mock引用不指向本次上下文的真实原值。'}]}
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            run = {'run_id': self.RUN_ID, 'incident_id': INCIDENT, 'judgement_id': 'mock-judge',
                   'route': 'five_source', 'status': 'completed', 'llm_invoked': True,
                   'result': base(), 'validation': {'status': 'failed', 'error': 'Mock原基础失败'}}
            before = copy.deepcopy(run)
            expected = copy.deepcopy(before)
            expected['result']['rule_optimization_suggestions'] = public
            with patch.object(dsh_runner, '_rule_gate_inputs',
                              return_value=(POLICY, {'source_confirmed': True}, {'gate_status': 'collect'})) as gate, \
                    patch('rule_optimization.run_rule_optimization',
                          return_value=(public, copy.deepcopy(runtime))) as model_stage:
                state = dsh_runner._attach_rule_stage(run, output, {'analysisModel': {}})
                self.assertEqual(run, expected)
                self.assertEqual(state['status'], 'partial_success')
                self.assertEqual(dsh_runner.read_json(output / 'base-analysis-result.json'), before)
                recovered = dsh_runner._recover_rule_stage(run, output)
            gate.assert_called_once()
            model_stage.assert_called_once()
            self.assertEqual(recovered['status'], 'partial_success')
            self.assertEqual(recovered['accepted_item_indices'], [1])
            self.assertEqual(recovered['rejected_item_indices'], [0])
            self.assertEqual(run, expected)
            self.assertEqual(run['validation'], before['validation'])
            self.assertEqual(dsh_runner.read_json(output / 'rules/runner-final-suggestions.json'), public)

    def test_completed_legacy_and_old_batch_failure_runs_are_not_backfilled(self):
        # 两类完全合成旧Run；不依赖实例HOME，不重放真实f452ca36。
        for marked in (False, True):
            with self.subTest(marked=marked), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                output = root / self.RUN_ID
                output.mkdir()
                saved = {'run_id': self.RUN_ID, 'incident_id': INCIDENT, 'judgement_id': 'mock-old-judge',
                         'route': 'five_source', 'status': 'completed', 'llm_invoked': True,
                         'result': base(), 'validation': {'status': 'failed', 'error': 'Mock原基础失败'},
                         'delivery': {'status': 'saved', 'markdown': 'Mock旧报告，建议全拒仍失败。'}}
                files = {
                    'result.json': json.dumps(saved, ensure_ascii=False),
                    'report.html': '<p>Mock旧报告：建议全拒，不是合法无建议。</p>',
                    'soc-result-request.json': json.dumps({'synthetic_mock': True}),
                    'rules/rule-model-output.json': envelope([item(), dict(item(), evidence_refs=['/missing'])]),
                    'rules/rule-final-suggestions.json': '[]',
                    'rules/runner-final-suggestions.json': '[]',
                }
                if marked:
                    files['rules/runner-state.json'] = json.dumps({
                        'schema_version': dsh_runner.RULE_STAGE_SCHEMA, 'run_id': self.RUN_ID,
                        'incident_id': INCIDENT, 'state': 'finished',
                        'runtime': {'status': 'failed', 'failure': {
                            'code': 'UNRESOLVED_POINTER', 'reason': 'Mock旧策略整批拒收。'}}}, ensure_ascii=False)
                for name, text in files.items():
                    path = output / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(text, encoding='utf-8')
                paths = [output / name for name in files]
                before_bytes = {path: path.read_bytes() for path in paths}
                self.assertEqual(dsh_runner._new_rule_run(saved, output), marked)
                blocked = AssertionError('Mock已完成旧Run禁止重算、生成、恢复交付或业务调用')
                with patch.object(dsh_runner, 'build_gateway', side_effect=blocked), \
                        patch.object(dsh_runner, '_recover_rule_stage', side_effect=blocked), \
                        patch.object(dsh_runner, '_attach_rule_stage', side_effect=blocked), \
                        patch.object(dsh_runner, '_finish_completed', side_effect=blocked), \
                        patch('rule_optimization.run_rule_optimization', side_effect=blocked), \
                        patch('rule_validation.validate_suggestions', side_effect=blocked):
                    result = dsh_runner.cleanup(self.RUN_ID, root, {})
                self.assertEqual(result, saved)
                self.assertEqual({path: path.read_bytes() for path in paths}, before_bytes)
                self.assertFalse((output / 'rules/run-contract.json').exists())

    def test_partial_delivery_keeps_array_and_explains_safe_rejection_category(self):
        # SOC与持久化均为Mock，仅验证组件数据流，不产生外部请求。
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            good = item()
            public = [{key: good[key] for key in ('rule_level', 'suggestion', 'impact_scope')}]
            run = {'run_id': self.RUN_ID, 'incident_id': INCIDENT, 'judgement_id': 'mock-judge',
                   'model': 'mock-only', 'report_revision': 1,
                   'route': 'five_source', 'status': 'completed', 'llm_invoked': True,
                   'result': base(), 'validation': {'status': 'failed', 'error': 'Mock原基础失败'}}
            run['result'].update(primary_claim={'type': 'MOCK_RELATION', 'result': '证据不足'},
                secondary_findings=None, attack_stage=None, technique=None, technique_name=None,
                key_claims=[], recommended_actions=[], reasoning_summary='Mock原基础说明，不作业务真值。',
                attack_chain_speculation={'current_stage': None, 'observed_path': [],
                                          'possible_next_steps': [], 'supporting_evidence': []})
            run['result']['rule_optimization_suggestions'] = public
            frozen_result, frozen_validation = copy.deepcopy(run['result']), copy.deepcopy(run['validation'])
            private_reason = 'MOCK_PRIVATE_REJECTION_TEXT_MUST_NOT_RENDER'
            private_pointer = '/five_source/enriched_context/history/mock-private-empty'
            runtime = {'status': 'partial_success', 'json_validation': {'status': 'partial'},
                       'candidate_count': 2, 'accepted_count': 1, 'rejected_count': 1,
                       'accepted_item_indices': [1], 'rejected_item_indices': [0],
                       'suggestion_count': 1, 'rejected_items': [{'item_index': 0,
                           'scope': 'evidence_traceability', 'code': 'EMPTY_EVIDENCE',
                           'pointer': private_pointer, 'reason': private_reason}]}
            dsh_runner._write_private(output / 'rules/runner-state.json', {
                'schema_version': dsh_runner.RULE_STAGE_SCHEMA, 'run_id': self.RUN_ID,
                'incident_id': INCIDENT, 'state': 'finished', 'runtime': runtime})
            notice = dsh_runner._rule_notice(run, output)
            self.assertIsInstance(notice, str)
            self.assertRegex(notice, r'拒收|未采纳|未采用|未通过')
            self.assertRegex(notice, r'证据|引用')
            for private_value in (private_reason, private_pointer, 'EMPTY_EVIDENCE'):
                self.assertNotIn(private_value, notice)
            client, gateway = MagicMock(), MagicMock()
            client.output = output
            client.invoke.return_value = {}
            storage = {'report': {'status': 'saved', 'download_url': 'https://mock.invalid/report'}}
            with patch.object(dsh_runner, 'persist', return_value=storage) as persistence:
                dsh_runner._finish_completed(run, output, client, gateway)
            client.invoke.assert_called_once()
            persistence.assert_called_once()
            gateway.invoke_trusted.assert_not_called()
            body = client.invoke.call_args.args[1]['body']
            self.assertEqual(body['validationStatus'], 'failed')
            self.assertEqual(body['resultJson']['result']['rule_optimization_suggestions'], public)
            self.assertEqual(run['delivery']['summary']['rule_optimization_suggestions'], public)
            self.assertEqual(run['result'], frozen_result)
            self.assertEqual(run['validation'], frozen_validation)
            self.assertIn(notice, run['delivery']['markdown'])
            reports = [body['reportHtml'], persistence.call_args.args[1],
                       (output / 'report.html').read_text(encoding='utf-8')]
            for report in reports:
                self.assertIn(good['suggestion'], report)
                self.assertIn(notice, report)
                for private_value in (private_reason, private_pointer, 'EMPTY_EVIDENCE'):
                    self.assertNotIn(private_value, report)

    def test_only_same_schema_run_and_incident_markers_identify_new_rule_run(self):
        for name in ('run-contract.json', 'runner-state.json', 'runner-failure.json', 'business-gate.json'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                output = Path(directory)
                (output / 'rules').mkdir()
                result = {'run_id': self.RUN_ID, 'incident_id': INCIDENT}
                marker = {'schema_version': dsh_runner.RULE_STAGE_SCHEMA, **result}
                path = output / 'rules' / name
                path.write_text(json.dumps(marker), encoding='utf-8')
                self.assertTrue(dsh_runner._new_rule_run(result, output))
                for key, wrong in (('schema_version', 'legacy'), ('run_id', 'run-other'), ('incident_id', OTHER)):
                    path.write_text(json.dumps({**marker, key: wrong}), encoding='utf-8')
                    self.assertFalse(dsh_runner._new_rule_run(result, output))


if __name__ == '__main__':
    unittest.main()
