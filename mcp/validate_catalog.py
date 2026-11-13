#!/usr/bin/env python3
"""Validate and materialize the current MCP composition catalog.

The composition files remain the source of truth. This command derives a
machine-readable index so published, draft and unregistered assets have one
stable status view.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "compositions.json"
COMPOSITIONS = ROOT / "compositions"
MANIFEST = ROOT / "current-manifest.json"


def _digest(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in sorted(paths, key=lambda item: item.relative_to(COMPOSITIONS).as_posix()):
        digest.update(path.relative_to(COMPOSITIONS).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


def _entry(composition_id: str, path: str | None) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    directory = COMPOSITIONS / composition_id
    composition_path = ROOT / path if path else directory / "composition.json"
    source_files = [item for item in [directory / "flow.json", directory / "src/index.ts"] if item.is_file()]
    source_files.extend(item for item in (directory / "src").rglob("*") if item.is_file())
    source_files = list(dict.fromkeys(source_files))

    if not directory.is_dir():
        return {"id": composition_id, "path": path, "status": "unregistered", "registered": False,
                "published": False, "draft": False, "published_version_id": None, "version_count": 0,
                "requires_llm": "unknown", "external_dependencies": [], "side_effects": "unknown",
                "load_status": "not_loaded", "verify_status": "not_verified", "closure_digest": None,
                "errors": ["composition_directory_missing"]}, [f"{composition_id}:composition_directory_missing"]

    if not composition_path.is_file():
        return {"id": composition_id, "path": path, "status": "unregistered", "registered": False,
                "published": False, "draft": False, "published_version_id": None, "version_count": 0,
                "requires_llm": "unknown", "external_dependencies": [], "side_effects": "unknown",
                "load_status": "not_loaded", "verify_status": "not_verified",
                "closure_digest": _digest(source_files) if source_files else None,
                "errors": ["composition_file_missing"]}, [f"{composition_id}:composition_file_missing"]

    try:
        value = json.loads(composition_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        return {"id": composition_id, "path": path, "status": "invalid",
                "errors": [f"composition_invalid:{error}"]}, [f"{composition_id}:composition_invalid"]

    if value.get("id") != composition_id:
        errors.append("composition_id_mismatch")
    published = value.get("published")
    draft = value.get("draft")
    versions = value.get("versions") if isinstance(value.get("versions"), list) else []
    config = published if isinstance(published, dict) else draft if isinstance(draft, dict) else {}
    dependencies: set[str] = set()
    for connection in (config.get("connections") or {}).values():
        if isinstance(connection, str) and connection:
            dependencies.add(connection)
    for item in ((config.get("options") or {}).get("fixedDependencies") or []):
        if isinstance(item, dict) and isinstance(item.get("compositionId"), str):
            dependencies.add(f"composition:{item['compositionId']}@{item.get('versionId', 'unknown')}")
    side_effects = "read_only" if config.get("readonly") is True else "write" if config.get("readonly") is False else "unknown"
    status = "published" if isinstance(published, dict) else "draft" if isinstance(draft, dict) else "registered"
    if not source_files:
        errors.append("runtime_source_missing")

    entry = {
        "id": composition_id, "path": path, "status": status, "registered": True,
        "published": isinstance(published, dict), "draft": isinstance(draft, dict),
        "published_version_id": value.get("publishedVersionId"), "version_count": len(versions),
        "tool_name": config.get("toolName"), "kind": config.get("kind"),
        "requires_llm": config.get("requires_llm", config.get("requiresLlm", "unknown")),
        "external_dependencies": sorted(dependencies), "side_effects": config.get("side_effects", config.get("sideEffects", side_effects)),
        "load_status": "not_loaded", "verify_status": "not_verified",
        "closure_digest": _digest([composition_path, *source_files]), "errors": errors,
    }
    if entry["published"] and not entry["published_version_id"]:
        errors.append("published_version_id_missing")
    if entry["published"] and not isinstance(published.get("publishedAt"), str):
        errors.append("published_at_missing")
    return entry, [f"{composition_id}:{error}" for error in errors]


def build_manifest() -> dict[str, Any]:
    index = json.loads(INDEX.read_text())
    entries: list[dict[str, Any]] = []
    errors: list[str] = []
    indexed: set[str] = set()
    for item in index.get("compositions", []):
        composition_id = item.get("id")
        path = item.get("path")
        if not isinstance(composition_id, str) or not isinstance(path, str):
            errors.append("index_entry_invalid")
            continue
        if composition_id in indexed:
            errors.append(f"{composition_id}:duplicate_index_entry")
        indexed.add(composition_id)
        entry, entry_errors = _entry(composition_id, path)
        entries.append(entry)
        errors.extend(entry_errors)

    for directory in sorted(item for item in COMPOSITIONS.iterdir() if item.is_dir()):
        if directory.name in indexed:
            continue
        entry, entry_errors = _entry(directory.name, None)
        entries.append(entry)
        # A directory without composition.json is an explicit unregistered
        # asset (for example an offline design), not a broken registered entry.
        if entry.get("status") != "unregistered" or entry.get("registered") is True:
            errors.extend(entry_errors)

    entries.sort(key=lambda item: item["id"])
    return {"schema_version": "mcp-catalog/v1",
            "source": "mcp/compositions.json plus composition runtime assets",
            "generated_by": "mcp/validate_catalog.py", "compositions": entries,
            "registered_count": sum(item.get("registered") is True for item in entries),
            "published_count": sum(item.get("published") is True for item in entries),
            "draft_count": sum(item.get("draft") is True for item in entries),
            "unregistered_count": sum(item.get("status") == "unregistered" for item in entries),
            "errors": sorted(errors), "valid": not errors}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="输出完整 JSON")
    parser.add_argument("--write", action="store_true", help="写入 mcp/current-manifest.json")
    args = parser.parse_args()
    manifest = build_manifest()
    if args.write:
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    if args.json:
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
    else:
        print(f"MCP catalog: registered={manifest['registered_count']} published={manifest['published_count']} draft={manifest['draft_count']} unregistered={manifest['unregistered_count']}")
        for error in manifest["errors"]:
            print(f"ERROR {error}")
    return 0 if manifest["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
