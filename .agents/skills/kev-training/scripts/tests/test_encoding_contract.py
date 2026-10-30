"""Stdlib-only contract tests; synthetic Git metadata is never a native encoding run."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from snapshot_fixture import make_snapshot


SCRIPT = Path(__file__).resolve().parents[1] / 'check_encoding.py'
SPEC = importlib.util.spec_from_file_location('encoding_preflight_contract', SCRIPT)
encoding = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(encoding)
PLANNER_SPEC = importlib.util.spec_from_file_location('training_plan_contract', SCRIPT.with_name('training_plan.py'))
planner = importlib.util.module_from_spec(PLANNER_SPEC)
PLANNER_SPEC.loader.exec_module(planner)


class EncodingContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.checkout = self.root / 'synthetic-checkout'
        (self.checkout / 'kev').mkdir(parents=True)
        self.tree = []
        for name in ('api.py', 'data.py', 'model.py', 'train.py'):
            content = b'# Synthetic source identity fixture. Never imported.\n'
            (self.checkout / 'kev' / name).write_bytes(content)
            blob = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
            self.tree.append(f'100644 blob {blob}\tkev/{name}'.encode())
        self.head = 'a' * 40
        self.dirty = b''
        self.untracked = b''
        self.metadata = self.root / 'checkpoint-config.json'
        self.metadata.write_text(json.dumps({'base_revision': 'b' * 40, 'args': {
            'base': 'synthetic/base', 'base_revision': 'b' * 40, 'option_isolation': 0, 'weights_dtype': 'fp32',
        }}), encoding='utf-8')
        files = {}
        for partition in encoding.PARTITIONS:
            path = self.root / (partition + '.jsonl')
            path.write_text(json.dumps({'state': 'Synthetic ' + partition, 'questions': {
                'route': {'type': 'choice', 'instructions': 'Choose the synthetic route',
                          'criteria': {'read': 'Read', 'search': 'Search'}, 'label': 'read'},
            }}) + '\n', encoding='utf-8')
            files[partition] = {'path': str(path), 'sha256': encoding.digest(path), 'records': 1}
        self.plan = {
            'schema_version': 'kev-training-plan/v1', 'status': 'prepared', 'kev_commit': self.head,
            'checkpoint': {'base': 'synthetic/base', 'base_revision': 'b' * 40, 'option_isolation': 0, 'weights_dtype': 'fp32',
                           'init_from': 'synthetic/checkpoint@' + 'c' * 40, 'lora': 16, 'head_dim': 256,
                           'lora_targets': 'all', 'special_embeddings': 0,
                           'metadata_path': str(self.metadata), 'metadata_sha256': encoding.digest(self.metadata)},
            'dataset': {'files': files}, 'environment': {'kev_root': str(self.checkout), 'run_root': str(self.root / 'job')},
            'training': {'recipe': 'cuda-bf16-lora', 'epochs': 1, 'lr': 2e-5, 'batch': 1, 'accum': 8, 'seed': 0},
            'commands': {'train': {'requires': ['CUDA/bf16/VRAM-checked']}},
            'context_limits': dict(encoding.LIMITS),
            'augmentation': {'choice_shuffle': True, 'p_none': 0, 'p_none_distract': 0, 'p_distract': 0, 'p_none_pair': 0},
        }
        self.plan['commands']['train']['argv'] = planner.training_argv(self.plan['checkpoint'], self.plan['dataset'],
                                                                       self.plan['training'], self.plan['environment']['run_root'])
        self.plan_path = self.root / 'training-plan.json'
        self.write_plan()

    def write_plan(self):
        self.plan_path.write_text(json.dumps(self.plan), encoding='utf-8')

    def git_metadata(self, root, *arguments, allow_missing=False):
        self.assertEqual(root, self.checkout)
        if arguments == ('rev-parse', '--show-toplevel'):
            return (str(self.checkout) + '\n').encode()
        if arguments == ('rev-parse', 'HEAD'):
            return (self.head + '\n').encode()
        if arguments == ('config', '--bool', 'core.sparseCheckout'):
            return b''
        if arguments == ('status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'kev/'):
            return self.dirty
        if arguments == ('ls-files', '--others', '-z', '--', 'kev/'):
            return self.untracked
        if arguments == ('ls-tree', '-r', '-z', 'HEAD', '--', 'kev/'):
            return b'\0'.join(self.tree) + b'\0'
        self.fail('Unexpected Git metadata request: ' + repr(arguments))

    def invoke(self, output='encoding-report.json'):
        out = self.root / output
        with patch.object(encoding, 'git', side_effect=self.git_metadata), contextlib.redirect_stdout(io.StringIO()):
            code = encoding.main(['--plan', str(self.plan_path), '--kev-root', str(self.checkout), '--out', str(out)])
        return code, json.loads(out.read_text(encoding='utf-8'))

    def assert_blocked_before_native(self, expected_code, exit_code=2):
        with patch.object(encoding, 'check_records') as native:
            code, report = self.invoke()
        self.assertEqual(code, exit_code)
        self.assertEqual(report['status'], 'blocked')
        self.assertEqual(report['checked_records'], 0)
        self.assertEqual(report['failures'][0]['code'], expected_code)
        self.assertEqual(report['checks']['native_imports'], 'not_run')
        native.assert_not_called()
        return report

    def test_stale_commit_pin_blocks_before_native_imports(self):
        self.head = 'c' * 40
        self.assert_blocked_before_native('kev_commit_mismatch')

    def test_fp32_recipe_identity_is_recorded_without_claiming_hardware_check(self):
        self.plan['training']['recipe'] = 'cuda-fp32-lora'
        argv = self.plan['commands']['train']['argv']
        argv[argv.index('--dtype') + 1] = 'fp32'
        self.plan['commands']['train']['requires'] = ['CUDA/fp32/VRAM-checked']
        self.write_plan()
        with patch.object(encoding.importlib.util, 'find_spec', return_value=None):
            code, report = self.invoke()
        self.assertEqual(code, 2)
        self.assertEqual(report['checks']['metadata'], 'passed')
        self.assertEqual(report['training_recipe'], 'cuda-fp32-lora')
        self.assertIn('GPU_hardware', report['not_verified'])
        self.assertEqual(report['training'], 'not_run')

    def test_recipe_and_dtype_mismatch_blocks_before_native_imports(self):
        self.plan['training']['recipe'] = 'cuda-fp32-lora'
        self.write_plan()
        self.assert_blocked_before_native('training_recipe_command_mismatch', exit_code=1)

    def test_argparse_override_blocks_before_native_imports(self):
        self.plan['training']['recipe'] = 'cuda-fp32-lora'
        argv = self.plan['commands']['train']['argv']
        argv[argv.index('--dtype') + 1] = 'fp32'
        argv.append('--dtype=bf16')
        self.plan['commands']['train']['requires'] = ['CUDA/fp32/VRAM-checked']
        self.write_plan()
        self.assert_blocked_before_native('training_recipe_command_mismatch', exit_code=1)

    def local_plan(self):
        checkpoint = self.plan['checkpoint']
        binding = make_snapshot(self.root, self.metadata, checkpoint['init_from'])
        checkpoint['local_snapshot'] = binding
        self.plan['commands']['train']['argv'] = planner.training_argv(checkpoint, self.plan['dataset'],
                                                                       self.plan['training'], self.plan['environment']['run_root'])
        self.write_plan()
        return binding

    def test_local_snapshot_identity_in_encoding_report_does_not_claim_model_loading(self):
        binding = self.local_plan()
        with patch.object(encoding.importlib.util, 'find_spec', return_value=None):
            code, report = self.invoke()
        self.assertEqual(code, 2)
        self.assertEqual(report['checks']['metadata'], 'passed')
        self.assertEqual(report['checkpoint_source']['init_from'], self.plan['checkpoint']['init_from'])
        self.assertEqual(report['checkpoint_source']['execution_init_from'], binding['path'])
        self.assertEqual(report['checkpoint_source']['verified_files'], 4)
        self.assertEqual(report['training'], 'not_run')

    def test_local_snapshot_drift_blocks_before_native_imports(self):
        binding = self.local_plan()
        path = Path(binding['path']) / 'head.pt'
        original = path.read_bytes(); path.write_bytes(original[:-1] + b'!')
        self.assert_blocked_before_native('local_snapshot_file_hash_mismatch: head.pt')

    def test_local_snapshot_drift_during_encoding_cannot_produce_ready(self):
        binding = self.local_plan()
        def change_snapshot(*_args):
            path = Path(binding['path']) / 'adapter_model.safetensors'
            original = path.read_bytes(); path.write_bytes(original[:-1] + b'!')
        with patch.object(encoding, 'check_records', side_effect=change_snapshot):
            code, report = self.invoke()
        self.assertEqual(code, 2)
        self.assertEqual(report['status'], 'blocked')
        self.assertEqual(report['failures'][0]['code'], 'local_snapshot_file_hash_mismatch: adapter_model.safetensors')
        self.assertNotEqual(report['checks'].get('final_identity_recheck'), 'passed')

    def test_fp32_recipe_cannot_execute_bf16_weight_dtype(self):
        self.plan['training']['recipe'] = 'cuda-fp32-lora'
        argv = self.plan['commands']['train']['argv']
        argv[argv.index('--dtype') + 1] = 'fp32'
        argv[argv.index('--weights_dtype') + 1] = 'bf16'
        self.plan['commands']['train']['requires'] = ['CUDA/fp32/VRAM-checked']
        self.write_plan()
        self.assert_blocked_before_native('training_recipe_command_mismatch', exit_code=1)

    def test_fp32_recipe_checks_the_original_metadata_weight_dtype(self):
        self.plan['training']['recipe'] = 'cuda-fp32-lora'
        argv = self.plan['commands']['train']['argv']
        argv[argv.index('--dtype') + 1] = 'fp32'
        self.plan['commands']['train']['requires'] = ['CUDA/fp32/VRAM-checked']
        metadata = json.loads(self.metadata.read_text())
        metadata['args']['weights_dtype'] = 'bf16'
        self.metadata.write_text(json.dumps(metadata), encoding='utf-8')
        self.plan['checkpoint']['metadata_sha256'] = encoding.digest(self.metadata)
        self.write_plan()
        self.assert_blocked_before_native('checkpoint_metadata_conflict')

    def test_recipe_and_hardware_requirement_mismatch_blocks_before_native_imports(self):
        self.plan['commands']['train']['requires'] = ['CUDA/fp32/VRAM-checked']
        self.write_plan()
        self.assert_blocked_before_native('training_recipe_requirement_mismatch', exit_code=1)

    def test_unsupported_recipe_blocks_before_native_imports(self):
        self.plan['training']['recipe'] = 'cuda-fp16-lora'
        self.write_plan()
        self.assert_blocked_before_native('unsupported_training_recipe', exit_code=1)

    def test_legacy_unnamed_bf16_recipe_remains_valid(self):
        del self.plan['training']['recipe']
        self.write_plan()
        with patch.object(encoding.importlib.util, 'find_spec', return_value=None):
            code, report = self.invoke()
        self.assertEqual(code, 2)
        self.assertEqual(report['checks']['metadata'], 'passed')
        self.assertEqual(report['training_recipe'], 'cuda-bf16-lora')

    def test_encoding_failure_writes_readable_sidecar_without_overwriting_plan_report(self):
        previous = self.root / 'report.md'
        previous.write_text('已经保存的训练准备说明。', encoding='utf-8')
        self.head = 'c' * 40
        self.assert_blocked_before_native('kev_commit_mismatch')
        readable = (self.root / 'encoding-report.md').read_text(encoding='utf-8')
        self.assertIn('当前不能继续', readable)
        self.assertIn('当前不能继续训练', readable)
        self.assertIn('kev_commit_mismatch', readable)
        self.assertEqual(previous.read_text(encoding='utf-8'), '已经保存的训练准备说明。')

    def test_existing_readable_report_also_prevents_overwrite(self):
        readable = self.root / 'encoding-report.md'
        readable.write_text('以前的编码检查。', encoding='utf-8')
        with patch.object(encoding, 'run_checks') as checks, contextlib.redirect_stderr(io.StringIO()):
            code = encoding.main(['--plan', str(self.plan_path), '--kev-root', str(self.checkout),
                                  '--out', str(self.root / 'encoding-report.json')])
        self.assertEqual(code, 1)
        self.assertFalse((self.root / 'encoding-report.json').exists())
        checks.assert_not_called()

    def test_changed_dataset_hash_blocks_before_native_imports(self):
        path = Path(self.plan['dataset']['files']['test']['path'])
        path.write_text(path.read_text(encoding='utf-8') + '\n', encoding='utf-8')
        report = self.assert_blocked_before_native('dataset_file_changed')
        self.assertEqual(report['failures'][0]['partition'], 'test')

    def test_changed_checkpoint_metadata_blocks_before_native_imports(self):
        self.metadata.write_text(self.metadata.read_text(encoding='utf-8') + '\n', encoding='utf-8')
        self.assert_blocked_before_native('checkpoint_metadata_changed')

    def legacy_identity_fixture(self):
        audit = {'kind': 'recomputed_legacy_native_audit', 'ok': True}
        for name in ('source', 'reviews'):
            path = self.root / (name + '.jsonl')
            path.write_text(json.dumps({'synthetic_snapshot': name}) + '\n', encoding='utf-8')
            audit[name + '_sha256'] = encoding.digest(path)
        manifest = self.root / 'split-manifest.json'
        manifest.write_text('{"synthetic_fixture": true}\n', encoding='utf-8')
        self.plan['dataset'].update(kind='legacy-native', directory=str(self.root), audit=audit,
                                    manifest={'path': str(manifest), 'sha256': encoding.digest(manifest)})
        self.write_plan()

    def test_changed_legacy_review_snapshot_blocks_before_native_imports(self):
        self.legacy_identity_fixture()
        (self.root / 'reviews.jsonl').write_text('{"synthetic_changed_review": true}\n', encoding='utf-8')
        report = self.assert_blocked_before_native('legacy_snapshot_changed')
        self.assertEqual(report['failures'][0]['snapshot'], 'reviews')

    def test_legacy_source_change_during_encoding_cannot_produce_ready(self):
        self.legacy_identity_fixture()
        def change_source(*_):
            (self.root / 'source.jsonl').write_text('{"synthetic_changed_source": true}\n', encoding='utf-8')
        with patch.object(encoding, 'check_records', side_effect=change_source):
            code, report = self.invoke()
        self.assertEqual(code, 2)
        self.assertEqual(report['status'], 'blocked')
        self.assertEqual(report['failures'][0]['code'], 'legacy_snapshot_changed')
        self.assertEqual(report['failures'][0]['snapshot'], 'source')
        self.assertNotEqual(report['checks'].get('final_identity_recheck'), 'passed')

    def test_dirty_runtime_blocks_before_native_imports(self):
        self.dirty = b' M kev/model.py\0'
        self.assert_blocked_before_native('kev_runtime_dirty')

    def test_ignored_untracked_runtime_is_also_blocked(self):
        self.untracked = b'kev/ignored-extra.py\0'
        self.assert_blocked_before_native('kev_runtime_untracked')

    def test_actual_runtime_bytes_checked_despite_clean_git_status(self):
        (self.checkout / 'kev' / 'model.py').write_text('# Changed bytes hidden by index flags\n', encoding='utf-8')
        self.assert_blocked_before_native('kev_runtime_content_changed')

    def test_bad_limits_are_malformed_contract(self):
        self.plan['context_limits']['max_state'] = 999
        self.write_plan()
        self.assert_blocked_before_native('unsupported_context_limits', exit_code=1)

    def test_unprepared_plan_is_malformed_contract(self):
        self.plan['status'] = 'draft'
        self.write_plan()
        self.assert_blocked_before_native('plan_not_prepared', exit_code=1)

    def test_record_count_is_checked_before_native_imports(self):
        self.plan['dataset']['files']['train']['records'] = 2
        self.write_plan()
        self.assert_blocked_before_native('dataset_count_mismatch')

    def test_missing_dependencies_produce_explicit_not_run_report(self):
        with patch.object(encoding.importlib.util, 'find_spec', return_value=None), \
             patch.object(encoding.importlib, 'import_module') as imports:
            code, report = self.invoke()
        self.assertEqual(code, 2)
        self.assertEqual(report['status'], 'blocked')
        self.assertEqual(report['failures'][0]['code'], 'missing_dependencies')
        self.assertEqual(report['checks']['metadata'], 'passed')
        self.assertEqual(report['checks']['tokenizer'], 'not_run')
        self.assertEqual(report['checked_records'], 0)
        self.assertEqual(report['plan_sha256'], encoding.digest(self.plan_path))
        self.assertEqual(set(report['files']), set(encoding.PARTITIONS))
        self.assertIn('model_weights', report['not_verified'])
        self.assertEqual(report['training'], 'not_run')
        self.assertFalse(report['tokenizer_download_allowed'])
        imports.assert_not_called()

    def test_existing_report_is_never_overwritten(self):
        out = self.root / 'encoding-report.json'
        original = b'{"sentinel":"previous evidence"}\n'
        out.write_bytes(original)
        with patch.object(encoding, 'run_checks') as checks, contextlib.redirect_stderr(io.StringIO()):
            code = encoding.main(['--plan', str(self.plan_path), '--kev-root', str(self.checkout), '--out', str(out)])
        self.assertEqual(code, 1)
        self.assertEqual(out.read_bytes(), original)
        checks.assert_not_called()

    def test_soft_target_mapping_checked_by_name(self):
        request = {'questions': {'route': {'type': 'choice', 'criteria': {'read': 'Read', 'search': 'Search'},
                                            'label': 'read', 'target': {'search': 1, 'read': 3}}}}
        materialized = {'questions': [{'qid': 'route', 'qtype': 'choice', 'keys': ['read', 'search'], 'label': 0,
                                      'options': ['read: Read', 'search: Search'], 'target': [.75, .25]}]}
        encoding.check_labels(request, materialized)
        materialized['questions'][0]['target'] = [.25, .75]
        with self.assertRaises(encoding.CheckFailure) as raised:
            encoding.check_labels(request, materialized)
        self.assertEqual(raised.exception.failure['code'], 'soft_target_mapping_changed')

    def test_native_label_coercion_cannot_accept_a_string_noul_label(self):
        request = {'questions': {'answer': {'type': 'noul', 'label': '1'}}}
        materialized = {'questions': [{'qid': 'answer', 'qtype': 'noul', 'keys': ['false', 'true'], 'label': 1,
                                      'options': ['no', 'yes']}]}
        with self.assertRaises(encoding.CheckFailure) as raised:
            encoding.check_labels(request, materialized)
        self.assertEqual(raised.exception.failure['code'], 'invalid_hard_label')


if __name__ == '__main__':
    unittest.main()
