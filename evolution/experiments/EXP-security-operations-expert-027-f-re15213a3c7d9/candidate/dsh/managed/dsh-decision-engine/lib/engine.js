/**
 * 决策点执行引擎。
 *
 * 「工具授权」那一个点是手写的，因为它要处理 ask/deny 这类改变行为的返回。
 * 另外八个点如果各写一遍「查模式 → 发请求 → 校验答案 → 写遥测」，
 * 八份重复代码里迟早有一份漏掉降级分支——而漏掉降级分支的后果是工具调用被卡住。
 *
 * 所以这里把那条链路收成一个 `ask()`：
 *
 *   模式 off        → 不发请求，返回 { mode: 'off' }
 *   冷却/no-key → client 已降级为 null，这里记一条 degraded 遥测
 *   答案形状不符     → 记 answer-shape-mismatch，按「不改变行为」处理
 *   有裁决           → 记一条 action 遥测，返回 action 交给适配器执行
 *
 * 适配器只负责两件事：给出 state/questions（spec.build），以及把 action 变成
 * 真实的副作用。所有决策点共用同一套超时、缓存与降级语义。
 *
 * @module dsh-decision-engine/engine
 */

/** 一个决策点在某次触发下「什么都不做」的结果。 */
const NOOP = Object.freeze({ mode: "off", action: undefined });

/**
 * @param options.getConfig - 返回当前合并配置的取值函数（配置每次现读）。
 * @param options.client - StartluxClient 实例。
 * @param options.logger - 宿主 logger，可缺省。
 * @param options.modeOf - `(cfg, id) => 'off'|'observe'|'enforce'`。
 * @param options.log - `(entry) => Promise<void>`，写 telemetry.jsonl。
 * @param options.specOf - `(id) => spec`，从注册表取 build/parse/decide。
 */
export function createDecisionRunner(options) {
  const { getConfig, client, logger, modeOf, log, specOf } = options;
  /**
   * 记一条带裁决的统计（可缺省）。
   *
   * 统计必须由**拿到裁决的一方**来写：`classify()` 返回时裁决还不存在
   * （裁决是 `spec.decide()` 的产物）。因此这里把「消耗事实」与「裁决」
   * 合起来交给客户端写盘，统计里才不会有永远为空的裁决维度。
   *
   * 缺省时统计不写（单元测试里的假 client 没有 statsStore）。
   */
  const recordDecision = options.recordDecision ?? (() => false);

  /** 决策点当前模式。读不到即 off —— 宁可少判断一次，也不要在热路径上意外发请求。 */
  function modeOfPoint(id) {
    try {
      return modeOf(getConfig(), id) ?? "off";
    } catch {
      return "off";
    }
  }

  /**
   * 问一次决策模型并给出处置。
   *
   * @param id - 决策点 id（同时是遥测里的 `point` 字段）。
   * @param input - 传给 spec.build 的现场数据。
   * @param extra - 可选：signal / tool / degradeHint。
   *
   * 软缓存（同类复用）不在引擎层开启：决策点的裁决要么与完整 state 一一
   * 对应（精确键），要么干脆不复用。归一化签名会丢掉现场内容，任何
   * 「同类」复用都可能把一次裁决扩散到参数不同的调用上，因此这里不提供
   * signatureText / softCacheable 的传递通道。
   * @returns
   *   `{ mode: 'off' }`            该点没开启，未发请求；
   *   `{ mode, action, ... }`      有裁决（observe 时 action 仍返回，供只记录不执行）；
   *   `{ mode, degraded: reason }` 降级，调用方必须按原生行为继续。
   */
  async function ask(id, input, extra = {}) {
    const mode = modeOfPoint(id);
    if (mode === "off") return NOOP;

    const spec = specOf(id);
    if (spec === undefined) {
      // 注册表里有、规格却没实现，属于接线错误：按降级处理并留痕，绝不抛。
      logger?.warn?.(`dsh-decision-engine: 决策点 ${id} 缺少规格实现，已按不介入处理`);
      return { mode, degraded: "no-spec" };
    }

    const cfg = getConfig();
    let built;
    try {
      built = spec.build(input);
    } catch (error) {
      logger?.warn?.(
        `dsh-decision-engine: ${id} 构造 state 失败（${error instanceof Error ? error.message : String(error)}）`,
      );
      return { mode, degraded: "build-error" };
    }
    if (built === undefined || built.questions === undefined) return { mode, degraded: "no-questions" };

    const result = await client.classify({
      point: id,
      tag: id,
      mode: cfg.mode,
      /**
       * 决策点**此刻的三态模式**（observe / enforce / off）。
       *
       * 与上面的 `mode`（旧的顶层 shadow/enforce）不是一回事：后者只用于
       * 遥测的兼容字段，前者才是决定「这次记录是否计入节省量」的依据。
       *
       * 为什么统计需要它：节省量是**反事实**数字，只有在观察模式下才有
       * 实测意义——那时「普通 LLM 路径」与「决策模型路径」跑在同一批工作
       * 上，两边比的是同一批活。生效模式下普通 LLM 路径根本没发生，
       * 「省了多少」只能是事后估算，不能与观察模式的实测数字混在一起
       * （详见 lib/stats.js 顶部的说明）。
       */
      pointMode: mode,
      ...(extra.tool === undefined ? {} : { tool: extra.tool }),
      state: built.state,
      questions: built.questions,
      ...(extra.signal === undefined ? {} : { signal: extra.signal }),
    });
    // classify 返回 null 就是已经降级并写过遥测了，这里不能再记一遍。
    if (result === null) return { mode, degraded: "classify" };

    const parsed = spec.parse(result.answers);
    if (parsed === undefined) {
      await log({
        ts: new Date().toISOString(),
        point: id,
        tag: id,
        mode: cfg.mode,
        ...(extra.tool === undefined ? {} : { tool: extra.tool }),
        action: "degraded",
        detail: "answer-shape-mismatch",
        latencyMs: result.latencyMs,
        model: result.model,
        // 遥测带 provider：它是回填历史统计时唯一可靠的归因来源。
        ...(typeof result.provider === "string" ? { provider: result.provider } : {}),
      });
      // 答案形状不符 = 这次**没有裁决**。统计要照实记：消耗照记，
      // 裁决维度留空（它会落在「未裁决」那格里），不能悄悄不写。
      recordDecision({
        facts: result.statsFacts,
        action: "degraded",
        detail: "answer-shape-mismatch",
        degraded: true,
      });
      return { mode, degraded: "answer-shape-mismatch" };
    }

    const action = spec.decide(parsed, cfg, input);
    // 裁决出来了，这时候才记统计：消耗 + 裁决一起写，统计里才有
    // 「allow / ask / reject」这一维。
    recordDecision({
      facts: result.statsFacts,
      action: action.kind,
      detail: action.reason ?? action.kind,
    });
    await log({
      ts: new Date().toISOString(),
      point: id,
      tag: id,
      mode: cfg.mode,
      ...(extra.tool === undefined ? {} : { tool: extra.tool }),
      model: result.model,
      // 遥测带 provider：它是回填历史统计时唯一可靠的归因来源。
      ...(typeof result.provider === "string" ? { provider: result.provider } : {}),
      action: action.kind,
      detail: action.reason ?? action.kind,
      latencyMs: result.latencyMs,
      cached: result.cached,
      ...(result.inputTokens === undefined ? {} : { inputTokens: result.inputTokens }),
      scores: parsed,
    });

    return { mode, action, parsed, latencyMs: result.latencyMs, cached: result.cached };
  }

  return {
    ask,
    modeOf: modeOfPoint,
    /** 该点此刻是否允许真正改变行为。observe 只记录。 */
    enforces(id) {
      return modeOfPoint(id) === "enforce";
    },
    /** 该点此刻是否参与（observe 或 enforce）。 */
    participates(id) {
      const mode = modeOfPoint(id);
      return mode === "observe" || mode === "enforce";
    },
  };
}
