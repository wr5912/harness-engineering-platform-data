#!/usr/bin/env python3
"""Offline Skill inspection; never executes target code or declares a full audit PASS.

Uses the official reference implementation's StrictYAML scalar semantics. This is
an independent checker, not execution of skills-ref or a target runtime loader.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple
from urllib.parse import unquote, urlsplit

try:
    import strictyaml
except ImportError:
    strictyaml = None

SPEC = "https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/docs/specification.mdx"
REFERENCE = "https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref"
DSH = "https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts"
LOCAL = "references/format-and-structure.md"
FIELDS = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
DSH_FIELDS = {"whenToUse", "disable-model-invocation", "user-invocable"}
LEGACY_DSH_FIELDS = {"disableModelInvocation", "modelInvocable", "userInvocable"}
DSH_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RESOURCE_RE = re.compile(r"(?<![\w/.-])(?:references|scripts|assets)/[^\s`<>\[\](){}\"']+\.(?:md|txt|jsonl?|ya?ml|py|sh|[cm]?js|tsx?|jsx|csv|tsv|html|css|sql|xml|toml|png|jpe?g|svg|pdf|docx|xlsx|pptx|zip)(?=$|[\s`\],;:#])", re.IGNORECASE)
LINK_RE = re.compile(r"!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+[^)\n]+)?\)")
LINK_DEF_RE = re.compile(r"(?m)^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)")
MCP_RE = re.compile(r"\bmcp__[A-Za-z0-9_-]+?__[A-Za-z0-9_-]+\b")
RISKY_RE = re.compile(r"\bcurl\b[^\n|]*\|\s*(?:sh|bash)\b|\brm\s+-rf\b", re.IGNORECASE)
MAX_TEXT_BYTES = 500_000
MAX_DEEP_FILES = 200


def finding(fid: str, level: str, file: str, line: int, message: str,
            action: str, confidence: str = "heuristic", *,
            basis: str = "local-quality", source_url: str = LOCAL,
            category: str = "content") -> Dict[str, object]:
    return {"id": fid, "level": level, "confidence": confidence,
            "file": file, "line": line, "message": message,
            "suggested_review": action, "basis": basis,
            "source_url": source_url, "category": category}


def frontmatter(text: str) -> Tuple[Optional[str], str]:
    """Delimit whole lines; a scalar containing '---' is not a delimiter."""
    rows = text.splitlines(keepends=True)
    if not rows or not re.fullmatch(r"---[ \t]*(?:\r?\n)?", rows[0]):
        return None, text
    for index, row in enumerate(rows[1:], 1):
        if re.fullmatch(r"---[ \t]*(?:\r?\n)?", row):
            return "".join(rows[1:index]), "".join(rows[index + 1:])
    return None, text


def read_text(path: Path, preserve_bom: bool = False) -> Optional[str]:
    try:
        if path.stat().st_size <= MAX_TEXT_BYTES:
            with path.open(encoding="utf-8" if preserve_bom else "utf-8-sig",
                           newline="" if preserve_bom else None) as stream:
                return stream.read()
    except (OSError, UnicodeError):
        pass
    return None


def field_line(fm: str, key: str) -> int:
    match = re.search(r"(?m)^" + re.escape(key) + r"\s*:", fm)
    return fm.count("\n", 0, match.start()) + 2 if match else 2


def implicit_type_candidate(value: str) -> bool:
    """Conservative ambiguity screen, not a YAML 1.2 type resolver.

    StrictYAML returns strings for scalars. A numeric/token-like value may have
    a different native type, including when this parser cannot prove its style.
    False positives are left BLOCKED for native verification, never ERROR.
    """
    return (value.lower() in {"true", "false", "null", "~", ".nan", ".inf", "+.inf", "-.inf"}
            or re.fullmatch(r"[+-]?(?:\d[\d_a-fA-FxXoOeE.+-]*|\.\d[\d_eE.+-]*)", value) is not None)


def validate_dsh_delimiters(text: str, findings: List[Dict[str, object]]) -> None:
    # Match the pinned implementation: split LF, remove only a terminal CR.
    rows = [row[:-1] if row.endswith("\r") else row for row in text.split("\n")]
    if not rows or rows[0] != "---":
        findings.append(finding("DSH-005", "ERROR", "SKILL.md", 1,
            "该 DSH 版本要求首行严格为 ---，不会去除 BOM 或分隔符尾空白。",
            "使首行仅包含 ---；LF 与 CRLF 均可。", "certain",
            basis="target-runtime", source_url=DSH, category="metadata"))
    closing_seen = False
    for index, row in enumerate(rows[1:], 2):
        if re.fullmatch(r"---[ \t]*", row):
            closing_seen = True
            if row != "---":
                findings.append(finding("DSH-005", "ERROR", "SKILL.md", index,
                    "该 DSH 版本的结束分隔符必须严格为 ---，不能含尾空白。",
                    "删除分隔符后的空格或制表符；LF 与 CRLF 均可。", "certain",
                    basis="target-runtime", source_url=DSH, category="metadata"))
            break
    if not closing_seen:
        findings.append(finding("DSH-005", "ERROR", "SKILL.md", 1,
            "未找到该 DSH 版本要求的独立 --- 结束分隔符。",
            "使用纯 --- 行及 LF 或 CRLF 换行。", "certain",
            basis="target-runtime", source_url=DSH, category="metadata"))


def validate_metadata(root: Path, fm: str, profile: str,
                      findings: List[Dict[str, object]]) -> List[str]:
    def error(fid, key, message, basis="official-spec", source=SPEC):
        findings.append(finding(fid, "ERROR", "SKILL.md", field_line(fm, key), message,
            "按所列来源修正字段；需要运行时扩展时明确选用相应 profile。", "certain",
            basis=basis, source_url=source, category="metadata"))

    if strictyaml is None:
        findings.append(finding("DEPENDENCY-001", "BLOCKED", "SKILL.md", 1,
            "缺少 StrictYAML，未进行 YAML 与字段校验。",
            "在获准环境准备 scripts/requirements.txt 中的依赖后重试；不自动安装。",
            "certain", category="metadata"))
        return []
    try:
        data = strictyaml.load(fm).data
    except strictyaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        line = getattr(mark, "line", 0) + 2
        # StrictYAML deliberately rejects some otherwise legal YAML forms. That
        # does not establish that DSH's different parser will reject the file.
        level = "BLOCKED" if profile == "dsh" else "ERROR"
        findings.append(finding("META-007", level, "SKILL.md", line,
            "官方参考所用 StrictYAML 无法接受此 frontmatter（" + type(exc).__name__ + "）。",
            "核对 YAML 语法和参考解析器支持范围；DSH 加载结果须由原生环境另行验证。",
            "certain", basis="official-reference", source_url=REFERENCE, category="metadata"))
        return []
    if not isinstance(data, dict):
        error("META-008", "", "frontmatter 必须是字段映射。")
        return []

    extensions = sorted(set(data) & DSH_FIELDS) if profile == "dsh" else []
    allowed = FIELDS | (DSH_FIELDS if profile == "dsh" else set())
    for key in set(data) - allowed:
        if profile == "dsh" and key in LEGACY_DSH_FIELDS:
            error("DSH-001", key, "DSH 不支持旧式调用控制字段：" + key,
                  "target-runtime", DSH)
        else:
            error("META-009", key, "字段不在所选 profile 的允许范围：" + str(key),
                  "official-reference", REFERENCE)

    raw_name = data.get("name")
    name = unicodedata.normalize("NFKC", raw_name) if isinstance(raw_name, str) else ""
    valid_name = (1 <= len(name) <= 64 and name == name.lower()
                  and all(c.isalnum() or c == "-" for c in name)
                  and not name.startswith("-") and not name.endswith("-") and "--" not in name)
    if not valid_name:
        error("META-002", "name", "name 必须为 1–64 字符的小写字母、数字及单连字符名称。")
    elif unicodedata.normalize("NFKC", root.name) != name:
        error("META-003", "name", "name 与 Skill 目录名不匹配。")
    if profile == "dsh" and isinstance(raw_name, str) and not DSH_NAME.fullmatch(raw_name):
        error("DSH-002", "name", "该 DSH 版本名称仅接受 ASCII kebab-case；不使用通用名称规范化结果。",
              "target-runtime", DSH)

    desc = data.get("description")
    if not isinstance(desc, str) or not desc.strip() or len(desc) > 1024:
        error("META-004", "description", "description 必须是非空字符串，最多 1024 字符。")
    elif len(desc) < 45:
        findings.append(finding("META-005", "REVIEW", "SKILL.md", field_line(fm, "description"),
            "description 较短，需核查用途与触发条件是否明确；长度本身不是违规。",
            "用正负任务检验触发边界。", basis="official-guidance", source_url=SPEC,
            category="content"))
    if "compatibility" in data:
        value = data["compatibility"]
        if not isinstance(value, str) or not value.strip() or len(value) > 500:
            error("META-006", "compatibility", "compatibility 若提供，须为 1–500 字符的非空字符串。")
    for key in ("license", "allowed-tools"):
        if key in data and not isinstance(data[key], str):
            error("META-010", key, key + " 必须是字符串。")
    if "metadata" in data:
        value = data["metadata"]
        if not isinstance(value, dict) or any(not isinstance(k, str) or not isinstance(v, str)
                                              for k, v in value.items()):
            error("META-011", "metadata", "metadata 须为字符串键到字符串值的映射，不接受嵌套对象或列表。")
    if profile == "dsh":
        for key in ("name", "description", "whenToUse"):
            value = data.get(key)
            if isinstance(value, str) and implicit_type_candidate(value):
                findings.append(finding("DSH-006", "BLOCKED", "SKILL.md", field_line(fm, key),
                    key + " 的原生标量类型无法由 StrictYAML 字符串语义确定，可能不符合 DSH 字符串要求。",
                    "用固定目标运行时核验原始 frontmatter 的值与类型；本检查器不推断隐式类型或加载结果。",
                    basis="target-runtime", source_url=DSH, category="metadata"))
        if "whenToUse" in data and (not isinstance(data["whenToUse"], str) or not data["whenToUse"]):
            findings.append(finding("DSH-003", "REVIEW", "SKILL.md", field_line(fm, "whenToUse"),
                "该 whenToUse 值会被 DSH 忽略，核查是否丢失触发意图。",
                "使用有实际内容的字符串；原生解析另行验证。",
                "certain", basis="target-runtime", source_url=DSH, category="content"))
        for key in ("disable-model-invocation", "user-invocable"):
            if key not in data:
                continue
            value = data[key]
            if isinstance(value, str) and value.lower() in {"true", "false", "yes", "no", "on", "off", "1", "0"}:
                continue
            if isinstance(value, str) and implicit_type_candidate(value):
                findings.append(finding("DSH-006", "BLOCKED", "SKILL.md", field_line(fm, key),
                    key + " 使用可能被原生解析为其他类型的标量，不能依据 StrictYAML 字符串结果判为非法开关。",
                    "用固定目标运行时核验原始值；DSH 接受原生数字 0/1，其他表示须按实际类型判断。",
                    basis="target-runtime", source_url=DSH, category="metadata"))
            else:
                error("DSH-004", key, "调用开关值不在该 DSH 版本支持范围内。", "target-runtime", DSH)
    return extensions


def markdown_lines(body: str, start: int, findings: List[Dict[str, object]]) -> List[Tuple[int, str]]:
    """Inspect simple ATX headings/fences; never claim full Markdown validation."""
    visible = []
    fence = None
    previous_level = None
    pending_heading = None
    for offset, row in enumerate(body.splitlines(), start):
        fence_match = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", row)
        if fence is not None:
            if fence_match and fence_match[1][0] == fence[0] and len(fence_match[1]) >= fence[1] and not fence_match[2].strip():
                fence = None
            continue
        if fence_match:
            fence = (fence_match[1][0], len(fence_match[1]), offset)
            pending_heading = None
            continue
        visible.append((offset, row))
        heading = re.match(r"^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$", row)
        if heading:
            level = len(heading[1])
            if previous_level is not None and level > previous_level + 1:
                findings.append(finding("STYLE-001", "REVIEW", "SKILL.md", offset,
                    "标题层级跳跃，核查组织是否清楚。", "按内容关系整理；这不是官方固定章节要求。",
                    category="presentation"))
            if pending_heading is not None and level <= pending_heading[1]:
                # A parent heading followed by a subheading is a legitimate container.
                findings.append(finding("STYLE-002", "REVIEW", "SKILL.md", pending_heading[0],
                    "标题下没有内容就进入同级或更高层章节，核查是否空章节。", "补实质内容或删去空标题。",
                    category="presentation"))
            pending_heading = (offset, level)
            previous_level = level
        elif row.strip() and not row.strip().startswith("<!--"):
            pending_heading = None
        if re.search(r"\b(?:TODO|TBD|FIXME)\b|待补充|待填写", row):
            findings.append(finding("STYLE-003", "REVIEW", "SKILL.md", offset,
                "发现待填写标记，核查是否未完成指令或有意示例。", "交付正文应完整；保留明确标注的模板示例。",
                category="presentation"))
    if pending_heading is not None:
        findings.append(finding("STYLE-002", "REVIEW", "SKILL.md", pending_heading[0],
            "末尾标题没有内容，核查是否空章节。", "补实质内容或删去空标题。", category="presentation"))
    if fence is not None:
        findings.append(finding("STYLE-004", "REVIEW", "SKILL.md", fence[2],
            "代码围栏到文件结束仍未显式闭合，后续文字可能被包含在代码中。",
            "核查渲染与原意；Markdown 允许这种写法，不据此判官方格式失败。", category="presentation"))
    return visible


def check_resources(root: Path, visible: List[Tuple[int, str]], findings: List[Dict[str, object]]) -> None:
    seen = set()
    for line, row in visible:
        targets = [(m[1], False) for pattern in (LINK_RE, LINK_DEF_RE) for m in pattern.finditer(row)]
        targets += [(m[0].rstrip(".,:;"), bool(re.search(r"(?:\bcore|其|上游|外部)\s*`?\s*$", row[:m.start()])))
                    for m in RESOURCE_RE.finditer(row)]
        for target, other_base in targets:
            target = target.strip("<>")
            if not target or target.startswith("#"):
                continue
            try:
                parsed = urlsplit(target)
            except ValueError:
                findings.append(finding("RES-005", "REVIEW", "SKILL.md", line,
                    "链接无法由简单 URL 解析器解释。", "人工核对链接文本、目标与渲染。", category="resources"))
                continue
            if parsed.scheme or parsed.netloc:
                continue
            relative = unquote(parsed.path)
            if not relative or (line, relative) in seen:
                continue
            seen.add((line, relative))
            if any(token in relative for token in ("<", ">", "{", "}", "*", "...")):
                findings.append(finding("RES-003", "REVIEW", "SKILL.md", line,
                    "引用含占位符，需人工区分模板与真实依赖：" + relative,
                    "确认示例已标注，实际依赖有具体定位。", category="resources"))
                continue
            reference = (root / relative).resolve()
            if not reference.is_relative_to(root):
                findings.append(finding("RES-001", "REVIEW", "SKILL.md", line,
                    "引用位于 Skill 包外，需确认共享依赖及可移植性：" + relative,
                    "核对外部依赖，不能仅凭包外引用判为缺失。", category="resources"))
            elif not reference.exists() and other_base:
                findings.append(finding("RES-004", "REVIEW", "SKILL.md", line,
                    "裸路径说明使用其他基准，不能按本包根确认缺失：" + relative,
                    "沿明确的共享包或上游来源解析，必要时补完整引用。", category="resources"))
            elif not reference.exists():
                findings.append(finding("RES-002", "ERROR", "SKILL.md", line,
                    "明确引用的包内资源不存在：" + relative, "修复路径或提供缺失文件。", "certain",
                    category="resources"))


def inspect(root: Path, include_references: bool = False, profile: str = "agent-skills") -> Dict[str, object]:
    if profile not in {"agent-skills", "dsh"}:
        raise ValueError("unknown profile: " + profile)
    root = root.expanduser().resolve()
    findings: List[Dict[str, object]] = []
    scanned = 0
    extensions = []

    def report():
        def state(category):
            items = [item for item in findings if item["category"] == category]
            if any(item["level"] == "ERROR" for item in items):
                return "FAIL"
            if any(item["level"] == "BLOCKED" for item in items):
                return "BLOCKED"
            return "PASS"
        overall = "FAIL" if any(f["level"] == "ERROR" for f in findings) else (
            "BLOCKED" if any(f["level"] == "BLOCKED" for f in findings) else "REVIEW_REQUIRED")
        return {"target": str(root), "profile": profile, "files_read": scanned,
            "findings": findings, "overall_status": overall, "runtime_extensions": extensions,
            "parser": "StrictYAML (official reference scalar semantics; independent checks)",
            "coverage": {"metadata": state("metadata"), "resources": state("resources") if state("resources") != "PASS" else "PARTIAL",
                "content": "FAIL" if state("content") == "FAIL" else "NOT_REVIEWED", "presentation": "REVIEW_REQUIRED" if any(f["category"] == "presentation" for f in findings) else "NOT_REVIEWED",
                "runtime": "NOT_RUN", "official_validator": "NOT_RUN"},
            "note": "静态结果不构成完整审查通过。正文信息、工整性、示例与实际运行须逐项取证；未运行 skills-ref、目标代码或网络请求。资源检查仅覆盖简单 Markdown 链接和常见文件后缀裸路径，不涵盖完整 Markdown、代码示例、URL 与锚点。"}

    entry = root / "SKILL.md"
    if not root.is_dir() or not entry.is_file():
        findings.append(finding("STRUCT-001", "ERROR", "SKILL.md", 1,
            "目标不是包含 SKILL.md 的有效目录。", "传入 Skill 文件夹路径。", "certain",
            basis="official-spec", source_url=SPEC, category="metadata"))
        return report()
    text = read_text(entry, preserve_bom=profile == "dsh")
    if text is None:
        findings.append(finding("STRUCT-002", "BLOCKED", "SKILL.md", 1,
            "无法读取 UTF-8 文件，或超过本检查器扫描上限。", "核对编码或改用能完整读取的审查方式。",
            "certain", category="metadata"))
        return report()
    scanned += 1
    if profile == "dsh":
        validate_dsh_delimiters(text, findings)
    # The generic reference-compatible checks remain separate from raw DSH
    # delimiter checks; removing a BOM here cannot erase the runtime finding.
    reference_text = text.removeprefix("\ufeff").replace("\r\n", "\n").replace("\r", "\n") if profile == "dsh" else text
    fm, body = frontmatter(reference_text)
    if fm is None:
        findings.append(finding("META-001", "ERROR", "SKILL.md", 1,
            "缺少由独立 --- 行分隔的 YAML frontmatter。", "添加标准 frontmatter。", "certain",
            basis="official-spec", source_url=SPEC, category="metadata"))
    else:
        extensions = validate_metadata(root, fm, profile, findings)
    body_start = len(text.splitlines()) - len(body.splitlines()) + 1
    if len(text.splitlines()) > 500:
        findings.append(finding("CONTEXT-001", "REVIEW", "SKILL.md", 1,
            "SKILL.md 总行数超过建议的 500 行，核查渐进披露。", "按需拆分参考资料，保留必要入口。",
            basis="official-guidance", source_url=SPEC, category="presentation"))
    if not body.strip():
        findings.append(finding("STRUCT-003", "ERROR", "SKILL.md", body_start,
            "没有正文指令，无法按该 Skill 执行任务。", "补充足以完成任务的方法和结果要求。",
            "certain", category="content"))
    visible = markdown_lines(body, body_start, findings)
    check_resources(root, visible, findings)
    targets = [("SKILL.md", text)]
    if include_references:
        for folder in ("references", "scripts"):
            for path in sorted((root / folder).rglob("*")):
                if path.is_symlink() or not path.is_file() or path.suffix.lower() not in {".md", ".py", ".txt", ".sh", ".js", ".ts"}:
                    continue
                if not path.resolve().is_relative_to(root):
                    continue
                content = read_text(path)
                if content is None:
                    findings.append(finding("SCAN-002", "BLOCKED", str(path.relative_to(root)), 1,
                        "附加文件未完整读取。", "人工补查并说明扫描限制。", category="resources"))
                    continue
                scanned += 1
                if len(targets) - 1 >= MAX_DEEP_FILES:
                    findings.append(finding("SCAN-001", "BLOCKED", str(path.relative_to(root)), 1,
                        "达到附加文件扫描上限，此候选文件及后续相关文件未检查。", "人工补查相关文件并记录范围。", category="resources"))
                    break
                targets.append((str(path.relative_to(root)), content))
    observed_tools = {}
    for label, content in targets:
        for match in MCP_RE.finditer(content):
            observed_tools.setdefault((label, match[0]), content.count("\n", 0, match.start()) + 1)
        for match in RISKY_RE.finditer(content):
            findings.append(finding("SCRIPT-001", "REVIEW", label, content.count("\n", 0, match.start()) + 1,
                "存在可能产生副作用的 shell 模式，也可能只是反例。", "只读核查语境，不执行目标代码。"))
    for (label, tool), line in list(observed_tools.items())[:15]:
        findings.append(finding("MCP-001", "REVIEW", label, line, "出现 MCP 工具标识：" + tool,
            "核对当前工具发现和稳定合同；名称出现不是缺陷。"))
    if len(observed_tools) > 15:
        findings.append(finding("MCP-002", "REVIEW", "SKILL.md", 1,
            "MCP 引用线索超过显示上限。", "按任务核查其余引用。"))
    return report()


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Offline Skill checks with explicit audit coverage")
    parser.add_argument("skill_dir", type=Path, help="Directory containing SKILL.md")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--profile", choices=("agent-skills", "dsh"), default="agent-skills")
    parser.add_argument("--include-references", action="store_true", help="Also read references/scripts for tool and shell hints")
    parser.add_argument("--fail-on-error", action="store_true", help="Exit 2 for ERROR or BLOCKED; exit 0 is not full audit approval")
    args = parser.parse_args(argv)
    result = inspect(args.skill_dir, args.include_references, args.profile)
    if args.format == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"Skill: {result['target']}\nProfile: {result['profile']}\nStatus: {result['overall_status']}")
        print("Coverage: " + json.dumps(result["coverage"], ensure_ascii=False))
        for item in result["findings"]:
            print(f"[{item['level']}] {item['id']} {item['file']}:{item['line']} ({item['basis']}) - {item['message']}")
            print("  -> " + str(item["suggested_review"]))
        print("Note: " + str(result["note"]))
    return 2 if args.fail_on_error and result["overall_status"] in {"FAIL", "BLOCKED"} else 0


if __name__ == "__main__":
    sys.exit(main())
