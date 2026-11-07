"""只展开显式实体引用；字面量、未知和重复编号保持失败关闭。"""
from __future__ import annotations

from copy import deepcopy
import re
from typing import Any, Mapping

from forced_output_contract import _BARE_ENTITY_REF

_EXPLICIT_REFS = re.compile(
    r"(?:内部实体|实体)\s*[:：]?\s*(" + _BARE_ENTITY_REF.pattern
    + r"(?:(?:\s*[、,，]\s*|\s*(?:和|与|及)\s*)" + _BARE_ENTITY_REF.pattern + r")*)"
)
_LITERAL_CONTEXT = re.compile(
    r"[`\"'“”‘’/\\]|命令|脚本|文件|路径|参数|进程|注册表|哈希|标识|编号|"
    r"(?<![A-Za-z])(?:cmdline|command|path|file|hash|id|url|uri)(?![A-Za-z])",
    re.IGNORECASE,
)
_NATIVE_JOIN = re.compile(r"[A-Za-z0-9_./\\:@-]")


def normalize_entity_references(
    output: Mapping[str, Any], five_source: Mapping[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """只规范显示，随后仍须通过完整原合同；不猜测裸编号含义。"""
    normalized = deepcopy(dict(output))
    changes: list[dict[str, Any]] = []
    snapshot = five_source.get("event_snapshot")
    entities = snapshot.get("entities") if isinstance(snapshot, Mapping) else None
    candidates: dict[str, str] = {}
    seen: set[str] = set()
    invalid: set[str] = set()
    if isinstance(entities, list):
        for entity in entities:
            if not isinstance(entity, Mapping):
                continue
            ref = entity.get("entity_ref")
            if not isinstance(ref, str) or _BARE_ENTITY_REF.fullmatch(ref) is None:
                continue
            # 重复编号一律拒绝，不依赖不完整的单值/复数身份字段比较。
            if ref in seen:
                invalid.add(ref)
            seen.add(ref)
            display = entity.get("entity_display")
            if not isinstance(display, str) or not display.strip() or _BARE_ENTITY_REF.search(display):
                invalid.add(ref)
            else:
                candidates[ref] = display

    def expand(parent: Any, key: str, path: str) -> None:
        if not isinstance(parent, dict) or not isinstance(parent.get(key), str):
            return
        original = parent[key]
        mentions = list(_BARE_ENTITY_REF.finditer(original))
        if not mentions:
            return
        # 即使字段属于正文，也不把命令、路径、引号内容或原生ID猜成引用。
        explicit = {
            (group.start(1) + token.start(), group.start(1) + token.end())
            for group in _EXPLICIT_REFS.finditer(original)
            for token in _BARE_ENTITY_REF.finditer(group.group(1))
        }
        if _LITERAL_CONTEXT.search(original) or any(
            (token.start(), token.end()) not in explicit
            or _NATIVE_JOIN.search(original[max(0, token.start() - 1):token.start()])
            or _NATIVE_JOIN.search(original[token.end():token.end() + 1])
            for token in mentions
        ):
            raise ValueError(f"{path} contains an ambiguous entity reference or native literal")
        refs = list(dict.fromkeys(token.group(0) for token in mentions))
        if any(ref in invalid or ref not in candidates for ref in refs):
            raise ValueError(f"{path} contains an unknown, ambiguous, or unreadable entity reference")
        resolved = {ref: candidates[ref] for ref in refs}
        rendered = _BARE_ENTITY_REF.sub(lambda match: resolved[match.group(0)], original)
        parent[key] = rendered
        changes.append({"field": path, "references": resolved, "before": original, "after": rendered})

    def rows(parent: Any, key: str, fields: tuple[str, ...], prefix: str = "") -> None:
        values = parent.get(key) if isinstance(parent, Mapping) else None
        if isinstance(values, list):
            for index, row in enumerate(values):
                for field in fields:
                    expand(row, field, f"{prefix}{key}[{index}].{field}")

    for field in ("reasoning_summary", "uncertainty_notes"):
        expand(normalized, field, field)
    rows(normalized, "verified_facts", ("fact",))
    rows(normalized, "key_claims", ("claim",))
    rows(normalized, "counter_evidence", ("claim", "fact"))
    rows(normalized, "rule_optimization_suggestions", ("suggestion",))
    rows(normalized, "recommended_actions", ("action", "reason"))
    for field in ("type", "description"):
        expand(normalized.get("secondary_findings"), field, f"secondary_findings.{field}")
    chain = normalized.get("attack_chain_speculation")
    if isinstance(chain, dict):
        expand(chain, "current_stage", "attack_chain_speculation.current_stage")
        rows(chain, "observed_path", ("description",), "attack_chain_speculation.")
        rows(chain, "possible_next_steps", ("description",), "attack_chain_speculation.")
    # evidence、target、rule、技术/事实ID不递归替换；原模型对象不变。
    return normalized, {
        "schema_version": 1, "status": "normalized" if changes else "unchanged",
        "source": "event_snapshot.entities", "changed_fields": len(changes), "changes": changes,
    }
