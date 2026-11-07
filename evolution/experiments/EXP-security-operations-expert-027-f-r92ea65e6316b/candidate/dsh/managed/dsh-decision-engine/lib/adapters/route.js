/**
 * 模型路由：`agent/request` 适配器。
 *
 * 这个点是**热路径**——每步一次模型请求就触发一次。若每次都问决策模型，
 * 等于每步多等约 2 秒，比省下的 token 更贵。因此这里用三道闸把它压下来：
 *
 *   闸1 步数闸    每轮只在前 N 步判断（默认 3）。后续步骤沿用本轮的裁决——
 *                一个任务的「要不要强模型」在开头就定了，逐步重问是浪费。
 *   闸2 路由闸    提议的 config 与上一次实际使用的不同才问。同一 provider/model
 *                连续多步时，裁决已经生效，不必再问。
 *   闸3 机械闸    只有本地判定「看起来机械」的步骤才问：上一步有工具结果、
 *                且最近没有用户新输入。新推理多半需要强模型，问了也是 keep。
 *
 * 生效方式：返回替换后的 LlmCallConfig。observe 只记录「本该换成什么」。
 *
 * 安全约束（照 `agent/request` 的契约）：这个 waterfall 不能改 messages，
 * 只能改 config。因此这里只动 provider/model 两个字段，其余字段原样透传，
 * 否则会把 maxTokens、reasoningEffort 等宿主已解析的默认值弄丢。
 *
 * @module dsh-decision-engine/adapters/route
 */

/**
 * 挂载模型路由监听器。
 * @param ctx - cordis 插件上下文。
 * @param deps - 运行期依赖。
 */
export function mountRoutePoint(ctx, deps) {
  const { runner, getConfig, digestRecent, telemetry } = deps;

  /**
   * 每轮的路由状态：turn → { askedSteps, lastProvider, lastModel }。
   * 用 WeakMap 挂在 session 上，会话销毁即回收，不担心泄漏。
   */
  const perSession = new WeakMap();

  const stateFor = (session) => {
    let state = perSession.get(session);
    if (state === undefined) {
      state = { turn: -1, askedSteps: new Set(), lastProvider: undefined, lastModel: undefined };
      perSession.set(session, state);
    }
    // 换轮即重置：新的一轮是一个新任务，前一轮的「机械」判断不适用。
    return state;
  };

  /** 最近一条 user 消息是否比最近一条工具结果更新（= 有新推理进入）。 */
  const hasFreshUserInput = (session) => {
    let events;
    try {
      events = session.events ?? [];
    } catch {
      return false;
    }
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type === "tool/result") return false;
      if (event?.type === "user/message") return true;
    }
    return false;
  };

  const listener = async (payload, next) => {
    const proposed = await next();
    const agent = payload?.agent;
    if (agent?.session === undefined) return proposed;
    if (!runner.participates("route")) return proposed;

    try {
      const cfg = getConfig();
      // 下沉目标没配就完全不判断：留空等于「不路由」，问一次模型再放弃是纯浪费。
      if (
        typeof cfg.routeCheapProvider !== "string" ||
        cfg.routeCheapProvider.length === 0 ||
        typeof cfg.routeCheapModel !== "string" ||
        cfg.routeCheapModel.length === 0
      ) {
        return proposed;
      }
      const state = stateFor(agent.session);
      if (state.turn !== payload.turn) {
        state.turn = payload.turn;
        state.askedSteps.clear();
      }

      // 闸1：本轮已问够步数就不再问，沿用当前（可能已被替换的）路由。
      if (state.askedSteps.size >= Math.max(1, cfg.routeMaxStepsPerTurn ?? 3)) return proposed;

      // 闸2：路由没变过就不必重问——裁决已经在上一问里生效。
      if (state.lastProvider === proposed.provider && state.lastModel === proposed.model) {
        // 但同一轮里第一次见到这个路由时，还是要问一次。
        if (state.askedSteps.size > 0) return proposed;
      }

      // 闸3：新用户输入带来的步骤通常是新推理，问了也多半 keep。
      if (hasFreshUserInput(agent.session) && state.askedSteps.size > 0) return proposed;

      // 已经在用便宜模型了，再往下沉没有意义。
      if (
        proposed.provider === cfg.routeCheapProvider &&
        proposed.model === cfg.routeCheapModel
      ) {
        return proposed;
      }

      state.askedSteps.add(payload.step);

      const result = await runner.ask(
        "route",
        {
          turn: payload.turn,
          step: payload.step,
          current: { provider: proposed.provider, model: proposed.model },
          recent: digestRecent(agent.session, cfg.recentMessages, cfg.recentMessageChars),
        },
        { signal: payload.signal },
      );

      if (result.action?.kind !== "switch") return proposed;
      // 校验目标路由确实配好了：留空等于「不路由」，不能真去请求空 provider。
      const provider = result.action.provider;
      const model = result.action.model;
      if (typeof provider !== "string" || provider.length === 0) return proposed;
      if (typeof model !== "string" || model.length === 0) return proposed;
      if (provider === proposed.provider && model === proposed.model) return proposed;

      // observe 到这里就结束：记录已写，但不改路由。
      if (!runner.enforces("route")) return proposed;

      state.lastProvider = provider;
      state.lastModel = model;
      ctx.logger?.info?.(
        `dsh-decision-engine: 第 ${payload.turn}/${payload.step} 步路由 ${proposed.provider}/${proposed.model} → ${provider}/${model}`,
      );
      // 只覆盖 provider/model，其余字段（maxTokens / reasoningEffort / temperature）
      // 原样保留——它们是宿主已解析好的，弄丢会改变请求语义。
      return { ...proposed, provider, model };
    } catch (error) {
      telemetry.noteAdapterError("route", error, ctx);
      return proposed;
    }
  };

  ctx.on("agent/request", listener);
}
