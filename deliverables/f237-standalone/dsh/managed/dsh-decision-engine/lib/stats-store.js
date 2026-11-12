/**
 * 统计数据的**持久化**层。
 *
 * ## 为什么不用 telemetry.jsonl
 *
 * 需求要求按 provider / model 维度统计 token 与耗时，而现有
 * `telemetry.jsonl` 的字段**覆盖不了**：
 *
 *   - **没有 provider**：只有 model。同一模型在两个 provider 上跑，分不开。
 *   - **没有 output_tokens**：API 返回了 `usage.output_tokens`，但遥测只记
 *     了 input。节省量必须同时看输入与输出。
 *   - **没有基线**：没有「不优化时会花多少」，只能事后猜。
 *   - **耗时口径不一致**：遥测里的 `latencyMs` 是缓存命中时的 0，
 *     与真实请求的耗时混在同一个字段里，累加出来的「总耗时」没有意义。
 *
 * 所以统计走**独立的 `stats.jsonl`**，与遥测各管各的：
 *
 *   - `telemetry.jsonl`  服务于「事后核对决策过程」（人读的流水账）；
 *   - `stats.jsonl`      服务于「统计与对比」（机器读的结构化度量）。
 *
 * ## 为什么用 JSONL 而不是 SQLite
 *
 * 需求给的两条路都可行。选 JSONL 的理由：
 *
 *   1. **零依赖**：本插件的硬约束是零运行时依赖。`node:sqlite` 虽然是
 *      Node 内置的，但在 Electron 里需要 `--experimental-sqlite`（旧版）
 *      或承担版本差异，而 JSONL 只需要 `appendFile`。
 *   2. **写入路径简单**：每次一条 `appendFile`，天然原子、不需要事务、
 *      不需要担心「写到一半进程被杀」。崩溃时最多丢最后一条。
 *   3. **可读**：用户能直接 `tail -f stats.jsonl` 看，比开 sqlite3 方便。
 *   4. **统计量级不构成压力**：决策请求是分钟级频率，一天几千条，
 *      JSONL 完全撑得住。
 *
 * ## 写入为什么不影响主功能
 *
 * `record()` **不 await**：它把写盘动作排进一个串行队列就立刻返回。
 * 决策路径上的等待时间因此恒为「入队 + 拼字符串」，而不是「等磁盘」。
 * 队列内部保证顺序与不交错（否则并发写会串行），失败只记一次警告。
 *
 * @module dsh-decision-engine/stats-store
 */

import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PROVIDER_PRESETS } from "./providers.js";
import { DECISION_POINTS } from "./decision-points.js";

/** 统计文件名（与 `telemetry.jsonl` 同目录）。 */
export const STATS_FILE_NAME = "stats.jsonl";

/**
 * 老遥测的「模型名 → provider」反推表。
 *
 * 只用于**回填**：老遥测没有 provider 字段（上面「为什么不用 telemetry.jsonl」
 * 一节第一条），但其 `model` 字段往往能反推出服务商——
 *
 *   - `startlux-*`  是 bamboonode 的默认决策模型（老版本唯一端点就是 bamboonode，
 *     没有 provider 概念时默认走它）；
 *   - `Kev-*` / `SemIf*` 是硅基流动（siliconflow，国内站）的模型。
 *
 * 两个 SiliconFlow 站点（国内站 / 国际站）都提供 Kev-4B / SemIf，老遥测分不出
 * 来，平局按用户选择归国内站（siliconflow）。
 *
 * 反推是**尽力而为**：匹配不上的（例如老遥测里 model 也是空，或某个第三方
 * 模型名）退回 `"unknown"`，由界面显示为「未知（历史）」——绝不能为了消除
 * 这个标签而去凭空猜一个服务商（那会让「按 provider 对比」出现一家不存在的）。
 */
const LEGACY_MODEL_PROVIDERS = [
  { brand: "startlux", provider: "bamboonode" },
  { brand: "kev", provider: "siliconflow" },
  { brand: "semif", provider: "siliconflow" },
];

/**
 * 从模型名反推老记录的 provider。
 *
 * @param model - 老遥测里的模型名（可能为任意字符串或缺失）。
 * @returns provider id；匹配不上返回 `"unknown"`。
 */
export function inferLegacyProvider(model) {
  const name = typeof model === "string" ? model.trim().toLowerCase() : "";
  if (name.length === 0) return "unknown";
  for (const { brand, provider } of LEGACY_MODEL_PROVIDERS) {
    if (name.startsWith(brand)) return provider;
  }
  return "unknown";
}

/**
 * 从遥测条目里找回 provider（回填用）。
 *
 * 来源按可靠度排序：
 *
 *   1. `entry.provider` —— 新版遥测直接带（这是**根治点**：遥测从 2026-10-27
 *      起每次决策都记 provider，回填不必再猜）。
 *   2. `entry.extra.provider` —— 降级记录里服务商 id 已经被记进 `extra`。
 *   3. `entry.extra.endpoint` 的主机名 —— 降级记录几乎都带 endpoint，按预设的
 *      baseUrl 主机名反查服务商（bamboonode / 硅基流动国内站 / 国际站 / system one）。
 *   4. 按模型名反推（`inferLegacyProvider`）—— 老遥测最后的手段。
 *
 * @param entry - 遥测条目。
 * @param model - 条目里的模型名（可能为空）。
 * @returns provider id；实在找不出返回 `"unknown"`。
 */
export function providerOfTelemetryEntry(entry, model) {
  const direct = typeof entry?.provider === "string" ? entry.provider.trim() : "";
  if (direct.length > 0 && direct !== "unknown") return direct;
  const extraProvider = typeof entry?.extra?.provider === "string" ? entry.extra.provider.trim() : "";
  if (extraProvider.length > 0 && extraProvider !== "unknown") return extraProvider;
  const endpoint = typeof entry?.extra?.endpoint === "string" ? entry.extra.endpoint : "";
  const byEndpoint = providerByEndpoint(endpoint);
  if (byEndpoint !== "unknown") return byEndpoint;
  return inferLegacyProvider(model);
}

/**
 * 按 endpoint 的主机名反查服务商。
 *
 * 只认**内置预设**的 baseUrl 主机名：自建/自定义地址（custom）无从判断归属，
 * 宁可留 unknown，也不猜。
 *
 * @param endpoint - 请求地址（可能为空或非法）。
 * @returns provider id；匹配不上返回 `"unknown"`。
 */
export function providerByEndpoint(endpoint) {
  const raw = typeof endpoint === "string" ? endpoint.trim() : "";
  if (raw.length === 0) return "unknown";
  let host;
  try {
    host = new URL(raw).host.toLowerCase();
  } catch {
    return "unknown";
  }
  if (host.length === 0) return "unknown";
  for (const preset of Object.values(PROVIDER_PRESETS)) {
    const base = typeof preset.baseUrl === "string" ? preset.baseUrl : "";
    if (base.length === 0) continue;
    try {
      if (new URL(base).host.toLowerCase() === host) return preset.id;
    } catch {
      /* 预设地址不合法就跳过 */
    }
  }
  return "unknown";
}

/**
 * 取某个 provider 的默认模型（回填与迁移用）。
 *
 * 降级记录没有拿到任何答案，本就没有 model；但服务商是知道的，而服务商
 * 有默认模型——那就是「本来会用的那个」。落到它上面，降级记录才会并进
 * 正确的那一行，而不是自成一行「某 provider / unknown」零数据。
 *
 * @param provider - provider id。
 * @returns 默认模型名；该 provider 没有默认模型时返回 `"unknown"`。
 */
export function defaultModelOf(provider) {
  const id = typeof provider === "string" ? provider.trim() : "";
  if (id.length === 0 || id === "unknown") return "unknown";
  const preset = PROVIDER_PRESETS[id];
  const model = typeof preset?.defaultModel === "string" ? preset.defaultModel.trim() : "";
  return model.length > 0 ? model : "unknown";
}

/**
 * 从老遥测的 tag 反推决策点。
 *
 * @param tag - 老遥测条目的 tag（可能缺失）。
 * @param point - 条目自带的 point 字段（新遥测有；有就直接用）。
 * @returns 决策点 id；无法确定返回 `"unknown"`。
 */
export function inferLegacyPoint(tag, point) {
  if (typeof point === "string" && point.trim().length > 0) return point.trim();
  const value = typeof tag === "string" ? tag.trim() : "";
  if (value.length === 0) return "unknown";
  if (value === "guard") return "authorize";
  if (value.startsWith("adapter/")) return value.slice("adapter/".length);
  // 引擎写的 tag 就是决策点 id（engine.js: tag: id）。必须与注册表核对：
  // 遥测里若出现未登记的 tag，不能想当然当成一个决策点。
  for (const def of DECISION_POINTS) {
    if (def.id === value) return value;
  }
  return "unknown";
}

/**
 * 统计存储。
 *
 * 用法：
 *
 *   const store = new StatsStore({ dir });
 *   store.record(buildRecord({ … }));        // 不 await，异步落盘
 *   const records = await store.read();      // 读全部
 */
export class StatsStore {
  /**
   * @param options.dir - 插件数据目录（`~/.dsh/dsh-decision-engine/`）。
   * @param options.fileName - 文件名，默认 `stats.jsonl`。
   * @param options.logger - 宿主 logger；写盘失败时用它警告。
   * @param options.maxQueue - 待写队列上限；超过则丢弃最旧的条目。
   *   防止磁盘挂掉时队列无限增长吃光内存。
   */
  constructor(options = {}) {
    this.dir = options.dir;
    this.fileName = options.fileName ?? STATS_FILE_NAME;
    this.logger = options.logger;
    this.maxQueue = Number.isFinite(options.maxQueue) ? Math.max(16, options.maxQueue) : 4096;
    /** 待写队列（字符串，已序列化）。 */
    this.queue = [];
    /** 正在进行的写盘任务。 */
    this.pending = null;
    /** 累计写入条数（诊断用）。 */
    this.written = 0;
    /** 累计失败条数（诊断用）。 */
    this.failed = 0;
    /** 队列被丢弃的条数（磁盘异常时的兜底计数）。 */
    this.dropped = 0;
  }

  /** 统计文件的绝对路径。 */
  get path() {
    return join(this.dir, this.fileName);
  }

  /**
   * 记录一条统计。
   *
   * **不返回 Promise**：调用方不该 await 它。写盘在后台串行进行，
   * 决策路径上的额外开销只有一次数组 push 与一次 JSON.stringify。
   *
   * @param record - `buildRecord()` 造出的记录。
   */
  record(record) {
    if (record === null || typeof record !== "object") return;
    let line;
    try {
      line = JSON.stringify(record);
    } catch {
      // 循环引用之类的问题不该把调用方带崩——统计是旁路。
      this.failed += 1;
      return;
    }
    if (this.queue.length >= this.maxQueue) {
      // 队列满说明磁盘写不过来（或者进程被 SIGSTOP 了）。丢最旧的，
      // 保最新的——统计的价值在近期数据。
      this.queue.shift();
      this.dropped += 1;
    }
    this.queue.push(`${line}\n`);
    this.schedule();
  }

  /**
   * 安排一次落盘。
   *
   * 串行保证顺序：写入中的那一次没结束就不再发起新的写，否则两个
   * `appendFile` 并发会让同一行被拆成两半（JSONL 一行被拆开后，
   * 解析时会被当成两条坏行丢掉）。
   */
  schedule() {
    if (this.pending !== null) return;
    this.pending = this.drain().finally(() => {
      this.pending = null;
      // 入队期间又来了新条目：继续排空。
      if (this.queue.length > 0) this.schedule();
    });
  }

  /**
   * 把队列里的条目写进文件。
   *
   * 一次 `appendFile` 写一批，而不是每条一次——减少系统调用，
   * 也让文件里的行保持连续。
   */
  async drain() {
    // 让出一次事件循环：调用方（决策路径）先跑完，不被写盘堵住。
    await Promise.resolve();
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.queue.length);
      const payload = batch.join("");
      try {
        await mkdir(dirname(this.path), { recursive: true });
        await appendFile(this.path, payload, "utf8");
        this.written += batch.length;
      } catch (error) {
        // 写盘失败：丢这批，记一次警告。**不重试**——重试会堆积，
        // 而统计失败绝不该拖住决策。
        this.failed += batch.length;
        this.logger?.warn?.(
          `dsh-decision-engine: 写入统计文件失败（${error instanceof Error ? error.message : String(error)}）`,
        );
      }
    }
  }

  /**
   * 等待队列里的内容全部落盘。
   *
   * 只在**关停**或测试里用；决策路径上绝不能 await 它。
   *
   * @returns 落盘后的条数。
   */
  async flush() {
    while (this.pending !== null) {
      await this.pending.catch(() => {});
    }
    return this.written;
  }

  /**
   * 把旧遥测**一次性**回填进统计文件。
   *
   * 为什么落盘而不是每次查询现算：
   *
   *   现算的话，回填只在「统计文件为空」时才有数据——而统计文件在插件
   *   跑起来后第一笔新请求就会被创建，于是**历史瞬间消失**。用户刚升级
   *   就发现「以前一个月的记录不见了」，比「一开始就是空的」更伤。
   *
   *   落盘之后历史与新记录同处一个文件，随时间范围一起被统计到。
   *
   * 只做一次：靠标记文件记住「已经回填过」，否则每次启动都会把旧遥测
   * 再灌一遍，统计里就全是重复的历史。
   *
   * @param options.telemetryFileName - 遥测文件名，默认 `telemetry.jsonl`。
   * @param options.markerFileName - 标记文件名，默认 `stats.backfilled`。
   * @returns 回填的条数；0 表示没回填（已回填过 / 没有旧遥测 / 失败）。
   */
  async backfillOnce(options = {}) {
    const markerName = options.markerFileName ?? "stats.backfilled";
    const markerPath = join(this.dir, markerName);
    // 已经回填过：直接跳过。
    try {
      await stat(markerPath);
      return 0;
    } catch {
      /* 标记不存在 = 还没回填过 */
    }
    let legacy;
    try {
      legacy = await backfillFromTelemetry({
        dir: this.dir,
        telemetryFileName: options.telemetryFileName ?? "telemetry.jsonl",
      });
    } catch {
      return 0;
    }
    if (legacy.length === 0) {
      // 没有旧遥测可回填，但也**要**留下标记：否则每次启动都要重扫一遍
      // （而 telemetry.jsonl 可能根本不存在）。
      await this.writeMarker(markerPath);
      return 0;
    }
    try {
      await mkdir(this.dir, { recursive: true });
      // 直接追加（不走队列）：这里本来就是启动时的一次性动作，
      // 等一下没关系，而且要保证「写完再打标记」的顺序。
      await appendFile(
        this.path,
        legacy.map((row) => `${JSON.stringify(row)}\n`).join(""),
        "utf8",
      );
      this.written += legacy.length;
      await this.writeMarker(markerPath);
      return legacy.length;
    } catch (error) {
      this.failed += legacy.length;
      this.logger?.warn?.(
        `dsh-decision-engine: 回填历史统计失败（${error instanceof Error ? error.message : String(error)}）`,
      );
      return 0;
    }
  }

  /**
   * 把已落盘的历史记录按模型名**补回 provider**（一次性迁移）。
   *
   * 为什么需要它：在「回填时按模型名反推 provider」这个功能上线之前，
   * 已经回填过的统计文件里，那批历史记录一律是 `provider: "unknown"`，
   * 统计页上显示为「未知（历史）」——而它们其实能反推出来。这个迁移只
   * 针对**已回填**的记录（带 `estimated: true`），不碰真实记录里因降级
   * 失败而确实是 `"unknown"` 的新记录（那些是真的没解析到 provider）。
   *
   * 与回填一样只做一次：靠 `stats.provider-repaired` 标记记住，否则每次
   * 启动都重扫一遍（虽然幂等，但没意义）。
   *
   * 降级记录另有一条路：统计行里没有 `extra`，但遥测里有——按**时间戳**
   * 与遥测对上，就能拿到 `extra.provider` / `extra.endpoint`（见
   * `fillMissingModesOnce` 里同样的时间戳索引做法）。对不上的才退回按模型名
   * 反推。
   *
   * @param options.markerFileName - 标记文件名，默认 `stats.provider-repaired`。
   * @returns 被补回 provider 的条数；0 表示没有可补的（已修过 / 无文件）。
   */
  async repairLegacyProviderOnce(options = {}) {
    const markerName = options.markerFileName ?? "stats.provider-repaired";
    const markerPath = join(this.dir, markerName);
    // 已修过：直接跳过。
    try {
      await stat(markerPath);
      return 0;
    } catch {
      /* 标记不存在 = 还没修过 */
    }
    let raw;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      // 统计文件不存在：留标记，下次不再扫。
      await this.writeMarker(markerPath);
      return 0;
    }
    // 遥测索引：时间戳 → 该时刻可用的 provider / point（降级记录靠它找回归属，
    // 老回填行靠它找回决策点）。
    const index = await this.telemetryIndex(options.telemetryFileName);
    const providerByTs = index.provider;
    const pointByTs = index.point;
    let changed = 0;
    const out = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        out.push("");
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // 坏行原样保留（与 read() 的容错一致）。
        out.push(line);
        continue;
      }
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        (parsed.provider === "unknown" || parsed.provider === "" || parsed.provider === undefined)
      ) {
        // 优先用遥测里那一刻的 provider；没有再用模型名反推。
        const ts = typeof parsed.ts === "string" ? parsed.ts : "";
        const fromTelemetry = providerByTs.get(ts);
        const inferred =
          fromTelemetry !== undefined
            ? fromTelemetry
            : typeof parsed.model === "string"
              ? inferLegacyProvider(parsed.model)
              : "unknown";
        if (inferred !== "unknown" && inferred !== parsed.provider) {
          parsed.provider = inferred;
          changed += 1;
        }
      }
      // 决策点：老回填行没有 point（老遥测就没有这个字段）。靠时间戳与遥测
      // 对上找回，对不上的保持 unknown——不猜。
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        (parsed.point === "unknown" || parsed.point === "" || parsed.point === undefined)
      ) {
        const ts = typeof parsed.ts === "string" ? parsed.ts : "";
        const fromTelemetry = pointByTs.get(ts);
        if (fromTelemetry !== undefined && fromTelemetry !== parsed.point) {
          parsed.point = fromTelemetry;
          changed += 1;
        }
      }
      // 降级（失败）记录：provider 已经解析出来了（id 已知），但 model 因配置
      // 留空被记成了 "unknown"。回落到该 provider 的默认模型，消除统计表里
      // 凭空多出的「某 provider / unknown」零数据行（见 lib/index.js 的 degrade 路径）。
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        parsed.degraded === true &&
        (parsed.model === "unknown" || parsed.model === "" || parsed.model === undefined) &&
        typeof parsed.provider === "string"
      ) {
        const defaultModel = defaultModelOf(parsed.provider);
        if (defaultModel !== "unknown" && defaultModel !== parsed.model) {
          parsed.model = defaultModel;
          changed += 1;
        }
      }
      out.push(JSON.stringify(parsed));
    }
    if (changed > 0) {
      try {
        const tmp = `${this.path}.tmp`;
        await writeFile(tmp, `${out.join("\n")}\n`, "utf8");
        await rename(tmp, this.path);
      } catch (error) {
        this.logger?.warn?.(
          `dsh-decision-engine: 补回历史 provider 失败（${error instanceof Error ? error.message : String(error)}）`,
        );
        await this.writeMarker(markerPath);
        return 0;
      }
    }
    // 无论是否改动了文件都留标记：下次启动不再扫（幂等）。
    await this.writeMarker(markerPath);
    return changed;
  }

  /**
   * 建「遥测时间戳 → provider / point」索引（迁移用）。
   *
   * 统计行里没有 `extra`（provider 与 endpoint 的原始线索只在遥测里），
   * 所以要把统计行归回服务商，只能靠**时间戳**与遥测对上——与
   * `fillMissingModesOnce` 补 mode 用的是同一套做法。
   *
   * 只在**唯一候选**时记入：同一时刻有多条遥测且给出不同归属，说明
   * 无法确定是哪一条，猜一个比不补更糟。
   *
   * @param telemetryFileName - 遥测文件名，默认 `telemetry.jsonl`。
   * @returns `{ provider: Map<ts, provider>, point: Map<ts, point> }`。
   */
  async telemetryIndex(telemetryFileName = "telemetry.jsonl") {
    /** @type {Map<string, string>} */
    const provider = new Map();
    /** @type {Map<string, string>} */
    const point = new Map();
    /** @type {Map<string, Set<string>>} */
    const providerCandidates = new Map();
    /** @type {Map<string, Set<string>>} */
    const pointCandidates = new Map();
    let raw;
    try {
      raw = await readFile(join(this.dir, telemetryFileName), "utf8");
    } catch {
      return { provider, point };
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (entry === null || typeof entry !== "object") continue;
      const ts = typeof entry.ts === "string" ? entry.ts : "";
      if (ts.length === 0) continue;
      const model = typeof entry.model === "string" ? entry.model : "unknown";
      const entryProvider = providerOfTelemetryEntry(entry, model);
      const entryPoint = inferLegacyPoint(entry.tag, entry.point);
      if (entryProvider !== "unknown") {
        const set = providerCandidates.get(ts);
        if (set === undefined) providerCandidates.set(ts, new Set([entryProvider]));
        else set.add(entryProvider);
      }
      if (entryPoint !== "unknown") {
        const set = pointCandidates.get(ts);
        if (set === undefined) pointCandidates.set(ts, new Set([entryPoint]));
        else set.add(entryPoint);
      }
    }
    for (const [ts, set] of providerCandidates) {
      if (set.size === 1) provider.set(ts, [...set][0]);
    }
    for (const [ts, set] of pointCandidates) {
      if (set.size === 1) point.set(ts, [...set][0]);
    }
    return { provider, point };
  }

  /**
   * 写「已回填」标记。
   *
   * 标记写失败不算失败：只是下次启动会再回填一次（会有重复的历史），
   * 而回填失败绝不该挡住插件启动。
   *
   * @param markerPath - 标记文件路径。
   */
  async writeMarker(markerPath) {
    try {
      await mkdir(this.dir, { recursive: true });
      await writeFile(markerPath, new Date().toISOString(), "utf8");
    } catch {
      /* 标记写不了就下次再来 */
    }
  }

  /**
   * 读取全部统计记录。
   *
   * 坏行跳过而不整体失败：一行写坏了（进程被杀时的半行）不该让整个
   * 统计功能不可用。
   *
   * @returns 记录数组；文件不存在时返回空数组。
   */
  async read() {
    let raw;
    try {
      raw = await readFile(this.path, "utf8");
    } catch {
      return [];
    }
    const out = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed !== null && typeof parsed === "object") out.push(parsed);
      } catch {
        // 坏行跳过。
      }
    }
    return out;
  }

  /**
   * 统计文件是否存在且非空。
   *
   * @returns 是否有数据。
   */
  async exists() {
    try {
      const info = await stat(this.path);
      return info.size > 0;
    } catch {
      return false;
    }
  }

  /**
   * 给**已有**的统计记录补上 `mode` 字段（一次性迁移）。
   *
   * ## 为什么需要这一步
   *
   * 节省量只由观察模式的记录贡献（见 lib/stats.js）。而 `stats.jsonl` 里
   * 的历史记录是在引入 `mode` 字段**之前**写的——它们没有这个字段，
   * 于是会被归为「未知模式」而**全部不计入节省量**。
   *
   * 这会造成一个很糟的结果：用户升级后打开统计页，发现历史里明明有
   * 205 条观察模式的记录（老遥测里 `mode: shadow` 的那些），节省量却
   * 变成了 0——看起来像「这个功能从来没省过东西」。
   *
   * ## 怎么补
   *
   * 从老遥测（`telemetry.jsonl`）里按**时间戳**找回每条记录当时的模式：
   *
   *   统计记录 ←—— ts 精确匹配 ——→ 遥测记录（带 mode）
   *
   * 时间戳是可靠的匹配键：回填时统计记录与遥测记录来自同一批数据，
   * 逐字复制了同一个 `ts`（实测 2173 条回填记录全部对上，无一歧义）。
   *
   * 匹配不上的一律**不改**：宁可让它保持「未知模式」不计入，也不能
   * 猜一个模式——猜错会让生效模式的记录被当成观察模式的实测。
   *
   * ## 为什么安全
   *
   *   - 只写 `mode` 一个字段，其余字段逐字保留；
   *   - 原文件先备份（`<name>.mode-backup`），失败可回退；
   *   - 靠标记文件保证**只做一次**；
   *   - 全部失败也不影响主功能（统计是旁路）。
   *
   * @param options.telemetryFileName - 遥测文件名，默认 `telemetry.jsonl`。
   * @param options.markerFileName - 标记文件名，默认 `stats.modes-filled`。
   * @returns 补上模式的条数；0 表示没补（已做过 / 没有可补的 / 失败）。
   */
  async fillMissingModesOnce(options = {}) {
    const markerName = options.markerFileName ?? "stats.modes-filled";
    const markerPath = join(this.dir, markerName);
    // 已经补过：直接跳过。
    try {
      await stat(markerPath);
      return 0;
    } catch {
      /* 标记不存在 = 还没补过 */
    }
    let records;
    try {
      records = await this.read();
    } catch {
      return 0;
    }
    // 已经有 mode 的记录不动；只补真正缺的。
    const missing = records.filter((row) => row.mode === undefined || row.mode === null);
    if (missing.length === 0) {
      // 没得补：留下标记，免得每次启动都扫一遍。
      await this.writeMarker(markerPath);
      return 0;
    }
    // 从遥测里建「时间戳 → 模式」索引。
    let telemetry;
    try {
      telemetry = await readFile(join(this.dir, options.telemetryFileName ?? "telemetry.jsonl"), "utf8");
    } catch {
      // 没有遥测可比：留标记（以后也不会有），本次不补。
      await this.writeMarker(markerPath);
      return 0;
    }
    /** @type {Map<string, string[]>} */
    const modesByTs = new Map();
    for (const line of telemetry.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (entry === null || typeof entry !== "object") continue;
      const ts = typeof entry.ts === "string" ? entry.ts : "";
      if (ts.length === 0) continue;
      const mode = legacyModeOf(entry.mode);
      const list = modesByTs.get(ts);
      if (list === undefined) modesByTs.set(ts, [mode]);
      else if (!list.includes(mode)) list.push(mode);
    }
    let filled = 0;
    for (const row of records) {
      if (row.mode !== undefined && row.mode !== null) continue;
      const ts = typeof row.ts === "string" ? row.ts : "";
      const candidates = modesByTs.get(ts);
      // 只在**唯一**候选时补：多个候选说明同一时刻有多条遥测，无法确定
      // 是哪一条——猜一个比不补更糟。
      if (candidates === undefined || candidates.length !== 1) continue;
      row.mode = candidates[0];
      filled += 1;
    }
    if (filled === 0) {
      await this.writeMarker(markerPath);
      return 0;
    }
    // 写回：先备份原文件，再整体重写。
    try {
      const payload = records.map((row) => `${JSON.stringify(row)}\n`).join("");
      await writeFile(`${this.path}.mode-backup`, await readFile(this.path, "utf8"), "utf8");
      await writeFile(this.path, payload, "utf8");
      await this.writeMarker(markerPath);
      return filled;
    } catch (error) {
      this.logger?.warn?.(
        `dsh-decision-engine: 补齐历史统计的模式字段失败（${error instanceof Error ? error.message : String(error)}）`,
      );
      // 不留标记：下次启动再试一次。
      return 0;
    }
  }
}

/**
 * 从旧的 `telemetry.jsonl` 里回填历史统计。
 *
 * 目的是让**升级后立刻就有历史可看**——否则统计功能上线时是一片空白，
 * 用户会以为「统计坏了」，而实际上只是没有历史数据。
 *
 * 回填能拿到的：model、input token、耗时、是否命中缓存、决策点。
 * 拿不到的：provider（老遥测没记）、output token、基线。
 *
 * 因此回填的记录会带上 `estimated: true` 标记，界面提示「历史数据由遥测
 * 推算，缺 provider 与 output token」——不能把推算值和实测值混为一谈。
 *
 * @param options.dir - 插件数据目录。
 * @param options.telemetryFileName - 遥测文件名，默认 `telemetry.jsonl`。
 * @param options.limit - 最多回填多少条（默认 5000，防止旧文件巨大时卡住）。
 * @returns 可直接写入的记录数组。
 */
/**
 * 把老遥测的 `mode` 字段映射成现在的三态。
 *
 * 老遥测只有两值：`shadow`（只记录）与 `enforce`（真正生效）。
 * 现在的三态把 `shadow` 改名叫 `observe`，其余一一对应：
 *
 *   shadow  → observe
 *   enforce → enforce
 *   其它/缺失 → unknown
 *
 * **为什么这个映射必须做对**：节省量只由观察模式的记录贡献（见
 * lib/stats.js 顶部说明）。老遥测里 `shadow` 的那些记录正是真正的观察
 * 样本——把它们一律当成「未知」而丢掉，等于把唯一有实测意义的历史
 * 节省量一并抹掉。
 *
 * 缺失的一律 `unknown` 而不是猜：无法证明它是在观察模式下产生的，
 * 宁可少算，不可把不确定的数字当成实测展示。
 *
 * @param value - 老遥测的 mode 值。
 * @returns `observe` / `enforce` / `unknown`。
 */
export function legacyModeOf(value) {
  if (value === "shadow" || value === "observe") return "observe";
  if (value === "enforce") return "enforce";
  if (value === "off") return "off";
  return "unknown";
}

export async function backfillFromTelemetry(options = {}) {
  const dir = options.dir;
  const fileName = options.telemetryFileName ?? "telemetry.jsonl";
  const limit = Number.isFinite(options.limit) ? Math.max(1, options.limit) : 5000;
  let raw;
  try {
    raw = await readFile(join(dir, fileName), "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n");
  // 只取尾部：遥测是追加写的，尾部才是最近的。
  const tail = lines.slice(-limit);
  const out = [];
  for (const line of tail) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (entry === null || typeof entry !== "object") continue;
    /**
     * 降级记录**也要**回填，但要单独标出来。
     *
     * 降级（超时、鉴权失败、端点 404……）的这次决策没有拿到任何模型答案，
     * 因此它没有 token、也没有裁决——但在裁决分账里它属于「未裁决」，
     * 而它确实花掉了等待时间（实测 280 次降级共 35 分钟）。
     *
     * 以前这里直接 `continue` 跳过，于是历史上所有降级都从统计里消失了：
     * 用户看到「这段时间零降级」，而实际上当时端点连着超时了 124 次。
     * 现在回填它们，并打上 `degraded: true`，让聚合把它们算进「未裁决」
     * 与降级专属的耗时字段。
     */
    const degraded = entry.action === "degraded";
    // 模型名：降级记录常常没有（没拿到任何答案），但 `extra.model` 里可能有
    // 「本来要用的那个」——用它比留 unknown 更准。
    const loggedModel =
      typeof entry.model === "string" && entry.model.length > 0
        ? entry.model
        : typeof entry.extra?.model === "string" && entry.extra.model.length > 0
          ? entry.extra.model
          : "unknown";
    const durationMs = typeof entry.latencyMs === "number" ? entry.latencyMs : 0;
    const cached = entry.cached === true;
    const loggedInput = typeof entry.inputTokens === "number" ? entry.inputTokens : 0;
    // provider 先定下来：它决定降级记录能落到哪个默认模型上。
    const provider = providerOfTelemetryEntry(entry, loggedModel);
    /**
     * 缓存命中的记录必须**反过来**映射，否则节省量会算成负数。
     *
     * 老遥测在缓存命中时记的 `inputTokens` 是从缓存里复用的**上一次真实
     * 请求**的计数（`classify` 直接返回缓存对象），可这次命中一个 token
 * 都没花、也没等网络。所以：
     *
     *   实际 = 0 / 0 / 0        （根本没发请求）
     *   基线 = loggedInput      （不缓存就得再付一次）
     *
     * 早先按字面把 loggedInput 当成实际消耗、基线留 0，于是
     * `savedInput = base - actual` 算出 -473 这种**负节省**——聚合结果里
     * 最伤信任的一类错（实测某个 30 分钟窗口就命中了这条路径）。
     *
     * 命中那次的耗时基线老遥测确实没有（它只记了命中=0），留 0 交给
     * 聚合阶段用同组真实请求的均值补。
     */
    out.push({
      ts: typeof entry.ts === "string" ? entry.ts : "",
      // provider 的来源按可靠度取（见 providerOfTelemetryEntry）：
      //   1. entry.provider —— 新版遥测直接带（根治点，不再靠猜）
      //   2. entry.extra.provider —— 降级记录里记过的服务商 id
      //   3. entry.extra.endpoint 的主机名 —— 降级记录几乎都带 endpoint
      //   4. 按模型名反推 —— 老遥测最后的手段
      // 四条路都走不通才退回 "unknown"，由界面显示为「未知（历史）」——
      // 绝不凭空猜一个服务商（那会让「按 provider 对比」出现一家不存在的）。
      provider,
      /**
       * 模型名：降级记录没有拿到任何答案，本就没有 model。
       *
       * 但**服务商是知道的**，而服务商有默认模型——那就是「本来会用的那个」。
       * 落到该默认模型上，降级记录才会并进正确的那一行（而不是自成一行
       * 「某 provider / unknown」零数据）。
       *
       * 这里的回落**只依据已确定的服务商**，不是猜：provider 本身已经从
       * 遥测里查实（见上面的 provider 解析），默认模型就是它的配置默认值。
       */
      model: loggedModel !== "unknown" ? loggedModel : defaultModelOf(provider),
      // point：新遥测自带；老遥测没有 point 字段，但 tag 与决策点是确定的
      // 一对一（guard → authorize，adapter/X → X，其余 tag 即点 id）——按 tag
      // 反推，不再让老记录整块落进「决策点 unknown」（见 inferLegacyPoint）。
      point: inferLegacyPoint(entry.tag, entry.point),
      /**
       * 模式：老遥测用 `shadow` / `enforce`，与现在的三态对应关系是
       *
       *   shadow  →  observe（只记录不生效）
       *   enforce →  enforce（真正生效）
       *
       * 这个映射必须做对：节省量**只**由观察模式的记录贡献，而老遥测里
       * 205 条 `shadow` 记录正是真正的观察样本——把它们当成「未知」丢掉，
       * 等于把唯一有实测意义的那些历史节省量一并抹掉。
       *
       * 没有 mode 字段的老记录一律 `unknown`（不计入节省）：无法证明它
       * 是在观察模式下产生的，宁可少算不可把不确定的数字当实测展示。
       */
      mode: legacyModeOf(entry.mode),
      // 裁决词原样保留：老遥测记的就是裁决（delegate / ask / deny / skip …），
      // 回填后仍能按 allow / ask / reject 分账——历史裁决不该丢。
      action: typeof entry.action === "string" ? entry.action : "",
      detail: typeof entry.detail === "string" ? entry.detail : "",
      cached,
      degraded,
      // 降级没有拿到任何答案：token 一律 0，耗时是「等不到答案」花掉的时间。
      inputTokens: cached || degraded ? 0 : loggedInput,
      // 老遥测没有 output token。
      outputTokens: 0,
      durationMs: cached ? 0 : durationMs,
      baseInputTokens: degraded ? 0 : loggedInput,
      baseOutputTokens: 0,
      baseDurationMs: cached || degraded ? 0 : durationMs,
      inputSource: loggedInput > 0 && !degraded ? "api" : "unknown",
      outputSource: "unknown",
      // 回填标记：界面据此说明「这是推算值」。
      estimated: true,
    });
  }
  return out;
}
