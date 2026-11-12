"""兼容交付的合成组件回归；不调用真实模型、MCP或SOC。"""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1] / 'dsh/managed/threat-analysis'
sys.path.insert(0, str(ROOT))
import dsh_runner
from result_delivery import build_delivery
from result_storage import build_writeback, persist

INCIDENT = 'INC-20261028-000010'
ERROR = 'secondary_findings.type lacks attack semantic'


def raw_result():
    return {'unified_event_id': INCIDENT, 'verdict': '真实告警',
        'primary_claim': {'type': 'SUSPECTED_INTRUSION_REASONING', 'result': '支持'},
        'secondary_findings': {'type': '主机信息收集', 'description': '观察到主机信息查询。'},
        'confidence_score': 0.82, 'attack_stage': '执行', 'technique': 'T1059.001', 'technique_name': 'PowerShell',
        'verified_facts': [], 'key_claims': [], 'counter_evidence': [], 'uncertainty_notes': '组件测试，不作为真实事件真值。',
        'attack_chain_speculation': {'current_stage': '执行', 'observed_path': [], 'possible_next_steps': [], 'supporting_evidence': []},
        'rule_optimization_suggestions': [], 'recommended_actions': [], 'reasoning_summary': '保留本轮模型输出。'}


def completed_run():
    return {'schema_version': '1.0', 'incident_id': INCIDENT, 'run_id': 'run-11111111-1111-4111-8111-111111111111',
        'report_revision': 1, 'route': 'five_source', 'llm_invoked': True, 'model': 'component-test',
        'status': 'completed', 'result': raw_result(),
        'validation': {'status': 'failed', 'error_type': 'ValueError', 'error': ERROR}}


class CompatDeliveryTest(unittest.TestCase):
    def test_completed_failed_validation_renders_and_preserves_soc_truth(self):
        run = completed_run()
        original = deepcopy(run)
        storage = {'summary': {'status': 'saved'}, 'report': {'status': 'saved', 'download_url': 'https://report.invalid/report'}}
        delivery = build_delivery(run, storage=storage)
        self.assertEqual(delivery['summary']['validation'], run['validation'])
        self.assertIn('主机信息收集', delivery['report_html'])
        self.assertIn('https://report.invalid/report', delivery['markdown'])
        for value in (delivery['markdown'], delivery['report_html']):
            self.assertNotIn(ERROR, value)
            self.assertNotIn('模型输出校验未通过', value)
        body = build_writeback(run, delivery['report_html'])
        self.assertEqual(body['validationStatus'], 'failed')
        self.assertEqual(body['resultJson']['validation'], run['validation'])
        self.assertEqual(body['runId'], run['run_id'])
        self.assertIn('模型输出校验未通过，需人工复核。', body['summary'])
        self.assertEqual(run, original)

    def test_noncompleted_is_still_not_formal_delivery(self):
        for status in ('contract_failed', 'model_failed', 'evidence_failed'):
            with self.subTest(status=status):
                run = completed_run()
                run['status'] = status
                with self.assertRaises(ValueError):
                    build_delivery(run)

    def test_failed_validation_report_is_local_without_mcp_save(self):
        run, gateway = completed_run(), MagicMock()
        html = build_delivery(run)['report_html']
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / run['run_id']
            (output / 'fusion' / 'raw').mkdir(parents=True)
            (output / 'report.html').write_text(html, encoding='utf-8')
            gateway.raw_directory = output / 'fusion' / 'raw'
            state = persist(run, html, gateway)['report']
            self.assertEqual(state['status'], 'saved')
            self.assertEqual(state['storage'], 'local')
            self.assertEqual(state['id'], run['run_id'])
            self.assertEqual((output / 'report.html').read_text(encoding='utf-8'), html)
        gateway.invoke_trusted.assert_not_called()
        self.assertNotIn('download_url', state)
        self.assertEqual(run['validation']['status'], 'failed')

    def test_runner_only_recovers_parsed_dictionary_and_keeps_validation_failed(self):
        for mode in ('dict', 'missing', 'array', 'malformed', 'request_failed'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as directory:
                fusion = Path(directory) / 'fusion'
                fusion.mkdir()
                (fusion / 'manifest.json').write_text(json.dumps({'route': 'five_source'}))
                (fusion / 'five-source-output.json').write_text('{}')
                candidate = raw_result()
                def rejected_inference(**kwargs):
                    output = kwargs['output_dir']
                    output.mkdir()
                    validation = {'status': 'request_failed' if mode == 'request_failed' else 'failed',
                                  'error_type': 'ValueError', 'error': ERROR}
                    (output / 'validation.json').write_text(json.dumps(validation))
                    if mode != 'missing':
                        value = '{broken' if mode == 'malformed' else json.dumps([] if mode == 'array' else candidate)
                        (output / 'model-analysis-output.json').write_text(value)
                    raise ValueError(ERROR)
                client = MagicMock()
                client.claim.return_value = {'judgementId': 'judge-component'}
                client.write.return_value = {'status': 'saved'}
                with patch.object(dsh_runner, 'build_gateway'), \
                        patch.object(dsh_runner, 'SocJudgementClient', return_value=client), \
                        patch.object(dsh_runner.evidence_collection, 'run', return_value=fusion), \
                        patch.object(dsh_runner, 'run_inference', side_effect=rejected_inference) as inference, \
                        patch.object(dsh_runner, '_attach_rule_stage'), \
                        patch.object(dsh_runner, '_finish_completed') as finish:
                    run = dsh_runner._analyze(INCIDENT, directory,
                        {'analysisModel': {'baseURL': 'http://model.invalid', 'model': 'component-test'}})
                inference.assert_called_once()
                if mode == 'dict':
                    self.assertEqual(run['status'], 'completed')
                    self.assertEqual(run['result'], candidate)
                    self.assertEqual(run['validation'], {'status': 'failed', 'error_type': 'ValueError', 'error': ERROR})
                    self.assertNotIn('error_type', run)
                    finish.assert_called_once()
                    client.write.assert_not_called()
                else:
                    self.assertNotEqual(run['status'], 'completed')
                    self.assertNotIn('result', run)
                    finish.assert_not_called()
                    self.assertEqual(client.write.call_args.args[:2], ('fail', 'judge-component'))


if __name__ == '__main__':
    unittest.main()
