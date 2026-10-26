"""Real local CLI handoff on synthetic legacy records; no GPU or user data."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

import test_training_plan as training_fixtures
import training_plan as planner
import check_encoding as encoding

CORE = Path(__file__).resolve().parents[3] / "kev-trace-pipeline/scripts"
sys.path.insert(0, str(CORE))
sys.path.insert(0, str(CORE / "tests"))
import legacy_native
from test_legacy_native import record, verified_reviews, write_rows


class LegacyTrainingHandoffTests(unittest.TestCase):
    def setUp(self):
        # Reuse the synthetic pinned-checkpoint/request fixture, not its test cases.
        self.fixture = training_fixtures.TrainingPlanTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.request = self.fixture.request
        self.request_path = self.fixture.request_path

    def prepare_legacy(self):
        source = self.root / "legacy-source.jsonl"
        reviews = self.root / "legacy-reviews.jsonl"
        rows = [record(i) for i in range(24)]
        write_rows(source, rows)
        write_rows(reviews, verified_reviews(source, rows))
        output = self.root / "legacy-data"
        completed = subprocess.run([sys.executable, str(CORE / "legacy_native.py"), "build",
                                    "--input", str(source), "--reviews", str(reviews), "--out", str(output),
                                    "--fractions", "0.25,0.25,0.25,0.25"], capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertTrue(legacy_native.audit_directory(output)["ok"])
        self.request["dataset"] = {"kind": "legacy-native", "directory": str(output)}
        self.request["source"]["source_run_ids"] = []
        self.request_path.write_text(json.dumps(self.request), encoding="utf-8")
        return output

    def invoke_plan(self, name):
        planner = Path(__file__).resolve().parents[1] / "training_plan.py"
        return subprocess.run([sys.executable, str(planner), "prepare", "--request", str(self.request_path),
                               "--out", str(self.root / name), "--json"], capture_output=True, text=True)

    def test_legacy_cli_to_training_plan_retains_real_origin_without_run_fabrication(self):
        data = self.prepare_legacy()
        result = self.invoke_plan("legacy-plan")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        plan = json.loads((self.root / "legacy-plan/training-plan.json").read_text())
        self.assertEqual(plan["dataset"]["kind"], "legacy-native")
        self.assertEqual(plan["source"]["source_run_ids"], [])
        self.assertEqual(plan["execution"]["training"], "not_run")
        argv = plan["commands"]["train"]["argv"]
        self.assertEqual(argv[argv.index("--data") + 1], str(data / "train.jsonl"))
        self.assertIn("尚未启动训练", (self.root / "legacy-plan/report.md").read_text())

    def test_changed_legacy_review_snapshot_blocks_training_preparation(self):
        data = self.prepare_legacy()
        snapshot = data / "reviews.jsonl"
        snapshot.write_text(snapshot.read_text() + "\n", encoding="utf-8")
        result = self.invoke_plan("changed-plan")
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "blocked")
        self.assertFalse((self.root / "changed-plan/training-plan.json").exists())

    def test_review_snapshot_stays_bound_after_prepare_and_encoding(self):
        data = self.prepare_legacy()
        result = self.invoke_plan("legacy-plan")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        plan_path = self.root / "legacy-plan/training-plan.json"
        plan = planner.read_json(plan_path)
        # Synthetic receipt tests command release only, not native tokenization.
        report = {"schema_version": "kev-encoding-report/v1", "status": "ready",
                  "plan_sha256": planner.digest(plan_path), "kev_commit": plan["kev_commit"],
                  "base": plan["checkpoint"]["base"], "base_revision": plan["checkpoint"]["base_revision"],
                  "failures": [], "checks": {name: "passed" for name in (
                      "metadata", "native_imports", "tokenizer", "native_loader", "native_materialize",
                      "strict_encoding", "native_fits", "target_mapping", "choice_shuffle", "final_identity_recheck")},
                  "checked_records": sum(x["records"] for x in plan["dataset"]["files"].values()),
                  "files": plan["dataset"]["files"],
                  "tokenstats": {"limits": dict(planner.LIMITS), "partitions": {
                      name: {"checked_records": x["records"]} for name, x in plan["dataset"]["files"].items()}}}
        report_path = self.root / "synthetic-encoding.json"
        planner.write_json(report_path, report)
        with self.assertRaisesRegex(ValueError, "encoding_legacy_review_identity_mismatch"):
            planner.authorized_training_card(plan_path, report_path)
        report["legacy_review_identity"] = encoding.check_legacy_identity(plan["dataset"])
        planner.write_json(report_path, report)
        self.assertEqual(planner.authorized_training_card(plan_path, report_path)["status"],
                         "encoding_ready_execution_not_started")
        snapshot = data / "reviews.jsonl"
        reviews = [json.loads(line) for line in snapshot.read_text().splitlines() if line.strip()]
        first_question = next(iter(reviews[0]["questions"].values()))
        first_question["status"] = "invalid"
        write_rows(snapshot, reviews)
        self.assertFalse(legacy_native.audit_directory(data)["ok"])
        with self.assertRaisesRegex(ValueError, "legacy_snapshot_changed"):
            planner.authorized_training_card(plan_path, report_path)


if __name__ == "__main__":
    unittest.main()
