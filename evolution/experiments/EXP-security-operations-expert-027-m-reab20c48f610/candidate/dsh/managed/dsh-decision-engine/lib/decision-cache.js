/**
 * 决策结果缓存。
 *
 * 为什么需要两种键：
 *
 * 旧实现只用「完整 state 的 sha256」当键。完整 state 里含 `args_preview`
 * （本次工具调用的实际参数），所以每次调用参数一变键就变——实测 309 次
 * 调用命中 0 次，等于缓存完全没工作，每次都真发请求。
 *
 * 现在分两层：
 *
 *   exact  键来自完整 state。命中即复用，绝对安全——默认只写这一层。
 *   soft   键来自「归一化签名」：工具名 + 命令族 + 风险标记集合。
 *          签名刻意丢弃参数内容，命中即意味着「不同参数共享同一次裁决」。
 *          曾以为靠风险标记一致 + 只缓存低风险放行就安全，但缓存层自己
 *          不判断风险：只要第一次（哪怕完全合理的）放行进了软层，同骨架
 *          的任何后续参数——包括危险得多的那一个——都会继承放行。
 *          因此软层只对**显式声明 `softCacheable: true`** 的调用方开放
 *          （fail-closed），授权（authorize）等安全检查绝不声明；
 *          评审意见 2026-10 即针对此处。
 */

import { createHash } from "node:crypto";

/**
 * 危险动作标记。命中越多，越不可能进 soft 层。
 * 这些词是「会改变外部世界」的动作，而不是普通读写。
 */
const RISK_PATTERNS = [
  ["rm", /\brm\b/],
  ["rmdir", /\brmdir\b/],
  ["mv", /\bmv\b/],
  ["dd", /\bdd\b/],
  ["mkfs", /\bmkfs/],
  ["chmod", /\bchmod\b/],
  ["chown", /\bchown\b/],
  ["sudo", /\bsudo\b/],
  ["kill", /\b(kill|pkill|killall)\b/],
  ["reboot", /\b(reboot|shutdown|halt)\b/],
  ["git-push", /\bgit\s+push\b/],
  ["git-reset", /\bgit\s+(reset|clean)\b/],
  ["publish", /\b(npm|pnpm|yarn)\s+publish\b/],
  ["curl", /\b(curl|wget)\b/],
  ["ssh", /\b(ssh|scp|rsync)\b/],
  ["redirect", /(^|[^>])>{1,2}[^>]/],
  ["pipe", /\|/],
  ["chain", /(&&|;)/],
  ["subshell", /\$\(|`/],
  ["eval", /\b(eval|exec)\b/],
  ["truncate", /\b(truncate|unlink)\b/],
  ["drop", /\b(drop|delete|truncate)\s+(table|database)\b/i],
  ["launchctl", /\b(launchctl|crontab|systemctl)\b/],
  ["defaults", /\bdefaults\s+write\b/],
  ["security", /\bsecurity\s+(delete|add)/],
];

/**
 * 从一段命令文本里抽取风险标记。
 * @param text - 命令或参数预览。
 * @returns 排序后的标记名数组。
 */
export function riskFlags(text) {
  const source = typeof text === "string" ? text : "";
  if (source.length === 0) return [];
  const hits = [];
  for (const [name, pattern] of RISK_PATTERNS) {
    if (pattern.test(source)) hits.push(name);
  }
  return hits;
}

/**
 * 归一化命令族：取第一个「看起来像命令」的词。
 *
 * 目的是让同一类重复操作落到同一个键上，例如反复跑的
 * `node -e ...` / `python3 - <<PY` / `ls -la`。
 *
 * @param text - 命令或参数预览。
 * @returns 命令族名（小写），取不到时返回空串。
 */
export function commandFamily(text) {
  const source = (typeof text === "string" ? text : "").trim();
  if (source.length === 0) return "";
  // 去掉前导环境变量赋值，如 `FOO=1 bar`
  const withoutEnv = source.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
  const first = withoutEnv.split(/[\s;|&]+/)[0] ?? "";
  // 只保留命令名的基名，去掉路径
  const base = first.split("/").pop() ?? "";
  return base.toLowerCase().slice(0, 32);
}

/**
 * 双层决策缓存。
 *
 * @param limit - 最多保留多少条（<=0 表示禁用缓存）。
 * @param ttlMs - 条目存活时间；策略或配置改了之后旧裁决不该继续被复用。
 */
export class DecisionCache {
  /**
   * @param getLimit - 返回当前容量的取值函数；<=0 表示禁用缓存。
   * @param getTtlMs - 返回当前存活时间的取值函数。
   *   两者都接收函数而非定值：配置页改了缓存参数应当立刻生效，
   *   不该要求重启（与端点、密钥的处理方式一致）。
   */
  constructor(getLimit, getTtlMs) {
    this.getLimit = getLimit;
    this.getTtlMs = getTtlMs;
    this.map = new Map();
    this.stats = { exactHits: 0, softHits: 0, stores: 0, softStores: 0 };
  }

  /** 当前容量。 */
  get limit() {
    const value = Number(typeof this.getLimit === "function" ? this.getLimit() : this.getLimit);
    return Number.isFinite(value) ? value : 0;
  }

  /** 当前存活时间。 */
  get ttlMs() {
    const value = Number(typeof this.getTtlMs === "function" ? this.getTtlMs() : this.getTtlMs);
    return Number.isFinite(value) && value > 0 ? value : 600000;
  }

  /** 完整 state 的精确键。 */
  static exactKey(parts) {
    return "e:" + createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  }

  /**
   * 归一化软键：工具名 + 命令族 + 风险标记。
   * 三者全同才认为是同一类操作。
   *
   * ⚠️ 键里不含参数内容：同键即意味着不同参数共享裁决。只允许非安全
   * 决策点在显式声明 `softCacheable: true` 后使用；授权等安全检查禁用。
   */
  static softKey(toolName, text) {
    const flags = riskFlags(text).join(",");
    const family = commandFamily(text);
    return `s:${toolName}|${family}|${flags}`;
  }

  get(key) {
    const entry = this.map.get(key);
    if (entry === undefined) return undefined;
    if (Date.now() - entry.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // LRU：命中后移到队尾
    this.map.delete(key);
    this.map.set(key, entry);
    if (key.startsWith("s:")) this.stats.softHits += 1;
    else this.stats.exactHits += 1;
    return entry.value;
  }

  /**
   * 写入。exact 键总是可写；soft 键只接受「低风险放行」的裁决。
   * @param key - 键。
   * @param value - 裁决。
   * @param soft - 是否为软键。
   */
  set(key, value, soft = false) {
    if (this.limit <= 0) return;
    if (soft) this.stats.softStores += 1;
    this.stats.stores += 1;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, at: Date.now() });
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  /** 命中率（含软硬两层），用于配置页展示。 */
  get report() {
    const hits = this.stats.exactHits + this.stats.softHits;
    const total = hits + this.stats.stores;
    return {
      size: this.map.size,
      exactHits: this.stats.exactHits,
      softHits: this.stats.softHits,
      stores: this.stats.stores,
      hitRate: total === 0 ? 0 : Math.round((hits / total) * 1000) / 1000,
    };
  }
}
