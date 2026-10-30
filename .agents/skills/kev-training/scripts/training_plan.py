#!/usr/bin/env python3
"""Prepare a pinned KEV training handoff; never start training or contact a server.

prepare --request REQUEST.json --out NEW_DIRECTORY
commands --plan training-plan.json --encoding-report encoding-report.json

Run prepare in the intended training environment after approved files are copied
there. Absolute paths in the resulting command cards refer to that environment.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import re
import shlex
import sys
from pathlib import Path, PurePosixPath

KEV_COMMIT = "2074cc44256200bb37540103fa4572901faa10f3"
PARTITIONS = ("train", "development", "calibration", "test")
LIMITS = {"max_state": 384, "max_branch": 1024, "max_packed": 2048}
DEFAULT_RECIPE = "cuda-bf16-lora"
RECIPE_DTYPES = {DEFAULT_RECIPE: "bf16", "cuda-fp32-lora": "fp32"}
PREDICTOR_UNSET = ("KEV_MERGE", "KEV_ATTN", "KEV_CUDA_GRAPHS", "KEV_FUSED")
EXECUTION_PATHS = ("HF_HUB_CACHE", "UV_PROJECT_ENVIRONMENT")
EXECUTION_SWITCHES = {"HF_HUB_OFFLINE": ("0", "1"), "TRANSFORMERS_OFFLINE": ("0", "1"),
                      "UV_NO_SYNC": ("0", "1"), "USE_HUB_KERNELS": ("NO", "YES")}
SKILLS = Path(__file__).resolve().parents[2]
VENDOR_ROOTS = {
    "kev-finetune": SKILLS / "kev-training/references/upstream/kev-finetune",
    "kev-deploy": SKILLS / "kev-deploy/references/upstream/kev-deploy",
}
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate_json_key: " + key)
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=pairs,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("nonfinite_json: " + value)))


def read_json(path):
    return strict_json(Path(path).read_text(encoding="utf-8-sig"))


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def absolute(value, name):
    require(isinstance(value, str) and value and Path(value).is_absolute(), name + " must be an absolute path")
    require("\x00" not in value and "\n" not in value and "\r" not in value, name + " contains a control character")
    return str(Path(value).resolve())


def text(value, name):
    require(isinstance(value, str) and bool(value.strip()), name + " is required")
    require(not any(c in value for c in "\n\r\x00"), name + " contains a control character")
    return value


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reporting():
    return load_module("kev_human_report", SKILLS / "kev-trace-pipeline/scripts/human_report.py")


def verify_vendor():
    identities = {}
    for name, root in VENDOR_ROOTS.items():
        manifest = read_json(root / "UPSTREAM.json")
        require(manifest.get("upstream", {}).get("commit") == KEV_COMMIT, "unexpected_vendor_revision: " + name)
        for item in manifest["upstream_files"]:
            require(digest(root / item["path"]) == item["sha256"], "vendor_file_changed: " + name + "/" + item["path"])
        identities[name] = {"commit": KEV_COMMIT, "manifest_sha256": digest(root / "UPSTREAM.json")}
    return identities


def reject_credentials(value):
    forbidden = {"password", "token", "api_key", "private_key", "ssh_password", "access_token", "github_pat"}
    if isinstance(value, dict):
        for key, item in value.items():
            require(key.lower() not in forbidden, "literal credentials are not training-plan inputs")
            reject_credentials(item)
    elif isinstance(value, list):
        for item in value:
            reject_credentials(item)
    elif isinstance(value, str):
        require("github_pat_" not in value and "-----BEGIN PRIVATE KEY" not in value,
                "literal credentials are not training-plan inputs")


def native_check(record, checker):
    problems = checker.check_record(record)
    require(not problems, "native_schema: " + "; ".join(problems))
    for question in record["questions"].values():
        target = question.get("target")
        if target is not None:
            require(isinstance(target, dict) and target, "invalid_soft_target")
            require(all(type(v) in (float, int) and math.isfinite(v) and v >= 0 for v in target.values()),
                    "soft_target_requires_finite_numeric_weights")
            require(sum(target.values()) > 0, "empty_soft_target")


def inspect_dataset(directory, kind):
    root = Path(directory)
    manifest_path = root / "split-manifest.json"
    manifest = read_json(manifest_path)
    require(manifest.get("status") == "ready" and not manifest.get("blocked"), "split_not_ready")
    checker = load_module("kev_vendor_validator", VENDOR_ROOTS["kev-finetune"] / "scripts/split_data.py")
    native_input = load_module("kev_native_input_identity", SKILLS / "kev-trace-pipeline/scripts/native_input.py")
    rows, files, identities, groups, forms = {}, {}, {}, {}, {}
    for partition in PARTITIONS:
        path = root / (partition + ".jsonl")
        records = [strict_json(line) for line in path.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
        require(records, "empty_partition: " + partition)
        group_set = set()
        for record in records:
            native_check(record, checker)
            meta = record.get("_meta", {})
            require(meta.get("split") == partition, "physical_partition_mismatch: " + partition)
            require(meta.get("variant") == "clean", "native_variant_must_be_clean")
            rid = text(meta.get("id"), "_meta.id")
            require(rid not in identities, "duplicate_record_id: " + rid)
            identities[rid] = partition
            group = text(meta.get("bridge_group_id") if kind == "platform-v2" else meta.get("group_id"), "effective group")
            group_set.add(group)
            require(groups.setdefault(group, partition) == partition, "cross_partition_group: " + group)
            for question in record["questions"].values():
                key = json.dumps({"state": record["state"], "question": {k: question.get(k) for k in ("type", "instructions", "criteria")}},
                                 sort_keys=True, ensure_ascii=False, separators=(",", ":"))
                require(forms.setdefault(key, partition) == partition, "cross_partition_identical_input")
                rendered_key = "native-rendered:" + native_input.question_key(record["state"], question)
                require(forms.setdefault(rendered_key, partition) == partition, "cross_partition_identical_rendered_input")
        require(manifest.get("partition_records", {}).get(partition) == len(records), "manifest_count_mismatch: " + partition)
        rows[partition] = records
        files[partition] = {"path": str(path.resolve()), "sha256": digest(path), "records": len(records),
                            "questions": sum(len(r["questions"]) for r in records), "groups": len(group_set)}
    if kind == "trace-ir":
        core = load_module("kev_core_dataset", SKILLS / "kev-trace-pipeline/scripts/dataset.py")
        audit = core.audit_partitions(rows)
        require(audit.get("ok") is True, "trace_ir_audit_failed: " + json.dumps(audit.get("errors", []), ensure_ascii=False))
        require(all(r["_meta"].get("label_status") == "verified" and not r["_meta"].get("training_only")
                    for records in rows.values() for r in records), "this_recipe_requires_reviewed_labels_no_weak_rows")
        review_scope = "trace IR verified means traceable reviewer/rule evidence; it is not platform human approval"
        audit_identity = {"kind": "recomputed_trace_ir_audit", "ok": True}
    elif kind == "legacy-native":
        require(manifest.get("source_format") == "legacy-native", "legacy_native_manifest_required")
        legacy = load_module("kev_legacy_native", SKILLS / "kev-trace-pipeline/scripts/legacy_native.py")
        audit = legacy.audit_directory(root)
        require(audit.get("ok") is True, "legacy_native_audit_failed: " + json.dumps(audit.get("errors", []), ensure_ascii=False))
        for partition in PARTITIONS:
            require(manifest.get("files", {}).get(partition, {}).get("sha256") == files[partition]["sha256"],
                    "legacy_native_file_changed: " + partition)
        review_scope = "legacy native records retain original origins; per-question review is an explicit claim, not DSH provenance or platform human approval"
        audit_identity = {"kind": "recomputed_legacy_native_audit", "ok": True,
                          "source_sha256": audit.get("source_sha256"), "reviews_sha256": audit.get("reviews_sha256")}
    elif kind == "platform-v2":
        require(manifest.get("source_format") == "platform-decision-dataset-v2", "platform_bridge_manifest_required")
        report_path = root / "platform-bridge-report.json"
        report = read_json(report_path)
        require(report.get("schema_version") == "kev-platform-bridge-report/v1" and report.get("status") == "ready"
                and report.get("ok") is True and report.get("blocked") is False and report.get("errors") == [],
                "platform_bridge_not_ready")
        for partition in PARTITIONS:
            require(manifest.get("files", {}).get(partition, {}).get("sha256") == files[partition]["sha256"],
                    "platform_bridge_file_changed: " + partition)
            reported = report.get("files", {}).get(partition, {})
            require(reported.get("sha256") == files[partition]["sha256"] and reported.get("records") == files[partition]["records"],
                    "platform_bridge_report_mismatch: " + partition)
            require(all(r["_meta"].get("group_id") == r["_meta"].get("bridge_group_id") for r in rows[partition]),
                    "native_calibration_group_must_use_connected_component: " + partition)
        review_scope = "platform reviewed exports; original model suggestion and uncertainty provenance retained"
        audit_identity = {"kind": "platform_bridge", "path": str(report_path.resolve()), "sha256": digest(report_path)}
    else:
        raise ValueError("dataset.kind must be trace-ir, platform-v2 or legacy-native")
    return {"kind": kind, "directory": str(root.resolve()), "files": files,
            "manifest": {"path": str(manifest_path.resolve()), "sha256": digest(manifest_path)},
            "audit": audit_identity, "review_scope": review_scope}


def checkpoint_contract(request):
    init = text(request.get("init_from"), "checkpoint.init_from")
    require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*@[0-9a-f]{40}", init),
            "checkpoint_requires_owner_repo_and_exact_hub_revision")
    config_path = absolute(request.get("training_config_path"), "checkpoint.training_config_path")
    expected = request.get("training_config_sha256")
    require(isinstance(expected, str) and HEX64.fullmatch(expected) and digest(config_path) == expected,
            "checkpoint_training_config_hash_mismatch")
    config = read_json(config_path)
    args = config.get("args", {})
    require(type(args.get("full_ft", 0)) in (int, bool) and args.get("full_ft", 0) == 0,
            "full_weight_checkpoint_not_supported_by_lora_recipe")
    revision = config.get("base_revision") or args.get("base_revision")
    require(isinstance(revision, str) and HEX40.fullmatch(revision), "base_revision_must_be_pinned")
    require(not args.get("base_revision") or args["base_revision"] == revision, "base_revision_conflict")
    result = {"init_from": init, "base": text(args.get("base"), "checkpoint base"), "base_revision": revision,
              "metadata_path": config_path, "metadata_sha256": expected}
    for key in ("lora", "head_dim"):
        require(type(args.get(key)) is int and args[key] > 0, key + " requires positive checkpoint metadata (LoRA recipe only)")
        result[key] = args[key]
    for key in ("option_isolation", "special_embeddings"):
        require(type(args.get(key)) in (int, bool) and args[key] in (0, 1), key + " missing from checkpoint metadata")
        result[key] = int(args[key])
    require(args.get("lora_targets") in ("all", "dense", "attn", "qv"), "invalid_checkpoint_lora_targets")
    require(args.get("weights_dtype") in ("fp32", "bf16"), "invalid_checkpoint_weights_dtype")
    result.update({key: args[key] for key in ("lora_targets", "weights_dtype")})
    if request.get("local_snapshot") is not None:
        result["local_snapshot"] = local_snapshot_binding(request["local_snapshot"])
        verify_checkpoint_source(result)
    result["metadata_identity"] = "caller must obtain this file from the pinned init checkpoint; hash checks integrity, not publisher authenticity"
    return result


def local_snapshot_binding(value):
    require(isinstance(value, dict) and set(value) == {"path", "repository_metadata_path", "repository_metadata_sha256"},
            "invalid_local_snapshot_binding")
    expected = value["repository_metadata_sha256"]
    require(isinstance(expected, str) and HEX64.fullmatch(expected), "invalid_local_snapshot_metadata_hash")
    return {"path": absolute(value["path"], "checkpoint.local_snapshot.path"),
            "repository_metadata_path": absolute(value["repository_metadata_path"], "checkpoint.local_snapshot.repository_metadata_path"),
            "repository_metadata_sha256": expected}


def execution_init_from(checkpoint):
    local = checkpoint.get("local_snapshot")
    return local["path"] if local is not None else checkpoint["init_from"]


def verify_checkpoint_source(checkpoint):
    """将固定 Hub 身份与实际读取目录绑定；只校验所提供来源，不认证发布者。"""
    init = checkpoint["init_from"]
    identity = {"init_from": init, "execution_init_from": execution_init_from(checkpoint)}
    if checkpoint.get("local_snapshot") is None:
        return identity
    local = local_snapshot_binding(checkpoint["local_snapshot"])
    require(local == checkpoint["local_snapshot"], "local_snapshot_path_changed")
    root, metadata_path = Path(local["path"]), Path(local["repository_metadata_path"])
    require(root.is_dir(), "local_snapshot_directory_unavailable")
    try:
        require(digest(metadata_path) == local["repository_metadata_sha256"], "local_snapshot_repository_metadata_changed")
        metadata = read_json(metadata_path)
        repository, separator, revision = init.partition("@")
        require(separator and HEX40.fullmatch(revision) and isinstance(metadata, dict)
                and metadata.get("id") == repository and metadata.get("sha") == revision,
                "local_snapshot_source_identity_mismatch")
        entries = metadata.get("siblings")
        require(isinstance(entries, list) and entries, "local_snapshot_repository_files_missing")
        names = set()
        for entry in entries:
            require(isinstance(entry, dict), "invalid_local_snapshot_repository_file")
            name = entry.get("rfilename")
            require(isinstance(name, str) and name and "\\" not in name
                    and not any(char in name for char in "\r\n\x00")
                    and not PurePosixPath(name).is_absolute() and all(part not in ("", ".", "..") for part in name.split("/"))
                    and name not in names, "invalid_local_snapshot_repository_file")
            names.add(name)
            path = root / name
            require(path.is_file(), "local_snapshot_file_missing: " + name)
            size = path.stat().st_size
            require(type(entry.get("size")) is int and entry["size"] == size, "local_snapshot_file_size_mismatch: " + name)
            lfs = entry.get("lfs")
            expected = lfs.get("sha256") if isinstance(lfs, dict) else entry.get("blobId")
            require(isinstance(expected, str) and (HEX64 if isinstance(lfs, dict) else HEX40).fullmatch(expected),
                    "invalid_local_snapshot_file_hash: " + name)
            hasher = hashlib.sha256() if isinstance(lfs, dict) else hashlib.sha1()
            if not isinstance(lfs, dict):
                hasher.update(("blob " + str(size) + "\0").encode())
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    hasher.update(chunk)
            require(hasher.hexdigest() == expected, "local_snapshot_file_hash_mismatch: " + name)
        require({"adapter_model.safetensors", "head.pt", "adapter_config.json", "training_config.json"} <= names,
                "local_snapshot_checkpoint_incomplete")
        require(digest(root / "training_config.json") == checkpoint["metadata_sha256"]
                and digest(checkpoint["metadata_path"]) == checkpoint["metadata_sha256"],
                "local_snapshot_training_config_mismatch")
        require(digest(metadata_path) == local["repository_metadata_sha256"], "local_snapshot_repository_metadata_changed")
    except OSError as exc:
        raise ValueError("local_snapshot_files_unavailable") from exc
    return {**identity, "local_snapshot": local, "verified_files": len(names)}


def card(cwd, argv, *, env=None, unset=(), requires=()):
    return {"cwd": cwd, "argv": argv, "env": env or {}, "unset_env": list(unset), "requires": list(requires)}


def execution_environment(value):
    """只承接缓存、已有venv与离线开关，不提供模型或训练语义覆盖。"""
    require(isinstance(value, dict), "environment.env must be a string map")
    result = {}
    for key, item in value.items():
        require(key in EXECUTION_PATHS or key in EXECUTION_SWITCHES, "unsupported_execution_environment_key")
        require(isinstance(item, str), "environment.env values must be strings")
        if key in EXECUTION_PATHS:
            result[key] = absolute(item, "environment.env." + key)
        else:
            require(item in EXECUTION_SWITCHES[key], "invalid_execution_environment_switch: " + key)
            result[key] = item
    return result


def recipe_dtype(recipe):
    require(isinstance(recipe, str) and recipe in RECIPE_DTYPES, "unsupported_training_recipe")
    return RECIPE_DTYPES[recipe]


def execution_prefix(execution_env):
    """显式使用所选任务venv的uv，不依赖远端登录PATH。"""
    venv = execution_env.get("UV_PROJECT_ENVIRONMENT")
    return [str(Path(venv) / "bin" / "uv") if venv else "uv", "run", "python"]


def training_argv(checkpoint, dataset, settings, run_root, execution_env=None):
    """生成唯一训练命令；配方校验复用它，避免参数覆盖改变实际执行。"""
    argv = execution_prefix(execution_env or {}) + ["-m", "kev.train", "--data", dataset["files"]["train"]["path"]]
    for key in ("init_from", "base", "base_revision", "lora", "head_dim", "lora_targets", "option_isolation", "special_embeddings", "weights_dtype"):
        argv += ["--" + key, str(execution_init_from(checkpoint) if key == "init_from" else checkpoint[key])]
    for key in ("epochs", "lr", "batch", "accum", "seed"):
        argv += ["--" + key, str(settings[key])]
    dtype = recipe_dtype(settings.get("recipe", DEFAULT_RECIPE))
    return argv + ["--checkpointing", "1", "--dtype", dtype, "--device", "cuda", "--max_state", "384",
                   "--p_none", "0", "--p_none_distract", "0", "--p_distract", "0", "--p_none_pair", "0",
                   "--out", str(Path(run_root) / "checkpoint")]


def training_recipe(plan):
    """核对配方与训练命令；旧版未命名计划沿用原有 BF16 配方。"""
    settings = plan.get("training")
    require(isinstance(settings, dict), "invalid_training_recipe")
    recipe = settings.get("recipe", DEFAULT_RECIPE)
    dtype = recipe_dtype(recipe)
    checkpoint = plan.get("checkpoint")
    require(dtype != "fp32" or isinstance(checkpoint, dict) and checkpoint.get("weights_dtype") == "fp32",
            "fp32_recipe_requires_fp32_checkpoint_weights")
    commands = plan.get("commands")
    require(isinstance(commands, dict) and isinstance(commands.get("train"), dict), "training_recipe_command_mismatch")
    train = commands["train"]
    argv = train.get("argv")
    try:
        execution_env = execution_environment(plan["environment"].get("env", {}))
        expected = training_argv(checkpoint, plan["dataset"], settings, plan["environment"]["run_root"], execution_env)
    except (KeyError, TypeError) as exc:
        raise ValueError("training_recipe_command_mismatch") from exc
    # argparse 接受 --option=value、缩写及末项覆盖；只接受生成器的完整规范参数。
    require(isinstance(argv, list) and argv == expected, "training_recipe_command_mismatch")
    requirements = train.get("requires")
    require(isinstance(requirements, list) and "CUDA/" + dtype + "/VRAM-checked" in requirements,
            "training_recipe_requirement_mismatch")
    return recipe


def build_plan(request, request_path):
    reject_credentials(request)
    require(request.get("schema_version") == "kev-training-request/v1", "unsupported_request_version")
    require(request.get("intent") == "prepare_training", "plan_only_or_other_intent_cannot_prepare_executable_training")
    vendor = verify_vendor()
    source = request.get("source", {})
    for key in ("agent_id", "parent_experiment_id"):
        text(source.get(key), "source." + key)
    require(re.fullmatch(r"git:[0-9a-f]{40}", source.get("parent_ref", "")), "fixed_parent_ref_required")
    dataset_request = request.get("dataset", {})
    run_ids = source.get("source_run_ids")
    require(isinstance(run_ids, list) and all(isinstance(v, str) and v.strip() for v in run_ids),
            "real_source_run_ids_required")
    require(bool(run_ids) or dataset_request.get("kind") == "legacy-native", "real_source_run_ids_required")
    dataset = inspect_dataset(absolute(dataset_request.get("directory"), "dataset.directory"), dataset_request.get("kind"))
    checkpoint = checkpoint_contract(request.get("checkpoint", {}))
    environment = request.get("environment", {})
    require(isinstance(environment, dict), "invalid_training_environment")
    execution_env = execution_environment(environment.get("env", {}))
    kev_root = absolute(environment.get("kev_root"), "environment.kev_root")
    run_root = absolute(environment.get("run_root"), "environment.run_root")
    require(":" not in run_root, "native_calibration_path_cannot_contain_colon")
    require(not Path(run_root).exists(), "run_root_already_exists_choose_new_run")
    credential_ref = environment.get("credential_ref")
    if credential_ref is not None:
        require(isinstance(credential_ref, str) and re.fullmatch(r"ref:[A-Za-z0-9][A-Za-z0-9._/-]{0,119}", credential_ref), "invalid_credential_reference")
    settings = {"recipe": DEFAULT_RECIPE, "epochs": 1, "lr": 2e-5, "batch": 1, "accum": 8, "seed": 0, "calibration_folds": 5,
                "calibration_policy": "report_only"}
    supplied = request.get("training", {})
    require(isinstance(supplied, dict) and not (set(supplied) - set(settings)), "unsupported_training_option")
    settings.update(supplied)
    dtype = recipe_dtype(settings["recipe"])
    for key in ("epochs", "batch", "accum", "calibration_folds"):
        require(type(settings[key]) is int and settings[key] > 0, "invalid_training_" + key)
    require(settings["calibration_folds"] >= 2 and settings["calibration_folds"] <= dataset["files"]["calibration"]["groups"],
            "calibration_folds_exceed_independent_groups")
    require(type(settings["seed"]) is int and settings["seed"] >= 0, "invalid_seed")
    require(type(settings["lr"]) in (int, float) and math.isfinite(settings["lr"]) and 0 < settings["lr"] < 1, "invalid_learning_rate")
    require(settings["calibration_policy"] in ("report_only", "workload_heldout"), "invalid_calibration_policy")
    run = Path(run_root)
    prefix = execution_prefix(execution_env)
    argv = training_argv(checkpoint, dataset, settings, run_root, execution_env)
    commands = {"train": card(kev_root, argv, requires=["encoding-ready", "actual-executor-authorized", "CUDA/" + dtype + "/VRAM-checked"])}
    for partition, name in (("calibration", "calibration-raw"), ("development", "development-raw")):
        commands[name] = card(kev_root, prefix + ["-m", "kev.benchmark", "--run", str(run / "checkpoint"),
                             "--data", dataset["files"][partition]["path"], "--device", "cuda", "--out", str(run / name)],
                             env={"KEV_TEMPERATURE": "1.0", "KEV_DTYPE": "fp32", "KEV_LORA_SCALE": "1", "KEV_BACKEND": "torch"},
                             unset=PREDICTOR_UNSET, requires=["checkpoint-complete", "zero-unexpected-rejected-records"])
    commands["calibration-report"] = card(kev_root, prefix + ["-m", "kev.calibrate", "--rows", str(run / "calibration-raw/rows.json"),
                    "--out", str(run / "calibration-report.json"), "--folds", str(settings["calibration_folds"]), "--seed", str(settings["seed"])],
                    requires=["calibration-raw-complete", "report-only-does-not-write-checkpoint-temperature"])
    if settings["calibration_policy"] == "workload_heldout":
        commands["calibration-write"] = card(kev_root, prefix + ["scripts/calibrate_checkpoint.py", "--run", str(run / "checkpoint"),
                    "--rows", str(run / "calibration-raw/rows.json"), "--folds", str(settings["calibration_folds"]),
                    "--seed", str(settings["seed"]), "--allow-in-distribution"],
                    requires=["reviewed-workload-calibration-policy", "calibration-only-raw-rows", "all-split-hashes-still-match", "record-native-in_distribution-reasons"])
        commands["development-calibrated"] = card(kev_root, prefix + ["-m", "kev.benchmark", "--run", str(run / "checkpoint"),
                    "--data", dataset["files"]["development"]["path"], "--device", "cuda", "--out", str(run / "development-calibrated")],
                    env={"KEV_DTYPE": "fp32", "KEV_LORA_SCALE": "1", "KEV_BACKEND": "torch"},
                    unset=["KEV_TEMPERATURE", *PREDICTOR_UNSET], requires=["calibration-write-complete"])
    commands["final-test"] = card(kev_root, prefix + ["-m", "kev.benchmark", "--run", str(run / "checkpoint"),
                    "--data", dataset["files"]["test"]["path"], "--device", "cuda", "--out", str(run / "final-test")],
                    env={"KEV_DTYPE": "fp32", "KEV_LORA_SCALE": "1", "KEV_BACKEND": "torch"},
                    unset=["KEV_TEMPERATURE", *PREDICTOR_UNSET], requires=["independent-final-acceptance-authorized", "checkpoint-temperature-threshold-builders-frozen"])
    for command in commands.values():
        command["env"] = {**execution_env, **command["env"]}
    plan = {"schema_version": "kev-training-plan/v1", "status": "prepared", "request_sha256": digest(request_path),
            "kev_commit": KEV_COMMIT, "vendor": vendor, "source": source, "dataset": dataset, "checkpoint": checkpoint,
            "environment": {"kev_root": kev_root, "run_root": run_root, "server_id": environment.get("server_id"), "credential_ref": credential_ref,
                            **({"env": execution_env} if "env" in environment else {})},
            "training": settings, "context_limits": LIMITS, "augmentation": {"p_none": 0, "p_none_distract": 0, "p_distract": 0, "p_none_pair": 0, "choice_shuffle": True},
            "commands": commands, "execution": {"tokenization": "not_run", "training": "not_run", "calibration": "not_run", "deployment": "not_run", "equivalence": "not_evaluated"},
            "warnings": ["Command cards are not jobs or proof of execution; platform medium-button sessions remain plan-only.",
                         "The " + settings["recipe"] + " recipe requires LoRA and CUDA/" + dtype + "; hardware support and budget need actual executor checks.",
                         "Calibration report does not persist temperature. See references/calibration.md before any checkpoint change.",
                         "Final-test card is reserved for independent acceptance; the external executor must enforce the frozen-checkpoint gate. Raw benchmarks use T=1.",
                         "Model input length, label quality, class coverage and full-Harness equivalence are separate checks."]}
    training_recipe(plan)
    return plan


def authorized_training_card(plan_path, report_path):
    plan, report = read_json(plan_path), read_json(report_path)
    require(plan.get("schema_version") == "kev-training-plan/v1" and plan.get("status") == "prepared", "plan_not_prepared")
    require(report.get("schema_version") == "kev-encoding-report/v1" and report.get("status") == "ready", "encoding_not_ready")
    require(report.get("plan_sha256") == digest(plan_path), "encoding_report_plan_mismatch")
    recipe = training_recipe(plan)
    require(report.get("training_recipe", DEFAULT_RECIPE) == recipe, "encoding_training_recipe_mismatch")
    checkpoint_source = verify_checkpoint_source(plan["checkpoint"])
    if plan["checkpoint"].get("local_snapshot") is not None:
        require(report.get("checkpoint_source") == checkpoint_source, "encoding_checkpoint_source_mismatch")
    require(report.get("kev_commit") == plan["kev_commit"], "encoding_runtime_mismatch")
    require(report.get("base") == plan["checkpoint"]["base"] and report.get("base_revision") == plan["checkpoint"]["base_revision"], "encoding_tokenizer_mismatch")
    required_checks = ("metadata", "native_imports", "tokenizer", "native_loader", "native_materialize",
                       "strict_encoding", "native_fits", "target_mapping", "choice_shuffle", "final_identity_recheck")
    require(report.get("failures") == [] and all(report.get("checks", {}).get(k) == "passed" for k in required_checks),
            "encoding_native_checks_incomplete")
    require(report.get("tokenstats", {}).get("limits") == LIMITS, "encoding_limits_mismatch")
    require(report.get("checked_records") == sum(item["records"] for item in plan["dataset"]["files"].values()),
            "encoding_population_mismatch")
    require(digest(plan["checkpoint"]["metadata_path"]) == plan["checkpoint"]["metadata_sha256"], "checkpoint_metadata_changed_after_encoding")
    require(digest(plan["dataset"]["manifest"]["path"]) == plan["dataset"]["manifest"]["sha256"], "split_manifest_changed_after_encoding")
    if plan["dataset"].get("kind") == "legacy-native":
        encoding = load_module("kev_encoding_identity", Path(__file__).with_name("check_encoding.py"))
        try:
            identity = encoding.check_legacy_identity(plan["dataset"])
        except encoding.CheckFailure as error:
            raise ValueError(error.failure["code"] + ": " + error.failure["detail"]) from error
        require(report.get("legacy_review_identity") == identity, "encoding_legacy_review_identity_mismatch")
    for partition, item in plan["dataset"]["files"].items():
        require(digest(item["path"]) == item["sha256"], "dataset_changed_after_encoding: " + partition)
        checked = report.get("files", {}).get(partition, {})
        require(checked.get("sha256") == item["sha256"] and checked.get("records") == item["records"],
                "encoding_file_identity_mismatch: " + partition)
        require(report.get("tokenstats", {}).get("partitions", {}).get(partition, {}).get("checked_records") == item["records"],
                "encoding_partition_not_fully_checked: " + partition)
    result = plan["commands"]["train"]
    return {"status": "encoding_ready_execution_not_started", "training_recipe": recipe, "checkpoint_source": checkpoint_source, "command": result,
            "shell_display": "cd " + shlex.quote(result["cwd"]) + " && " + shlex.join(result["argv"]),
            "remaining": ["Verify executor authorization and actual CUDA/" + recipe_dtype(recipe) + "/VRAM/budget", "Capture actual job id, logs and checkpoint receipt"]}


def main(argv=None):
    parser = argparse.ArgumentParser(description="准备可复现的 KEV 训练方案；不启动训练或连接服务器。")
    sub = parser.add_subparsers(dest="action", required=True)
    prepare = sub.add_parser("prepare"); prepare.add_argument("--request", required=True); prepare.add_argument("--out", required=True)
    commands = sub.add_parser("commands"); commands.add_argument("--plan", required=True); commands.add_argument("--encoding-report", required=True)
    for command in (prepare, commands):
        command.add_argument("--json", action="store_true", help="以 JSON 返回程序回执；文件中的训练数据不受影响")
    args = parser.parse_args(argv)
    human = reporting()
    if args.action == "commands":
        try:
            result = authorized_training_card(args.plan, args.encoding_report)
        except (ValueError, KeyError, TypeError, OSError) as exc:
            if args.json:
                print(json.dumps({"status": "blocked", "training": "not_run", "reason": str(exc)}, ensure_ascii=False))
            else:
                human.print_summary("training-commands", "blocked", "计划、编码报告或数据身份未通过核对，尚未启动训练。",
                                    next_step="按诊断修正材料，再重新核对同一批数据。", diagnostics=[str(exc)])
            return 2
        if args.json:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            human.print_summary("training-commands", "requires_review", "编码结果和文件身份已核对，" + result["training_recipe"] + " 训练命令已准备；尚未执行。",
                                next_step="在实际训练环境核对执行授权、显存、时间和费用，再由执行器运行并保存日志。")
            print("\n模型来源：" + result["checkpoint_source"]["init_from"] + "\n执行位置：" + result["checkpoint_source"]["execution_init_from"])
            print("\n训练命令（执行目录与参数保持原样）：\n" + result["shell_display"])
        return 0
    out = Path(args.out).resolve()
    require(not out.exists(), "output_directory_already_exists")
    out.mkdir(parents=True)
    try:
        plan = build_plan(read_json(args.request), args.request)
    except (ValueError, KeyError, TypeError, OSError) as exc:
        report = {"stage": "prepare-training", "status": "blocked", "reason_codes": [str(exc)], "next_allowed_stage": None}
        write_json(out / "stage-status.json", report)
        human.emit_result(out, "prepare-training", "blocked", "训练方案未生成，尚未启动训练。",
                          ["invalid_input"], "按排查明细修正数据或模型信息后，使用新目录重新准备。",
                          [("程序状态", "stage-status.json")], json_output=args.json, machine_result=report,
                          diagnostics=[str(exc)])
        return 2
    write_json(out / "training-plan.json", plan)
    write_json(out / "stage-status.json", {"stage": "prepare-training", "status": "requires_review", "reason_codes": ["encoding_not_run", "executor_not_started"], "next_allowed_stage": "encoding-review"})
    checkpoint_source = {"init_from": plan["checkpoint"]["init_from"], "execution_init_from": execution_init_from(plan["checkpoint"])}
    result = {"out": str(out), "status": "prepared", "training_recipe": plan["training"]["recipe"], "checkpoint_source": checkpoint_source, "training": "not_run", "next": "check_encoding.py"}
    counts = plan["dataset"]["files"]
    names = {"train": "训练", "development": "开发", "calibration": "校准", "test": "最终测试"}
    detail = "配方 " + plan["training"]["recipe"] + "。" + "；".join(f"{names[key]}集 {counts[key]['records']} 条、{counts[key]['groups']} 个来源组" for key in PARTITIONS) + "。"
    source_detail = "模型来源：" + checkpoint_source["init_from"] + "；执行位置：" + checkpoint_source["execution_init_from"] + "。"
    human.emit_result(out, "prepare-training", "requires_review", ["训练方案已保存，尚未启动训练。", detail, source_detail],
                      ["encoding_not_run", "executor_not_started"], "在同一训练环境使用所选模型的分词器检查这四份文件。",
                      [("训练方案及逐阶段命令", "training-plan.json"), ("程序状态", "stage-status.json")],
                      json_output=args.json, machine_result=result,
                      limitations=["格式、复核记录和分组检查不证明标签语义、类别覆盖或完整任务效果。"])
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, TypeError, OSError) as exc:
        print("训练准备未完成：" + str(exc), file=sys.stderr)
        raise SystemExit(1)
