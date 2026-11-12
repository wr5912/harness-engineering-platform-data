from __future__ import annotations

import json
import hashlib
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


ROOT = Path(__file__).resolve().parents[1] / "dsh/managed/threat-analysis"
sys.path.insert(0, str(ROOT))

from mcp_gateway import FIXED_RUNTIME_TOOLS, McpGateway  # noqa: E402
from model_inference import extract_json_output  # noqa: E402
from forced_output_contract import _is_primary_scoped_behavior, _is_stable_relation_evidence, _require_observed_target, _require_structured_target, _resolve_path, _validate_evidence_reference  # noqa: E402
from result_delivery import build_delivery, failure_markdown, priority_pill  # noqa: E402
from result_storage import SocJudgementClient, SocWriteError, build_writeback, persist  # noqa: E402
import dsh_runner  # noqa: E402
from incident_scope import build_forward_slices, derive_effective_time_range  # noqa: E402


class ThreatAnalysisAutomationTest(unittest.TestCase):
    def test_single_timestamp_alert_and_incident_produce_queryable_window(self) -> None:
        point = "2026-11-05T03:56:52.707000Z"
        expected = [point, "2026-11-05T03:56:52.708000Z"]
        incident = {"firstSeenTime": point, "lastSeenTime": point}
        for alerts in ([], [{"event_time": point}], [{"event_time": point}] * 2):
            with self.subTest(alerts=alerts):
                window = derive_effective_time_range(incident, alerts)
                self.assertEqual(window, expected)
                self.assertEqual(build_forward_slices(*window), [tuple(expected)])
        wider = [point, "2026-11-05T03:57:52.707000Z"]
        self.assertEqual(derive_effective_time_range(incident, [{"event_time": x} for x in wider]), wider)
        for start, end in ((point, point), (wider[1], point), ("invalid", point)):
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                build_forward_slices(start, end)

    def test_compat_delivery_preserves_failed_evidence_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            fusion = Path(directory) / 'fusion'
            fusion.mkdir()
            (fusion / 'manifest.json').write_text(json.dumps({'route': 'five_source'}))
            (fusion / 'five-source-output.json').write_text('{}')

            def rejected_inference(**kwargs):
                output = kwargs['output_dir']
                output.mkdir()
                (output / 'validation.json').write_text(json.dumps({
                    'status': 'failed', 'error_type': 'ValueError',
                    'error': 'claim evidence reference does not resolve: graph.missing',
                }))
                (output / 'model-analysis-output.json').write_text(json.dumps({'verdict': '误报'}))
                raise ValueError('unresolved evidence')

            client = MagicMock()
            client.claim.return_value = {'judgementId': 'judge-validation'}
            client.write.return_value = {'status': 'saved'}
            with patch.object(dsh_runner, 'build_gateway'), \
                    patch.object(dsh_runner, 'SocJudgementClient', return_value=client), \
                    patch.object(dsh_runner.evidence_collection, 'run', return_value=fusion), \
                    patch.object(dsh_runner, 'run_inference', side_effect=rejected_inference), \
                    patch.object(dsh_runner, '_attach_rule_stage'), \
                    patch.object(dsh_runner, '_finish_completed') as finish:
                run = dsh_runner._analyze('INC-20261105-000004', directory,
                                          {'analysisModel': {'baseURL': 'http://model.invalid', 'model': 'test'}})
            self.assertEqual(run['status'], 'completed')
            self.assertEqual(run['result'], {'verdict': '误报'})
            self.assertEqual(run['validation']['status'], 'failed')
            self.assertIn('graph.missing', run['validation']['error'])
            finish.assert_called_once()
            client.write.assert_not_called()

    def test_evidence_array_paths_resolve_both_model_notations(self) -> None:
        payload = {"enriched_context": {"edr_detail": {"entities": [
            {"activity_segments": [{"processes": [{"cmdline": "first"}, {"cmdline": "observed"}]}]}
        ]}}}
        for field in ("entities.0.activity_segments.0.processes.1.cmdline",
                      "entities[0].activity_segments[0].processes[1].cmdline"):
            warnings = []
            evidence = {"source": "edr_detail", "field": field, "value": "observed"}
            self.assertEqual(_validate_evidence_reference(evidence, payload, "claim evidence", warnings), "observed")
            self.assertEqual(warnings, [])
        for field in ("entities.-1", "entities.1", "entities.zero", "entities.0.missing",
                      "entities.0.activity_segments.0.processes.1.cmdline.0"):
            with self.subTest(field=field), self.assertRaises(ValueError):
                _validate_evidence_reference({"source": "edr_detail", "field": field, "value": "invented"},
                                             payload, "claim evidence", [])
        self.assertEqual(_resolve_path({"0": "mapping key"}, "0"), "mapping key")
        with self.assertRaises(KeyError):
            _resolve_path({"0": "mapping key"}, "[0]")

    def test_evidence_scope_and_relation_accept_both_array_notations(self) -> None:
        payload = {"event_snapshot": {"judgement_target": {"primary_entity": {"asset_id": "A-1"}}, "entities": []},
                   "enriched_context": {"graph": {"path_hints": [{"relation": "connection", "basis": "observed"}]},
                       "edr_detail": {"entities": [{"asset_id": "A-1", "activity_segments": [
                           {"scope": "linked", "relation_basis": "observed", "processes": [{"cmdline": "observed"}]}
                       ]}]}}}
        for prefix in ("entities[0].activity_segments[0]", "entities.0.activity_segments.0",
                       "entities[0].activity_segments.0"):
            with self.subTest(prefix=prefix):
                evidence = {"source": "edr_detail", "field": prefix + ".processes.0.cmdline", "value": "observed"}
                _validate_evidence_reference(evidence, payload, "evidence", [])
                self.assertTrue(_is_primary_scoped_behavior(evidence, payload))
                self.assertTrue(_is_stable_relation_evidence(
                    {"source": "edr_detail", "field": prefix + ".relation_basis"}, payload))
        for field in ("path_hints[0].relation", "path_hints.0.relation"):
            self.assertTrue(_is_stable_relation_evidence({"source": "graph", "field": field}, payload))
        payload["enriched_context"]["edr_detail"]["entities"][0]["activity_segments"][0]["scope"] = "unrelated"
        self.assertFalse(_is_primary_scoped_behavior(evidence, payload))
        self.assertFalse(_is_stable_relation_evidence({"source": "graph", "field": "path_hints.1.relation"}, payload))

    def test_unknown_action_priority_is_not_rendered_as_p3(self) -> None:
        for value in ("P0", None):
            with self.subTest(value=value):
                pill = priority_pill(value)
                self.assertIn('class="priority unknown"', pill)
                self.assertNotIn('class="priority p3"', pill)

    def test_structured_action_target_and_report_keep_source_identity(self) -> None:
        target = {"host_name": "web<script>", "ip": "203.0.113.10", "port": 443, "asset_id": "A-10"}
        _require_structured_target(target, "recommended_actions[0].target")
        for invalid in ("203.0.113.10", {"host_name": "web"}, {"ip": "203.0.113.10", "host_name": "E1"},
                        {"ip": "203.0.113.10", "port": 0},
                        {"ip": "203.0.113.10", "port": True}, {"ip": "203.0.113.10", "unknown": "x"}):
            with self.subTest(target=invalid), self.assertRaises(ValueError):
                _require_structured_target(invalid, "recommended_actions[0].target")
        run = {
            "status": "completed", "route": "full_analysis", "incident_id": "INC-20261021-000001",
            "run_id": "run-11111111-1111-4111-8111-111111111111", "llm_invoked": True,
            "validation": {"status": "passed"}, "result": {
                "verdict": "可疑", "confidence_score": 0.62,
                "primary_claim": {"type": "可疑连接", "result": "证据不足"},
                "secondary_findings": None, "reasoning_summary": "观察到连接，尚无执行结果。",
                "verified_facts": [{"id": "F01", "fact": "连接到目标端点", "source": "graph"}],
                "key_claims": [{"claim": "发生连接", "result": "支持", "weight": 0.5,
                                "evidence": [{"source": "graph", "field": "connections[0]", "value": {"dst": "203.0.113.10"}}]}],
                "counter_evidence": [], "attack_chain_speculation": {
                    "observed_path": [{"description": "连接到端点", "fact_refs": ["F01"]}],
                    "possible_next_steps": [], "supporting_evidence": ["F01"]},
                "recommended_actions": [{"action": "核验连接", "target": target, "priority": "P2",
                                         "reason": "观察到连接，需核验其用途。"}],
                "rule_optimization_suggestions": [],
            },
        }
        delivery = build_delivery(run, analyzed_at="2026-10-21T03:04:05+00:00")
        report = delivery["report_html"]
        self.assertIn("2026-10-21 03:04:05 UTC", report)
        self.assertIn("203.0.113.10:443", report)
        self.assertIn("证据引用 1", report)
        self.assertIn("攻击链依据 · F01", report)
        self.assertIn("连接到目标端点", report)
        self.assertIn("尚未执行任何处置", report)
        self.assertIn(run["run_id"], report)
        self.assertNotIn("<script>", report)
        self.assertEqual(target, delivery["summary"]["recommended_actions"][0]["target"])
        self.assertEqual(target, build_writeback(run, report)["resultJson"]["result"]["recommended_actions"][0]["target"])
        run['validation']['status'] = 'failed'
        self.assertEqual(build_delivery(run)['summary']['validation']['status'], 'failed')

    def test_action_target_must_identify_one_observed_endpoint_and_its_port(self) -> None:
        five_source = {"event_snapshot": {"entities": [
            {"entity_type": "asset", "asset_id": "A-10", "aliases": [
                {"type": "ip", "value": "203.0.113.10"}, {"type": "hostname", "value": "web-a"}]},
            {"entity_type": "asset", "asset_id": "A-11", "aliases": [
                {"type": "ip", "value": "203.0.113.11"},
                {"type": "ip", "value": "203.0.113.12"},
                {"type": "hostname", "value": "web-b"}]},
        ]}, "enriched_context": {"graph": {"path_hints": [{
            "src_ip": "203.0.113.10", "dst_ip": "203.0.113.11", "dst_ports": [443]}]},
            "edr_detail": {"assets": [{"activity_segments": [{"network_details": [{
                "source_ip": "203.0.113.10", "source_port": 53123,
                "destination_ip": "203.0.113.11", "destination_port": 443}]}]}]}}}
        field = "recommended_actions[0].target"
        for target in ({"ip": "203.0.113.11", "port": 443},
                       {"asset_id": "A-11", "ip": "203.0.113.11", "host_name": "web-b", "port": 443},
                       {"asset_id": "A-11", "ip": "203.0.113.12", "host_name": "web-b"},
                       {"asset_id": "A-10", "ip": "203.0.113.10", "port": 53123}):
            with self.subTest(valid=target):
                _require_observed_target(target, five_source, field)
        for target in ({"ip": "203.0.113.99"}, {"asset_id": "A-99"},
                       {"asset_id": "A-10", "ip": "203.0.113.11"},
                       {"asset_id": "A-11", "host_name": "web-a"},
                       {"asset_id": "A-11", "ip": "203.0.113.12", "port": 443},
                       {"ip": "203.0.113.10", "port": 443}):
            with self.subTest(invalid=target), self.assertRaisesRegex(ValueError, "observed|same target"):
                _require_observed_target(target, five_source, field)

    def test_cancel_cleanup_does_not_contradict_an_already_started_terminal_write(self) -> None:
        run_id = "run-11111111-1111-4111-8111-111111111111"
        for operation in ("result", "fail"):
            with self.subTest(operation=operation), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / run_id
                output.mkdir()
                dsh_runner.checkpoint(output, {"run_id": run_id, "incident_id": "INC-20261015-000001",
                                               "judgement_id": "judge-basic", "status": "evidence_failed"})
                (output / f"soc-{operation}-request.json").write_text("{}", encoding="utf-8")
                with patch.object(dsh_runner, "build_gateway") as gateway:
                    result = dsh_runner.cleanup(run_id, directory, {})
                    repeated = dsh_runner.cleanup(run_id, directory, {})
                gateway.assert_not_called()
                self.assertEqual("unknown", result["delivery"]["status"])
                self.assertEqual(result, repeated)

    def test_cancel_cleanup_recovers_claim_response_and_reuses_original_identity(self) -> None:
        run_id = "run-11111111-1111-4111-8111-111111111111"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / run_id
            output.mkdir()
            (output / "soc-claim-request.json").write_text(json.dumps({"incidentId": "INC-20261015-000001"}), encoding="utf-8")
            (output / "soc-claim-response.json").write_text(json.dumps({"status": "success", "status_code": 200,
                "result": {"code": 200, "data": {"judgementId": "judge-basic"}}}), encoding="utf-8")
            client = MagicMock()
            client.write.return_value = {"status": "saved"}
            with patch.object(dsh_runner, "build_gateway"), patch.object(dsh_runner, "SocJudgementClient", return_value=client):
                result = dsh_runner.cleanup(run_id, directory, {})
                repeated = dsh_runner.cleanup(run_id, directory, {})
            client.write.assert_called_once()
            self.assertEqual(("fail", "judge-basic"), client.write.call_args.args[:2])
            self.assertEqual(run_id, client.write.call_args.args[2]["runId"])
            self.assertEqual(result, repeated)

    def test_fixed_runtime_contract_contains_pending_tool(self) -> None:
        self.assertIn(
            ("ai_soc_correlate", "ai_soc_correlate__get_correlate_incident_judge_pending"),
            FIXED_RUNTIME_TOOLS,
        )

    def test_gateway_sends_legacy_contract_to_authorized_run_bridge(self) -> None:
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    "status": "success", "status_code": 200,
                    "result": {"data": {"incidentId": "INC-20261010-000001"}},
                }).encode()

        with tempfile.TemporaryDirectory() as directory:
            gateway = McpGateway(
                bridge_url="http://127.0.0.1:3000/run-bridge",
                bridge_key="test-run-key",
                raw_directory=Path(directory),
            )
            with patch("mcp_gateway.urllib.request.urlopen", return_value=Response()) as urlopen:
                result = gateway.invoke(
                    call_id="C000001",
                    resource="ai_soc_correlate",
                    tool_name="ai_soc_correlate__get_correlate_incident_by_incident_id",
                    arguments={"incidentId": "INC-20261010-000001"},
                )

        request = urlopen.call_args.args[0]
        self.assertEqual("http://127.0.0.1:3000/run-bridge/invoke", request.full_url)
        self.assertEqual("Bearer test-run-key", request.get_header("Authorization"))
        self.assertEqual(
            {
                "resource": "ai_soc_correlate",
                "tool": "ai_soc_correlate__get_correlate_incident_by_incident_id",
                "args": {"incidentId": "INC-20261010-000001"},
            },
            json.loads(request.data),
        )
        self.assertEqual("INC-20261010-000001", result.data["incidentId"])

    def test_gateway_keeps_fixed_runtime_gate(self) -> None:
        gateway = McpGateway(
            bridge_url="http://127.0.0.1:3000/run-bridge",
            bridge_key="test-run-key",
            raw_directory=Path("/unused"),
            transport=MagicMock(return_value={
                "status": "success", "status_code": 200, "result": {"data": {}},
            }),
        )
        with self.assertRaises(PermissionError):
            gateway.invoke(
                call_id="C000001",
                resource="ai_soc_correlate",
                tool_name="ai_soc_correlate__create_incident_judgement_claim",
                arguments={"incidentId": "INC-20261010-000001"},
            )
        with self.assertRaises(PermissionError):
            gateway.invoke_trusted(
                resource="ai_soc_correlate",
                tool_name="ai_soc_correlate__get_correlate_threat_intel",
                arguments={},
            )

    def test_pending_uses_first_page_and_bounded_page_size(self) -> None:
        client = SocJudgementClient.__new__(SocJudgementClient)
        expected = {"rows": [{"incidentId": "INC-20261010-000001"}], "total": 1}
        with patch.object(client, "invoke", return_value=expected) as invoke:
            self.assertEqual(expected, client.pending(100))
        invoke.assert_called_once_with(
            "pending", {"pageNum": 1, "pageSize": 100, "previewPriority": False}
        )
        for invalid in (True, 0, 101):
            with self.assertRaises(ValueError):
                client.pending(invalid)

    def test_pending_preserves_soc_error_type_and_status(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(dsh_runner, "build_gateway"), patch.object(
                dsh_runner, "SocJudgementClient"
            ) as client_type:
                client_type.return_value.pending.side_effect = SocWriteError(503, "SOCTransport")
                result = dsh_runner.pending(directory, {})
        self.assertEqual({"type": "SOCTransport", "status_code": 503}, result["error"])

    def test_claim_conflict_preserves_409_for_batch_skip(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            gateway = MagicMock()
            client = SocJudgementClient(gateway, directory)
            response = {
                "status": "error",
                "status_code": 409,
                "result": {"code": "409", "msg": "claim conflict"},
            }
            gateway.invoke_trusted.return_value = response
            with self.assertRaises(SocWriteError) as raised:
                client.claim("INC-20261010-000001")
        self.assertEqual("409", raised.exception.code)
        self.assertEqual("claim conflict", raised.exception.business_message)
        gateway.invoke_trusted.assert_called_once_with(
            resource="ai_soc_correlate",
            tool_name="ai_soc_correlate__create_incident_judgement_claim",
            arguments={"incidentId": "INC-20261010-000001"},
        )

    def test_soc_write_retries_once_with_same_judgement_and_body(self) -> None:
        client = SocJudgementClient.__new__(SocJudgementClient)
        body = {"runId": "run-test"}
        with patch.object(
            client, "invoke", side_effect=[TimeoutError(), {"replayed": True}]
        ) as invoke:
            state = client.write("result", "judgement-test", body)

        self.assertEqual("saved", state["status"])
        self.assertEqual(2, state["attempts"])
        self.assertTrue(state["replayed"])
        self.assertEqual(
            [
                unittest.mock.call(
                    "result", {"judgementId": "judgement-test", "body": body}
                ),
                unittest.mock.call(
                    "result", {"judgementId": "judgement-test", "body": body}
                ),
            ],
            invoke.call_args_list,
        )

    def test_report_uses_local_receipt_and_failure_is_non_blocking(self) -> None:
        run = {'run_id': 'run-11111111-1111-4111-8111-111111111111',
               'incident_id': 'INC-20261010-000001', 'report_revision': 1}
        gateway = MagicMock()
        html = '<html>report</html>'
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / run['run_id']
            (output / 'fusion' / 'raw').mkdir(parents=True)
            gateway.raw_directory = output / 'fusion' / 'raw'
            (output / 'report.html').write_text(html, encoding='utf-8')
            state = persist(run, html, gateway)['report']
            self.assertEqual('saved', state['status'])
            self.assertEqual('local', state['storage'])
            self.assertEqual(run['run_id'], state['id'])
            self.assertEqual(hashlib.sha256(html.encode()).hexdigest(), state['sha256'])
            self.assertNotIn('download_url', state)
            (output / 'report.html').unlink()
            failed = persist(run, html, gateway)['report']
            self.assertEqual('failed', failed['status'])
            self.assertEqual('FileNotFoundError', failed['error_type'])
        gateway.invoke_trusted.assert_not_called()

    def test_claim_409_displays_business_reason_without_inventing_lock(self) -> None:
        run = {"run_id": "run-rejected", "status": "claim_failed", "error_code": 409,
               "business_message": "当前领取名额用于超时保障，请重新获取待研判队首"}
        markdown = failure_markdown(run)
        self.assertIn(run["business_message"], markdown)
        self.assertNotIn("锁未过期", markdown)
        del run["business_message"]
        self.assertIn("409", failure_markdown(run))
        self.assertNotIn("已被认领", failure_markdown(run))

    def test_model_output_accepts_only_raw_json_or_complete_json_fence(self) -> None:
        def response(content: str) -> dict:
            return {"choices": [{"message": {"content": content}}]}

        expected = {"verdict": "可疑"}
        raw = json.dumps(expected, ensure_ascii=False)
        self.assertEqual(expected, extract_json_output(response(raw)))
        self.assertEqual(
            expected, extract_json_output(response(f"```json\n{raw}\n```"))
        )
        for invalid in (f"说明\n```json\n{raw}\n```", f"```JSON\n{raw}\n```"):
            with self.assertRaises(json.JSONDecodeError):
                extract_json_output(response(invalid))

    @unittest.skipUnless(hasattr(dsh_runner.signal, "SIGALRM"), "requires SIGALRM")
    def test_analysis_deadline_still_writes_soc_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            gateway = MagicMock()
            client = MagicMock()
            client.claim.return_value = {"judgementId": "judgement-test"}
            client.write.return_value = {"status": "saved"}
            with (
                patch.object(dsh_runner, "ANALYSIS_TIMEOUT_SECONDS", 1),
                patch.object(dsh_runner, "build_gateway", return_value=gateway),
                patch.object(dsh_runner, "SocJudgementClient", return_value=client) as client_type,
                patch.object(dsh_runner.evidence_collection, "parse_args", return_value=object()),
                patch.object(
                    dsh_runner.evidence_collection, "run",
                    side_effect=lambda _args, **_kwargs: time.sleep(2),
                ) as run_evidence,
            ):
                result = dsh_runner.analyze(
                    "INC-20261010-000001",
                    directory,
                    {"connections": {"runtime": {
                        "bridgeUrl": "http://127.0.0.1:3000/run-bridge",
                        "bridgeKey": "test-run-key",
                    }}},
                )

        self.assertEqual("evidence_failed", result["status"])
        self.assertEqual("TimeoutError", result["error_type"])
        self.assertEqual("saved", result["delivery"]["storage"]["summary"]["status"])
        self.assertEqual("fail", client.write.call_args.args[0])
        self.assertIs(gateway, client_type.call_args.args[0])
        self.assertIs(gateway, run_evidence.call_args.kwargs["gateway"])


if __name__ == "__main__":
    unittest.main()
