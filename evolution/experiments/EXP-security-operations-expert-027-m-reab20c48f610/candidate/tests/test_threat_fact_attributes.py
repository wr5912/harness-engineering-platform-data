"""分类子句的窄句型归一化：合成组件测试，不访问外部服务。"""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'dsh/managed/threat-analysis'
sys.path.insert(0, str(ROOT))
from fact_attributes import normalize_fact_attributes
from forced_output_contract import validate_forced_output
from model_inference import run_inference

IP = '192.0.2.3'
SESSION = '{11111111-2222-3333-4444-555555555555}'
FACT = f'同一 EDR 活动片段中记录了来自 {IP} 的认证活动，事件类型为 MALWARE_EXECUTION，会话 ID 为 {SESSION}。'
EXPECTED = f'同一 EDR 活动片段中记录了来自 {IP} 的认证活动，会话 ID 为 {SESSION}。'


def fixture():
    source = {'unified_event_id': 'INC-TEST', 'data_completeness': 1,
        'event_snapshot': {'event_type': 'SUSPECTED_INTRUSION_REASONING',
            'judgement_target': {'claim_type': 'SUSPECTED_INTRUSION_REASONING'},
            'entities': [{'entity_ref': 'E1', 'entity_type': 'asset', 'role': 'anchor'}]},
        'enriched_context': {'edr_detail': {'entities': [{'entity_ref': 'E1', 'activity_segments': [
            {'scope': 'anchor_entity', 'authentication_activities': [
                {'event_type': 'MALWARE_EXECUTION', 'source_ip': IP, 'session_id': SESSION}]}]}]}}}
    output = {'unified_event_id': 'INC-TEST', 'verdict': '误报', 'confidence_score': 0.8,
        'primary_claim': {'type': 'SUSPECTED_INTRUSION_REASONING', 'result': '证据不足'},
        'secondary_findings': None, 'attack_stage': None, 'technique': None, 'technique_name': None,
        'verified_facts': [{'id': 'F03', 'fact': FACT, 'source': 'edr_detail'}], 'key_claims': [],
        'counter_evidence': [], 'uncertainty_notes': None,
        'attack_chain_speculation': {'current_stage': None, 'observed_path': [], 'possible_next_steps': [], 'supporting_evidence': []},
        'rule_optimization_suggestions': [], 'recommended_actions': [], 'reasoning_summary': '观察到认证记录，尚无充分攻击证据。'}
    return source, output


class FactAttributeTest(unittest.TestCase):
    def test_mixed_observation_is_preserved_and_fully_validated(self):
        source, output = fixture()
        original, frozen = deepcopy(output), deepcopy(source)
        with self.assertRaisesRegex(ValueError, 'incident or rule declaration'):
            validate_forced_output(output, source)
        normalized, audit = normalize_fact_attributes(output, source)
        self.assertEqual(normalized['verified_facts'][0], {'id': 'F03', 'fact': EXPECTED, 'source': 'edr_detail'})
        self.assertEqual(output, original)
        self.assertEqual(source, frozen)
        self.assertEqual(audit['changed_fields'], 1)
        self.assertTrue(audit['changes'][0]['source_ref'].endswith('.authentication_activities[0]'))
        self.assertEqual(audit['changes'][0]['observed_values']['event_type'], 'MALWARE_EXECUTION')
        self.assertEqual(validate_forced_output(normalized, source), [])
        self.assertEqual(normalize_fact_attributes(normalized, source)[1]['status'], 'unchanged')

    def test_wrong_source_type_cross_record_and_ambiguous_segments_do_not_pass(self):
        modes = ('wrong_type', 'missing_value', 'wrong_value_type', 'wrong_source', 'cross_record',
                 'snapshot_only', 'wrong_container', 'partial_ip', 'related_entity', 'duplicate_row', 'two_segments')
        for mode in modes:
            with self.subTest(mode=mode):
                source, output = fixture()
                asset = source['enriched_context']['edr_detail']['entities'][0]
                segment = asset['activity_segments'][0]
                rows = segment['authentication_activities']
                if mode == 'wrong_type':
                    rows[0]['event_type'] = 'OTHER_TYPE'
                elif mode == 'missing_value':
                    rows[0].pop('session_id')
                elif mode == 'wrong_value_type':
                    rows[0]['session_id'] = [SESSION]
                elif mode == 'wrong_source':
                    output['verified_facts'][0]['source'] = 'graph'
                elif mode == 'cross_record':
                    rows[0]['session_id'] = '{different-session}'
                    rows.append({'event_type': 'MALWARE_EXECUTION', 'source_ip': '192.0.2.99', 'session_id': SESSION})
                elif mode == 'snapshot_only':
                    source['event_snapshot']['authentication_activities'] = deepcopy(rows)
                    rows.clear()
                elif mode == 'wrong_container':
                    segment['metadata'] = deepcopy(rows)
                    rows.clear()
                elif mode == 'partial_ip':
                    output['verified_facts'][0]['fact'] = FACT.replace(IP, IP + '0')
                elif mode == 'related_entity':
                    asset['entity_ref'] = 'E9'
                elif mode == 'duplicate_row':
                    rows.append(deepcopy(rows[0]))
                else:
                    asset['activity_segments'].append(deepcopy(segment))
                with self.assertRaises(ValueError):
                    normalized, _ = normalize_fact_attributes(output, source)
                    validate_forced_output(normalized, source)

    def test_pure_labels_declarations_literals_and_extra_text_remain_rejected(self):
        cases = ('事件类型为 MALWARE_EXECUTION。', '原始主张：' + FACT, '规则名称：' + FACT,
                 '命令输出：' + FACT, '`' + FACT + '`', FACT + '路径为 /tmp/event.log',
                 '已经证实恶意攻击。' + FACT, FACT + '攻击已成功。', FACT.replace('，事件类型为', '\n事件类型为'))
        for text in cases:
            with self.subTest(text=text):
                source, output = fixture()
                output['verified_facts'][0]['fact'] = text
                with self.assertRaises(ValueError):
                    normalized, _ = normalize_fact_attributes(output, source)
                    validate_forced_output(normalized, source)

    def test_target_declaration_cannot_be_hidden_inside_type_slot(self):
        source, output = fixture()
        target_type = 'SUSPECTED_INTRUSION_REASONING'
        source['enriched_context']['edr_detail']['entities'][0]['activity_segments'][0]['authentication_activities'][0]['event_type'] = target_type
        output['verified_facts'][0]['fact'] = FACT.replace('MALWARE_EXECUTION', target_type)
        normalized, audit = normalize_fact_attributes(output, source)
        self.assertEqual(audit['status'], 'unchanged')
        with self.assertRaisesRegex(ValueError, 'incident or rule declaration'):
            validate_forced_output(normalized, source)

    def test_evidence_values_and_other_fields_are_not_changed(self):
        source, output = fixture()
        output['key_claims'] = [{'claim': FACT, 'evidence': [{'field': 'x', 'value': FACT}]}]
        output['reasoning_summary'] = FACT
        output['recommended_actions'] = [{'target': {'asset_id': 'asset-test'}, 'reason': FACT}]
        normalized, _ = normalize_fact_attributes(output, source)
        for field in ('key_claims', 'reasoning_summary', 'recommended_actions'):
            self.assertEqual(normalized[field], output[field])

    def test_raw_frozen_once_and_other_validation_errors_still_block_delivery(self):
        for broken in (False, True):
            with self.subTest(broken=broken), tempfile.TemporaryDirectory() as directory:
                source, output = fixture()
                if broken:
                    output['unified_event_id'] = 'WRONG-INCIDENT'
                response = {'model': 'component-test', 'choices': [{'message': {'content': json.dumps(output, ensure_ascii=False)}}]}
                calls = []
                def transport(*args):
                    calls.append(args)
                    return response
                args = dict(five_source=source, system_prompt='组件测试', base_url='http://model.invalid', model='component-test', api_key=None, output_dir=Path(directory), transport=transport)
                if broken:
                    with self.assertRaisesRegex(ValueError, 'unified_event_id'):
                        run_inference(**args)
                else:
                    self.assertEqual(run_inference(**args)['verified_facts'][0]['fact'], EXPECTED)
                root = Path(directory)
                self.assertEqual(len(calls), 1)
                self.assertEqual(json.loads((root / 'model-analysis-output.json').read_text()), output)
                self.assertEqual(json.loads((root / 'raw-response.json').read_text()), response)
                self.assertTrue((root / 'fact-attribute-normalization.json').is_file())
                self.assertEqual((root / 'forced-analysis-output.json').exists(), not broken)
                with self.assertRaises(FileExistsError):
                    run_inference(**args)
                self.assertEqual(len(calls), 1)


if __name__ == '__main__':
    unittest.main()
