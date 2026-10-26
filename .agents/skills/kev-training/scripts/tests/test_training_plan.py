"""Synthetic handoff invariants. No user data, credentials, network or training."""
from copy import deepcopy
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
SKILLS = SCRIPTS.parents[1]
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(SKILLS / "kev-trace-pipeline/scripts"))
sys.path.insert(0, str(SKILLS / "kev-trace-pipeline/scripts/tests"))
import training_plan as planner
from dataset import split_records
from test_dataset import compile_ok, example


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
        self.assertEqual(planner.read_json(output / "training-plan.json")["execution"]["training"], "not_run")
        machine_output = self.root / "prepared-json"
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            result = planner.main(["prepare", "--request", str(self.request_path), "--out", str(machine_output), "--json"])
        self.assertEqual(result, 0)
        self.assertEqual(json.loads(stdout.getvalue())["training"], "not_run")
        self.assertTrue((machine_output / "report.md").is_file())

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

    def test_fold_count_uses_independent_groups(self):
        self.request["training"]["calibration_folds"] = 100
        with self.assertRaisesRegex(ValueError, "independent_groups"):
            self.build()


if __name__ == "__main__":
    unittest.main()
