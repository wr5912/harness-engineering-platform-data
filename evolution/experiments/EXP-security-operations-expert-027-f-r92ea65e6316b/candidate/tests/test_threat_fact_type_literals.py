"""即使来源三值吻合，也不自动删除类型槽里的文件/程序字面量。"""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'dsh/managed/threat-analysis'
sys.path.insert(0, str(ROOT))
from fact_attributes import normalize_fact_attributes
from forced_output_contract import _reject_incident_or_rule_declaration


class FactTypeLiteralTest(unittest.TestCase):
    def test_native_literals_and_unsupported_tokens_are_not_removed(self):
        for value in ('payload.exe', 'cmd.exe', 'MALWARE_EXECUTION-OTHER', 'malware_execution'):
            with self.subTest(value=value):
                ip, session = '192.0.2.3', '{11111111-2222-3333-4444-555555555555}'
                snapshot = {'event_type': 'SUSPECTED_INTRUSION_REASONING',
                    'judgement_target': {'claim_type': 'SUSPECTED_INTRUSION_REASONING'},
                    'entities': [{'entity_ref': 'E1', 'role': 'anchor'}]}
                source = {'event_snapshot': snapshot, 'enriched_context': {'edr_detail': {'entities': [
                    {'entity_ref': 'E1', 'activity_segments': [{'scope': 'anchor_entity', 'authentication_activities': [
                        {'event_type': value, 'source_ip': ip, 'session_id': session}]}]}]}}}
                fact = f'同一 EDR 活动片段中记录了来自 {ip} 的认证活动，事件类型为 {value}，会话 ID 为 {session}。'
                output = {'verified_facts': [{'id': 'F03', 'fact': fact, 'source': 'edr_detail'}]}
                original = deepcopy(output)
                normalized, audit = normalize_fact_attributes(output, source)
                self.assertEqual(normalized, original)
                self.assertEqual(output, original)
                self.assertEqual(audit['changed_fields'], 0)
                with self.assertRaisesRegex(ValueError, 'incident or rule declaration'):
                    _reject_incident_or_rule_declaration(normalized['verified_facts'][0]['fact'], snapshot,
                                                        snapshot['judgement_target'], 'fact')


if __name__ == '__main__':
    unittest.main()
