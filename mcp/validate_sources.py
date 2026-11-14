#!/usr/bin/env python3
"""校验 data 仓当前来源合同，不读取或兼容旧 Experiment/Candidate。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import yaml


SOURCE = re.compile(r"^business:([a-z0-9]+(?:-[a-z0-9]+)*)@([0-9a-f]{40})$")
LEGACY = re.compile(r"(?:experiment:|source_experiment|active_experiment|candidate_root|evolution/experiments)")


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def validate(data_root: Path, business_root: Path) -> dict:
    errors: list[str] = []
    manifest_path = business_root / "manifest.yaml"
    if not manifest_path.is_file():
        return {"valid": False, "errors": [f"缺少 business manifest: {manifest_path}"]}
    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    agents = manifest.get("agents")
    if not isinstance(agents, list):
        return {"valid": False, "errors": ["business manifest agents 无效"]}
    expected = {row.get("agent_id") for row in agents if isinstance(row, dict)}
    expected.discard(None)
    try:
        commit = __import__("subprocess").check_output(
            ["git", "-C", str(business_root), "rev-parse", "HEAD"], text=True
        ).strip()
    except Exception as exc:  # pragma: no cover - diagnostic path
        return {"valid": False, "errors": [f"无法读取 business commit: {exc}"]}

    forbidden_dirs = ["evolution", "agents", "deliverables", "visual-validation"]
    for name in forbidden_dirs:
        if (data_root / name).exists():
            fail(errors, f"data 不得保留旧业务数据目录: {name}")

    registry_dir = data_root / "registry" / "agents"
    actual = set()
    for path in sorted(registry_dir.glob("*.yaml")):
        value = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        agent_id = value.get("agent_id")
        actual.add(agent_id)
        if agent_id not in expected:
            fail(errors, f"registry Agent 不在 business manifest: {agent_id}")
        ref = value.get("source_ref")
        match = SOURCE.fullmatch(str(ref)) if ref is not None else None
        if not match or match.group(1) != agent_id or match.group(2) != commit:
            fail(errors, f"registry source_ref 无效: {path}")
        if value.get("source_commit") != commit:
            fail(errors, f"registry source_commit 漂移: {path}")
        if "source_experiment" in value or "active_experiment" in value:
            fail(errors, f"registry 含旧来源字段: {path}")
    if actual != expected:
        fail(errors, f"registry Agent 集合不一致: expected={sorted(expected)} actual={sorted(actual)}")

    access_path = data_root / "config" / "business-access.json"
    if access_path.is_file():
        access = json.loads(access_path.read_text(encoding="utf-8"))
        for row in access.get("gateway", {}).get("instances", []):
            agent_id = row.get("agentId")
            match = SOURCE.fullmatch(str(row.get("sourceId")))
            if agent_id not in expected or not match or match.group(1) != agent_id or match.group(2) != commit:
                fail(errors, f"业务实例来源无效: {row.get('instanceId')}")

    scan_roots = [data_root / "config", data_root / "registry", data_root / "mcp"]
    for root in scan_roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix in {".json", ".js"} and "bundle" in path.name:
                continue
            if path.resolve() == Path(__file__).resolve():
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            if LEGACY.search(text):
                fail(errors, f"当前 data 输入仍引用旧来源: {path}")
    return {"valid": not errors, "business_commit": commit, "agent_count": len(expected), "errors": errors}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--business-root", type=Path, required=True)
    args = parser.parse_args()
    result = validate(args.data_root.resolve(), args.business_root.resolve())
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
