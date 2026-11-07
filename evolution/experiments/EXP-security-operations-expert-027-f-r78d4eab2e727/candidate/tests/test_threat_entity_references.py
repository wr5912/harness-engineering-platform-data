"""合成组件回归；不访问SOC或模型服务，不能替代真实业务复验。"""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1] / "dsh/managed/threat-analysis"
sys.path.insert(0, str(ROOT))
from entity_references import normalize_entity_references
from forced_output_contract import _require_structured_target, validate_forced_output
from model_inference import run_inference


def fixture():
    source = {"unified_event_id": "INC-TEST", "data_completeness": 1,
        "event_snapshot": {"judgement_target": {"claim_type": "test"}, "entities": [
            {"entity_ref": "E1", "entity_type": "asset", "ip": "192.0.2.1", "entity_display": "主机甲（192.0.2.1）"},
            {"entity_ref": "E2", "entity_type": "user", "name": "用户乙", "entity_display": "用户乙"},
            {"entity_ref": "E10", "entity_type": "ip", "ip": "192.0.2.10", "entity_display": "192.0.2.10"}]},
        "enriched_context": {"graph": {"observations": ["E1 原始证据"]}}}
    output = {"unified_event_id": "INC-TEST", "verdict": "误报", "confidence_score": 0.8,
        "primary_claim": {"type": "test", "result": "证据不足"}, "secondary_findings": None,
        "attack_stage": None, "technique": None, "technique_name": None,
        "verified_facts": [{"id": "F01", "fact": "观察到实体 E1 的活动", "source": "graph"}],
        "key_claims": [{"claim": "观察到实体 E1 的活动", "result": "支持", "weight": 0.5,
            "evidence": [{"source": "graph", "field": "observations[0]", "value": "E1 原始证据"}]}],
        "counter_evidence": [], "uncertainty_notes": None,
        "attack_chain_speculation": {"current_stage": None, "observed_path": [], "possible_next_steps": [], "supporting_evidence": []},
        "rule_optimization_suggestions": [], "recommended_actions": [],
        "reasoning_summary": "仅观察到实体 E1 的活动，未观察到恶意结果。"}
    return source, output


class EntityReferenceTest(unittest.TestCase):
    def test_explicit_references_boundaries_and_evidence_preservation(self):
        source, output = fixture()
        output["verified_facts"][0]["fact"] = "涉及实体 E1、E2、E10，XE1、E1_x保持原值"
        raw = deepcopy(output)
        normalized, audit = normalize_entity_references(output, source)
        self.assertEqual(normalized["verified_facts"][0]["fact"], "涉及实体 主机甲（192.0.2.1）、用户乙、192.0.2.10，XE1、E1_x保持原值")
        self.assertEqual(output, raw)
        self.assertEqual(normalized["key_claims"][0]["evidence"], raw["key_claims"][0]["evidence"])
        self.assertEqual(normalized["verified_facts"][0]["id"], "F01")
        self.assertEqual(audit["status"], "normalized")
        self.assertEqual(validate_forced_output(normalized, source), [])
        repeated, audit = normalize_entity_references(normalized, source)
        self.assertEqual(repeated, normalized)
        self.assertEqual(audit["status"], "unchanged")

    def test_unknown_duplicate_and_unreadable_references_fail(self):
        for mode in ("unknown", "display_conflict", "identity_conflict", "plural_conflict", "identical_duplicate", "unreadable", "missing_display"):
            with self.subTest(mode=mode):
                source, output = fixture()
                entity = source["event_snapshot"]["entities"][0]
                if mode == "unknown":
                    output["reasoning_summary"] = "实体 E99 的活动"
                elif mode in ("display_conflict", "identity_conflict", "plural_conflict", "identical_duplicate"):
                    duplicate = deepcopy(entity)
                    if mode == "display_conflict":
                        duplicate["entity_display"] = "不同显示名"
                    elif mode == "identity_conflict":
                        duplicate["ip"] = "192.0.2.99"
                    elif mode == "plural_conflict":
                        entity["hostnames"], duplicate["hostnames"] = ["a", "b"], ["a", "c"]
                    source["event_snapshot"]["entities"].append(duplicate)
                else:
                    entity["entity_display"] = "E2" if mode == "unreadable" else None
                with self.assertRaisesRegex(ValueError, "entity reference"):
                    normalize_entity_references(output, source)

    def test_literals_and_nonexplicit_mentions_are_never_rewritten(self):
        cases = ("观察到命令 `echo E1`", "观察到文件 /tmp/E1.log", "涉及实体 E1，命令是 echo E1",
                 "涉及实体 E1.log", "规则 ID 为 E1", "实体 E1 的原始标识是 E2", "观察到 E1 的活动",
                 "实体 E1 的说明是‘实体 E2’", "实体 E1 的路径为 C:\\Temp\\E1.log")
        for text in cases:
            with self.subTest(text=text):
                source, output = fixture()
                output["verified_facts"][0]["fact"] = text
                raw = deepcopy(output)
                with self.assertRaisesRegex(ValueError, "entity reference or native literal"):
                    normalize_entity_references(output, source)
                self.assertEqual(output, raw)

    def test_machine_targets_and_rule_identifiers_are_not_repaired(self):
        source, output = fixture()
        output["recommended_actions"] = [{"action": "核查实体 E1", "reason": "实体 E1 存在活动", "priority": "P2", "target": {"ip": "E1"}}]
        output["rule_optimization_suggestions"] = [{"rule": {"id": "E1", "name": "E1"}, "suggestion": "核对实体 E1 的证据"}]
        normalized, _ = normalize_entity_references(output, source)
        self.assertEqual(normalized["recommended_actions"][0]["target"], {"ip": "E1"})
        self.assertEqual(normalized["rule_optimization_suggestions"][0]["rule"], {"id": "E1", "name": "E1"})
        with self.assertRaisesRegex(ValueError, "bare internal entity"):
            _require_structured_target(normalized["recommended_actions"][0]["target"], "target")

    def test_unresolved_evidence_still_fails_full_validation(self):
        source, output = fixture()
        output["key_claims"][0]["evidence"][0]["field"] = "missing[0]"
        normalized, _ = normalize_entity_references(output, source)
        with self.assertRaisesRegex(ValueError, "reference does not resolve"):
            validate_forced_output(normalized, source)

    def test_inference_freezes_raw_and_requires_full_validation(self):
        for reject in (False, True):
            with self.subTest(reject=reject), tempfile.TemporaryDirectory() as directory:
                source, output = fixture()
                if reject:
                    output["key_claims"][0]["evidence"][0]["field"] = "missing[0]"
                response = {"model": "component-test", "choices": [{"message": {"content": json.dumps(output, ensure_ascii=False)}}]}
                calls = []
                def transport(*args):
                    calls.append(args)
                    return response
                args = dict(five_source=source, system_prompt="组件测试", base_url="http://model.invalid", model="component-test", api_key=None, output_dir=Path(directory), transport=transport)
                if reject:
                    with self.assertRaisesRegex(ValueError, "reference does not resolve"):
                        run_inference(**args)
                else:
                    self.assertNotEqual(run_inference(**args)["verified_facts"], output["verified_facts"])
                root = Path(directory)
                self.assertEqual(len(calls), 1)
                self.assertEqual(json.loads((root / "raw-response.json").read_text()), response)
                self.assertEqual(json.loads((root / "model-analysis-output.json").read_text()), output)
                self.assertEqual((root / "forced-analysis-output.json").exists(), not reject)
                self.assertEqual(json.loads((root / "validation.json").read_text())["status"], "failed" if reject else "passed")
                with self.assertRaises(FileExistsError):
                    run_inference(**args)
                self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
