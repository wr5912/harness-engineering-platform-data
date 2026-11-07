/**
 * 检索必要性 + 技能选择的 tools/pre-execute 适配器。
 *
 * 这两个点都挂在 `tools/pre-execute` 上，但只对「特定工具」生效：
 *
 *   检索必要性  只有 web_search / web_fetch / research 等检索工具才判断。
 *               其余工具一行 `includes` 就返回，零请求零延迟。
 *   技能选择    只有 `skill` 工具、且候选清单非空时才判断。
 *
 * 「只对特定工具生效」不是优化，而是必要条件：这两个点在注册表里都是
 * 非热路径，但 `tools/pre-execute` 本身是每次工具调用都会走的，
 * 若不按工具名过滤，就等于给每个 bash/read/edit 都加 2 秒。
 *
 * 两者的生效方式不同：
 *   检索  deny 直接拦下（这是唯一能真省下搜索 token 的方式）
 *   技能  deny 会给出更匹配的名字（拦掉错的、指对对的）
 *
 * @module dsh-decision-engine/adapters/tools
 */

/** 检索类工具名（默认值；可在配置里用 retrievalTools 覆盖）。 */
export const DEFAULT_RETRIEVAL_TOOLS = ["web_search", "web_fetch", "research", "multi_search", "advanced_search"];

/** 技能加载工具名。 */
export const SKILL_TOOL = "skill";

/**
 * 判断一次工具调用是不是检索。
 * @param name - 工具名。
 * @param tools - 配置里的检索工具名集合。
 * @returns 是否按检索处理。
 */
export function isRetrievalTool(name, tools) {
  return typeof name === "string" && tools.has(name);
}

/**
 * 从工具参数里摘出「这次要检索什么」。
 *
 * 不同检索工具的参数名不一样（web_search 用 queries，web_fetch 用 url，
 * research 用 question），逐个认；认不出来就退回整段参数预览。
 * 这个字符串同时是软缓存的签名——同一个问题问第二遍应该命中缓存。
 *
 * @param args - 工具参数。
 * @returns 用于 state 与缓存的查询文本。
 */
export function retrievalQuery(args) {
  if (args === null || typeof args !== "object") return "";
  const candidates = [args.query, args.question, args.url, args.prompt];
  if (Array.isArray(args.queries)) candidates.push(args.queries.join(" | "));
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  try {
    return JSON.stringify(args).slice(0, 400);
  } catch {
    return "";
  }
}

/**
 * 挂载检索必要性 + 技能选择两个监听器。
 *
 * 两者合成一个 `tools/pre-execute` 监听器而不是注册两个：一个监听器里先按
 * 工具名分派，省掉一次 dispatch 往返，也让「这次调用归哪个点管」在日志里
 * 只有一个明确答案（不会出现两个点同时记录同一次调用）。
 *
 * @param ctx - cordis 插件上下文。
 * @param deps - 运行期依赖。
 */
export function mountToolPoints(ctx, deps) {
  const { runner, getConfig, digestRecent, telemetry } = deps;

  const listener = async (exec, next) => {
    if (exec?.agent === undefined) return next();
    const name = exec.name;
    const cfg = getConfig();

    // ---- 技能选择 ------------------------------------------------------
    if (name === SKILL_TOOL && runner.participates("skillPick")) {
      try {
        const requested = typeof exec.arguments?.name === "string" ? exec.arguments.name : "";
        const candidates = await loadSkillCandidates(ctx, exec, cfg);
        // 候选太少时挑选没有意义，直接放行——别为一次「只有一个选项」付费。
        if (candidates.length >= 2) {
          const result = await runner.ask(
            "skillPick",
            {
              requested,
              candidates,
              recent: digestRecent(exec.agent.session, cfg.recentMessages, cfg.recentMessageChars),
            },
            { tool: name, signal: exec.signal },
          );
          // observe 只记录；enforce 且判出更匹配的技能时才改写这次调用。
          if (runner.enforces("skillPick") && result.action?.kind === "redirect") {
            const suggest = result.action.suggest;
            if (typeof suggest === "string" && suggest.length > 0 && suggest !== requested) {
              // 不改写参数（那会替模型做决定），而是拦下并告知更匹配的那个：
              // 模型看到原因后可以自己重发，避免「装错再换」付两遍正文 token。
              return {
                kind: "deny",
                reason: `${result.action.reason}。若要装该技能，请改用以 skill(name: "${suggest}") 重试。`,
                info: { name: "StartluxSkillPickError", code: "STARTLUX_SKILLPICK_REDIRECT", suggest },
              };
            }
          }
        }
      } catch (error) {
        telemetry.noteAdapterError("skillPick", error, ctx);
      }
      return next();
    }

    // ---- 检索必要性 ----------------------------------------------------
    if (runner.participates("retrieval") && isRetrievalTool(name, deps.retrievalTools())) {
      try {
        const query = retrievalQuery(exec.arguments);
        const result = await runner.ask(
          "retrieval",
          {
            tool: name,
            query,
            recent: digestRecent(exec.agent.session, cfg.recentMessages, cfg.recentMessageChars),
          },
          {
            tool: name,
            signal: exec.signal,
            // 软缓存（同类复用）默认关闭；此前误传 softCacheable 会把「检索
            // 有必要」的裁决跨不同查询复用，与「skip 永不复用」的意图相反。
            // 该点的裁决要么跟着完整 state 走精确键，要么不复用。
          },
        );
        if (runner.enforces("retrieval") && result.action?.kind === "skip") {
          return {
            kind: "deny",
            reason: result.action.reason,
            info: { name: "StartluxRetrievalError", code: "STARTLUX_RETRIEVAL_SKIP" },
          };
        }
      } catch (error) {
        telemetry.noteAdapterError("retrieval", error, ctx);
      }
      return next();
    }

    return next();
  };

  ctx.on("tools/pre-execute", listener);
}

/**
 * 取当前可见的技能候选清单（名称 + 描述）。
 *
 * 只带名字和一行描述，绝不带正文：决策模型每次约 1.9k token，把技能正文
 * 塞进 state 会让这个「省钱的点」变成主要花销。正文只在模型真正加载时付费。
 *
 * @param ctx - 插件上下文（用于 `ctx.get('skills')`）。
 * @param exec - 待执行的工具调用（提供 agent scope 与 cwd）。
 * @param cfg - 当前配置。
 * @returns 候选数组；取不到时返回空数组。
 */
async function loadSkillCandidates(ctx, exec, cfg) {
  const skills = ctx.get?.("skills");
  if (skills === undefined || typeof skills.list !== "function") return [];
  let summaries;
  try {
    summaries = await skills.list({
      cwd: exec.agent?.session?.header?.cwd,
      signal: exec.signal,
      scope: exec.agent,
    });
  } catch {
    return [];
  }
  // 决策模型每次只有很小的一段 state；候选超过上限就截断，宁可少挑不可超长。
  const limit = Math.max(2, cfg.skillPickCandidates ?? 8);
  return summaries.slice(0, limit).map((summary) => ({
    name: String(summary.name ?? ""),
    description: String(summary.description ?? "").slice(0, 160),
  }));
}
