"""显式Mock组件回归：只验证附加偏差审计I/O隔离，不证明真实研判或SOC通过。
放入Candidate/tests后，从该Candidate的真实model_inference源码加载；本提案未执行。
"""
import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

SOURCE = Path(__file__).resolve().parents[1] / 'dsh' / 'managed' / 'threat-analysis'
sys.path.insert(0, str(SOURCE))
SPEC = importlib.util.spec_from_file_location('base_projection_under_test', SOURCE / 'model_inference.py')
assert SPEC is not None and SPEC.loader is not None
inference = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(inference)


class BaseSuggestionProjectionMockTests(unittest.TestCase):
    def exercise(self, *, original_error=None, metadata_fails=False, forced_fails=False):
        self.assertEqual(Path(inference.__file__).resolve(), (SOURCE / 'model_inference.py').resolve())
        # 基础内容和五源均为组件Mock，不是通过真实validator的业务样本。
        base = {'unified_event_id': 'INC-20261106-000001', 'verdict': '误报',
                'confidence_score': .62, 'verified_facts': [{'fact': '固定Mock事实'}],
                'counter_evidence': [], 'recommended_actions': [{'action': '固定Mock处置'}],
                'rule_optimization_suggestions': [{'suggestion': '基础旧建议不得采用'}]}
        source = {'unified_event_id': base['unified_event_id'], 'enriched_context': {}}
        transport = Mock(return_value={'model': 'mock-component-model', 'choices': [
            {'message': {'content': json.dumps(base, ensure_ascii=False)}}]})
        warning = ['保留原validator的固定Mock警告']
        validator = Mock(side_effect=original_error, return_value=warning)
        normalization = {'status': 'unchanged', 'changed_fields': []}
        normalize = lambda value, _source: (copy.deepcopy(value), copy.deepcopy(normalization))
        real_write, saved = inference._write_json, {}
        mandatory_error = OSError('mock mandatory base artifact failure')
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)

            def write(path, value):
                if path.name == 'base-suggestion-projection.json':
                    if original_error is None:
                        self.assertTrue((output / 'forced-analysis-output.json').is_file())
                    raise OSError('mock optional audit failure')
                if (path.name == 'request-metadata.json' and metadata_fails
                        and 'base_suggestion_projection_audit' in value):
                    raise OSError('mock fallback metadata failure')
                if path.name == 'forced-analysis-output.json' and forced_fails:
                    raise mandatory_error
                real_write(path, value)
                saved.setdefault(path.name, copy.deepcopy(value))

            with patch.object(inference, 'normalize_entity_references', side_effect=normalize), \
                    patch.object(inference, 'normalize_fact_attributes', side_effect=normalize), \
                    patch.object(inference, 'validate_forced_output', validator), \
                    patch.object(inference, '_write_json', side_effect=write):
                expected_error = original_error or (mandatory_error if forced_fails else None)
                arguments = dict(five_source=source, system_prompt='Mock组件提示',
                                 base_url='http://mock.invalid', model='mock-component-model',
                                 api_key=None, output_dir=output, transport=transport)
                if expected_error is not None:
                    with self.assertRaises(type(expected_error)) as caught:
                        inference.run_inference(**arguments)
                    self.assertIs(caught.exception, expected_error)
                else:
                    result = inference.run_inference(**arguments)
                    expected = copy.deepcopy(base)
                    expected['rule_optimization_suggestions'] = []
                    self.assertEqual(result, expected)
                    self.assertEqual(json.loads((output / 'forced-analysis-output.json').read_text()), expected)
            validator.assert_called_once_with(base, source)  # 原validator看到未清空的原归一化值。
            transport.assert_called_once()
            validation = json.loads((output / 'validation.json').read_text())
            self.assertEqual(validation, saved['validation.json'])  # 附加写入不改原校验记录。
            if original_error is not None:
                self.assertEqual(validation, {'status': 'failed', 'error_type': 'ValueError',
                                              'error': str(original_error)})
            else:
                self.assertEqual(validation['status'], 'passed_with_warnings')
                self.assertEqual(validation['warnings'], warning)
                self.assertEqual(validation['entity_reference_normalization'], normalization)
                self.assertEqual(validation['fact_attribute_normalization'], normalization)
            self.assertEqual(json.loads((output / 'model-analysis-output.json').read_text()), base)
            self.assertEqual(json.loads((output / 'raw-response.json').read_text()), transport.return_value)
            if original_error is not None or forced_fails:
                self.assertFalse((output / 'forced-analysis-output.json').exists())
            metadata = json.loads((output / 'request-metadata.json').read_text())
            if forced_fails or metadata_fails:
                self.assertNotIn('base_suggestion_projection_audit', metadata)
            else:
                self.assertEqual(metadata['base_suggestion_projection_audit'],
                                 {'status': 'failed', 'error_type': 'OSError'})

    def test_optional_audit_and_metadata_failures_preserve_base_or_original_error(self):
        for original_error in (None, ValueError('original mock validator failure')):
            for metadata_fails in (False, True):
                with self.subTest(original_error=original_error, metadata_fails=metadata_fails):
                    self.exercise(original_error=original_error, metadata_fails=metadata_fails)

    def test_mandatory_frozen_base_write_failure_is_not_swallowed(self):
        self.exercise(forced_fails=True)


if __name__ == '__main__':
    unittest.main()
