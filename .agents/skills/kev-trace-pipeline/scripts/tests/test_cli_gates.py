"""Subprocess checks for stage gates, using only synthetic local evidence."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


CLI = Path(__file__).resolve().parents[1] / 'kev_trace.py'


def trace_rows(number, *, actual_user=True, corrupt=False):
    header = {'type': 'session', 'version': 4, 'id': f'synthetic-session-{number}'}
    events = [
        {'type': 'user/message', 'surfaceOp': 'append', 'data': {
            'role': 'user', 'source': {'kind': 'user' if actual_user else 'runtime-context'},
            'content': [{'type': 'text', 'text': f'Synthetic request {number}.'}],
        }},
        {'type': 'request/header', 'data': {'header': {
            'config': {'model': 'synthetic'},
            'tools': [{'name': 'lookup', 'description': 'Look up a fact',
                       'parameters': {'type': 'object'}}],
        }}},
        {'type': 'assistant/message', 'surfaceOp': 'append', 'data': {
            'turn': 1, 'step': 1, 'message': {
                'role': 'assistant', 'source': {'kind': 'model'},
                'content': [{'type': 'text', 'text': 'Synthetic response.'}],
            },
        }},
    ]
    if corrupt:
        events.insert(2, {'type': 'plugin/unknown-required-event', 'data': {}})
    return [header, *[dict(event, seq=index) for index, event in enumerate(events)]]


def ir_record(number, *, session=None, status='verified'):
    return {
        'schema_version': 'kev-decision-ir/v1', 'sample_id': f'synthetic-{number}',
        'decision_site_id': 'synthetic-choice', 'contract_version': 'synthetic/v1',
        'implementation': 'model', 'state': {'request': f'Synthetic request {number}'},
        'question': {'type': 'choice', 'instructions': 'Synthetic policy: choose respond.',
                     'criteria': {'respond': 'Respond', 'clarify': 'Ask for context'}},
        'label': {'status': status, 'value': 'respond' if status == 'verified' else None,
                  'source': 'synthetic-test-policy' if status == 'verified' else '',
                  'evidence_refs': ['synthetic-test-rule/v1'] if status == 'verified' else []},
        'provenance': {
            'trace_sha256': 'a' * 64, 'session_id': session or f'session-{number}',
            'source_group_id': f'source-{number}', 'decision_seq': 3, 'decision_line': 5,
            'state_builder_version': 'synthetic-state/v1',
            'candidate_builder_version': 'synthetic-candidates/v1',
            'state_evidence_refs': [{'kind': 'event', 'seq': 0, 'line': 2}],
            'candidate_evidence_refs': [{'kind': 'contract', 'contract_version': 'synthetic/v1'}],
        },
    }


class CliGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write_rows(self, name, rows):
        path = self.root / name
        path.write_text(''.join(json.dumps(row) + '\n' for row in rows), encoding='utf-8')
        return path

    def read_json(self, path):
        return json.loads(path.read_text(encoding='utf-8'))

    def read_rows(self, path):
        return [json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line]

    def run_stage(self, stage, *arguments, out_name=None, code=0):
        out = self.root / (out_name or stage)
        result = subprocess.run(
            [sys.executable, str(CLI), stage, *map(str, arguments), '--out', str(out)],
            cwd=self.root, capture_output=True, text=True, timeout=15,
            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'},
        )
        self.assertEqual(result.returncode, code, result.stdout + result.stderr)
        gate = self.read_json(out / 'stage-status.json')
        self.assertEqual(set(gate), {'stage', 'status', 'reason_codes', 'next_allowed_stage'})
        self.assertEqual(gate['stage'], stage)
        if code:
            self.assertEqual(gate['status'], 'blocked')
            self.assertIsNone(gate['next_allowed_stage'])
        return out, gate

    def test_single_source_split_is_blocked_and_retains_compile(self):
        source = self.write_rows('single-source.jsonl', [
            ir_record(number, session='one-source-session') for number in range(6)
        ])
        compiled, _ = self.run_stage('compile', '--input', source)
        before = (compiled / 'compiled.jsonl').read_bytes()
        split, gate = self.run_stage('split', '--input', compiled / 'compiled.jsonl', code=2)
        manifest = self.read_json(split / 'split-manifest.json')
        self.assertEqual(manifest['status'], 'blocked')
        self.assertEqual(manifest['independent_groups'], 1)
        self.assertIn('insufficient_independent_groups', gate['reason_codes'])
        self.assertFalse((split / 'train.jsonl').exists())
        self.assertEqual((compiled / 'compiled.jsonl').read_bytes(), before)

    def test_zero_compile_preserves_unlabeled_quarantine(self):
        source = self.write_rows('unlabeled.jsonl', [ir_record(1, status='unlabeled')])
        out, gate = self.run_stage('compile', '--input', source, code=2)
        report = self.read_json(out / 'compile-report.json')
        self.assertEqual(report['status'], 'blocked')
        self.assertEqual(report['compiled_records'], 0)
        self.assertEqual(self.read_rows(out / 'compiled.jsonl'), [])
        self.assertEqual(len(self.read_rows(out / 'quarantine.jsonl')), 1)
        self.assertIn('label_unlabeled', gate['reason_codes'])

    def test_audit_structural_error_is_fatal_with_evidence(self):
        source = self.write_rows('corrupt-trace.jsonl', trace_rows(1, corrupt=True))
        out, gate = self.run_stage('audit', source, code=2)
        audit = self.read_json(out / 'trace-audit.json')
        self.assertIn('unsupported_event', gate['reason_codes'])
        self.assertTrue(any(issue['severity'] == 'error' for issue in audit['traces'][0]['issues']))
        self.assertTrue((out / 'request-snapshots.jsonl').exists())

    def test_extract_missing_user_is_blocked_without_inventing_samples(self):
        source = self.write_rows('context-only.jsonl', trace_rows(1, actual_user=False))
        out, gate = self.run_stage('extract', source, code=2)
        self.assertIn('no_usable_samples', gate['reason_codes'])
        self.assertIn('missing_actual_user_message', gate['reason_codes'])
        self.assertEqual(self.read_json(out / 'extraction-report.json')['samples'], 0)
        self.assertEqual(self.read_rows(out / 'annotations.todo.jsonl'), [])

    def test_extract_partial_structural_failure_retains_unaffected_sample(self):
        good = self.write_rows('good.jsonl', trace_rows(1))
        bad = self.write_rows('bad.jsonl', trace_rows(2, corrupt=True))
        out, gate = self.run_stage('extract', good, bad, code=2)
        report = self.read_json(out / 'extraction-report.json')
        self.assertEqual(report['samples'], 1)
        self.assertEqual(report['blocked'][0]['reason'], 'trace_integrity')
        self.assertEqual(len(self.read_rows(out / 'samples.jsonl')), 1)
        self.assertIn('trace_audit_errors', gate['reason_codes'])

    def test_annotate_unlabeled_is_nonfatal_and_requires_review(self):
        source = self.write_rows('unlabeled.jsonl', [ir_record(1, status='unlabeled')])
        annotations = self.write_rows('no-new-labels.jsonl', [])
        out, gate = self.run_stage('annotate', '--samples', source, '--annotations', annotations)
        self.assertEqual(gate['status'], 'requires_review')
        self.assertEqual(gate['next_allowed_stage'], 'annotate')
        self.assertIn('no_default_export_eligible_labels', gate['reason_codes'])
        self.assertEqual(self.read_json(out / 'annotation-report.json')['labels'], {'unlabeled': 1})

    def test_partial_compile_is_nonfatal_but_requires_review(self):
        source = self.write_rows('mixed-labels.jsonl', [ir_record(1), ir_record(2, status='unlabeled')])
        out, gate = self.run_stage('compile', '--input', source)
        self.assertEqual(gate['status'], 'requires_review')
        self.assertEqual(gate['next_allowed_stage'], 'split')
        self.assertEqual(self.read_json(out / 'compile-report.json')['status'], 'partial')
        self.assertEqual(len(self.read_rows(out / 'compiled.jsonl')), 1)
        self.assertEqual(len(self.read_rows(out / 'quarantine.jsonl')), 1)

    def test_malformed_input_gets_blocked_status_without_overwriting_input(self):
        source = self.root / 'malformed.jsonl'
        source.write_text('{broken json}\n', encoding='utf-8')
        before = source.read_bytes()
        _, gate = self.run_stage('audit', source, code=1)
        self.assertIn('invalid_input', gate['reason_codes'])
        self.assertEqual(source.read_bytes(), before)

    def test_dataset_audit_rejects_cross_partition_overlap(self):
        source = self.write_rows('independent.jsonl', [ir_record(number) for number in range(4)])
        compiled, _ = self.run_stage('compile', '--input', source)
        split, _ = self.run_stage('split', '--input', compiled / 'compiled.jsonl')
        with (split / 'test.jsonl').open('a', encoding='utf-8') as handle:
            handle.write((split / 'train.jsonl').read_text(encoding='utf-8'))
        out, gate = self.run_stage('audit-dataset', '--dataset-dir', split, code=2)
        self.assertFalse(self.read_json(out / 'dataset-audit.json')['ok'])
        self.assertIn('cross_partition_overlap', gate['reason_codes'])

    def test_valid_flow_stops_before_encoding_or_training_claims(self):
        traces = [self.write_rows(f'trace-{number}.jsonl', trace_rows(number)) for number in range(4)]
        _, audit = self.run_stage('audit', *traces)
        self.assertEqual((audit['status'], audit['next_allowed_stage']), ('completed', 'discover'))
        _, discovery = self.run_stage('discover', *traces)
        self.assertEqual((discovery['status'], discovery['next_allowed_stage']),
                         ('requires_review', 'contract-review'))
        extracted, extraction = self.run_stage('extract', *traces)
        self.assertEqual((extraction['status'], extraction['next_allowed_stage']),
                         ('requires_review', 'annotate'))
        report = self.read_json(extracted / 'extraction-report.json')
        self.assertFalse(report['ready_for_training'])
        self.assertEqual(report['token_budget'], 'not_checked')
        samples = self.read_rows(extracted / 'samples.jsonl')
        self.assertEqual({row['label']['status'] for row in samples}, {'unlabeled'})
        annotations = self.write_rows('synthetic-reviewed-labels.jsonl', [
            {'sample_id': row['sample_id'], 'label': {
                'status': 'verified', 'value': 'respond', 'source': 'synthetic-test-policy',
                'evidence_refs': ['synthetic-test-rule/v1'],
            }} for row in samples
        ])
        annotated, annotation = self.run_stage('annotate', '--samples', extracted / 'samples.jsonl',
                                                '--annotations', annotations)
        self.assertEqual((annotation['status'], annotation['next_allowed_stage']),
                         ('requires_review', 'compile'))
        compiled, compilation = self.run_stage('compile', '--input', annotated / 'samples.labeled.jsonl')
        self.assertEqual(compilation['next_allowed_stage'], 'split')
        split, splitting = self.run_stage('split', '--input', compiled / 'compiled.jsonl')
        self.assertEqual(splitting['next_allowed_stage'], 'audit-dataset')
        self.assertEqual(self.read_json(split / 'split-manifest.json')['independent_groups'], 4)
        audited, dataset = self.run_stage('audit-dataset', '--dataset-dir', split)
        self.assertEqual((dataset['status'], dataset['next_allowed_stage']),
                         ('requires_review', 'encoding-review'))
        final = self.read_json(audited / 'dataset-audit.json')
        self.assertTrue(final['ok'])
        self.assertEqual(final['training_handoff']['token_budget'], 'not_checked')
        self.assertEqual(final['training_handoff']['runtime_equivalence'], 'not_evaluated')


if __name__ == '__main__':
    unittest.main()
