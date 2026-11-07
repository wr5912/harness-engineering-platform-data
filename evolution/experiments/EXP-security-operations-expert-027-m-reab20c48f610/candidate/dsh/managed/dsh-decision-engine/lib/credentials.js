/**
 * `~/.dsh/.credentials.yaml` 的 `refs:` 段读写。
 *
 * 为什么单独一层：密钥存哪里是本插件的一个显式选项（`keyStorage`），
 * 「写进 refs 段」这件事必须**可测**——写坏一个共享凭据文件，代价是
 * 用户所有服务（DeepSeek / ModelScope / 智谱 …）的 key 一起失效。
 *
 * 因此这里只做纯文本变换：给定原文与键值，返回新文本。
 * 文件 I/O 留给调用方，本模块零依赖、可被单测直接驱动。
 *
 * 只碰 `refs:` 段，`records:` 段（DSH 的授权记录，带嵌套结构）一个字节都不改。
 *
 * @module dsh-decision-engine/credentials
 */

/**
 * 在 `refs:` 段里查找某个键的值。
 *
 * @param raw - 文件全文。
 * @param name - 键名。
 * @returns 值（已去引号）；未找到返回 undefined。
 */
export function pickRefValue(raw, name) {
  const refs = parseRefsBlock(raw);
  if (refs === undefined) return undefined;
  for (const entry of refs.entries) {
    if (entry.name === name) return entry.value;
  }
  return undefined;
}

/**
 * 列出 `refs:` 段里的所有键名（不含值）。
 *
 * 配置页用它显示「哪些 key 已经配好」，而不必把明文读进内存。
 *
 * @param raw - 文件全文。
 * @returns 键名数组；没有 refs 段时为空数组。
 */
export function listRefNames(raw) {
  const refs = parseRefsBlock(raw);
  if (refs === undefined) return [];
  return refs.entries.map((entry) => entry.name);
}

/**
 * 定位 `refs:` 段：起始行、结束行与段内条目。
 *
 * @param raw - 文件全文。
 * @returns `{ start, end, indent, entries }`；没有 refs 段时返回 undefined。
 */
function parseRefsBlock(raw) {
  const lines = String(raw ?? "").split(/\r?\n/);
  let start = -1;
  let refsIndent = -1;
  /** @type {Array<{line: number, name: string, value: string}>} */
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;

    if (trimmed === "refs:") {
      start = index;
      refsIndent = indent;
      continue;
    }
    if (start < 0) continue;
    // 缩进不深于 refs 的顶层键 = refs 段结束。
    if (indent <= refsIndent) {
      return { start, end: index, indent: refsIndent, entries };
    }
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const name = trimmed.slice(0, sep).trim();
    const value = trimmed
      .slice(sep + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    entries.push({ line: index, name, value });
  }
  if (start < 0) return undefined;
  return { start, end: lines.length, indent: refsIndent, entries };
}

/**
 * 把一组键值写入 `refs:` 段。
 *
 * 行为约定：
 *
 *   - 已存在的键：原地替换值，保留该行位置；
 *   - 不存在的键：追加到 refs 段末尾（段内缩进对齐已有条目）；
 *   - 值为空字符串：**删除该键**（用户清空即撤销，不留空壳行）；
 *   - 没有 refs 段：在文件末尾新建一个；
 *   - `records:` 段与注释：一律不动。
 *
 * @param raw - 文件全文。
 * @param updates - 键名 → 值。值传 "" 表示删除。
 * @returns 新文本。
 */
export function applyRefUpdates(raw, updates) {
  const source = String(raw ?? "");
  const lines = source.split(/\r?\n/);
  const block = parseRefsBlock(source);

  // 没有 refs 段：追加一个。先保证末尾有换行，避免与最后一行粘连。
  if (block === undefined) {
    const body = lines.filter((line) => line.length > 0 || lines.indexOf(line) > 0);
    // 去掉尾部空行后补回一个换行
    while (body.length > 0 && body[body.length - 1].trim().length === 0) body.pop();
    const additions = [];
    additions.push("refs:");
    for (const [name, value] of Object.entries(updates ?? {})) {
      if (typeof value !== "string" || value.length === 0) continue;
      additions.push(`  ${name}: ${renderValue(value)}`);
    }
    return [...body, ...additions, ""].join("\n");
  }

  // 条目缩进：沿用段内第一个子条目，没有就比 refs 多两格。
  const childIndent =
    block.entries.length > 0
      ? " ".repeat(block.entries[0].line >= 0 ? countIndent(lines[block.entries[0].line]) : block.indent + 2)
      : " ".repeat(block.indent + 2);

  /** 待删除的行号（值为空时）。 */
  const removals = new Set();
  /** 新增的条目行。 */
  const additions = [];

  for (const [name, value] of Object.entries(updates ?? {})) {
    const existing = block.entries.find((entry) => entry.name === name);
    if (typeof value !== "string" || value.length === 0) {
      if (existing !== undefined) removals.add(existing.line);
      continue;
    }
    const rendered = `${childIndent}${name}: ${renderValue(value)}`;
    if (existing !== undefined) {
      lines[existing.line] = rendered;
    } else {
      additions.push(rendered);
    }
  }

  // 追加位置：refs 段最后一个条目之后；段内没有条目则紧跟 `refs:` 行。
  let insertAt;
  if (block.entries.length > 0) {
    insertAt = block.entries[block.entries.length - 1].line + 1;
  } else {
    insertAt = block.start + 1;
  }

  const result = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (removals.has(index)) continue;
    result.push(lines[index]);
    if (index === insertAt - 1) result.push(...additions);
  }
  // insertAt 落在文件末尾之外（refs 是最后一行且没有条目）
  if (insertAt >= lines.length) result.push(...additions);
  return result.join("\n");
}

/** 行首空格数。 */
function countIndent(line) {
  return line.length - line.trimStart().length;
}

/**
 * 渲染 YAML 标量。
 *
 * key 都是 `sk-…` 这类无特殊字符的串，但仍要处理少数含 `:#` 或引号的值，
 * 否则写进去之后读不回来（值是 key，读错就等于 key 丢了）。
 *
 * @param value - 原始值。
 * @returns 可安全写入的文本。
 */
function renderValue(value) {
  const text = String(value);
  if (text.length === 0) return "";
  const needsQuote = /[:#\[\]{},]/.test(text) || text !== text.trim();
  if (!needsQuote) return text;
  if (!text.includes("'")) return `'${text}'`;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}