"""Run isolated model evaluations against frozen five-source incident data.

Transport, parsing, display normalization, and contract validation are separate.
Original responses and evidence values remain unchanged. Readable entity
references and witnessed classification annotations are normalized with audits;
the original normalized object passes the unchanged full validator before the
base suggestion field is independently projected to its empty placeholder.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

from entity_references import normalize_entity_references
from fact_attributes import normalize_fact_attributes
from forced_output_contract import validate_forced_output


DEFAULT_TIMEOUT_SECONDS = 180
Transport = Callable[[str, dict[str, Any], str | None, int], dict[str, Any]]


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(path)


def _redact_secret(value: str, secret: str | None) -> str:
    return value.replace(secret, "[REDACTED]") if secret else value


def _base_suggestion_audit(
    output: Mapping[str, Any], *, validation_status: str, adopted: bool
) -> dict[str, Any]:
    """Record the independent placeholder deviation without copying raw advice."""

    field = "rule_optimization_suggestions"
    present = field in output
    value = output.get(field)
    if not present:
        deviation = "missing_field"
    elif not isinstance(value, list):
        deviation = "invalid_field_type"
    elif value:
        deviation = "nonempty_base_suggestions"
    else:
        deviation = None
    return {
        "schema_version": "base-suggestion-projection/1",
        "source_artifact": "model-analysis-output.json",
        "source_view": "normalized_model_output_before_suggestion_projection",
        "field": field,
        "field_present": present,
        "source_field_type": type(value).__name__ if present else None,
        "source_item_count": len(value) if isinstance(value, list) else None,
        "deviation": deviation,
        "original_validation_status": validation_status,
        "status": ("projected" if deviation else "unchanged") if adopted else "not_applied",
        "projection_applied": adopted and deviation is not None,
        "other_fields_changed": False,
        "raw_model_output_preserved": True,
        "base_validation_preserved": True,
    }


def _write_base_suggestion_audit(
    output_dir: Path, audit: Mapping[str, Any], metadata: dict[str, Any]
) -> None:
    """Isolate optional audit I/O from the frozen base and original validation."""

    try:
        _write_json(output_dir / "base-suggestion-projection.json", audit)
    except OSError as error:
        metadata["base_suggestion_projection_audit"] = {
            "status": "failed",
            "error_type": type(error).__name__,
        }
        try:
            _write_json(output_dir / "request-metadata.json", metadata)
        except Exception:
            # 附加留痕亦尽力而为；不能覆盖已冻结基础或正在抛出的原校验异常。
            pass


def build_chat_request(
    *,
    system_prompt: str,
    five_source: Mapping[str, Any],
    model: str,
    temperature: float = 0,
) -> dict[str, Any]:
    """Build the fixed two-message request used by each analysis."""

    if not 0 <= temperature <= 2:
        raise ValueError("temperature must be between 0 and 2")

    user_content = (
        "请严格按照系统提示词研判以下安全事件。"
        "除该 JSON 外没有其他案例事实输入：\n\n"
        f"{_canonical_json(five_source)}"
    )
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
        "stream": False,
        "response_format": {"type": "json_object"},
    }


def _default_transport(
    endpoint: str,
    payload: dict[str, Any],
    api_key: str | None,
    timeout: int,
) -> dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if api_key is not None:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Model API returned HTTP {exc.code}: {response_body}"
        ) from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Model API request failed: {exc.reason}") from exc

    decoded = json.loads(response_body)
    if not isinstance(decoded, dict):
        raise ValueError("Model API response must be a JSON object")
    return decoded


def extract_json_output(response: Mapping[str, Any]) -> dict[str, Any]:
    """Parse raw JSON or one complete JSON Markdown fence without content repair."""

    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("Model API response has no choices")
    first_choice = choices[0]
    if not isinstance(first_choice, Mapping):
        raise ValueError("Model API response choice must be an object")
    message = first_choice.get("message")
    if not isinstance(message, Mapping):
        raise ValueError("Model API response choice has no message")
    content = message.get("content")
    if not isinstance(content, str):
        raise ValueError("Model API response message content must be a string")

    fenced = re.fullmatch(r"```json[ \t]*\r?\n(.*)\r?\n```", content, re.DOTALL)
    if fenced is not None:
        content = fenced.group(1)
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("Model output must be a JSON object")
    return parsed


def run_inference(
    *,
    five_source: Mapping[str, Any],
    system_prompt: str,
    base_url: str,
    model: str,
    api_key: str | None,
    output_dir: Path,
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    temperature: float = 0,
    transport: Transport = _default_transport,
) -> dict[str, Any]:
    """Call once, preserve original validation, then freeze an empty advice slot."""

    if api_key is not None and not api_key.strip():
        raise ValueError("API key is empty; use explicit no-auth mode instead")
    incident_id = five_source.get("unified_event_id")
    if not isinstance(incident_id, str) or not incident_id:
        raise ValueError("five-source input has no unified_event_id")

    output_dir = Path(output_dir)
    frozen_artifacts = (
        "request-metadata.json",
        "raw-response.json",
        "model-analysis-output.json",
        "entity-reference-normalization.json",
        "fact-attribute-normalization.json",
        "base-suggestion-projection.json",
        "forced-analysis-output.json",
        "validation.json",
    )
    existing = [name for name in frozen_artifacts if (output_dir / name).exists()]
    if existing:
        raise FileExistsError(
            f"analysis result directory already contains frozen artifacts: {existing}"
        )
    output_dir.mkdir(parents=True, exist_ok=True)

    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    request_payload = build_chat_request(
        system_prompt=system_prompt,
        five_source=five_source,
        model=model,
        temperature=temperature,
    )
    metadata = {
        "unified_event_id": incident_id,
        "endpoint": endpoint,
        "model": model,
        "temperature": temperature,
        "stream": False,
        "response_format": {"type": "json_object"},
        "auth_mode": "none" if api_key is None else "bearer",
        "timeout_seconds": timeout,
        "input_sha256": _sha256_text(_canonical_json(five_source)),
        "system_prompt_sha256": _sha256_text(system_prompt),
        "request_sha256": _sha256_text(_canonical_json(request_payload)),
        "requested_at": datetime.now(timezone.utc).isoformat(),
    }
    _write_json(output_dir / "request-metadata.json", metadata)

    try:
        response = transport(endpoint, request_payload, api_key, timeout)
    except Exception as exc:
        safe_error = _redact_secret(str(exc), api_key)
        _write_json(
            output_dir / "validation.json",
            {
                "status": "request_failed",
                "error_type": type(exc).__name__,
                "error": safe_error,
            },
        )
        raise RuntimeError(safe_error) from None

    metadata["response_model"] = response.get("model")
    metadata["responded_at"] = datetime.now(timezone.utc).isoformat()
    _write_json(output_dir / "request-metadata.json", metadata)
    _write_json(output_dir / "raw-response.json", response)
    forced_output = None
    try:
        model_output = extract_json_output(response)
        _write_json(output_dir / "model-analysis-output.json", model_output)
        forced_output, normalization = normalize_entity_references(model_output, five_source)
        _write_json(output_dir / "entity-reference-normalization.json", normalization)
        forced_output, fact_normalization = normalize_fact_attributes(forced_output, five_source)
        _write_json(output_dir / "fact-attribute-normalization.json", fact_normalization)
        # 原完整校验先看归一化原文；建议缺失、类型非法或其他字段失败不由投影修好。
        warnings = validate_forced_output(forced_output, five_source)
    except Exception as exc:
        _write_json(
            output_dir / "validation.json",
            {
                "status": "failed",
                "error_type": type(exc).__name__,
                "error": str(exc),
            },
        )
        if isinstance(forced_output, Mapping):
            _write_base_suggestion_audit(
                output_dir,
                _base_suggestion_audit(forced_output, validation_status="failed", adopted=False),
                metadata,
            )
        raise

    validation_status = "passed_with_warnings" if warnings else "passed"
    _write_json(
        output_dir / "validation.json",
        {
            "status": validation_status,
            "warnings": warnings,
            "entity_reference_normalization": {
                "status": normalization["status"],
                "changed_fields": normalization["changed_fields"],
            },
            "fact_attribute_normalization": {
                "status": fact_normalization["status"],
                "changed_fields": fact_normalization["changed_fields"],
            },
            "validated_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    # 此投影独立于原validation，不回写原模型制品，也不增加缺失字段来凑通过。
    field = "rule_optimization_suggestions"
    if field not in forced_output or not isinstance(forced_output[field], list):
        _write_base_suggestion_audit(
            output_dir,
            _base_suggestion_audit(forced_output, validation_status=validation_status, adopted=False),
            metadata,
        )
        raise ValueError("base suggestion placeholder requires an existing array field")
    projected_output = copy.deepcopy(forced_output)
    projected_output[field] = []
    if not isinstance(projected_output[field], list) or projected_output[field]:
        raise ValueError("base suggestion placeholder must be an empty array")
    # 原基础必需产物先冻结；新增偏差审计的I/O失败不改变原validation或返回结果。
    _write_json(output_dir / "forced-analysis-output.json", projected_output)
    _write_base_suggestion_audit(
        output_dir,
        _base_suggestion_audit(forced_output, validation_status=validation_status, adopted=True),
        metadata,
    )
    return projected_output
