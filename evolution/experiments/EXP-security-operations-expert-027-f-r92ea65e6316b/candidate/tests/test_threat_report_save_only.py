"""本地报告组件回归；只使用合成文件，不访问模型、SOC或MCP。"""
from copy import deepcopy
import hashlib
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / 'dsh/managed/threat-analysis'
sys.path.insert(0, str(ROOT))
from result_storage import LIMIT, build_writeback, persist
from result_delivery import build_delivery

RUN_ID = 'run-11111111-1111-4111-8111-111111111111'
OTHER_RUN_ID = 'run-22222222-2222-4222-8222-222222222222'
INCIDENT = 'INC-20261110-000004'


class LocalOnlyGateway:
    def __init__(self, raw_directory):
        self.raw_directory = raw_directory
        self.calls = []

    def invoke_trusted(self, **kwargs):
        self.calls.append(kwargs)
        raise AssertionError('Local report receipts must never invoke MCP')


def sample_run():
    return {'run_id': RUN_ID, 'incident_id': INCIDENT, 'report_revision': 1,
            'status': 'completed', 'route': 'fast_classification', 'llm_invoked': False,
            'validation': {'status': 'not_applicable_fast_classification'},
            'result': {'verdict': '误报', 'matches': []}}


class LocalReportReceiptTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.output = self.root / RUN_ID
        (self.output / 'fusion' / 'raw').mkdir(parents=True)
        self.report = self.output / 'report.html'
        self.gateway = LocalOnlyGateway(self.output / 'fusion' / 'raw')
        network = patch('urllib.request.urlopen', side_effect=AssertionError('No external HTTP'))
        self.urlopen = network.start()
        self.addCleanup(network.stop)

    def tearDown(self):
        self.assertEqual(self.gateway.calls, [])
        self.urlopen.assert_not_called()

    def save_existing(self, content, run=None):
        self.report.write_bytes(content.encode('utf-8'))
        return persist(sample_run() if run is None else run, content, self.gateway)

    def assert_failed(self, state):
        self.assertEqual(state['status'], 'failed')
        self.assertNotIn('download_url', state)
        self.assertNotIn('id', state)

    def test_exact_local_utf8_receipt_without_network(self):
        run, content = sample_run(), '<html>中文报告\r\n第二行</html>'
        original = deepcopy(run)
        state = self.save_existing(content, run)['report']
        payload = content.encode('utf-8')
        self.assertEqual(state, {'status': 'saved', 'storage': 'local', 'id': RUN_ID,
            'relative_path': 'report.html', 'file_name': INCIDENT + '-' + RUN_ID + '.html',
            'content_type': 'text/html', 'sha256': hashlib.sha256(payload).hexdigest(),
            'size_bytes': len(payload)})
        self.assertEqual(self.report.read_bytes(), payload)
        self.assertEqual(stat.S_IMODE(self.report.stat().st_mode), 0o600)
        self.assertEqual(run, original)

    def test_no_http_capability_does_not_invent_url(self):
        storage = self.save_existing('<html>报告</html>')
        storage['summary'] = {'status': 'saved'}
        delivery = build_delivery(sample_run(), storage=storage)
        self.assertIn('已保存，未返回有效下载链接', delivery['markdown'])
        self.assertNotIn('[下载 HTML 报告]', delivery['markdown'])
        self.assertNotIn(str(self.output), delivery['markdown'])

    def test_template_and_soc_html_contract_are_unchanged(self):
        run, stamp = sample_run(), '2026-11-10T00:00:00+00:00'
        before = build_delivery(run, analyzed_at=stamp)['report_html']
        storage = self.save_existing(before, run)
        self.assertEqual(before, build_delivery(run, storage=storage, analyzed_at=stamp)['report_html'])
        body = build_writeback(run, before)
        self.assertEqual(body['reportHtml'], before)
        self.assertEqual(body['resultJson']['result'], run['result'])
        self.assertEqual(body['validationStatus'], run['validation']['status'])

    def test_missing_and_mismatched_file_are_not_saved(self):
        self.assert_failed(persist(sample_run(), 'report', self.gateway)['report'])
        self.report.write_bytes(b'old')
        self.assert_failed(persist(sample_run(), 'new', self.gateway)['report'])
        self.assertEqual(self.report.read_bytes(), b'old')

    def test_report_symlink_is_rejected(self):
        external = self.root / 'external.html'
        external.write_bytes(b'original')
        self.report.symlink_to(external)
        self.assert_failed(persist(sample_run(), 'original', self.gateway)['report'])
        self.assertEqual(external.read_bytes(), b'original')

    def test_run_and_parent_symlinks_are_rejected(self):
        self.report.write_bytes(b'report')
        linked = self.root / 'linked'
        linked.symlink_to(self.root, target_is_directory=True)
        gateway = LocalOnlyGateway(linked / RUN_ID / 'fusion' / 'raw')
        self.assert_failed(persist(sample_run(), 'report', gateway)['report'])
        other = self.root / OTHER_RUN_ID
        other.symlink_to(self.output, target_is_directory=True)
        run = sample_run()
        run['run_id'] = OTHER_RUN_ID
        self.assert_failed(persist(run, 'report', LocalOnlyGateway(other / 'fusion' / 'raw'))['report'])

    def test_cross_run_and_wrong_layout_are_rejected(self):
        self.report.write_bytes(b'report')
        run = sample_run()
        run['run_id'] = OTHER_RUN_ID
        self.assert_failed(persist(run, 'report', self.gateway)['report'])
        for raw in (self.output / 'raw', self.output / 'fusion' / 'other', self.output / 'other' / 'raw'):
            self.assert_failed(persist(sample_run(), 'report', LocalOnlyGateway(raw))['report'])

    def test_invalid_identity_revision_and_nonregular_file(self):
        self.report.mkdir()
        self.assert_failed(persist(sample_run(), '', self.gateway)['report'])
        for field, values in (('report_revision', (None, True, 0, -1, '1')),
                              ('run_id', (None, 'run-test', '../' + RUN_ID)),
                              ('incident_id', (None, 'INC-TEST', '../' + INCIDENT))):
            for value in values:
                run = sample_run()
                run[field] = value
                self.assert_failed(persist(run, '', self.gateway)['report'])

    def test_utf8_size_limit(self):
        for content in ('x' * LIMIT, '报' * (LIMIT // 3)):
            self.assertEqual(self.save_existing(content)['report']['status'], 'saved')
        for content in ('x' * (LIMIT + 1), '报' * (LIMIT // 3 + 1)):
            self.report.write_bytes(content.encode('utf-8'))
            self.assert_failed(persist(sample_run(), content, self.gateway)['report'])
        self.assert_failed(persist(sample_run(), 'small', self.gateway)['report'])

    def test_local_read_failure_does_not_publish_link(self):
        self.report.write_bytes(b'report')
        with patch('result_storage.os.open', side_effect=PermissionError('synthetic denial')):
            self.assert_failed(persist(sample_run(), 'report', self.gateway)['report'])


if __name__ == '__main__':
    unittest.main()
