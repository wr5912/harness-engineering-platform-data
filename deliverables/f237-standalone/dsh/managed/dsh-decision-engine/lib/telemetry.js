/**
 * 匿名使用统计的**上报端**（客户端部分）。
 *
 * ## 为什么单独一个模块
 *
 * 与 `stats-store.js` 同一个理由：统计路径最容易出「数字对不上」和「悄悄多打
 * 了一次网络请求」两类问题，而它们都没法靠读代码确认。因此这里把**纯计算**
 * （哪天算一天、该不该发、发什么）与**副作用**（读写状态文件、发 HTTP）分开：
 * 纯函数可以被 `test/telemetry.test.js` 直接断言，副作用部分接受注入的
 * `fetchImpl` / `clock` / `dir`，测试里完全不碰网络。
 *
 * ## 三条硬承诺
 *
 * 1. **关掉就是真的不联网**。`level === "off"` 时连状态文件都不读，更不发请求。
 * 2. **每台机器每天最多一次**。状态文件记 `lastAttemptDay`；同一天重复启动不会
 *    重发。这既是隐私承诺（不做行为追踪），也是服务端幂等的前提。
 * 3. **绝不阻塞插件**。`start()` 由调用方 `void` 掉，内部所有错误都被吞成
 *    一条警告：统计失败不能变成插件故障。
 *
 * ## 发什么、绝不发什么
 *
 * 发送的字段一共七个（见 `buildPayload`）：随机安装 id、插件版本、平台、架构、
 * 宿主版本、当天决策数、事件种类。**不发送**：API key、prompt / 工具参数、
 * 文件路径、会话内容、provider 网址、用户名、IP（服务端也不读
 * `CF-Connecting-IP`）。安装 id 是首次运行时生成的随机 UUIDv4，与任何账号
 * 无关；删除 `telemetry.json` 即换一个新 id。
 *
 * ## 为什么用固定 +8 时区算「一天」
 *
 * 中国自 1991 年起不再使用夏令时，`Asia/Shanghai` 恒为 UTC+8，因此
 * `(ms + 8h)` 之后取日历日就是当地日期，不需要 Intl / 时区数据库——后者在
 * Electron 里还取决于 ICU 的打包方式。服务端用同一算法，两端对日一致。
 *
 * @module dsh-decision-engine/telemetry
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** 默认上报端点（站点 Worker 的采集入口）。 */
export const DEFAULT_ENDPOINT = "https://dsh.zuos.us/api/e";

/** 统计档位：`off` 完全不联网，`install` 只在首次运行报一次，`daily` 每天一次。 */
export const TELEMETRY_LEVELS = ["off", "install", "daily"];

/**
 * 状态文件名（与 config.yml、stats.jsonl 同目录）。
 *
 * **不能叫 `telemetry.json`**：同目录下已有 `telemetry.jsonl`（本插件的本地决策
 * 流水账，用户会 `tail -f` 的那个）。两个只差一个字母、口径完全不同的文件放在
 * 一起，迟早有人清缓存时删错——而删错流水账等于丢掉用户的决策审计记录。
 */
export const STATE_FILE = "analytics.json";

/** 时区偏移（毫秒）。中国无夏令时，固定 +8 是精确的。 */
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 单次上报超时：宁可失败也不能拖住进程退出。 */
const REQUEST_TIMEOUT_MS = 5000;

/** 连续失败多少次后彻底降级（不再尝试，避免每天打一次注定失败的请求）。 */
const DEGRADE_AFTER_FAILURES = 30;

/**
 * 把时间戳格式化成 `Asia/Shanghai` 的日历日 `YYYY-MM-DD`。
 *
 * @param ms - 毫秒时间戳。
 * @returns 当地日期字符串；输入非数字时返回空串。
 */
export function shanghaiDay(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value)) return "";
  return new Date(value + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 安装 id 的合法性：UUIDv4 形态。服务端按同一规则校验。
 *
 * @param value - 待检查的值。
 * @returns 是否合法。
 */
export function isValidInstallId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** 生成一个新的安装 id（随机 UUIDv4，与任何账号 / 机器指纹无关）。 */
export function newInstallId() {
  return randomUUID();
}

/**
 * 解析状态文件内容。任何损坏都退化成「全新安装」而不是抛错——
 * 统计状态坏掉时，正确行为是当作没装过、重新报一次，而不是永远不报。
 *
 * @param text - 文件全文，可能为空或损坏。
 * @returns 规范化后的状态对象。
 */
export function parseState(text) {
  let raw = null;
  try {
    raw = JSON.parse(String(text ?? ""));
  } catch {
    raw = null;
  }
  const source = raw !== null && typeof raw === "object" ? raw : {};
  const firstRun = Number(source.firstRunAt);
  return {
    installId: isValidInstallId(source.installId) ? source.installId : null,
    firstRunAt: Number.isFinite(firstRun) && firstRun > 0 ? firstRun : null,
    firstVersion: typeof source.firstVersion === "string" ? source.firstVersion : "",
    lastSentDay: typeof source.lastSentDay === "string" ? source.lastSentDay : "",
    lastAttemptDay: typeof source.lastAttemptDay === "string" ? source.lastAttemptDay : "",
    lastOkDay: typeof source.lastOkDay === "string" ? source.lastOkDay : "",
    failures: Number.isFinite(Number(source.failures)) ? Math.max(0, Number(source.failures)) : 0,
    degraded: source.degraded === true,
  };
}

/**
 * 序列化状态。字段顺序固定，便于人直接读这个文件。
 *
 * @param state - `parseState` 形状的对象。
 * @returns JSON 文本（带结尾换行）。
 */
export function serializeState(state) {
  return `${JSON.stringify({
    installId: state?.installId ?? null,
    firstRunAt: state?.firstRunAt ?? null,
    firstVersion: state?.firstVersion ?? "",
    lastSentDay: state?.lastSentDay ?? "",
    lastAttemptDay: state?.lastAttemptDay ?? "",
    lastOkDay: state?.lastOkDay ?? "",
    failures: state?.failures ?? 0,
    degraded: state?.degraded === true,
  }, null, 2)}\n`;
}

/**
 * 决定本次启动要不要上报、报哪一种。纯函数，测试的主入口。
 *
 * @param state - 当前状态（`parseState` 形状）。
 * @param options.today - 当地日期 `YYYY-MM-DD`。
 * @param options.level - `off` / `install` / `daily`。
 * @returns `"install"` / `"heartbeat"` / `null`（null = 本次不发）。
 */
export function decideKind(state, { today, level } = {}) {
  if (level === "off") return null;
  if (typeof today !== "string" || today.length === 0) return null;
  if (state?.degraded === true) return null;
  // 同一当地日重复启动不重发：这是「每天最多一次」的唯一执行点。
  if (state?.lastAttemptDay === today) return null;
  const fresh = !isValidInstallId(state?.installId) || !Number.isFinite(Number(state?.firstRunAt));
  if (fresh) return "install";
  if (level === "install") return null;
  return "heartbeat";
}

/**
 * 版本号清洗：只保留可打印的版本字符，防注入与超长。
 *
 * @param value - 原始版本号。
 * @returns 清洗后的版本号，可能为空串。
 */
export function normalizeVersion(value) {
  return String(value ?? "").trim().replace(/[^0-9A-Za-z._+-]/g, "").slice(0, 32);
}

/** 平台 / 架构等短字段的统一清洗。 */
function shortField(value, max = 24) {
  return String(value ?? "").trim().replace(/[^0-9A-Za-z._+-]/g, "").slice(0, max);
}

/**
 * 插件标识（npm 包名的合法形态）：小写，字母数字与 `-` / `.` / `_`，最长 48。
 *
 * **这是多插件共存的前提**：上报体必须自报家门，否则 D1 里分不清哪条数据属于
 * 哪个插件。将来 dsh 生态里出现第二个、第三个插件时，统计天然分开，不需要改
 * 协议版本，也不必给每张表临时补迁移。
 *
 * 上限 48 而不是更长：一个表的主键前缀越长，索引越占空间，而 npm 包名超过
 * 48 字符的情况极其罕见。
 *
 * @param value - 原始值（通常是 package.json 的 name）。
 * @returns 合法插件 id；非法时返回空串（由调用方决定是回退还是拒发）。
 */
export function normalizePluginId(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{0,47}$/.test(text) ? text : "";
}

/**
 * 构造上报体。**字段名刻意用短键**：心跳是免费的，但没必要把字节花在字段名
 * 上；短键同时天然限制了能塞进去的东西（没有地方放 prompt）。
 *
 * @param input.pluginId - 本插件的 npm 包名（必填，服务端按它分插件统计）。
 * @param input.installId - 安装 id。
 * @param input.kind - `install` / `heartbeat`。
 * @param input.version - 本插件版本。
 * @param input.platform - `process.platform`。
 * @param input.arch - `process.arch`。
 * @param input.hostVersion - 宿主版本（拿不到时为空串）。
 * @param input.decisions - 当天决策数（0 表示没有，不上报该字段）。
 * @returns 可直接 `JSON.stringify` 的对象。
 */
export function buildPayload(input = {}) {
  const payload = {
    v: 1,
    // `p` = plugin：谁在报。客户端没有合法插件 id 时在 prepare 阶段就拦下，
    // 这里只负责清洗。
    p: normalizePluginId(input.pluginId),
    id: input.installId,
    k: input.kind,
    ver: normalizeVersion(input.version) || "unknown",
    os: shortField(input.platform),
    arch: shortField(input.arch),
  };
  const host = normalizeVersion(input.hostVersion);
  if (host.length > 0) payload.host = host;
  const decisions = Number(input.decisions);
  if (Number.isFinite(decisions) && decisions > 0) payload.d = Math.min(Math.trunc(decisions), 100000);
  return payload;
}

/**
 * 校验并规范化上报端点。只接受 http/https；留空或非法时回落默认值
 * （统计不该因为一个写错的地址就整体失败）。
 *
 * @param raw - 配置里的地址。
 * @returns 完整 URL。
 */
export function resolveEndpoint(raw) {
  const text = String(raw ?? "").trim();
  if (text.length === 0) return DEFAULT_ENDPOINT;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_ENDPOINT;
    return url.href;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

/**
 * 把档位规范化成三个合法值之一；未知值按默认值处理。
 *
 * 默认是 **`daily`**。这里推翻了最初的 `install` 方案，理由是它会让统计
 * **彻底失效**：`install` 档只在首次运行报一次，已装用户第二天起不再上报，
 * 于是 `daily_active` 永远没有新行、DAU/WAU 恒为 0——「每天看一次数据」
 * 这个需求根本不可能满足。
 *
 * 与「默认不擅自介入」的关系：那条姿态针对的是**守卫**（`enabled: false`
 * 意味着不干预会话）。上报不发请求给 provider、不改任何裁决、不增加延迟
 * （`apply()` 里 `void` 掉），隐私边界也写死在上报体（7 个字段、无内容）。
 * 因此默认 `daily` 不违背该姿态；`off` 依然是一个请求都不发的硬承诺。
 *
 * @param raw - 配置里的值。
 * @param fallback - 未知值时回落到什么档位，默认 `daily`。
 * @returns 合法档位。
 */
export function resolveLevel(raw, fallback = "daily") {
  const text = String(raw ?? "").trim();
  if (TELEMETRY_LEVELS.includes(text)) return text;
  return TELEMETRY_LEVELS.includes(fallback) ? fallback : "daily";
}

/**
 * 上报器。副作用全部集中在这里，且只在 `start()` 里发生一次。
 *
 * 与 `StatsStore` 同一模式：注入 `dir` / `logger` / `fetchImpl` / `clock`，
 * 测试不需要环境与网络。
 */
export class TelemetryReporter {
  #dir;
  #logger;
  #endpoint;
  #pluginId;
  #level;
  #fetchImpl;
  #clock;
  #warned = false;

  /**
   * @param options.dir - 状态文件所在目录（插件数据目录）。
   * @param options.logger - 宿主 logger，可缺省。
   * @param options.endpoint - 上报地址；留空用默认。
   * @param options.level - `off` / `install` / `daily`。
   * @param options.pluginId - 本插件标识（npm 包名）。**必填**：没有它服务端
   *   分不清数据属于哪个插件，因此非法/缺失时整条上报被拒（见 `prepare`）。
   * @param options.fetchImpl - 注入的 fetch，测试用。
   * @param options.clock - 注入的时钟，测试用。
   */
  constructor(options = {}) {
    this.#dir = options.dir ?? ".";
    this.#logger = options.logger;
    this.#endpoint = resolveEndpoint(options.endpoint);
    this.#pluginId = normalizePluginId(options.pluginId);
    this.#level = resolveLevel(options.level ?? "daily");
    this.#fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.#clock = typeof options.clock === "function" ? options.clock : () => Date.now();
  }

  /** 当前档位（`off` 时调用方可以直接跳过整个流程）。 */
  get level() {
    return this.#level;
  }

  /** 当前生效的上报端点（排查时直接看日志即可）。 */
  get endpoint() {
    return this.#endpoint;
  }

  /** 当前插件标识；为空串表示配置有误、不会上报。 */
  get pluginId() {
    return this.#pluginId;
  }

  /** 状态文件绝对路径（用户排查时会直接看这个文件）。 */
  get statePath() {
    return join(this.#dir, STATE_FILE);
  }

  /**
   * 读状态文件；不存在或损坏时返回「全新安装」的初始状态。
   * 注意：**不创建文件**——只读，不产生副作用。
   *
   * @returns 状态对象。
   */
  async readState() {
    try {
      return parseState(await readFile(this.statePath, "utf8"));
    } catch {
      return parseState("");
    }
  }

  /**
   * 原子写状态：先写临时文件再 rename，避免「写到一半被杀」留下半截 JSON。
   *
   * @param state - 完整状态。
   */
  async writeState(state) {
    await mkdir(this.#dir, { recursive: true });
    const tmp = `${this.statePath}.tmp`;
    await writeFile(tmp, serializeState(state), { encoding: "utf8", mode: 0o600 });
    await rename(tmp, this.statePath);
  }

  /**
   * 计算本次应发的上报体（不发送、不落盘，便于测试与干跑）。
   *
   * @param input.version - 插件版本。
   * @param input.platform - 平台。
   * @param input.arch - 架构。
   * @param input.hostVersion - 宿主版本。
   * @param input.decisions - 当日决策数。
   * @returns `{ state, payload, today, kind }`；不该发时 null。
   */
  async prepare(input = {}) {
    if (this.#level === "off") return null;
    // 没有合法的插件标识就**不发**。宁可少一条数据，也不能往公共统计里塞
    // 一条无法归属的记录——那正是多插件共存时最难收拾的一类脏数据。
    if (this.#pluginId.length === 0) return null;
    const now = this.#clock();
    const today = shanghaiDay(now);
    if (today.length === 0) return null;
    const state = await this.readState();
    const kind = decideKind(state, { today, level: this.#level });
    if (kind === null) return null;

    const installId = state.installId ?? newInstallId();
    const next = {
      ...state,
      installId,
      firstRunAt: state.firstRunAt ?? now,
      firstVersion: state.firstVersion.length > 0 ? state.firstVersion : normalizeVersion(input.version),
      lastAttemptDay: today,
    };
    const payload = buildPayload({
      pluginId: this.#pluginId,
      installId,
      kind,
      version: input.version,
      platform: input.platform,
      arch: input.arch,
      hostVersion: input.hostVersion,
      decisions: input.decisions,
    });
    return { state: next, payload, today, kind };
  }

  /**
   * 执行一次上报。**绝不抛错**：所有失败只记一条警告并把状态留到下次。
   *
   * @param input - 同 `prepare`。
   * @returns `{ sent: boolean, kind: string|null, reason: string }`，便于测试断言。
   */
  async start(input = {}) {
    if (this.#level === "off") return { sent: false, kind: null, reason: "off" };

    let prepared = null;
    try {
      prepared = await this.prepare(input);
    } catch (err) {
      this.#warn(`统计状态读取失败（不影响插件）：${String(err?.message ?? err)}`);
      return { sent: false, kind: null, reason: "state-error" };
    }
    if (prepared === null) return { sent: false, kind: null, reason: "not-due" };

    const { state, payload, today } = prepared;

    // 先落状态再发送：即便发送过程中进程被杀，也不会因为「没记过」而在同一天
    // 反复重发。代价是发送失败的那一天不会重试——下次启动就是明天了。
    try {
      await this.writeState(state);
    } catch (err) {
      this.#warn(`统计状态写入失败（不影响插件）：${String(err?.message ?? err)}`);
    }

    const sent = await this.#post(payload);
    try {
      await this.writeState({
        ...state,
        lastSentDay: sent ? today : state.lastSentDay,
        lastOkDay: sent ? today : state.lastOkDay,
        failures: sent ? 0 : state.failures + 1,
        degraded: sent ? false : state.failures + 1 >= DEGRADE_AFTER_FAILURES,
      });
    } catch {
      /* 第二次写失败只影响下次重试，不必再警告 */
    }
    if (!sent) this.#warn(`上报未成功（端点 ${this.#endpoint}），下次启动再试；不影响插件`);
    return { sent, kind: payload.k, reason: sent ? "ok" : "http-failed" };
  }

  /** 真正发请求；返回是否 2xx。超时 / 网络错误一律当作「没发成功」。 */
  async #post(payload) {
    const fetchImpl = this.#fetchImpl;
    if (typeof fetchImpl !== "function") return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(this.#endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return Boolean(response?.ok);
    } catch {
      // 离线、被墙、端点 5xx：都只是「这次没报上去」，插件照常工作。
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 同一类警告只发一次，避免每天刷屏。 */
  #warn(message) {
    if (this.#warned) return;
    this.#warned = true;
    this.#logger?.warn?.(`dsh-decision-engine: ${message}`);
  }
}
