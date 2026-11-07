/**
 * `config.yml` 的极简读写。
 *
 * 为什么自己写：本插件的配置全是「标量 + 字符串数组」，为它引入一个 YAML
 * 依赖不值得（插件目标之一是零运行时依赖）。但这套读写必须**可测**——
 * 「保存后再打开没回显」「切换 provider 把别的配置冲掉」这类问题都出在这里，
 * 而它们无法靠读代码确认，只能靠往返测试。
 *
 * 因此把它从 `index.js` 拆出来：本模块零依赖、无 I/O，只做纯文本变换，
 * 可以被 `test/config-file.test.js` 直接调用。
 *
 * 支持的语法（够用即止）：
 *
 *   key: value           标量（含引号、行尾注释）
 *   key:                 显式空值（保留为 ""，语义是「用户要求留空」）
 *   key: [a, b]          字符串数组
 *   # 注释 / 空行        忽略
 *
 * @module dsh-decision-engine/config-file
 */

/**
 * 解析配置文件文本。
 *
 * @param text - 文件全文。
 * @returns 键值对；无法识别的行被忽略。
 */
export function parseConfigText(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) continue;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    // 去掉行尾注释（只处理 ` #` 之后的，避免把 URL 里的 # 当注释）
    const hashAt = value.indexOf(" #");
    if (hashAt >= 0) value = value.slice(0, hashAt).trim();
    // 显式空值（`model:` 后面什么都不写）必须被保留为 ""。
    // 若在这里丢弃，键会缺失并回落到内置默认模型名，「自动」就永远无法生效。
    if (value.length === 0) {
      out[key] = "";
      continue;
    }
    if (isSingleQuoted(value)) {
      out[key] = value.slice(1, -1);
      continue;
    }
    if (isDoubleQuoted(value)) {
      // 双引号内允许 `\"`：面板保存带引号的值（如 JSON 形态的请求头）时
      // 会转义，读回必须还原，否则每次保存都多一层反斜杠。
      out[key] = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      continue;
    }
    // 标量类型推断
    if (value === "true") out[key] = true;
    else if (value === "false") out[key] = false;
    else if (/^-?\d+$/.test(value)) out[key] = Number(value);
    else if (value.startsWith("[") && value.endsWith("]")) {
      out[key] = value
        .slice(1, -1)
        .split(",")
        .map((part) => part.trim().replace(/^["']|["']$/g, ""))
        .filter((part) => part.length > 0);
    } else out[key] = value;
  }
  return out;
}

/** 值是否为成对单引号包裹（未闭合不算）。 */
function isSingleQuoted(value) {
  return value.length >= 2 && value.startsWith("'") && value.endsWith("'");
}

/** 值是否为成对双引号包裹（未闭合不算）。 */
function isDoubleQuoted(value) {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"');
}

/**
 * 把值渲染成 yml 右侧的文本。
 *
 * 需要引号的情况：含 `: # [ ] { } ,` 或首尾空白。优先用单引号，
 * 因为值里带 `"` 时单引号不需要转义；只有同时含单引号与特殊字符时才退回
 * 双引号并转义。
 *
 * @param value - 任意标量。
 * @returns 渲染结果（不含 `key: ` 前缀）。
 */
export function renderConfigValue(value) {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => String(item ?? "").trim()).filter((item) => item.length > 0).join(", ")}]`;
  }
  const text = String(value ?? "");
  if (text.length === 0) return "";
  const needsQuote = /[:#\[\]{},]/.test(text) || text !== text.trim() || text.includes("\n");
  if (!needsQuote) return text;
  if (!text.includes("'") && !text.includes("\n")) return `'${text}'`;
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 把若干键值写回配置文本的行数组。
 *
 * 保留原有注释与顺序，只替换/追加目标键——用户的注释是说明书，
 * 整文件重写一次就全丢，而这份文件是用户唯一能看懂配置的地方。
 *
 * @param lines - 现有行（会被修改副本，不原地改动入参）。
 * @param updates - 要写入的键值；`undefined` 视为「不修改」。
 * @returns 新行数组。
 */
export function applyConfigUpdates(lines, updates) {
  const out = [...lines];
  for (const [key, value] of Object.entries(updates ?? {})) {
    if (value === undefined) continue;
    const rendered = `${key}: ${renderConfigValue(value)}`.trimEnd();
    let replaced = false;
    for (let index = 0; index < out.length; index += 1) {
      const trimmed = out[index].trim();
      if (trimmed.startsWith("#")) continue;
      const sep = trimmed.indexOf(":");
      if (sep <= 0) continue;
      if (trimmed.slice(0, sep).trim() !== key) continue;
      // 保留原有的缩进，避免把用户手动缩进的块写歪。
      const indent = out[index].slice(0, out[index].length - out[index].trimStart().length);
      out[index] = indent + rendered;
      replaced = true;
      break;
    }
    if (!replaced) out.push(rendered);
  }
  return out;
}