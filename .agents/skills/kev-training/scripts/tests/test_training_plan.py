"""Synthetic handoff invariants. No user data, credentials, network or training."""
from copy import deepcopy
import argparse
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1]
SKILLS = SCRIPTS.parents[1]
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SKILLS / "kev-trace-pipeline/scripts"))
sys.path.insert(0, str(SKILLS / "kev-trace-pipeline/scripts/tests"))
import training_plan as planner
from dataset import split_records
from test_dataset import compile_ok, example
from snapshot_fixture import make_snapshot


class TrainingPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / "data"; self.data.mkdir()
        partitions, manifest = split_records(compile_ok([example(i) for i in range(24)]),
                {"train": .25, "development": .25, "calibration": .25, "test": .25})
        self.assertEqual(manifest["status"], "ready")
        planner.write_json(self.data / "split-manifest.json", manifest)
        for split, rows in partitions.items():
            (self.data / (split + ".jsonl")).write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
        self.config = self.root / "training_config.json"
        planner.write_json(self.config, {"base_revision": "b" * 40, "args": {
            "base": "synthetic/base", "base_revision": "b" * 40, "lora": 16, "head_dim": 256,
            "option_isolation": 0, "special_embeddings": 0, "lora_targets": "all", "weights_dtype": "fp32", "full_ft": 0}})
        self.request = {"schema_version": "kev-training-request/v1", "intent": "prepare_training",
            "source": {"agent_id": "synthetic-agent", "parent_experiment_id": "synthetic-exp", "parent_ref": "git:" + "a" * 40, "source_run_ids": ["synthetic-run"]},
            "dataset": {"directory": str(self.data), "kind": "trace-ir"},
            "checkpoint": {"init_from": "synthetic/checkpoint@" + "c" * 40, "training_config_path": str(self.config), "training_config_sha256": planner.digest(self.config)},
            "environment": {"kev_root": str(self.root / "kev"), "run_root": str(self.root / "job"), "server_id": "synthetic-server", "credential_ref": "ref:synthetic/key"},
            "training": {"calibration_folds": 2}}
        self.request_path = self.root / "request.json"
        planner.write_json(self.request_path, self.request)

    def build(self):
        planner.write_json(self.request_path, self.request)
        return planner.build_plan(self.request, self.request_path)

    def test_recipe_uses_only_train_without_changing_candidates(self):
        plan = self.build(); args = plan["commands"]["train"]["argv"]
        self.assertEqual(args[args.index("--data") + 1], str(self.data / "train.jsonl"))
        for option in ("p_none", "p_none_distract", "p_distract", "p_none_pair"):
            self.assertEqual(args[args.index("--" + option) + 1], "0")
        self.assertNotIn("--suite", args); self.assertNotIn("--replay", args)
        self.assertEqual(plan["execution"]["training"], "not_run")
        self.assertFalse((self.root / "job").exists())

    def test_default_recipe_remains_cuda_bf16_lora(self):
        plan = self.build()
        train = plan["commands"]["train"]
        self.assertEqual(plan["training"]["recipe"], "cuda-bf16-lora")
        self.assertEqual(train["argv"][train["argv"].index("--dtype") + 1], "bf16")
        self.assertIn("CUDA/bf16/VRAM-checked", train["requires"])
        # Older plans did not carry a recipe name; their BF16 command stays valid.
        del plan["training"]["recipe"]
        self.assertEqual(planner.training_recipe(plan), "cuda-bf16-lora")

    def test_explicit_fp32_recipe_preserves_lora_budgets_and_augmentation(self):
        self.request["training"]["recipe"] = "cuda-fp32-lora"
        plan = self.build()
        train = plan["commands"]["train"]
        args = train["argv"]
        self.assertEqual(planner.training_recipe(plan), "cuda-fp32-lora")
        for option, expected in (("dtype", "fp32"), ("weights_dtype", "fp32"), ("device", "cuda"),
                                 ("epochs", "1"), ("lr", "2e-05"), ("batch", "1"), ("accum", "8"),
                                 ("checkpointing", "1"), ("max_state", "384")):
            self.assertEqual(args[args.index("--" + option) + 1], expected)
        self.assertIn("CUDA/fp32/VRAM-checked", train["requires"])
        self.assertNotIn("CUDA/bf16/VRAM-checked", train["requires"])
        self.assertEqual(plan["context_limits"], {"max_state": 384, "max_branch": 1024, "max_packed": 2048})
        self.assertEqual(plan["augmentation"], {"p_none": 0, "p_none_distract": 0, "p_distract": 0,
                                               "p_none_pair": 0, "choice_shuffle": True})
        self.assertTrue(any("cuda-fp32-lora" in warning and "CUDA/fp32" in warning for warning in plan["warnings"]))
        self.assertNotIn("--full_ft", args)
        self.assertEqual(plan["execution"]["training"], "not_run")

    def test_fp32_recipe_cannot_retain_bf16_backbone_weights(self):
        config = planner.read_json(self.config)
        config["args"]["weights_dtype"] = "bf16"
        planner.write_json(self.config, config)
        self.request["checkpoint"]["training_config_sha256"] = planner.digest(self.config)
        self.assertEqual(self.build()["checkpoint"]["weights_dtype"], "bf16")
        self.request["training"]["recipe"] = "cuda-fp32-lora"
        with self.assertRaisesRegex(ValueError, "fp32_recipe_requires_fp32_checkpoint_weights"):
            self.build()

    def test_recipe_rejects_argparse_overrides_and_noncanonical_options(self):
        self.request["training"]["recipe"] = "cuda-fp32-lora"
        plan = self.build()
        # 实际 argparse 会让末项覆盖前面的规范选项，包括等号形式和缩写。
        parser = argparse.ArgumentParser()
        parser.add_argument("--dtype")
        parser.add_argument("--device")
        parser.add_argument("--weights_dtype")
        for override, field, actual in ((["--dtype=bf16"], "dtype", "bf16"),
                                         (["--dty", "bf16"], "dtype", "bf16"),
                                         (["--weights_dtype=bf16"], "weights_dtype", "bf16"),
                                         (["--device=cpu"], "device", "cpu")):
            with self.subTest(override=override):
                changed = deepcopy(plan)
                changed["commands"]["train"]["argv"] += override
                parsed, _ = parser.parse_known_args(changed["commands"]["train"]["argv"][5:])
                self.assertEqual(getattr(parsed, field), actual)
                with self.assertRaisesRegex(ValueError, "training_recipe_command_mismatch"):
                    planner.training_recipe(changed)
        for override in (["--dtype", "fp32"], ["--dtype=fp32"], ["--max_state=8192"],
                         ["--init_from=other/checkpoint"], ["--checkpointing", "0"], ["--full_ft", "1"], ["--"]):
            with self.subTest(override=override):
                changed = deepcopy(plan)
                changed["commands"]["train"]["argv"] += override
                with self.assertRaisesRegex(ValueError, "training_recipe_command_mismatch"):
                    planner.training_recipe(changed)

    def test_unsupported_recipe_and_independent_dtype_are_rejected(self):
        for recipe in ("cuda-fp16-lora", "cpu-fp32-lora", None, []):
            with self.subTest(recipe=recipe):
                self.request["training"]["recipe"] = recipe
                with self.assertRaisesRegex(ValueError, "unsupported_training_recipe"):
                    self.build()
        self.request["training"] = {"dtype": "fp32"}
        with self.assertRaisesRegex(ValueError, "unsupported_training_option"):
            self.build()

    def test_plan_only_cannot_be_promoted_to_training_preparation(self):
        self.request["intent"] = "plan_only"
        with self.assertRaisesRegex(ValueError, "plan_only"):
            self.build()

    def test_trace_sources_cannot_be_replaced_with_empty_run_ids(self):
        self.request["source"]["source_run_ids"] = []
        with self.assertRaisesRegex(ValueError, "real_source_run_ids_required"):
            self.build()

    def test_prepare_cli_is_readable_and_preserves_machine_plan(self):
        output = self.root / "prepared-human"
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            result = planner.main(["prepare", "--request", str(self.request_path), "--out", str(output)])
        self.assertEqual(result, 0)
        self.assertIn("训练方案已保存，尚未启动训练", stdout.getvalue())
        self.assertNotIn('"schema_version"', stdout.getvalue())
        self.assertIn("训练集", (output / "report.md").read_text())
        self.assertIn("cuda-bf16-lora", (output / "report.md").read_text())
        self.assertEqual(planner.read_json(output / "training-plan.json")["execution"]["training"], "not_run")
        machine_output = self.root / "prepared-json"
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            result = planner.main(["prepare", "--request", str(self.request_path), "--out", str(machine_output), "--json"])
        self.assertEqual(result, 0)
        self.assertEqual(json.loads(stdout.getvalue())["training"], "not_run")
        self.assertTrue((machine_output / "report.md").is_file())

    def test_fp32_prepare_reports_the_selected_recipe(self):
        self.request["training"]["recipe"] = "cuda-fp32-lora"
        planner.write_json(self.request_path, self.request)
        out = self.root / "prepared-fp32"
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = planner.main(["prepare", "--request", str(self.request_path), "--out", str(out), "--json"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(stdout.getvalue())["training_recipe"], "cuda-fp32-lora")
        self.assertIn("cuda-fp32-lora", (out / "report.md").read_text())


    def test_missing_encoding_report_is_a_readable_failure(self):
        plan = self.build(); pp = self.root / "plan.json"
        planner.write_json(pp, plan)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = planner.main(["commands", "--plan", str(pp), "--encoding-report", str(self.root / "absent.json")])
        self.assertEqual(code, 2)
        self.assertIn("当前不能继续", stdout.getvalue())
        self.assertIn("尚未启动训练", stdout.getvalue())

    def test_reviewed_metadata_does_not_hide_split_overlap(self):
        path = self.data / "test.jsonl"
        rows = [json.loads(s) for s in path.read_text().splitlines()]
        train = json.loads((self.data / "train.jsonl").read_text().splitlines()[0])
        rows[0]["_meta"]["group_id"] = train["_meta"]["group_id"]
        path.write_text("".join(json.dumps(r) + "\n" for r in rows))
        with self.assertRaisesRegex(ValueError, "cross_partition_group"):
            self.build()

    def test_different_json_with_same_native_input_cannot_cross_partitions(self):
        native = planner.load_module("synthetic_native_identity", SKILLS / "kev-trace-pipeline/scripts/native_input.py")
        train = json.loads((self.data / "train.jsonl").read_text().splitlines()[0])
        path = self.data / "test.jsonl"
        rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        rows[0]["state"] = native.render(train["state"])
        rows[0]["questions"] = deepcopy(train["questions"])
        path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "cross_partition_identical_rendered_input"):
            self.build()

    def test_stale_checkpoint_metadata_is_blocked(self):
        self.config.write_text(self.config.read_text() + " ")
        with self.assertRaisesRegex(ValueError, "hash_mismatch"):
            self.build()

    def test_full_weight_checkpoint_cannot_enter_lora_recipe(self):
        config = planner.read_json(self.config); config["args"]["full_ft"] = 1
        planner.write_json(self.config, config)
        self.request["checkpoint"]["training_config_sha256"] = planner.digest(self.config)
        with self.assertRaisesRegex(ValueError, "full_weight"):
            self.build()

    def test_checkpoint_revision_requires_real_hub_shape(self):
        self.request["checkpoint"]["init_from"] = "unresolvable@" + "c" * 40
        with self.assertRaisesRegex(ValueError, "owner_repo"):
            self.build()

    def local_request(self):
        binding = make_snapshot(self.root, self.config, self.request["checkpoint"]["init_from"])
        self.request["checkpoint"]["local_snapshot"] = binding
        return binding

    def test_local_snapshot_preserves_hub_identity_and_binds_native_execution_path(self):
        binding = self.local_request()
        plan = self.build()
        checkpoint = plan["checkpoint"]
        self.assertEqual(checkpoint["init_from"], self.request["checkpoint"]["init_from"])
        self.assertEqual(checkpoint["local_snapshot"], binding)
        self.assertNotIn("files", checkpoint["local_snapshot"], "逐文件清单只来自固定的仓库元数据引用")
        argv = plan["commands"]["train"]["argv"]
        self.assertEqual(argv[argv.index("--init_from") + 1], binding["path"])
        self.assertEqual(planner.verify_checkpoint_source(checkpoint), {
            "init_from": checkpoint["init_from"], "execution_init_from": binding["path"],
            "local_snapshot": binding, "verified_files": 4})
        argv[argv.index("--init_from") + 1] = checkpoint["init_from"]
        with self.assertRaisesRegex(ValueError, "training_recipe_command_mismatch"):
            planner.training_recipe(plan)

    def test_local_snapshot_prepare_report_names_identity_and_actual_path(self):
        binding = self.local_request()
        planner.write_json(self.request_path, self.request)
        out, stdout = self.root / "local-plan", io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = planner.main(["prepare", "--request", str(self.request_path), "--out", str(out), "--json"])
        self.assertEqual(code, 0)
        result = json.loads(stdout.getvalue())
        self.assertEqual(result["checkpoint_source"]["init_from"], self.request["checkpoint"]["init_from"])
        self.assertEqual(result["checkpoint_source"]["execution_init_from"], binding["path"])
        report = (out / "report.md").read_text()
        self.assertIn(self.request["checkpoint"]["init_from"], report)
        self.assertIn(binding["path"], report)

    def test_local_snapshot_rejects_missing_weights_and_changed_bytes(self):
        binding = self.local_request()
        path = Path(binding["path"]) / "adapter_model.safetensors"
        original = path.read_bytes()
        path.write_bytes(original[:-1] + b"!")
        with self.assertRaisesRegex(ValueError, "local_snapshot_file_hash_mismatch"):
            self.build()
        path.unlink()
        with self.assertRaisesRegex(ValueError, "local_snapshot_file_missing"):
            self.build()

    def test_local_snapshot_repository_id_and_revision_must_match_fixed_source(self):
        binding = self.local_request()
        path = Path(binding["repository_metadata_path"])
        original = planner.read_json(path)
        for changed in ({"id": "other/checkpoint"}, {"sha": "d" * 40}):
            with self.subTest(changed=changed):
                planner.write_json(path, {**original, **changed})
                binding["repository_metadata_sha256"] = planner.digest(path)
                with self.assertRaisesRegex(ValueError, "local_snapshot_source_identity_mismatch"):
                    self.build()

    def test_local_snapshot_metadata_and_training_config_are_both_bound(self):
        binding = self.local_request()
        path = Path(binding["repository_metadata_path"])
        path.write_text(path.read_text() + "\n")
        with self.assertRaisesRegex(ValueError, "local_snapshot_repository_metadata_changed"):
            self.build()
        binding["repository_metadata_sha256"] = planner.digest(path)
        # 另一份独立 metadata 即便自己摘要正确，也不能替代快照中的 training_config。
        config = planner.read_json(self.config)
        config["args"]["head_dim"] = 128
        planner.write_json(self.config, config)
        self.request["checkpoint"]["training_config_sha256"] = planner.digest(self.config)
        with self.assertRaisesRegex(ValueError, "local_snapshot_training_config_mismatch"):
            self.build()

    def test_local_snapshot_requires_complete_fixed_repository_metadata(self):
        binding = self.local_request()
        path = Path(binding["repository_metadata_path"])
        metadata = planner.read_json(path)
        metadata["siblings"] = [row for row in metadata["siblings"] if row["rfilename"] != "head.pt"]
        planner.write_json(path, metadata)
        binding["repository_metadata_sha256"] = planner.digest(path)
        with self.assertRaisesRegex(ValueError, "local_snapshot_checkpoint_incomplete"):
            self.build()

    def test_local_snapshot_command_release_rechecks_files_and_encoding_source_identity(self):
        binding = self.local_request()
        plan = self.build()
        pp, rp = self.root / "plan.json", self.root / "encoding.json"
        planner.write_json(pp, plan)
        report = {"schema_version": "kev-encoding-report/v1", "status": "ready", "plan_sha256": planner.digest(pp),
                  "training_recipe": plan["training"]["recipe"], "kev_commit": plan["kev_commit"],
                  "base": plan["checkpoint"]["base"], "base_revision": plan["checkpoint"]["base_revision"],
                  "failures": [], "checks": {name: "passed" for name in ("metadata", "native_imports", "tokenizer", "native_loader", "native_materialize",
                      "strict_encoding", "native_fits", "target_mapping", "choice_shuffle", "final_identity_recheck")},
                  "checked_records": sum(x["records"] for x in plan["dataset"]["files"].values()), "files": deepcopy(plan["dataset"]["files"]),
                  "tokenstats": {"limits": dict(planner.LIMITS), "partitions": {name: {"checked_records": x["records"]} for name, x in plan["dataset"]["files"].items()}}}
        planner.write_json(rp, report)
        with self.assertRaisesRegex(ValueError, "encoding_checkpoint_source_mismatch"):
            planner.authorized_training_card(pp, rp)
        report["checkpoint_source"] = planner.verify_checkpoint_source(plan["checkpoint"])
        planner.write_json(rp, report)
        released = planner.authorized_training_card(pp, rp)
        self.assertEqual(released["checkpoint_source"]["init_from"], plan["checkpoint"]["init_from"])
        self.assertEqual(released["checkpoint_source"]["execution_init_from"], binding["path"])
        weights = Path(binding["path"]) / "head.pt"
        raw = weights.read_bytes(); weights.write_bytes(raw[:-1] + b"!")
        with self.assertRaisesRegex(ValueError, "local_snapshot_file_hash_mismatch"):
            planner.authorized_training_card(pp, rp)

    def test_calibration_report_does_not_claim_persisted_temperature(self):
        plan = self.build()
        self.assertNotIn("calibration-write", plan["commands"])
        self.assertIn("report-only-does-not-write-checkpoint-temperature", plan["commands"]["calibration-report"]["requires"])
        self.request["training"]["calibration_policy"] = "workload_heldout"
        plan = self.build()
        self.assertIn("--allow-in-distribution", plan["commands"]["calibration-write"]["argv"])
        self.assertIn("calibration-raw/rows.json", " ".join(plan["commands"]["calibration-write"]["argv"]))
        self.assertNotIn(str(self.data / "test.jsonl"), plan["commands"]["calibration-write"]["argv"])

    def test_final_test_is_separate_and_predictor_environment_is_fixed(self):
        plan = self.build()
        final = plan["commands"]["final-test"]
        self.assertIn("independent-final-acceptance-authorized", final["requires"])
        self.assertIn("KEV_TEMPERATURE", final["unset_env"])
        self.assertEqual(final["env"]["KEV_LORA_SCALE"], "1")
        self.assertEqual(final["env"]["KEV_BACKEND"], "torch")
        self.assertIn("KEV_MERGE", final["unset_env"])

    def test_explicit_execution_environment_reaches_every_phase_without_changing_recipe(self):
        self.request["training"].update(recipe="cuda-fp32-lora", calibration_policy="workload_heldout")
        previous = self.build()
        environment = {"HF_HUB_CACHE": str(self.root / "hub"), "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
                       "USE_HUB_KERNELS": "NO", "UV_PROJECT_ENVIRONMENT": str(self.root / "venv"), "UV_NO_SYNC": "1"}
        self.request["environment"]["env"] = environment
        plan = self.build()
        self.assertEqual(plan["environment"]["env"], environment)
        self.assertNotIn("env", previous["environment"])
        self.assertEqual(len(plan["commands"]), 7)
        for name, command in plan["commands"].items():
            with self.subTest(phase=name):
                self.assertEqual(command["env"], {**environment, **previous["commands"][name]["env"]})
                self.assertEqual(command["argv"], [str(self.root / "venv/bin/uv"), *previous["commands"][name]["argv"][1:]])
                for key in ("cwd", "unset_env", "requires"):
                    self.assertEqual(command[key], previous["commands"][name][key])
        self.assertEqual(planner.training_recipe(plan), "cuda-fp32-lora")
        self.assertEqual(plan["context_limits"], previous["context_limits"])
        self.assertEqual(plan["checkpoint"], previous["checkpoint"])
        self.assertEqual(plan["augmentation"], previous["augmentation"])
        plan["commands"]["train"]["env"]["HF_HUB_OFFLINE"] = "0"
        self.assertEqual(plan["commands"]["calibration-raw"]["env"]["HF_HUB_OFFLINE"], "1")
        self.assertEqual(self.request["environment"]["env"], environment)

    def test_phase_environment_takes_precedence_and_does_not_drop_unsets(self):
        self.request["environment"]["env"] = {"HF_HUB_OFFLINE": "1"}
        baseline = self.build()
        original = planner.card

        def phase_card(cwd, argv, **kwargs):
            result = original(cwd, argv, **kwargs)
            # 阶段给定同名环境时必须优先，不能被共享执行环境反向覆盖。
            if "kev.benchmark" in argv:
                result["env"]["HF_HUB_OFFLINE"] = "0"
            return result

        with patch.object(planner, "card", side_effect=phase_card):
            plan = self.build()
        self.assertEqual(plan["commands"]["train"]["env"]["HF_HUB_OFFLINE"], "1")
        for name in ("calibration-raw", "development-raw", "final-test"):
            self.assertEqual(plan["commands"][name]["env"]["HF_HUB_OFFLINE"], "0")
            self.assertEqual(plan["commands"][name]["unset_env"], baseline["commands"][name]["unset_env"])
        self.assertIn("KEV_TEMPERATURE", plan["commands"]["final-test"]["unset_env"])
        self.assertEqual(plan["commands"]["final-test"]["env"]["KEV_DTYPE"], "fp32")

    def test_execution_environment_rejects_invalid_types_paths_switches_and_semantic_overrides(self):
        for environment in (None, [], "offline", {"HF_HUB_OFFLINE": True}, {"HF_HUB_OFFLINE": "true"},
                            {"USE_HUB_KERNELS": "UNIT_PRIVATE_VALUE"}, {"HF_HUB_CACHE": "relative/cache"},
                            {"UV_PROJECT_ENVIRONMENT": "/venv\nUNIT_PRIVATE_VALUE"},
                            {"KEV_DTYPE": "bf16"}, {"KEV_BASE_REVISION": "d" * 40}, {"KEV_MAX_STATE": "8192"},
                            {"HOME": "/other-home"}, {"PATH": "/other-bin"}, {"UV_ENV_FILE": "/credentials"}):
            with self.subTest(environment=environment):
                self.request["environment"]["env"] = environment
                with self.assertRaises(ValueError) as caught:
                    self.build()
                self.assertNotIn("UNIT_PRIVATE_VALUE", str(caught.exception))

    def test_secret_environment_is_rejected_without_copying_values_to_cli_reports(self):
        private = "UNIT_ONLY_PRIVATE_VALUE"
        for key in ("HF_TOKEN", "OPENAI_API_KEY", "SSH_PASSWORD", "API_KEY", "TOKEN"):
            with self.subTest(key=key):
                self.request["environment"]["env"] = {key: private}
                planner.write_json(self.request_path, self.request)
                output = self.root / ("blocked-" + key)
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout):
                    result = planner.main(["prepare", "--request", str(self.request_path), "--out", str(output), "--json"])
                self.assertEqual(result, 2)
                self.assertFalse((output / "training-plan.json").exists())
                self.assertNotIn(private, stdout.getvalue())
                for file in output.iterdir():
                    self.assertNotIn(private, file.read_text())

    def test_changed_execution_environment_requires_a_new_encoding_report(self):
        self.request["environment"]["env"] = {"UV_NO_SYNC": "1"}
        plan = self.build(); pp = self.root / "plan.json"; rp = self.root / "encoding.json"
        planner.write_json(pp, plan)
        planner.write_json(rp, {"schema_version": "kev-encoding-report/v1", "status": "ready", "plan_sha256": planner.digest(pp)})
        plan["environment"]["env"]["UV_NO_SYNC"] = "0"
        plan["commands"]["train"]["env"]["UV_NO_SYNC"] = "0"
        planner.write_json(pp, plan)
        with self.assertRaisesRegex(ValueError, "encoding_report_plan_mismatch"):
            planner.authorized_training_card(pp, rp)

    def test_encoding_report_must_bind_the_exact_plan_and_files(self):
        plan = self.build(); pp = self.root / "plan.json"; rp = self.root / "encoding.json"
        planner.write_json(pp, plan)
        report = {"schema_version": "kev-encoding-report/v1", "status": "ready", "plan_sha256": "d" * 64,
                  "kev_commit": plan["kev_commit"], "base": plan["checkpoint"]["base"], "base_revision": plan["checkpoint"]["base_revision"]}
        planner.write_json(rp, report)
        with self.assertRaisesRegex(ValueError, "plan_mismatch"):
            planner.authorized_training_card(pp, rp)
        report["plan_sha256"] = planner.digest(pp); planner.write_json(rp, report)
        with self.assertRaisesRegex(ValueError, "native_checks_incomplete"):
            planner.authorized_training_card(pp, rp)
        # A complete synthetic receipt exercises only the command-release gate,
        # never asserts that native tokenization actually ran in this unit test.
        report.update(failures=[], checks={name: "passed" for name in ("metadata", "native_imports", "tokenizer", "native_loader", "native_materialize",
                      "strict_encoding", "native_fits", "target_mapping", "choice_shuffle", "final_identity_recheck")},
                      checked_records=sum(x["records"] for x in plan["dataset"]["files"].values()), files=deepcopy(plan["dataset"]["files"]),
                      tokenstats={"limits": dict(planner.LIMITS), "partitions": {name: {"checked_records": x["records"]} for name, x in plan["dataset"]["files"].items()}})
        planner.write_json(rp, report)
        self.assertEqual(planner.authorized_training_card(pp, rp)["status"], "encoding_ready_execution_not_started")
        p = self.data / "train.jsonl"; p.write_text(p.read_text() + "\n")
        with self.assertRaisesRegex(ValueError, "changed_after_encoding"):
            planner.authorized_training_card(pp, rp)

    def test_credentials_are_not_plan_fields(self):
        self.request["environment"]["password"] = "synthetic-non-secret"
        with self.assertRaisesRegex(ValueError, "credentials"):
            self.build()

    def test_fp32_command_release_requires_the_same_encoding_recipe(self):
        self.request["training"]["recipe"] = "cuda-fp32-lora"
        self.request["environment"]["env"] = {"HF_HUB_OFFLINE": "1", "UV_NO_SYNC": "1", "UV_PROJECT_ENVIRONMENT": str(self.root / "venv")}
        plan = self.build(); pp = self.root / "plan.json"; rp = self.root / "encoding.json"
        planner.write_json(pp, plan)
        report = {"schema_version": "kev-encoding-report/v1", "status": "ready", "plan_sha256": planner.digest(pp),
                  "kev_commit": plan["kev_commit"], "base": plan["checkpoint"]["base"], "base_revision": plan["checkpoint"]["base_revision"],
                  "failures": [], "checks": {name: "passed" for name in ("metadata", "native_imports", "tokenizer", "native_loader", "native_materialize",
                      "strict_encoding", "native_fits", "target_mapping", "choice_shuffle", "final_identity_recheck")},
                  "checked_records": sum(x["records"] for x in plan["dataset"]["files"].values()), "files": deepcopy(plan["dataset"]["files"]),
                  "tokenstats": {"limits": dict(planner.LIMITS), "partitions": {name: {"checked_records": x["records"]} for name, x in plan["dataset"]["files"].items()}}}
        for recipe in (None, "cuda-bf16-lora"):
            with self.subTest(encoding_recipe=recipe):
                if recipe is not None:
                    report["training_recipe"] = recipe
                planner.write_json(rp, report)
                with self.assertRaisesRegex(ValueError, "encoding_training_recipe_mismatch"):
                    planner.authorized_training_card(pp, rp)
        report["training_recipe"] = "cuda-fp32-lora"
        planner.write_json(rp, report)
        result = planner.authorized_training_card(pp, rp)
        self.assertEqual(result["training_recipe"], "cuda-fp32-lora")
        self.assertEqual(result["command"]["env"], self.request["environment"]["env"])
        self.assertIn("CUDA/fp32/VRAM/budget", result["remaining"][0])
        plan["commands"]["train"]["argv"][plan["commands"]["train"]["argv"].index("--dtype") + 1] = "bf16"
        planner.write_json(pp, plan)
        with self.assertRaisesRegex(ValueError, "encoding_report_plan_mismatch"):
            planner.authorized_training_card(pp, rp)

    def test_selected_venv_binds_uv_for_all_stage_cards_without_path_override(self):
        venv = str(self.root / "task venv")
        self.request["environment"]["env"] = {"UV_PROJECT_ENVIRONMENT": venv, "UV_NO_SYNC": "1"}
        plan = self.build()
        for name, command in plan["commands"].items():
            with self.subTest(stage=name):
                self.assertEqual(command["argv"][:3], [str(Path(venv) / "bin/uv"), "run", "python"])
                self.assertNotIn("PATH", command["env"])
        self.assertEqual(planner.training_recipe(plan), plan["training"]["recipe"])
        plan["commands"]["train"]["argv"][0] = "uv"
        with self.assertRaisesRegex(ValueError, "training_recipe_command_mismatch"):
            planner.training_recipe(plan)

    def test_no_selected_venv_preserves_native_uv_resolution(self):
        plan = self.build()
        self.assertTrue(all(command["argv"][:3] == ["uv", "run", "python"] for command in plan["commands"].values()))

    def test_fold_count_uses_independent_groups(self):
        self.request["training"]["calibration_folds"] = 100
        with self.assertRaisesRegex(ValueError, "independent_groups"):
            self.build()


if __name__ == "__main__":
    unittest.main()
