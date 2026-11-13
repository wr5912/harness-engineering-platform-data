/**
 * 统计与对比的**纯计算**部分。
 *
 * 为什么单独拆一个零依赖模块：统计逻辑是这个插件里最容易出「数字对不上」
 * 的地方——时间边界（跨月、跨年、夏令时）、基线口径（节省量到底相对什么
 * 算）、聚合维度（provider × model）三件事各自都能写错，而它们必须能被
 * 单独验证。因此这里只做纯函数：不读文件、不发请求、不依赖宿主。
 *
 * 两个概念要分清：
 *
 *   **实际消耗**  这次决策真实花了什么：input token、output token、耗时。
 *   **基线消耗**  「走普通 LLM 路径」时，同一份工作会花什么。
 *
 * ## 节省量只统计「观察」模式
 *
 * 这是本模块最重要的一条口径，**不能**因为「数字好看」而放宽。
 *
 * 「节省」是一个**反事实**（counterfactual）数字：它回答的是
 * 「如果采用决策模型，这次能少花多少」。而反事实只有在
 * **两种路径跑在同一份数据上**时才成立：
 *
 *   观察（observe）  决策模型只记录、不改变行为。于是同一批工作既有
 *                   「普通 LLM 实际怎么跑的」（真实数据），又有
 *                   「决策模型说本该怎么跑」（记录下来的裁决）。
 *                   两边比的是同一批工作，结论才有意义。
 *
 *   生效（enforce）  决策已经落地，普通 LLM 路径**根本没有发生**。
 *                   此时「省了多少」只能是事后估算（而且必然掺进
 *                   猜测），与观察模式下的实测量不是一回事。
 *
 * 把两种模式的数字混在同一张表里，是这类统计最典型的自欺：读者看到
 * 一个漂亮的节省量，却不知道它是实测对比还是估算模型算出来的。
 * 因此本模块**只**把观察模式的记录计入节省，界面上也必须写明这一点。
 *
 * 基线口径（观察模式下可归因的两类）：
 *
 *   1. **结果缓存**  缓存命中时一次请求根本没发出去 → 基线 = 原本那次
 *      完整请求的开销，实际 = 0。这是省得最多的一类。
 *   2. **上下文截断**  state 被裁到 `maxStateChars` 之内 → 基线 = 未截断
 *      时的 input token，实际 = 截断后的。
 *
 * 刻意**不**把「思考模式」算进节省：`think_mode` 是用户自己的配置，不是
 * 插件的优化；把它算进来会让「节省量」随配置摆动，数字失去意义。
 *
 * @module dsh-decision-engine/stats
 */

import { OUTCOME_LABELS, OUTCOME_MATRIX, OUTCOMES, outcomeOf } from "./outcomes.js";

export { OUTCOME_LABELS, OUTCOME_MATRIX, OUTCOMES, outcomeOf };

/** 预设时间范围。`custom` 表示用户自己给了起止时刻。 */
export const RANGE_PRESETS = ["today", "week", "month", "year", "custom"];

/** 预设范围的中文名（界面直接用，服务端下发避免前端抄一份）。 */
export const RANGE_LABELS = {
  today: "当日",
  week: "本周",
  month: "本月",
  year: "本年",
  custom: "自定义",
};

/**
 * token 数的来源标记。
 *
 * 用户必须能分清「这个数字是服务端报的还是估的」——两者混在一起时，
 * 一个自建服务（不报 usage）的数字会看起来和另一家的实测数字一样可信。
 */
export const TOKEN_SOURCES = {
  /** 服务端 usage 字段返回的精确值。 */
  api: "api",
  /** 本插件用估算器算出来的值。 */
  estimated: "estimated",
  /** 拿不到任何值（0）。 */
  unknown: "unknown",
};

/**
 * 记录所属的决策点模式。
 *
 * 与 `lib/decision-points.js` 的三态一致：`off` 不参与、`observe` 只记录、
 * `enforce` 真正生效。
 *
 * 为什么统计要记它：节省量是**反事实**数字，只有在「观察」模式下才有
 * 实测意义（两种路径跑在同一批工作上）。生效模式下普通 LLM 路径根本没
 * 发生，节省只能是估算——把它和实测混在一起是最典型的自欺。详见本模块
 * 顶部的说明。
 *
 * **历史记录没有这个字段**：老记录一律按 `unknown` 处理，**不计入节省**
 * （无法证明它是在观察模式下产生的）。宁可少算，不可把不确定的数字当成
 * 实测展示。
 */
export const RECORD_MODES = ["observe", "enforce", "off", "unknown"];

/** 观察模式：只记录不生效——节省量的唯一有效来源。 */
export const MODE_OBSERVE = "observe";

/**
 * 归一化记录的模式字段。
 *
 * 非法值一律降级成 `unknown`，而不是猜一个：猜错会让「生效模式下的
 * 估算」被当成「观察模式下的实测」，那正是要避免的事。
 *
 * @param value - 原始模式值。
 * @returns `observe` / `enforce` / `off` / `unknown`。
 */
export function normalizeMode(value) {
  return RECORD_MODES.includes(value) ? value : "unknown";
}

/**
 * 一条记录是否计入「节省量」。
 *
 * **只有观察模式计入。** 这是本模块最关键的一条过滤：省下来的量必须在
 * 两种路径跑在同一批工作上的前提下才有意义，而这只发生在观察模式。
 *
 * @param mode - 记录的模式。
 * @returns 是否计入节省量。
 */
export function contributesSavings(mode) {
  return mode === MODE_OBSERVE;
}

/**
 * 造一条统计记录。
 *
 * 这是**唯一**的写入端构造入口：基线口径在这里定死，别处不再各算一套，
 * 否则「省了多少」在不同页面上会给出不同数字。
 *
 * @param options - 字段：
 *   - `ts`  ISO 时间串（默认现在）。
 *   - `provider` / `model`  维度。
 *   - `point`  决策点 id。
 *   - `mode`  决策点模式（observe / enforce / off）。**决定这条记录是否
 *     计入节省量**：只有 observe 计入（见模块顶部说明）。
 *   - `action` / `detail`  裁决与原因。
 *   - `cached`  是否命中缓存。
 *   - `degraded`  是否降级。
 *   - `inputTokens` / `outputTokens`  实际消耗。
 *   - `inputSource` / `outputSource`  上面两个数字的来源。
 *   - `durationMs`  端到端耗时。
 *   - `baseInputTokens`  未截断时的 input token（基线）。
 *   - `baseOutputTokens`  基线的 output token（默认与实际相同）。
 *   - `baseDurationMs`  基线耗时（默认与实际相同）。
 * @returns 记录对象（字段齐整，可直接 JSON 化）。
 */
export function buildRecord(options = {}) {
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const source = (value) =>
    TOKEN_SOURCES[value] === TOKEN_SOURCES.api ||
    TOKEN_SOURCES[value] === TOKEN_SOURCES.estimated
      ? value
      : TOKEN_SOURCES.unknown;
  const inputTokens = num(options.inputTokens);
  const outputTokens = num(options.outputTokens);
  const durationMs = num(options.durationMs);
  // 基线默认 = 实际：没有优化可归因时，节省量就是 0，而不是某个假想的数。
  //
  // 三个基线字段的默认值必须**一致**（都跟随实际值）。曾经只有 output 与
  // duration 跟随实际、input 默认为 0，于是「没有优化」的那次请求会算出
  // savedInputTokens = 0 - 实际值 = **负数**——界面显示「省了 -1200 token」，
  // 而实际是「没省也没多」。
  const baseInputTokens =
    options.baseInputTokens === undefined ? inputTokens : num(options.baseInputTokens);
  const baseOutputTokens =
    options.baseOutputTokens === undefined ? outputTokens : num(options.baseOutputTokens);
  const baseDurationMs =
    options.baseDurationMs === undefined ? durationMs : num(options.baseDurationMs);
  return {
    ts: typeof options.ts === "string" ? options.ts : new Date().toISOString(),
    provider: typeof options.provider === "string" && options.provider.length > 0 ? options.provider : "unknown",
    model: typeof options.model === "string" && options.model.length > 0 ? options.model : "unknown",
    point: typeof options.point === "string" && options.point.length > 0 ? options.point : "unknown",
    // 模式决定这条记录是否计入节省量。老记录没有这个字段 → unknown →
    // 不计入（见 normalizeMode 的说明）。
    mode: normalizeMode(options.mode),
    action: typeof options.action === "string" ? options.action : "",
    detail: typeof options.detail === "string" ? options.detail : "",
    cached: options.cached === true,
    degraded: options.degraded === true,
    inputTokens,
    outputTokens,
    durationMs,
    baseInputTokens,
    baseOutputTokens,
    baseDurationMs,
    inputSource: source(options.inputSource),
    outputSource: source(options.outputSource),
  };
}

/**
 * 一天的毫秒数。
 *
 * 用 `Date` 的本地时间语义做加减（`setDate` / `setHours`），而不是
 * `24 * 3600 * 1000`：后者在有夏令时的时区上会让「当日」变成 23 或 25 小时。
 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 把「年-月-日 时:分」解析成本地时间的时刻。
 *
 * `Date` 构造器对 `YYYY-MM-DDTHH:mm` 的解析在 ES 规范里是**本地时间**，
 * 而 `YYYY-MM-DD`（不带时间）会被当成 UTC——两者差一个时区，跨时区部署时
 * 「当日 00:00」会差一整天。因此这里**手工拆字段**再 `new Date(y, m-1, d, …)`，
 * 语义完全由本函数说了算，不依赖引擎的字符串解析细节。
 *
 * @param value - `YYYY-MM-DDTHH:mm` 或 `YYYY-MM-DD HH:mm` 形态的字符串。
 * @returns 本地时刻；解析失败返回 undefined。
 */
export function parseLocalDateTime(value) {
  if (typeof value !== "string") return undefined;
  const matched = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (matched === null) return undefined;
  const [, year, month, day, hour, minute, second] = matched;
  const y = Number(year);
  const mo = Number(month) - 1;
  const d = Number(day);
  const h = Number(hour ?? "0");
  const mi = Number(minute ?? "0");
  const s = Number(second ?? "0");
  // 月/日越界会让 Date 静默滚到下个月（例如 2 月 31 日 → 3 月 3 日），
  // 这种「看起来正常」的越界比直接报错更难发现，因此显式校验。
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return undefined;
  const date = new Date(y, mo, d, h, mi, s, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  // 回读一遍：挡住「2 月 31 日」这类会被 Date 静默进位的输入。
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return undefined;
  return date;
}

/**
 * 把一个时刻规整到当天 00:00（本地时间）。
 *
 * @param date - 任意时刻。
 * @returns 当天 00:00:00.000 的时刻。
 */
function startOfDay(date) {
  const out = new Date(date.getTime());
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * 本周周一 00:00（本地时间）。
 *
 * `getDay()` 里 0 是周日，因此周一需要减 1。这个偏移用 `setDate` 做，
 * 跨月跨年由 Date 自己处理。
 *
 * @param date - 任意时刻。
 * @returns 本周周一 00:00 的时刻。
 */
function startOfWeek(date) {
  const out = startOfDay(date);
  const weekday = out.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  out.setDate(out.getDate() - offset);
  return out;
}

/**
 * 本月 1 日 00:00（本地时间）。
 *
 * @param date - 任意时刻。
 * @returns 本月 1 日 00:00 的时刻。
 */
function startOfMonth(date) {
  const out = startOfDay(date);
  out.setDate(1);
  return out;
}

/**
 * 本年 1 月 1 日 00:00（本地时间）。
 *
 * @param date - 任意时刻。
 * @returns 本年 1 月 1 日 00:00 的时刻。
 */
function startOfYear(date) {
  const out = startOfDay(date);
  out.setMonth(0, 1);
  return out;
}

/**
 * 把范围请求解析成具体的时间区间。
 *
 * 区间统一用**左闭右开** `[start, end)`：
 *
 *   - 「当日 00:00-24:00」= 今天 00:00 到明天 00:00；
 *   - 「本周周一至周日」= 本周一 00:00 到下周一 00:00（周日整天都在里面）；
 *   - 「自定义」精确到分钟：结束时刻按「含该整分钟」处理，因此 end 取该
 *     分钟的下一分钟起点。
 *
 * 左闭右开还有个好处：相邻区间（本月 → 本年）不会在边界上重复计入同一条
 * 记录，而闭区间会。
 *
 * @param options.preset - `RANGE_PRESETS` 之一；非法值按 `today` 处理。
 * @param options.start - 自定义起始（`YYYY-MM-DDTHH:mm`）。
 * @param options.end - 自定义结束（`YYYY-MM-DDTHH:mm`）。
 * @param options.now - 「当前时刻」，便于测试注入固定时间。
 * @returns `{ preset, label, start, end, startMs, endMs, valid, error }`。
 */
export function resolveRange(options = {}, now = new Date()) {
  const requested = typeof options.preset === "string" ? options.preset : "today";
  const preset = RANGE_PRESETS.includes(requested) ? requested : "today";
  const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();

  if (preset === "custom") {
    const start = parseLocalDateTime(options.start);
    const end = parseLocalDateTime(options.end);
    if (start === undefined || end === undefined) {
      return {
        preset,
        label: RANGE_LABELS.custom,
        start: undefined,
        end: undefined,
        startMs: 0,
        endMs: 0,
        valid: false,
        error: "自定义范围需要合法的起止时间（YYYY-MM-DDTHH:mm）",
      };
    }
    // 结束时刻按「含该整分钟」处理：用户填 12:30 表示到 12:30:59.999 为止。
    const endExclusive = new Date(end.getTime() + 60 * 1000);
    if (endExclusive.getTime() <= start.getTime()) {
      return {
        preset,
        label: RANGE_LABELS.custom,
        start,
        end: endExclusive,
        startMs: start.getTime(),
        endMs: endExclusive.getTime(),
        valid: false,
        error: "结束时间必须晚于开始时间",
      };
    }
    return {
      preset,
      label: RANGE_LABELS.custom,
      start,
      end: endExclusive,
      startMs: start.getTime(),
      endMs: endExclusive.getTime(),
      valid: true,
      error: "",
    };
  }

  let start;
  let end;
  if (preset === "week") {
    start = startOfWeek(base);
    end = new Date(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (preset === "month") {
    start = startOfMonth(base);
    end = new Date(start.getTime());
    end.setMonth(end.getMonth() + 1);
  } else if (preset === "year") {
    start = startOfYear(base);
    end = new Date(start.getTime());
    end.setFullYear(end.getFullYear() + 1);
  } else {
    start = startOfDay(base);
    end = new Date(start.getTime() + DAY_MS);
    // 用 setDate 而不是 +DAY_MS：夏令时切换日当天的长度可能不是 24 小时。
    end = new Date(start.getTime());
    end.setDate(end.getDate() + 1);
  }
  return {
    preset,
    label: RANGE_LABELS[preset] ?? RANGE_LABELS.today,
    start,
    end,
    startMs: start.getTime(),
    endMs: end.getTime(),
    valid: true,
    error: "",
  };
}

/**
 * 一条统计记录的**规范化**形状。
 *
 * 写入端与读取端都走它：字段缺失时补零，而不是让 `undefined` 渗进聚合
 * 运算里变成 NaN。NaN 出现在「节省比例」上时，界面显示的是空白或
 * `NaN%`——那是最难自查的一类数字错误。
 */
function normalizeRecord(raw) {
  const ts = typeof raw?.ts === "string" ? Date.parse(raw.ts) : Number.NaN;
  const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return {
    ts: Number.isNaN(ts) ? 0 : ts,
    provider: typeof raw?.provider === "string" && raw.provider.length > 0 ? raw.provider : "unknown",
    model: typeof raw?.model === "string" && raw.model.length > 0 ? raw.model : "unknown",
    point: typeof raw?.point === "string" && raw.point.length > 0 ? raw.point : "unknown",
    // 老记录没有 mode → unknown → 不计入节省量。
    mode: normalizeMode(raw?.mode),
    action: typeof raw?.action === "string" ? raw.action : "",
    cached: raw?.cached === true,
    degraded: raw?.degraded === true,
    detail: typeof raw?.detail === "string" ? raw.detail : "",
    inputTokens: num(raw?.inputTokens),
    outputTokens: num(raw?.outputTokens),
    durationMs: num(raw?.durationMs),
    baseInputTokens: num(raw?.baseInputTokens),
    baseOutputTokens: num(raw?.baseOutputTokens),
    baseDurationMs: num(raw?.baseDurationMs),
    inputSource: typeof raw?.inputSource === "string" ? raw.inputSource : "unknown",
    outputSource: typeof raw?.outputSource === "string" ? raw.outputSource : "unknown",
  };
}

/**
 * 判断一条记录是否落在区间内（左闭右开）。
 *
 * @param record - 原始记录。
 * @param range - `resolveRange()` 的结果。
 * @returns 是否在区间内。
 */
export function isInRange(record, range) {
  const ts = normalizeRecord(record).ts;
  if (ts === 0) return false;
  return ts >= range.startMs && ts < range.endMs;
}

/**
 * 把一组记录累加成一个「桶」。
 *
 * **降级记录单独计数，不进用量口径。**
 *
 * 降级（超时、鉴权失败、端点 404……）的这次决策：
 *
 *   - 没有拿到任何模型答案 → 没有 token 可统计；
 *   - 也没有裁决 → 在裁决分账里属于「未裁决」；
 *   - 但它确实花掉了等待时间（实测 280 次降级共 35 分钟，其中 124 次是
 *     8 秒超时）——这段时间是真实成本，只是它**不是**「一次模型请求的耗时」。
 *
 * 因此降级记录累加到 `degraded` 与 `degradedDurationMs` 两个**独立**字段，
 * 不混进 `requests` / `durationMs`。混进去的话，「均耗时」的分母会多出
 * 一批根本没得到回答的请求，数字就不再是「一次请求多快」。
 *
 * @param bucket - 累加目标（原地修改）。
 * @param record - 已规范化的记录。
 */
function accumulate(bucket, record) {
  if (record.degraded === true) {
    bucket.degraded += 1;
    bucket.degradedDurationMs += record.durationMs;
    return;
  }
  bucket.requests += 1;
  if (record.cached === true) bucket.cached += 1;
  bucket.inputTokens += record.inputTokens;
  bucket.outputTokens += record.outputTokens;
  bucket.durationMs += record.durationMs;
  /**
   * 节省量只认**观察模式**的记录。
   *
   * 两套数字必须分开累加，不能混：
   *
   *   实际消耗（上面三行）  全部记录——决策引擎真实花了多少，与模式无关。
   *   节省量（这里）        只有观察模式——只有那时「普通 LLM 路径」与
   *                        「决策模型路径」跑在同一批工作上，反事实才成立。
   *
   * 若把生效模式的记录也算进节省，它带来的「省下的量」是事后估算，
   * 却会和观察模式的实测数字摆在同一张表里——读者无从分辨，这正是
   * 最难自查也最难解释的偏差。
   *
   * 基线与实际必须**成对**累加：省下的量 = 基线 - 实际，两边口径一致
   * 才有意义。
   */
  if (!contributesSavings(record.mode)) return;
  bucket.observeRequests += 1;
  bucket.observeInputTokens += record.inputTokens;
  bucket.observeOutputTokens += record.outputTokens;
  bucket.observeDurationMs += record.durationMs;
  bucket.observeBaseInputTokens += record.baseInputTokens;
  bucket.observeBaseOutputTokens += record.baseOutputTokens;
  bucket.observeBaseDurationMs += record.baseDurationMs;
}

/**
 * 把桶清零（原地）。
 *
 * 基线补齐后需要重新累加一遍，而重新累加前必须先清零——否则旧值会被
 * 再加一遍，数字直接翻倍。
 *
 * @param bucket - 累加桶。
 */
function resetBucket(bucket) {
  const fresh = emptyBucket();
  for (const key of Object.keys(fresh)) bucket[key] = fresh[key];
}

/**
 * 造一个空的累加桶。
 *
 * @returns 桶。
 */
function emptyBucket() {
  return {
    requests: 0,
    cached: 0,
    degraded: 0,
    /** 降级累计等待耗时（不进「总耗时」，见 accumulate 的说明）。 */
    degradedDurationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    /**
     * 观察模式专属的累加桶。
     *
     * 单独一套字段而不是复用上面三个：节省量**只**由观察模式的记录
     * 贡献，而实际消耗要统计全部记录。共用一套字段就必须二选一，
     * 而两种都要——所以分成两套，各算各的。
     */
    observeRequests: 0,
    observeInputTokens: 0,
    observeOutputTokens: 0,
    observeDurationMs: 0,
    observeBaseInputTokens: 0,
    observeBaseOutputTokens: 0,
    observeBaseDurationMs: 0,
  };
}

/**
 * 造一个空的「裁决分账桶」。
 *
 * 三格之外另有一个 `none`：表示「这次没有裁决」（模型降级、答案形状
 * 不符、点被关掉）。它**不是**第四种裁决——降级时插件根本没有改变
 * 任何行为，把它算成「放行」会虚增放行次数，算成「拦截」会虚增拦截
 * 次数，两者都是错的。所以它单列一格，界面上明确写出「未裁决」。
 *
 * @returns 桶。
 */
function emptyOutcomeBucket() {
  return {
    allow: 0,
    ask: 0,
    reject: 0,
    none: 0,
  };
}

/**
 * 把一次裁决记进桶。
 *
 * @param bucket - 累加目标（原地修改）。
 * @param outcome - `outcomeOf()` 的结果。
 */
function accumulateOutcome(bucket, outcome) {
  if (outcome === "allow" || outcome === "ask" || outcome === "reject") {
    bucket[outcome] += 1;
    return;
  }
  bucket.none += 1;
}

/**
 * 把桶整理成对外的形状：补上节省量、平均值与比例。
 *
 * 节省量**只由观察模式的记录**算出（见 accumulate 的说明）：
 * `observe*` 系列是节省量的分子分母，其余记录一概不参与。
 *
 * @param bucket - 累加桶。
 * @returns 对外字段。
 */
function finalizeBucket(bucket) {
  /**
   * 节省量：基线 - 实际，两边都取**观察模式**的累加值。
   *
   * 分母是基线而不是实际值——「省了多少」永远是相对基线说的。
   */
  const savedInputTokens = bucket.observeBaseInputTokens - bucket.observeInputTokens;
  const savedOutputTokens = bucket.observeBaseOutputTokens - bucket.observeOutputTokens;
  const savedDurationMs = bucket.observeBaseDurationMs - bucket.observeDurationMs;
  const baseTotalTokens = bucket.observeBaseInputTokens + bucket.observeBaseOutputTokens;
  const actualTotalTokens = bucket.observeInputTokens + bucket.observeOutputTokens;
  const baseTotalMs = bucket.observeBaseDurationMs;
  // 比例的分母是基线，不是实际值——「省了多少」永远是相对基线说的。
  const savedRatio = baseTotalTokens > 0 ? (baseTotalTokens - actualTotalTokens) / baseTotalTokens : 0;
  const savedTimeRatio = baseTotalMs > 0 ? (baseTotalMs - bucket.observeDurationMs) / baseTotalMs : 0;
  /**
   * 「平均」一律按**真实请求**算，不含缓存命中。
   *
   * 缓存命中的那次没有发请求：token 是 0、耗时也是 0。把它算进分母，
   * 「平均耗时」会随着命中率升高而变好看——那说的就不是「一次请求多快」，
   * 而是「我们有多久没请求」，两个意思混在一个数字里，最容易被误读。
   * 需求原话是「每次请求从发起至完整响应的端到端耗时」，缓存命中根本没有
   * 这段过程，所以它不该出现在分母里。
   */
  const realRequests = Math.max(0, bucket.requests - bucket.cached);
  return {
    requests: bucket.requests,
    realRequests,
    cached: bucket.cached,
    degraded: bucket.degraded,
    /** 降级累计等待耗时（与「总耗时」分开，见 accumulate 的说明）。 */
    degradedDurationMs: bucket.degradedDurationMs,
    inputTokens: bucket.inputTokens,
    outputTokens: bucket.outputTokens,
    totalTokens: bucket.inputTokens + bucket.outputTokens,
    durationMs: bucket.durationMs,
    /**
     * 观察模式的样本量：**节省量是从多少条记录算出来的**。
     *
     * 这个数必须露出来：节省量是 0 有两种完全不同的原因——
     * 「观察模式下确实没省」与「这段时间根本没有观察模式的记录」。
     * 没有这个数，读者会以为前者。
     */
    observeRequests: bucket.observeRequests,
    observeInputTokens: bucket.observeInputTokens,
    observeOutputTokens: bucket.observeOutputTokens,
    observeDurationMs: bucket.observeDurationMs,
    observeBaseInputTokens: bucket.observeBaseInputTokens,
    observeBaseOutputTokens: bucket.observeBaseOutputTokens,
    observeBaseDurationMs: bucket.observeBaseDurationMs,
    savedInputTokens,
    savedOutputTokens,
    savedTotalTokens: savedInputTokens + savedOutputTokens,
    savedDurationMs,
    savedRatio,
    savedTimeRatio,
    avgDurationMs: realRequests === 0 ? 0 : Math.round(bucket.durationMs / realRequests),
    avgInputTokens: realRequests === 0 ? 0 : Math.round(bucket.inputTokens / realRequests),
    avgOutputTokens: realRequests === 0 ? 0 : Math.round(bucket.outputTokens / realRequests),
  };
}

/**
 * 按指标排序对比表。
 *
 * 支持的 `key`：inputTokens / outputTokens / totalTokens / durationMs /
 * avgDurationMs / requests / savedInputTokens / savedOutputTokens /
 * savedDurationMs / savedRatio。
 *
 * 未知键一律按 `inputTokens` 排——排序写错不该让整张表乱序。
 *
 * @param rows - 对比表。
 * @param key - 排序字段。
 * @param direction - `desc`（默认）或 `asc`。
 * @returns 排序后的**新**数组（不改原数组）。
 */
export function sortRows(rows, key, direction = "desc") {
  const allowed = new Set([
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "durationMs",
    "avgDurationMs",
    "requests",
    "savedInputTokens",
    "savedOutputTokens",
    "savedDurationMs",
    "savedRatio",
    // 观察模式的实际消耗：节省量对比表的「实际」三列按它们排序。
    "observeInputTokens",
    "observeOutputTokens",
    "observeDurationMs",
  ]);
  const field = allowed.has(key) ? key : "inputTokens";
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = Number(a[field] ?? 0);
    const right = Number(b[field] ?? 0);
    if (left === right) {
      // 同值时按 provider/model 排，保证顺序稳定（不稳定的排序会让界面
      // 每次刷新都换顺序，用户以为数字在动）。
      const byProvider = String(a.provider ?? "").localeCompare(String(b.provider ?? ""));
      if (byProvider !== 0) return byProvider;
      return String(a.model ?? "").localeCompare(String(b.model ?? ""));
    }
    return (left - right) * sign;
  });
}

/**
 * 统计与对比的主入口。
 *
 * @param records - 原始记录数组（不限于区间内的，函数内部自己筛）。
 * @param range - `resolveRange()` 的结果。
 * @returns
 *   - `range`：区间信息（含标签与起止 ISO 字符串）
 *   - `totals`：全量汇总
 *   - `rows`：provider × model 的对比表
 *   - `byProvider`：只按 provider 汇总
 *   - `byPoint`：按决策点汇总
 */
export function aggregate(records, range) {
  const totals = emptyBucket();
  /** @type {Map<string, ReturnType<typeof emptyBucket>>} */
  const byCombo = new Map();
  /** @type {Map<string, ReturnType<typeof emptyBucket>>} */
  const byProvider = new Map();
  /** @type {Map<string, ReturnType<typeof emptyBucket>>} */
  const byPoint = new Map();
  /** 区间内的规范化记录，留给基线补齐阶段复用。 */
  const scoped = [];

  // ---- 裁决分账（allow / ask / reject）--------------------------------
  //
  // 与上面的用量分账是**两套独立的口径**：
  //
  //   用量分账  按「这一次决策花了多少」算，含缓存命中与降级。
  //   裁决分账  按「这一次裁决让事情过去了还是被拦下了」算。
  //
  // 两套不能合并：一次降级没有裁决（不计入任何一格），但它照样花了一次
  // 请求的 token；反过来一次缓存命中的裁决也是真实裁决（照常计入），
  // 却没花任何 token。硬合成一张表，两边都得打折。
  const outcomeTotals = emptyOutcomeBucket();
  /** @type {Map<string, ReturnType<typeof emptyOutcomeBucket>>} */
  const outcomeByPoint = new Map();
  /**
   * 未登记的裁决词（point/kind 组合在 OUTCOME_MATRIX 里查不到）。
   *
   * 单独收集而不是直接丢弃：新增决策点忘了登记时，数字会**少得悄无声息**
   * ——界面看着仍然合理，只是偏小。这里把它显式列出来，界面上提示
   * 「有 N 条裁决未分类」，让漏登记变成一眼可见的事。
   */
  const otherVerdicts = new Map();
  /**
   * 按模式分账：observe / enforce / off / unknown 各多少条。
   *
   * 界面必须靠它解释「为什么节省量是 0」：节省量只由 observe 贡献，
   * 所以「这段时间全是 enforce」与「观察了但没省」是两种完全不同的
   * 事实，读者有权区分。
   */
  const modeCounts = { observe: 0, enforce: 0, off: 0, unknown: 0 };

  for (const raw of Array.isArray(records) ? records : []) {
    if (!isInRange(raw, range)) continue;
    const record = normalizeRecord(raw);
    scoped.push(record);
    modeCounts[record.mode] = (modeCounts[record.mode] ?? 0) + 1;
    accumulate(totals, record);
    // 组合键必须用**不会出现在 id 里**的分隔符：provider 与 model 直接拼接
    // 时，"ab" + "c" 与 "a" + "bc" 会撞成同一个键，两组数据被合并统计——
    // 而 provider/model 都可能含任意字符（自定义服务的模型名尤其）。
    const comboKey = `${record.provider}\u0000${record.model}`;
    let combo = byCombo.get(comboKey);
    if (combo === undefined) {
      combo = emptyBucket();
      byCombo.set(comboKey, combo);
    }
    accumulate(combo, record);
    let providerBucket = byProvider.get(record.provider);
    if (providerBucket === undefined) {
      providerBucket = emptyBucket();
      byProvider.set(record.provider, providerBucket);
    }
    accumulate(providerBucket, record);
    let pointBucket = byPoint.get(record.point);
    if (pointBucket === undefined) {
      pointBucket = emptyBucket();
      byPoint.set(record.point, pointBucket);
    }
    accumulate(pointBucket, record);

    // ---- 裁决分类 ---------------------------------------------------
    //
    // 「没有裁决」与「有裁决但查不到分类」必须分开：
    //
    //   action 为空 / degraded  → 这次根本没裁决（模型降级、答案形状不符）
    //   action 有值但未登记      → 有裁决，只是没归类（新增 kind 忘了登记）
    //
    // 前者计入 `none`；后者单独列进 `otherVerdicts` 并在界面上提示。
    // 把两者混为一谈会让「未登记」看起来像「降级」，掩盖真正的漏登记。
    const hasVerdict = record.action.length > 0 && record.degraded !== true;
    if (!hasVerdict) {
      accumulateOutcome(outcomeTotals, "none");
      let noneBucket = outcomeByPoint.get(record.point);
      if (noneBucket === undefined) {
        noneBucket = emptyOutcomeBucket();
        outcomeByPoint.set(record.point, noneBucket);
      }
      accumulateOutcome(noneBucket, "none");
      continue;
    }
    const outcome = outcomeOf(record.point, record.action);
    if (outcome === "none") {
      const verdictKey = `${record.point}/${record.action}`;
      otherVerdicts.set(verdictKey, (otherVerdicts.get(verdictKey) ?? 0) + 1);
    }
    accumulateOutcome(outcomeTotals, outcome);
    let pointOutcome = outcomeByPoint.get(record.point);
    if (pointOutcome === undefined) {
      pointOutcome = emptyOutcomeBucket();
      outcomeByPoint.set(record.point, pointOutcome);
    }
    accumulateOutcome(pointOutcome, outcome);
  }

  /**
   * 补齐「缓存命中」缺的那份基线。
   *
   * 一条缓存命中记录表示「这次没发请求，0 token、0 毫秒」，但它**替掉**了
   * 一次完整请求。那次请求的开销就是省下来的量。
   *
   * 两种来源：
   *   - 新记录自带 `baseInputTokens` / `baseDurationMs`（写入时就算好了）；
   *   - 历史记录（从 telemetry.jsonl 回填）没有基线字段，只能用同组真实
   *     请求的**平均**耗时与**平均**token 估算。
   *
   * 估算必须覆盖 token 与耗时两项，否则「省了多少 token」会是 0——
   * 而历史记录里缓存命中的占比往往不低（实测 telemetry.jsonl 里 678/2029
   * 条是缓存命中），只补耗时会让节省量看起来偏小。
   */
  const realSamples = new Map();
  for (const record of scoped) {
    if (record.cached === true || record.degraded === true) continue;
    if (record.durationMs <= 0) continue;
    const comboKey = `${record.provider}\u0000${record.model}`;
    const sample = realSamples.get(comboKey) ?? { duration: 0, input: 0, output: 0, count: 0 };
    sample.duration += record.durationMs;
    sample.input += record.inputTokens;
    sample.output += record.outputTokens;
    sample.count += 1;
    realSamples.set(comboKey, sample);
  }
  let needsRecount = false;
  for (const record of scoped) {
    if (record.cached !== true) continue;
    const comboKey = `${record.provider}\u0000${record.model}`;
    const sample = realSamples.get(comboKey);
    if (sample === undefined || sample.count === 0) continue;
    /**
     * 缺哪个补哪个，而不是「有一个就不补」。
     *
     * 回填出来的历史命中记录是有 input 基线的（老遥测记了被复用的那份
     * token 数），但**耗时**基线老遥测确实没有。若按「任一基线存在就跳过」
     * 判断，这批记录的耗时节省会永远是 0——而缓存命中省下的时间恰恰是
     * 用户最想看到的数字。
     */
    if (record.baseInputTokens === 0) {
      record.baseInputTokens = Math.round(sample.input / sample.count);
      needsRecount = true;
    }
    if (record.baseOutputTokens === 0) {
      record.baseOutputTokens = Math.round(sample.output / sample.count);
      needsRecount = true;
    }
    if (record.baseDurationMs === 0) {
      record.baseDurationMs = Math.round(sample.duration / sample.count);
      needsRecount = true;
    }
  }

  // 基线补齐后要重新累加一遍：上面的 accumulate 发生在补齐之前，
  // 补出来的基线不会自动进桶。重新累加的代价是一次 O(n) 遍历，
  // 与统计本身相比可忽略。
  if (needsRecount) {
    for (const bucket of [totals, ...byCombo.values(), ...byProvider.values(), ...byPoint.values()]) {
      resetBucket(bucket);
    }
    for (const record of scoped) {
      accumulate(totals, record);
      accumulate(byCombo.get(`${record.provider}\u0000${record.model}`), record);
      accumulate(byProvider.get(record.provider), record);
      accumulate(byPoint.get(record.point), record);
    }
  }

  const rows = [...byCombo.entries()].map(([comboKey, bucket]) => {
    const [provider, model] = comboKey.split("\u0000");
    return { provider, model, ...finalizeBucket(bucket) };
  });
  const providers = [...byProvider.entries()].map(([provider, bucket]) => ({
    provider,
    ...finalizeBucket(bucket),
  }));
  const points = [...byPoint.entries()].map(([point, bucket]) => ({
    point,
    ...finalizeBucket(bucket),
  }));
  const outcomePoints = [...outcomeByPoint.entries()].map(([point, bucket]) => ({
    point,
    ...bucket,
  }));
  /**
   * 裁决总览：三格 + 未裁决 + 未分类明细。
   *
   * `decided` 是三格之和——「这次到底裁决了多少次」。它与用量分账里的
   * `requests` 不同：后者数的是**决策请求**（含降级与缓存命中），
   * 前者数的是**产生了裁决的次数**。两个数不一样是正常的，也是必要的。
   */
  const decided = outcomeTotals.allow + outcomeTotals.ask + outcomeTotals.reject;
  const otherVerdictList = [...otherVerdicts.entries()]
    .map(([verdict, count]) => ({ verdict, count }))
    .sort((a, b) => b.count - a.count || a.verdict.localeCompare(b.verdict));

  return {
    range: {
      preset: range.preset,
      label: range.label,
      start: range.start instanceof Date ? range.start.toISOString() : "",
      end: range.end instanceof Date ? range.end.toISOString() : "",
      startMs: range.startMs,
      endMs: range.endMs,
      valid: range.valid !== false,
      error: range.error ?? "",
    },
    totals: finalizeBucket(totals),
    rows,
    byProvider: providers,
    byPoint: points,
    recordCount: scoped.length,
    /**
     * 节省量的**来源说明**。
     *
     * 节省量只由观察模式的记录贡献（见模块顶部说明）。这个对象把
     * 「有多少条记录参与了节省」与「节省是怎么来的」一起交给界面，
     * 让它能明确告诉用户：节省量是 0，是因为**观察模式下没省**，
     * 还是因为**这段时间根本没有观察模式的记录**。
     *
     * `observeRequests === 0` 而 `requests > 0` → 这段时间全在「生效」
     * 模式跑，普通 LLM 路径没发生过，无从对比——这时界面必须说明，
     * 而不是显示一个 0 的节省量了事。
     */
    savings: {
      /** 参与节省量计算的记录数（= 观察模式的记录数）。 */
      observeRequests: modeCounts.observe,
      /** 区间内的全部记录数。 */
      totalRequests: scoped.length,
      /** 各模式的记录数。 */
      byMode: modeCounts,
      /**
       * 节省量是否**不可用**。
       *
       * true = 这段时间没有观察模式的记录，省下的量无从对比。
       * 界面此时不该显示一个 0 的节省量（那会被读成「一点也没省」），
       * 而应说明「需要在观察模式下才有对比数据」。
       */
      unavailable: modeCounts.observe === 0,
    },
    /**
     * 裁决统计（allow / ask / reject）。
     *
     * 与 `totals`（用量）并列，互不换算——两套口径回答两个不同问题。
     */
    outcomes: {
      ...outcomeTotals,
      decided,
      total: outcomeTotals.allow + outcomeTotals.ask + outcomeTotals.reject + outcomeTotals.none,
      byPoint: outcomePoints,
      /**
       * 未登记的裁决词。列表非空说明 `OUTCOME_MATRIX` 漏登记了某个
       * （point, kind）——界面必须提示，否则这类错误会静默地少算。
       */
      otherVerdicts: otherVerdictList,
      otherVerdictCount: otherVerdictList.reduce((sum, item) => sum + item.count, 0),
    },
  };
}
