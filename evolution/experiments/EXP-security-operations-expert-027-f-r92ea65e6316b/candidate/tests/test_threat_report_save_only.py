"""SAVE即交付链接的合成组件回归，不访问外部服务。"""
import base64
from copy import deepcopy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'dsh/managed/threat-analysis'
sys.path.insert(0, str(ROOT))
from result_storage import persist
from result_delivery import build_delivery


class SaveOnlyGateway:
    def __init__(self, data=None, error=None):
        self.calls = []
        self.data = {'id': 'report-test', 'downloadUrl': 'https://report.invalid/file'} if data is None else data
        self.error = error

    def invoke_trusted(self, **kwargs):
        self.calls.append(kwargs)
        if kwargs['resource'] != 'report-write' or kwargs['tool_name'] != 'save_persistence_result' or len(self.calls) != 1:
            raise AssertionError('Only one SAVE is permitted; GET and retry are unavailable')
        if self.error is not None:
            raise self.error
        return {'status': 'success', 'status_code': 200, 'result': {'code': '200', 'data': self.data}}


def sample_run():
    return {'run_id': 'run-test', 'incident_id': 'INC-TEST', 'report_revision': 1,
            'status': 'completed', 'route': 'fast_classification', 'validation': {'status': 'not_applicable_fast_classification'},
            'result': {'verdict': '误报', 'matches': []}}


class ReportSaveOnlyTest(unittest.TestCase):
    def test_one_save_returns_link_without_get(self):
        gateway, run = SaveOnlyGateway(), sample_run()
        original = deepcopy(run)
        storage = persist(run, '<html>报告</html>', gateway)
        self.assertEqual(storage['report'], {'status': 'saved', 'id': 'report-test', 'download_url': 'https://report.invalid/file'})
        self.assertEqual(len(gateway.calls), 1)
        args = gateway.calls[0]['arguments']
        self.assertEqual(args['businessId'], run['run_id'])
        self.assertEqual(args['revision'], run['report_revision'])
        self.assertEqual(base64.b64decode(args['content']['fileContentBase64']).decode(), '<html>报告</html>')
        self.assertEqual(run, original)
        storage['summary'] = {'status': 'saved'}
        markdown = build_delivery(run, storage=storage)['markdown']
        self.assertIn('[下载 HTML 报告](<https://report.invalid/file>)', markdown)
        self.assertNotIn('待接入', markdown)

    def test_saved_without_usable_url_is_not_reuploaded(self):
        for url in (None, '', 'javascript:alert(1)', '/download/guessed', 'http://[broken'):
            with self.subTest(url=url):
                gateway = SaveOnlyGateway({'id': 'report-test', 'downloadUrl': url})
                storage = persist(sample_run(), '<html>report</html>', gateway)
                self.assertEqual(storage['report']['status'], 'saved')
                self.assertNotIn('download_url', storage['report'])
                self.assertEqual(len(gateway.calls), 1)
                self.assertIn('已保存，未返回有效下载链接', build_delivery(sample_run(), storage=storage)['markdown'])

    def test_unknown_save_is_not_retried_or_reported_saved(self):
        gateway = SaveOnlyGateway(error=TimeoutError())
        state = persist(sample_run(), '<html>report</html>', gateway)['report']
        self.assertEqual(state['status'], 'unknown')
        self.assertNotIn('download_url', state)
        self.assertEqual(len(gateway.calls), 1)

    def test_missing_or_invalid_id_does_not_publish_a_link(self):
        for identifier in (None, '', ' ', 123):
            with self.subTest(identifier=identifier):
                gateway = SaveOnlyGateway({'id': identifier, 'downloadUrl': 'https://report.invalid/file'})
                state = persist(sample_run(), '<html>report</html>', gateway)['report']
                self.assertEqual(state['status'], 'unknown')
                self.assertNotIn('download_url', state)
                self.assertEqual(len(gateway.calls), 1)

    def test_invalid_revision_and_oversize_report_are_not_submitted(self):
        for revision, content in ((None, 'report'), (True, 'report'), (0, 'report'), (1, 'x' * 1048577)):
            with self.subTest(revision=revision):
                gateway, run = SaveOnlyGateway(), sample_run()
                run['report_revision'] = revision
                self.assertEqual(persist(run, content, gateway)['report']['status'], 'failed')
                self.assertEqual(gateway.calls, [])


if __name__ == '__main__':
    unittest.main()
