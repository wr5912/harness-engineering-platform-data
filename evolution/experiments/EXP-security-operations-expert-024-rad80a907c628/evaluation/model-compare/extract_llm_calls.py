#!/usr/bin/env python3
"""从评测 Run 的 evidence 与实例 session 日志提取每次 LLM 调用的耗时与 token。

耗时口径：同一 step 的 step/start.time 到该 step 内最后一条 assistant 事件 time 的墙钟差
（含流式生成与该 step 内重试等待）；token 取 assistant 事件的 usage 结算值。
仅统计带 usage 结算的主请求调用；辅助标题/压缩调用单独计数（通常无 usage）。
"""
import json
import os
import subprocess
import sys
from collections import Counter, defaultdict

ASSETS = "/home/cmp/harness-engineering-platform-data"
RUNS = {
    "Qwen3.8-27B": {
        "run": "run-e2e49fac-a081-4ae3-81bd-7c178caa4df3",
        "instance": "security-operations-expert-eval-817d612a",
    },
    "Qwen3.5-4B": {
        "run": "run-a13f0baa-e6bf-42da-8d14-bb9fd278500f",
        "instance": "security-operations-expert-eval-00db0ea4",
    },
}
RUNS_ROOT = os.path.join(ASSETS, "evolution/experiments/EXP-security-operations-expert-024-rad80a907c628/runs")
INST_ROOT = os.path.join(ASSETS, ".local/instances")


def read_jsonl(path):
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def load_session_log(path):
    out = subprocess.run(["zstd", "-dc", path], capture_output=True, check=True)
    events = []
    for line in out.stdout.decode("utf-8", errors="replace").splitlines():
        line = line.strip()
        if line:
            events.append(json.loads(line))
    return events


def map_sessions(run_dir):
    """建立 session_id -> (case, role) 映射。role: target/subagent/judge。"""
    mapping = {}
    ev_root = os.path.join(run_dir, "evidence")
    for case in sorted(os.listdir(ev_root)):
        case_dir = os.path.join(ev_root, case)
        trace = os.path.join(case_dir, "trace.jsonl")
        if os.path.exists(trace):
            seen_main = False
            for row in read_jsonl(trace):
                event = row.get("event", {})
                log = row.get("session_log", "")
                if event.get("type") == "session" and isinstance(event.get("id"), str):
                    if log.endswith("session.v4.jsonl") and not seen_main:
                        mapping[event["id"]] = (case, "target")
                        seen_main = True
                    elif "subagents/" in log:
                        mapping[event["id"]] = (case, "subagent")
        judge = os.path.join(case_dir, "judge-trace.jsonl")
        if os.path.exists(judge):
            for row in read_jsonl(judge):
                event = row.get("event", {})
                if event.get("type") == "session" and isinstance(event.get("id"), str):
                    mapping[event["id"]] = (case, "judge")
    return mapping


def iter_calls(events):
    """按 step 聚合出每次模型调用：start=step/start，end=该 step 最后一条 assistant 事件。"""
    steps = {}
    order = []
    title_calls = 0
    compaction_calls = 0
    for event in events:
        etype = event.get("type")
        data = event.get("data") or {}
        if etype == "step/start":
            key = (data.get("turn"), data.get("step"))
            steps[key] = {"start": event.get("time"), "assists": [], "start_seq": event.get("seq")}
            order.append(key)
        elif etype in ("assistant/message", "assistant/attempt"):
            key = (data.get("turn"), data.get("step"))
            if key in steps:
                steps[key]["assists"].append(event)
        elif etype == "session/title-llm-request":
            title_calls += 1
        elif etype == "compaction/summary" and data.get("llmStreamCall") is True:
            compaction_calls += 1
    calls = []
    for key in order:
        step = steps[key]
        assists = step["assists"]
        if not assists or step["start"] is None:
            continue
        last = assists[-1]
        usage = (last.get("data") or {}).get("usage") or {}
        stream = (last.get("data") or {}).get("stream") or []
        if not usage:
            for item in reversed(stream):
                chunk = (item or {}).get("chunk") or {}
                if chunk.get("type") == "usage":
                    usage = chunk.get("usage") or {}
                    break
        elapsed_ms = (last.get("time") or 0) - step["start"]
        calls.append({
            "turn": key[0],
            "step": key[1],
            "end_time": last.get("time"),
            "elapsed_ms": elapsed_ms,
            "input_tokens": usage.get("inputTokens"),
            "output_tokens": usage.get("outputTokens"),
            "total_tokens": usage.get("totalTokens"),
            "kind": last.get("type"),
        })
    return calls, title_calls, compaction_calls


def main():
    results = {}
    for label, meta in RUNS.items():
        run_dir = os.path.join(RUNS_ROOT, meta["run"])
        mapping = map_sessions(run_dir)
        inst = os.path.join(INST_ROOT, meta["instance"], "dsh-home/sessions/--work-harness-workspace--")
        rows = []
        sessions_found = 0
        aux = {"title_requests": 0, "compaction_calls": 0}
        for sid, (case, role) in mapping.items():
            log_path = os.path.join(inst, sid, "session.v4.jsonl.zstd")
            if not os.path.exists(log_path):
                # 无前缀目录名的子代理 session 直接用 uuid
                alt = os.path.join(inst, sid.replace("session-", "", 1), "session.v4.jsonl.zstd")
                log_path = alt if os.path.exists(alt) else log_path
            if not os.path.exists(log_path):
                continue
            sessions_found += 1
            events = load_session_log(log_path)
            calls, title, comp = iter_calls(events)
            aux["title_requests"] += title
            aux["compaction_calls"] += comp
            for c in calls:
                c.update({"case_id": case, "role": role, "session_id": sid})
                rows.append(c)
        results[label] = {"rows": rows, "sessions_found": sessions_found,
                          "sessions_mapped": len(mapping), "aux": aux, "run": meta["run"]}
    out = os.path.join(ASSETS, ".local/deliverables/run-calls/model-compare-raw.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False)
    for label, data in results.items():
        rows = data["rows"]
        by_role = Counter(r["role"] for r in rows)
        with_usage = [r for r in rows if r["input_tokens"] is not None and r["output_tokens"] is not None]
        ti = sum(r["input_tokens"] for r in with_usage)
        to = sum(r["output_tokens"] for r in with_usage)
        durs = sorted(r["elapsed_ms"] for r in rows if r["elapsed_ms"] >= 0)
        def pct(p):
            if not durs: return None
            return durs[min(len(durs) - 1, int(len(durs) * p))]
        print(f"== {label} ({data['run']}) ==")
        print(f"  mapped sessions: {data['sessions_mapped']}, found: {data['sessions_found']}, calls: {len(rows)}, by_role: {dict(by_role)}")
        print(f"  with usage: {len(with_usage)}, input_tokens: {ti}, output_tokens: {to}")
        print(f"  duration ms: min={durs[0] if durs else None} p50={pct(0.5)} p90={pct(0.9)} max={durs[-1] if durs else None}")
        print(f"  aux: {data['aux']}")
    print("raw ->", out)


if __name__ == "__main__":
    sys.exit(main())
