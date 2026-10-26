#!/usr/bin/env python3
"""Check a prepared plan with the pinned native Kev encoder, without model weights.

Only tokenizer files may be downloaded, and only with --allow-tokenizer-download.
The default uses the local tokenizer cache. No training, model construction, GPU
selection, checkpoint-weight loading, or fallback tokenizer is performed.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.machinery
import importlib.util
import json
import math
import os
from pathlib import Path
import random
import re
import subprocess
import sys


PARTITIONS = ('train', 'development', 'calibration', 'test')
LIMITS = {'max_state': 384, 'max_branch': 1024, 'max_packed': 2048}
SHUFFLE_SEEDS = tuple(range(8))
HEX40 = re.compile(r'[0-9a-f]{40}\Z')
HEX64 = re.compile(r'[0-9a-f]{64}\Z')


class CheckFailure(Exception):
    def __init__(self, code, detail, *, malformed=False, **context):
        super().__init__(detail)
        self.failure = {'code': code, 'detail': detail, **context}
        self.exit_code = 1 if malformed else 2


def require(condition, code, detail, *, malformed=False, **context):
    if not condition:
        raise CheckFailure(code, detail, malformed=malformed, **context)


def strict_json(value):
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                raise ValueError('duplicate JSON key')
            result[key] = item
        return result
    def constant(_):
        raise ValueError('nonfinite JSON number')
    return json.loads(value, object_pairs_hook=pairs, parse_constant=constant)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def absolute_path(value, field):
    require(isinstance(value, str) and value and not any(c in value for c in '\x00\r\n')
            and Path(value).is_absolute(), 'invalid_plan_path', field + ' must be an absolute path', malformed=True)
    return Path(value).resolve()


def check_legacy_identity(dataset):
    """Bind a legacy plan to the source/review snapshots that passed its audit."""
    if dataset.get('kind') != 'legacy-native':
        return None
    root = absolute_path(dataset.get('directory'), 'dataset.directory')
    audit = dataset.get('audit')
    require(isinstance(audit, dict) and audit.get('kind') == 'recomputed_legacy_native_audit'
            and audit.get('ok') is True, 'invalid_legacy_audit_identity',
            'Legacy training needs the replayed source/review audit identity', malformed=True)
    identity = {}
    for name in ('source', 'reviews'):
        expected = audit.get(name + '_sha256')
        require(isinstance(expected, str) and HEX64.fullmatch(expected), 'invalid_legacy_audit_identity',
                'Legacy source and review snapshots need SHA-256 identities', malformed=True)
        path = root / (name + '.jsonl')
        try:
            actual = digest(path)
        except OSError as exc:
            raise CheckFailure('legacy_snapshot_unavailable', 'Cannot read the audited legacy snapshot',
                               snapshot=name) from exc
        require(actual == expected, 'legacy_snapshot_changed',
                'Legacy source or review snapshot changed after preparation; rebuild and prepare again', snapshot=name)
        identity[name] = {'path': str(path), 'sha256': actual}
    manifest = dataset.get('manifest')
    require(isinstance(manifest, dict), 'invalid_legacy_audit_identity',
            'Legacy dataset needs its audited split manifest', malformed=True)
    manifest_path = absolute_path(manifest.get('path'), 'dataset.manifest.path')
    try:
        actual_manifest = digest(manifest_path)
    except OSError as exc:
        raise CheckFailure('legacy_snapshot_unavailable', 'Cannot read the audited legacy manifest',
                           snapshot='manifest') from exc
    require(actual_manifest == manifest.get('sha256'), 'legacy_snapshot_changed',
            'Legacy split manifest changed after preparation', snapshot='manifest')
    identity['manifest'] = {'path': str(manifest_path), 'sha256': actual_manifest}
    return identity


def git(root, *arguments, allow_missing=False):
    try:
        result = subprocess.run(['git', '-C', str(root), *arguments], capture_output=True,
                                timeout=20, env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CheckFailure('kev_checkout_unavailable', 'Git checkout verification failed: ' + type(exc).__name__) from exc
    if allow_missing and result.returncode == 1:
        return b''
    require(result.returncode == 0, 'kev_checkout_unavailable', 'A full local Kev Git checkout is required')
    return result.stdout


def check_checkout(root, expected):
    require(root.is_dir(), 'kev_checkout_unavailable', 'Kev checkout directory does not exist')
    top = git(root, 'rev-parse', '--show-toplevel').decode().strip()
    require(Path(top).resolve() == root, 'kev_checkout_root_mismatch', '--kev-root must name the checkout root')
    head = git(root, 'rev-parse', 'HEAD').decode().strip()
    require(head == expected, 'kev_commit_mismatch', 'Kev checkout HEAD differs from the prepared plan', actual_head=head)
    sparse = git(root, 'config', '--bool', 'core.sparseCheckout', allow_missing=True).decode().strip()
    require(sparse != 'true', 'kev_sparse_checkout', 'A complete runtime checkout is required')
    dirty = git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'kev/')
    require(not dirty, 'kev_runtime_dirty', 'Tracked or untracked runtime files differ from the pinned checkout')
    # Include ignored source files too; ordinary generated bytecode is not source.
    others = git(root, 'ls-files', '--others', '-z', '--', 'kev/').decode().split('\0')
    others = [name for name in others if name and '__pycache__' not in Path(name).parts and not name.endswith('.pyc')]
    require(not others, 'kev_runtime_untracked', 'Untracked runtime files are not covered by the commit pin')
    runtime = root / 'kev'
    require(not runtime.is_symlink(), 'kev_runtime_symlink', 'Runtime code must be inside the pinned checkout')
    # Read every tracked runtime blob independently of index flags such as
    # assume-unchanged/skip-worktree, which can hide edits from git status.
    tree = git(root, 'ls-tree', '-r', '-z', 'HEAD', '--', 'kev/')
    tracked = set()
    for entry in tree.split(b'\0'):
        if not entry:
            continue
        try:
            description, filename = entry.decode().split('\t', 1)
            mode, kind, blob = description.split()
        except (ValueError, UnicodeError) as exc:
            raise CheckFailure('kev_tree_invalid', 'Cannot identify pinned runtime blobs') from exc
        path = root / filename
        require(kind == 'blob' and mode in ('100644', '100755') and path.is_file() and not path.is_symlink(),
                'kev_runtime_incomplete', 'Pinned runtime must contain ordinary readable files')
        content = path.read_bytes()
        actual = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
        require(actual == blob, 'kev_runtime_content_changed', 'Runtime bytes differ from the pinned commit', file=filename)
        tracked.add(filename)
    for name in ('api.py', 'data.py', 'model.py', 'train.py'):
        path = runtime / name
        require('kev/' + name in tracked and path.is_file() and not path.is_symlink(),
                'kev_runtime_incomplete', 'Missing, untracked, or linked runtime module: ' + name)
    require(not any(path.is_symlink() for path in runtime.rglob('*')), 'kev_runtime_symlink',
            'Runtime symlinks cannot establish the identity of imported code')


def check_metadata(plan_path, kev_root, report):
    """All metadata and content-identity checks run before native imports."""
    try:
        raw = plan_path.read_bytes()
        report['plan_sha256'] = hashlib.sha256(raw).hexdigest()
        plan = strict_json(raw.decode('utf-8-sig'))
    except (OSError, UnicodeError, ValueError) as exc:
        raise CheckFailure('invalid_plan', 'Cannot read a strict JSON training plan', malformed=True) from exc
    require(isinstance(plan, dict) and plan.get('schema_version') == 'kev-training-plan/v1'
            and plan.get('status') == 'prepared', 'plan_not_prepared', 'Expected a prepared kev-training-plan/v1', malformed=True)
    commit = plan.get('kev_commit')
    require(isinstance(commit, str) and HEX40.fullmatch(commit), 'invalid_kev_commit', 'kev_commit must be a full commit SHA', malformed=True)
    report['kev_commit'] = commit
    checkpoint = plan.get('checkpoint')
    require(isinstance(checkpoint, dict), 'invalid_checkpoint_contract', 'checkpoint must be an object', malformed=True)
    base, revision, isolation = (checkpoint.get(key) for key in ('base', 'base_revision', 'option_isolation'))
    require(isinstance(base, str) and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)?', base),
            'invalid_tokenizer_base', 'checkpoint.base must identify a Hub repository, not a URL or local directory', malformed=True)
    require(isinstance(revision, str) and HEX40.fullmatch(revision), 'unpinned_tokenizer_revision',
            'checkpoint.base_revision must be a full commit SHA', malformed=True)
    require(type(isolation) in (bool, int) and isolation in (0, 1), 'invalid_option_isolation',
            'checkpoint.option_isolation must be 0/1 or boolean', malformed=True)
    require(plan.get('context_limits') == LIMITS, 'unsupported_context_limits',
            'This check requires state/branch/packed limits 384/1024/2048', malformed=True)
    augmentation = plan.get('augmentation')
    require(isinstance(augmentation, dict) and augmentation.get('choice_shuffle') is True
            and all(type(augmentation.get(key)) in (int, float) and augmentation[key] == 0
                    for key in ('p_none', 'p_none_distract', 'p_distract', 'p_none_pair')),
            'unsupported_augmentation', 'This preflight checks the explicit shuffle-only training recipe', malformed=True)
    report.update(base=base, base_revision=revision, option_isolation=bool(isolation))
    require(not Path(base).exists(), 'ambiguous_tokenizer_source',
            'A local path shadows the pinned Hub tokenizer repository')
    environment = plan.get('environment', {})
    if isinstance(environment, dict) and environment.get('kev_root') is not None:
        require(absolute_path(environment['kev_root'], 'environment.kev_root') == kev_root,
                'kev_root_mismatch', '--kev-root differs from the prepared execution environment')
    check_checkout(kev_root, commit)
    metadata_path = absolute_path(checkpoint.get('metadata_path'), 'checkpoint.metadata_path')
    expected_metadata = checkpoint.get('metadata_sha256')
    require(isinstance(expected_metadata, str) and HEX64.fullmatch(expected_metadata), 'invalid_metadata_hash',
            'checkpoint.metadata_sha256 must be a SHA-256 hash', malformed=True)
    try:
        metadata_bytes = metadata_path.read_bytes()
        require(hashlib.sha256(metadata_bytes).hexdigest() == expected_metadata, 'checkpoint_metadata_changed',
                'Checkpoint metadata no longer matches the prepared plan')
        metadata = strict_json(metadata_bytes.decode('utf-8-sig'))
    except (OSError, UnicodeError, ValueError) as exc:
        raise CheckFailure('checkpoint_metadata_unavailable', 'Checkpoint metadata cannot be read as strict JSON') from exc
    require(isinstance(metadata, dict) and isinstance(metadata.get('args'), dict), 'invalid_checkpoint_metadata',
            'Checkpoint metadata must contain its original training args')
    args = metadata['args']
    metadata_revision = metadata.get('base_revision') or args.get('base_revision')
    require(args.get('base') == base and metadata_revision == revision
            and (not args.get('base_revision') or args['base_revision'] == revision)
            and type(args.get('option_isolation')) in (int, bool) and args.get('option_isolation') == isolation,
            'checkpoint_metadata_conflict', 'Base, revision, or option isolation differs from checkpoint metadata')
    report['checkpoint_metadata'] = {'path': str(metadata_path), 'sha256': expected_metadata}
    dataset = plan.get('dataset')
    files = dataset.get('files') if isinstance(dataset, dict) else None
    require(isinstance(files, dict) and set(files) == set(PARTITIONS), 'invalid_dataset_files',
            'dataset.files must contain train, development, calibration, and test', malformed=True)
    paths = set()
    for partition in PARTITIONS:
        item = files[partition]
        require(isinstance(item, dict), 'invalid_file_contract', 'Dataset file contract must be an object', malformed=True, partition=partition)
        path = absolute_path(item.get('path'), 'dataset.files.' + partition + '.path')
        require(path not in paths, 'shared_partition_path', 'Partitions must have separate physical files', partition=partition)
        paths.add(path)
        expected, count = item.get('sha256'), item.get('records')
        require(isinstance(expected, str) and HEX64.fullmatch(expected) and type(count) is int and count > 0,
                'invalid_file_contract', 'Every file needs a SHA-256 hash and positive record count', malformed=True, partition=partition)
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise CheckFailure('dataset_file_unavailable', 'Cannot read dataset file', partition=partition) from exc
        actual = hashlib.sha256(data).hexdigest()
        report['files'][partition] = {'path': str(path), 'sha256': actual, 'records': count}
        require(actual == expected, 'dataset_file_changed', 'Dataset hash differs from the prepared plan', partition=partition)
        try:
            lines = [line for line in data.decode('utf-8-sig').splitlines() if line.strip()]
            for line in lines:
                strict_json(line)
        except (UnicodeError, ValueError) as exc:
            raise CheckFailure('invalid_dataset_json', 'Dataset is not strict JSONL', partition=partition) from exc
        require(len(lines) == count, 'dataset_count_mismatch', 'Physical record count differs from the prepared plan', partition=partition)
    legacy_identity = check_legacy_identity(dataset)
    if legacy_identity is not None:
        report['legacy_review_identity'] = legacy_identity
    report['checks']['metadata'] = 'passed'
    return plan


def load_native(kev_root):
    missing = [name for name in ('torch', 'transformers', 'datasets', 'pydantic') if importlib.util.find_spec(name) is None]
    require(not missing, 'missing_dependencies', 'Native Kev dependencies are unavailable: ' + ', '.join(missing))
    try:
        # Import installed dependencies before adding the checkout as a package path.
        for name in ('torch', 'transformers', 'datasets', 'pydantic'):
            importlib.import_module(name)
        require(not any(name == 'kev' or name.startswith('kev.') for name in sys.modules),
                'kev_already_imported', 'Run this check in a fresh process to pin native imports')
        spec = importlib.machinery.PathFinder.find_spec('kev', [str(kev_root)])
        require(spec is not None, 'kev_runtime_incomplete', 'The pinned checkout has no importable Kev package')
        package = importlib.util.module_from_spec(spec)
        sys.modules['kev'] = package
        if spec.loader is not None:
            spec.loader.exec_module(package)
        data = importlib.import_module('kev.data')
        model = importlib.import_module('kev.model')
        transformers = importlib.import_module('transformers')
        for module in (data, model, importlib.import_module('kev.api')):
            require(Path(module.__file__).resolve() == kev_root / 'kev' / (module.__name__.split('.')[-1] + '.py'),
                    'native_import_mismatch', 'Imported module is outside the pinned runtime')
        actual = dict(zip(LIMITS, (model.MAX_STATE, model.MAX_BRANCH, model.MAX_PACKED)))
        require(actual == LIMITS, 'native_context_limits_mismatch', 'Pinned native encoder limits differ from this recipe')
        return data, model, transformers.AutoTokenizer
    except CheckFailure:
        raise
    except Exception as exc:
        raise CheckFailure('native_import_failed', 'Installed native dependencies cannot import Kev: ' + type(exc).__name__) from exc


def check_labels(request, materialized):
    source = request['questions']
    questions = materialized['questions']
    require(len(source) == len(questions), 'question_mapping_changed', 'Native materialization changed question count')
    for (qid, public), internal in zip(source.items(), questions):
        kind, label, criteria = public.get('type'), public.get('label'), public.get('criteria')
        if kind == 'choice':
            require(isinstance(criteria, dict) and isinstance(label, str) and label in criteria,
                    'invalid_hard_label', 'Choice label must name a current option')
            keys, expected = list(criteria), list(criteria).index(label)
        elif kind == 'noul':
            require(type(label) is bool, 'invalid_hard_label', 'Noul label must be boolean')
            keys, expected = ['false', 'true'], int(label)
        elif kind == 'score':
            require(isinstance(criteria, list) and type(label) is int and 0 <= label < len(criteria),
                    'invalid_hard_label', 'Score label must be a zero-based level index')
            keys, expected = list(map(str, range(len(criteria)))), label
        else:
            raise CheckFailure('invalid_question_type', 'Unsupported question type')
        require(internal.get('qid') == qid and internal.get('qtype') == kind and internal.get('keys') == keys
                and type(internal.get('label')) is int and internal['label'] == expected
                and len(internal['options']) == len(keys), 'label_mapping_changed',
                'Native materialization did not preserve the exact target mapping')
        target = public.get('target')
        if target is not None:
            require(isinstance(target, dict) and target and not (set(target) - set(keys))
                    and all(type(v) in (int, float) and math.isfinite(v) and v >= 0 for v in target.values())
                    and math.isfinite(sum(target.values())) and sum(target.values()) > 0,
                    'invalid_soft_target', 'Soft targets need finite nonnegative weights on current keys')
            weights = [target.get(key, 0) / sum(target.values()) for key in keys]
            actual = internal.get('target')
            require(isinstance(actual, list) and len(actual) == len(weights)
                    and all(math.isfinite(a) and math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12)
                            for a, b in zip(actual, weights)), 'soft_target_mapping_changed',
                    'Native normalized soft targets differ from their named weights')
        else:
            require(internal.get('target') is None, 'unexpected_soft_target',
                    'Native materialization added a supervision target absent from the input')


def distribution(values):
    if not values:
        return {'count': 0, 'min': None, 'p50': None, 'p95': None, 'max': None}
    ordered = sorted(values)
    return {'count': len(values), 'min': ordered[0], 'p50': ordered[(len(ordered) - 1) // 2],
            'p95': ordered[max(0, math.ceil(len(ordered) * .95) - 1)], 'max': ordered[-1]}


def check_records(plan, kev_root, report, allow_download):
    data, model, auto_tokenizer = load_native(kev_root)
    report['checks']['native_imports'] = 'passed'
    try:
        tokenizer = auto_tokenizer.from_pretrained(plan['checkpoint']['base'], revision=plan['checkpoint']['base_revision'],
                                                   local_files_only=not allow_download, trust_remote_code=False)
    except Exception as exc:
        raise CheckFailure('tokenizer_unavailable', 'Pinned tokenizer could not be loaded: ' + type(exc).__name__) from exc
    special_ids = [tokenizer.convert_tokens_to_ids(token) for token in model.SPECIAL]
    require(len(special_ids) == 5 and all(type(value) is int and value >= 0 and value != tokenizer.unk_token_id for value in special_ids)
            and len(set(special_ids)) == len(special_ids), 'missing_native_special_tokens',
            'Tokenizer lacks the distinct delimiter tokens reused by the native trainer')
    for token, expected in zip(model.SPECIAL, special_ids):
        require(tokenizer(token, add_special_tokens=False).input_ids == [expected], 'native_special_token_mismatch',
                'Native delimiter token does not encode as its existing single token')
    report['checks']['tokenizer'] = 'passed'
    report['tokenizer_special_tokens'] = dict(zip(model.SPECIAL, special_ids))
    for partition in PARTITIONS:
        path = Path(plan['dataset']['files'][partition]['path'])
        states, branches, packed = [], [], []
        original_checked, variants_checked = 0, 0
        try:
            records = data.load_records(path)
            require(len(records) == plan['dataset']['files'][partition]['records'], 'native_record_count_mismatch',
                    'Native loader record count differs from the prepared plan')
            require(digest(path) == plan['dataset']['files'][partition]['sha256'], 'dataset_file_changed',
                    'Dataset changed during native loading')
        except Exception as exc:
            failure = exc.failure if isinstance(exc, CheckFailure) else {'code': 'native_loader_failed', 'detail': type(exc).__name__}
            report['failures'].append({**failure, 'partition': partition})
            continue
        for index, request in enumerate(records):
            report['checked_records'] += 1
            try:
                original = data.materialize(request)
                check_labels(request, original)
                variants = [(None, request, original)]
                for seed in SHUFFLE_SEEDS:
                    shuffled = data.augment(request, random.Random(seed), p_none=0, p_none_distract=0, p_distract=0)
                    require(shuffled['state'] == request['state'] and list(shuffled['questions']) == list(request['questions']),
                            'shuffle_changed_input', 'Shuffle changed the state or question identity')
                    for qid, question in request['questions'].items():
                        changed = shuffled['questions'][qid]
                        require(changed == question,
                                'shuffle_changed_target', 'Shuffle must preserve every named candidate and target')
                    internal = data.materialize(shuffled)
                    check_labels(shuffled, internal)
                    variants.append((seed, shuffled, internal))
                for seed, _, internal in variants:
                    encoded = model.encode(tokenizer, internal, strict=True, max_state=LIMITS['max_state'],
                                           max_branch=LIMITS['max_branch'], option_isolation=bool(plan['checkpoint']['option_isolation']))
                    require(not encoded.get('state_truncated') and encoded['labels'] == [q['label'] for q in internal['questions']]
                            and encoded.get('option_isolation') == bool(plan['checkpoint']['option_isolation']),
                            'encoded_target_or_truncation', 'Strict encoding truncated input or changed labels')
                    require(model.fits(internal, tokenizer, **LIMITS) and len(encoded['ids']) <= LIMITS['max_packed'],
                            'native_fits_failed', 'Record does not fit the native training limits')
                    state_count = encoded['state_tokens']
                    row_lengths = [state_count + encoded['seg'].count(q + 1) for q in range(len(internal['questions']))]
                    require(state_count <= LIMITS['max_state'] and all(n <= LIMITS['max_branch'] for n in row_lengths),
                            'encoded_limits_exceeded', 'Actual strict encoding exceeds the fixed context limits')
                    states.append(state_count); branches.extend(row_lengths); packed.append(len(encoded['ids']))
                    variants_checked += 1
                original_checked += 1
            except Exception as exc:
                failure = exc.failure if isinstance(exc, CheckFailure) else {'code': 'native_encoding_failed', 'detail': type(exc).__name__}
                report['failures'].append({**failure, 'partition': partition, 'record_index': index})
        report['tokenstats']['partitions'][partition] = {
            'checked_records': original_checked, 'encoded_variants': variants_checked,
            'state_tokens': distribution(states), 'branch_tokens_including_state': distribution(branches),
            'packed_tokens': distribution(packed),
        }
    if not report['failures']:
        report['checks'].update(native_loader='passed', native_materialize='passed', strict_encoding='passed',
                                native_fits='passed', target_mapping='passed', choice_shuffle='passed')


def empty_report():
    return {
        'schema_version': 'kev-encoding-report/v1', 'status': 'blocked', 'plan_sha256': None,
        'kev_commit': None, 'base': None, 'base_revision': None, 'files': {}, 'checked_records': 0, 'failures': [],
        'tokenstats': {'limits': dict(LIMITS), 'shuffle_seeds': list(SHUFFLE_SEEDS), 'partitions': {}},
        'checks': dict.fromkeys(('metadata', 'native_imports', 'tokenizer', 'native_loader', 'native_materialize',
                                 'strict_encoding', 'native_fits', 'target_mapping', 'choice_shuffle'), 'not_run'),
        'not_verified': ['model_weights', 'checkpoint_publisher_authenticity', 'GPU_hardware', 'training_loss',
                         'label_semantic_correctness', 'calibration', 'full_Harness_equivalence'],
        'training': 'not_run',
    }


def run_checks(plan_path, kev_root, report, allow_download=False):
    plan = check_metadata(plan_path, kev_root, report)
    initial_plan_hash = report['plan_sha256']
    check_records(plan, kev_root, report, allow_download)
    # Native code and files can change while tokenization is running. Ready only
    # describes the same plan, metadata, dataset bytes, and pinned runtime.
    require(digest(plan_path) == initial_plan_hash, 'plan_changed', 'Training plan changed during encoding checks')
    recheck = empty_report()
    check_metadata(plan_path, kev_root, recheck)
    report['checks']['final_identity_recheck'] = 'passed'
    if not report['failures']:
        report['status'] = 'ready'
    return 0 if report['status'] == 'ready' else 2


def main(argv=None):
    parser = argparse.ArgumentParser(description="使用固定版本 KEV 和真实分词器检查数据长度；不加载模型权重或启动训练。")
    parser.add_argument('--plan', required=True)
    parser.add_argument('--kev-root', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--allow-tokenizer-download', action='store_true')
    parser.add_argument('--json', action='store_true', help='以 JSON 返回程序回执；完整机器报告始终保存')
    args = parser.parse_args(argv)
    out = Path(args.out)
    human_path = out.with_suffix('.md') if out.suffix != '.md' else out.with_name(out.name + '.md')
    if out.exists() or out.is_symlink() or human_path.exists() or human_path.is_symlink():
        print('编码检查未开始：报告路径已有内容，请使用新的 JSON 报告路径。', file=sys.stderr)
        return 1
    report = empty_report()
    report['tokenizer_download_allowed'] = args.allow_tokenizer_download
    sys.dont_write_bytecode = True
    try:
        code = run_checks(Path(args.plan).resolve(), Path(args.kev_root).resolve(), report, args.allow_tokenizer_download)
    except CheckFailure as exc:
        report['failures'].append(exc.failure)
        code = exc.exit_code
    except (OSError, UnicodeError, ValueError, TypeError, KeyError) as exc:
        report['failures'].append({'code': 'preflight_failed', 'detail': type(exc).__name__})
        code = 2
    try:
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open('x', encoding='utf-8') as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write('\n')
    except OSError as exc:
        print('编码报告未能保存，请检查路径和写入权限：' + type(exc).__name__, file=sys.stderr)
        return 1
    result = {'status': report['status'], 'report': str(out.resolve()), 'checked_records': report['checked_records'],
              'failure_codes': [failure['code'] for failure in report['failures']]}
    spec = importlib.util.spec_from_file_location('kev_encoding_human_report', Path(__file__).resolve().parents[2] / 'kev-trace-pipeline/scripts/human_report.py')
    human = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(human)
    passed = report['status'] == 'ready'
    summary = (f"已检查 {report['checked_records']} 条记录，当前数据的编码与长度检查通过。尚未启动训练。" if passed
               else f"编码检查未通过，已检查 {report['checked_records']} 条记录；当前不能继续训练。")
    try:
        human.emit_result(out.parent, 'check-encoding', 'completed' if passed else 'blocked', summary,
                          [] if passed else result['failure_codes'],
                          '核对训练环境、预算和执行条件后，再取训练命令。' if passed else '按排查明细补齐依赖或修正数据，再使用新报告路径重新检查。',
                          [('完整编码结果', out.resolve())], json_output=args.json, machine_result=result,
                          diagnostics=[json.dumps(failure, ensure_ascii=False) for failure in report['failures']],
                          limitations=['本次未验证标签语义、GPU 条件、实际训练、概率校准或完整业务效果。'],
                          report_name=human_path.name)
    except OSError as exc:
        print('机器报告已保存，可读报告保存失败：' + type(exc).__name__, file=sys.stderr)
        return 1
    return code


if __name__ == '__main__':
    raise SystemExit(main())
