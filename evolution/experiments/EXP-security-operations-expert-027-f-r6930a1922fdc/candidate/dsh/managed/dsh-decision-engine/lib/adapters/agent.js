/**
 * 子任务分派、轮次延续、上下文压缩 —— 三个都挂在 `agent/pre-step` 与
 * `agent/turn-stopping` 上的适配器。
 *
 * 为什么合在一个文件：三者的触发条件都依赖「这一步/这一轮到哪了」，
 * 分成三个监听器会让同一份 inbox/step 状态被读三遍，也让「这一步到底问了
 * 几个决策点」变得难以推断。这里用一个 pre-step 监听器内部分派。
 *
 * 各点的生效方式都刻意保守：
 *
 *   分派    只注入一条 runtime-context 建议，绝不替模型开子代理
 *           （开子代理是模型的决定，插件越权会让上下文分叉不可控）
 *   轮次    用 `agent.steer()` 续一轮，且每轮最多一次
 *   压缩    只在自己判定够便宜时先跑确定性裁剪；摘要交给 compaction-basic
 *
 * @module dsh-decision-engine/adapters/agent
 */

/**
 * 挂载分派 / 轮次 / 压缩三个监听器。
 * @param ctx - cordis 插件上下文。
 * @param deps - 运行期依赖。
 */
export function mountAgentPoints(ctx, deps) {
  const { runner, getConfig, digestRecent, telemetry, makeUserMessage } = deps;

  /** 每会话的续轮计数：turn → 已 steer 次数。防止自续无限循环。 */
  const steerCounts = new WeakMap();

  const steersThisTurn = (session, turn) => {
    const map = steerCounts.get(session);
    return map?.get(turn) ?? 0;
  };

  const noteSteer = (session, turn) => {
    let map = steerCounts.get(session);
    if (map === undefined) {
      map = new Map();
      steerCounts.set(session, map);
    }
    map.set(turn, (map.get(turn) ?? 0) + 1);
    // 只保留最近两轮，避免长会话里这个 Map 无界增长。
    if (map.size > 2) {
      const oldest = map.keys().next();
      if (!oldest.done) map.delete(oldest.value);
    }
  };

  /** 取最近一步的助手文本，作为「这一轮说了什么」的判断依据。 */
  const lastAssistantText = (session, chars) => {
    let events;
    try {
      events = session.events ?? [];
    } catch {
      return "";
    }
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type !== "assistant/message") continue;
      const content = event.data?.message?.content;
      if (!Array.isArray(content)) continue;
      const text = content
        .map((block) => (block?.type === "text" && typeof block.text === "string" ? block.text : ""))
        .filter((part) => part.length > 0)
        .join(" ");
      if (text.length > 0) return text.slice(-chars);
    }
    return "";
  };

  // ---------------------------------------------------------------- pre-step
  const preStep = async (payload, next) => {
    const decision = await next();
    // 判 reject 说明这一步根本没进入，注入建议没有意义。
    if (decision.kind === "reject") return decision;
    const agent = payload?.agent;
    if (agent?.session === undefined) return decision;
    const cfg = getConfig();

    try {
      const additions = [];

      // ---- 上下文压缩 ------------------------------------------------
      if (runner.participates("compact")) {
        const compacted = await maybePruneContext(ctx, agent, payload, cfg, runner, telemetry);
        if (compacted !== undefined) additions.push(compacted);
      }

      // ---- 子任务分派 ------------------------------------------------
      // 只在「每轮第一步 + 这一步确实带着新的用户输入」时判断：
      // 分派决策只在这个时刻可能改变，后续步骤再问必然是 inline。
      if (runner.participates("delegate") && payload.step === 1 && payload.messages.length > 0) {
        const incoming = payload.messages
          .map((message) => textOf(message))
          .filter((text) => text.length > 0)
          .join("\n")
          .slice(0, 1200);
        if (incoming.length > 0) {
          const result = await runner.ask(
            "delegate",
            {
              turn: payload.turn,
              step: payload.step,
              incoming,
              recent: digestRecent(agent.session, cfg.recentMessages, cfg.recentMessageChars),
            },
            { signal: payload.signal },
          );
          // 只有明确建议「开子代理/组队」时才注入提示；inline 不打扰。
          if (runner.enforces("delegate") && result.action?.kind === "advise") {
            additions.push(
              makeUserMessage(
                `[decision-engine-delegate] ${result.action.reason}\n` +
                  `如果确实适合，请用 subagent / 团队工具把它分出去；否则直接在当前上下文里做完，不要为了分派而分派。`,
                "delegate",
              ),
            );
          }
        }
      }

      if (additions.length === 0) return decision;
      return { ...decision, messages: [...decision.messages, ...additions] };
    } catch (error) {
      telemetry.noteAdapterError("pre-step", error, ctx);
      return decision;
    }
  };

  ctx.on("agent/pre-step", preStep);

  // ----------------------------------------------------------- turn-stopping
  /**
   * 轮次延续：`agent/turn-stopping` 是 serial 而不是 waterfall，返回值不传递，
   * 唯一的生效方式是调用 `agent.steer(...)` 把消息塞回 inbox —— 机器随后
   * 重新读一遍 inbox，有东西就再跑一步。
   *
   * 契约明确写了「数据决定，监听器顺序不改变结果」，因此这里唯一能做的就是
   * 「steer 或不 steer」，不能否决别的监听器的意见。
   */
  const turnStopping = async (payload) => {
    const agent = payload?.agent;
    if (agent?.session === undefined) return;
    if (!runner.participates("turnStop")) return;

    try {
      const cfg = getConfig();
      // 每轮最多续一次：否则一轮里的空转会被无限放大成烧钱循环。
      if (steersThisTurn(agent.session, payload.turn) >= Math.max(0, cfg.turnStopMaxSteers ?? 1)) return;

      const last = lastAssistantText(agent.session, cfg.recentMessageChars * 4);
      const result = await runner.ask(
        "turnStop",
        {
          turn: payload.turn,
          last,
          pendingTools: 0,
          steered: steersThisTurn(agent.session, payload.turn),
        },
        { signal: payload.signal },
      );

      if (!runner.enforces("turnStop")) return;
      if (result.action?.kind !== "continue") return;
      if (typeof agent.steer !== "function") return;

      noteSteer(agent.session, payload.turn);
      agent.steer(
        makeUserMessage(
          `[decision-engine-turnstop] ${result.action.reason}\n继续把没做完的部分做完；如果其实已经完成，直接说明结论即可。`,
          "turnStop",
        ),
      );
      ctx.logger?.info?.(`dsh-decision-engine: 第 ${payload.turn} 轮按决策续一轮`);
    } catch (error) {
      telemetry.noteAdapterError("turnStop", error, ctx);
    }
  };

  ctx.on("agent/turn-stopping", turnStopping);
}

/** 把一条消息压成纯文本（只取 text block）。 */
function textOf(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => (block?.type === "text" && typeof block.text === "string" ? block.text : ""))
    .filter((part) => part.length > 0)
    .join(" ");
}

/**
 * 上下文压缩：判断「现在只丢陈旧工具结果够不够」。
 *
 * 生效方式是调用宿主的 `toolResultPruner.pruneSession(session)` —— 这是一个
 * 纯确定性、无模型、replay 安全的裁剪，把超长工具结果的中间段换成标记。
 * 裁完之后 compaction-basic 会在同一步重新测量压力：低于阈值它就**跳过摘要**，
 * 于是真正省下一次摘要调用。
 *
 * 绝不在 observe 模式下裁剪（那会改变会话内容），也绝不在没超阈值时裁剪。
 *
 * @returns 需要追加进这一步的提示消息，或 undefined（不注入）。
 */
async function maybePruneContext(ctx, agent, payload, cfg, runner, telemetry) {
  const meter = ctx.get?.("tokenMeter");
  const pruner = ctx.get?.("toolResultPruner");
  if (meter === undefined || pruner === undefined) return undefined;

  let measurement;
  try {
    measurement = meter.measure(agent.session);
  } catch {
    return undefined;
  }
  const total = Number(measurement?.totalTokens ?? 0);
  if (total <= 0) return undefined;

  // 触发线：compaction-basic 默认 thresholdRatio 0.8。它只在达到 0.8×contextWindow
  // 时才动手，所以我们要在它之前判断，取 0.7 作为「提前介入」的位置。
  // 拿不到 contextWindow 时退回绝对阈值，避免完全不动。
  const contextWindow = Number(cfg.compactContextWindow ?? 0);
  const threshold = contextWindow > 0 ? contextWindow * (cfg.compactThresholdRatio ?? 0.7) : (cfg.compactTriggerTokens ?? 100000);
  if (total < threshold) return undefined;

  // 先数一下有多少超长工具结果，没有就不必问模型。
  const oversized = countOversizedToolResults(agent.session, cfg.compactToolResultChars ?? 8192);
  if (oversized === 0) return undefined;

  const result = await runner.ask(
    "compact",
    {
      totalTokens: total,
      triggerTokens: Math.round(threshold),
      oversized,
      nodes: Array.isArray(measurement?.nodes) ? measurement.nodes.length : 0,
      recent: digestRecentSafe(agent.session, cfg),
    },
    { signal: payload.signal },
  );

  if (!runner.enforces("compact")) return undefined;
  if (result.action?.kind !== "prune") return undefined;

  let pruned;
  try {
    pruned = pruner.pruneSession(agent.session);
  } catch (error) {
    telemetry.noteAdapterError("compact", error, ctx);
    return undefined;
  }
  if (pruned === undefined || pruned.pruned.length === 0) return undefined;

  ctx.logger?.info?.(
    `dsh-decision-engine: 裁剪 ${pruned.pruned.length} 条超长工具结果，省 ${pruned.charsRemoved} 字符（${result.action.reason}）`,
  );
  return undefined;
}

/** 数当前 surface 上超长的 tool/result 数量。 */
function countOversizedToolResults(session, limit) {
  let count = 0;
  let nodes;
  try {
    nodes = session.surface?.nodes;
  } catch {
    return 0;
  }
  if (nodes === undefined) return 0;
  for (const seq of nodes) {
    let event;
    try {
      event = session.eventAt(seq);
    } catch {
      continue;
    }
    if (event?.type !== "tool/result") continue;
    const content = event.data?.message?.content;
    if (!Array.isArray(content)) continue;
    let chars = 0;
    for (const block of content) {
      if (block?.type === "text" && typeof block.text === "string") chars += block.text.length;
    }
    if (chars > limit) count += 1;
  }
  return count;
}

/** 压缩判断里只需要很短的上下文；单独一个 helper 避免把大字符串传进 state。 */
function digestRecentSafe(session, cfg) {
  try {
    const count = Math.min(cfg.recentMessages ?? 0, 4);
    if (count <= 0) return "";
    const events = session.events ?? [];
    const lines = [];
    for (let index = events.length - 1; index >= 0 && lines.length < count; index -= 1) {
      const event = events[index];
      if (event?.type !== "user/message" && event?.type !== "assistant/message") continue;
      const text = textOf(event.data?.message ?? event.data);
      if (text.length > 0) lines.unshift(text.slice(0, 160));
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}
