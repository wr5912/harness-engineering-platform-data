/**
 * 决策点注册表。
 *
 * 一个「决策点」= 一个已经设计好问题与输出映射的适配器，而不是一个裸 hook。
 * 裸 hook 名对用户没有意义：勾上 `agent/request` 之后要回答「换成哪个模型」，
 * 勾上 `agent/pre-step` 要回答「注入什么消息」——这些答案必须由适配器给出。
 *
 * 因此配置页列的是这里定义的决策点，hook 只是它的实现细节。
 *
 * 字段说明：
 *   id         稳定标识，写进配置（pointAuthorize）与遥测（point 字段）
 *   hook       底层挂载的 DSH 事件名（或它替代的宿主服务）
 *   hotPath    true = 每步/每次模型调用都触发，延迟敏感，需要预取或触发条件
 *   available  false = 尚未实装，配置页显示为「即将支持」；本版本全部为 true
 *   defaultMode 三态默认值
 *   gate       触发闸说明：说明为什么不是「每次都问」，是冷却/采样/条件判断哪一种
 */

/** 三态：off 不参与；observe 只记录不生效；enforce 真正生效。 */
export const POINT_MODES = ["off", "observe", "enforce"];

/** @type {ReadonlyArray<object>} */
export const DECISION_POINTS = [
  {
    id: "authorize",
    key: "pointAuthorize",
    hook: "tools/pre-execute",
    hotPath: false,
    available: true,
    defaultMode: "observe",
    trigger: "每次工具调用",
    triggerEn: "every tool call",
    label: "工具授权",
    labelEn: "Tool authorization",
    summary:
      "判断这次工具调用能否放行。可替代 auto-review——后者把完整会话历史发给主模型，每次工具调用都跑一遍。",
    summaryEn:
      "Decide whether this tool call may proceed. Can replace auto-review, which sends the full session history to the main model on every call.",
    saving: "替代 auto-review：每次约省 60k token",
    savingEn: "Replaces auto-review: saves ~60k tokens per call",
  },
  {
    id: "route",
    key: "pointRoute",
    hook: "agent/request",
    hotPath: true,
    available: true,
    defaultMode: "off",
    gate: "每轮最多判断前 N 步；同一 provider/model 连续多步只问一次",
    trigger: "每次模型请求",
    triggerEn: "every model request",
    label: "模型路由",
    labelEn: "Model routing",
    summary:
      "逐步判断这一步值不值得用强模型：机械步骤（读结果、改格式、重试）下沉到便宜模型。",
    summaryEn:
      "Decide per step whether the strong model is warranted; route mechanical steps to a cheaper one.",
    saving: "主通道约省 20–40% token",
    savingEn: "~20–40% of main-channel tokens",
  },
  {
    id: "delegate",
    key: "pointDelegate",
    hook: "agent/pre-step",
    hotPath: true,
    available: true,
    defaultMode: "off",
    gate: "仅每轮第一步且带新用户输入时判断（分派决策只在这一刻可能改变）",
    trigger: "每步",
    triggerEn: "every step",
    label: "子任务分派",
    labelEn: "Subtask delegation",
    summary:
      "判断该自己接着做、开 subagent、还是组 agent team。每开一个子代理都等于新开一整个上下文。",
    summaryEn:
      "Decide whether to continue inline, spawn a subagent, or form an agent team. Each spawn costs a whole fresh context.",
    saving: "少开一次 = 省一整个上下文",
    savingEn: "One avoided spawn = one whole context saved",
  },
  {
    id: "compact",
    key: "pointCompact",
    hook: "agent/pre-step → ctx.compaction",
    hotPath: false,
    available: true,
    defaultMode: "off",
    gate: "仅当实测 token 已达阈值触发线的 70% 才问（compaction-basic 的 0.8 阈值）",
    trigger: "接近上下文阈值",
    triggerEn: "approaching the context limit",
    label: "上下文压缩",
    labelEn: "Context compaction",
    summary:
      "判断现在该摘要压缩，还是只丢掉几条已经没用的工具结果——后者不花摘要的钱。",
    summaryEn:
      "Decide whether to summarize now, or simply drop a few stale tool results without paying for a summary.",
    saving: "省掉一次摘要调用",
    savingEn: "Skips one summarisation call",
  },
  {
    id: "turnStop",
    key: "pointTurnStop",
    hook: "agent/turn-stopping",
    hotPath: false,
    available: true,
    defaultMode: "off",
    gate: "同一轮最多续一次（steer 次数上限），避免无限自续",
    trigger: "每轮结束",
    triggerEn: "every turn end",
    label: "轮次延续",
    labelEn: "Turn continuation",
    summary: "判断再来一轮还有没有增量价值，避免空转一整轮。",
    summaryEn: "Decide whether another round adds value, avoiding a wasted full turn.",
    saving: "省一整个 turn 的上下文",
    savingEn: "Saves one full turn of context",
  },
  {
    id: "retrieval",
    key: "pointRetrieval",
    hook: "tools/pre-execute",
    hotPath: false,
    available: true,
    defaultMode: "off",
    gate: "仅检索类工具（web_search/web_fetch/research 等）才问；其余工具零开销",
    trigger: "每次搜索/抓取",
    triggerEn: "every search or fetch",
    label: "检索必要性",
    labelEn: "Retrieval necessity",
    summary: "判断这条信息是否已经知道、或能否直接推断，避免不必要的搜索与抓取。",
    summaryEn: "Decide whether the information is already known or inferable, avoiding needless fetches.",
    saving: "省搜索与结果 token",
    savingEn: "Saves search and result tokens",
  },
  {
    id: "skillPick",
    key: "pointSkillPick",
    hook: "tools/pre-execute",
    hotPath: false,
    available: true,
    defaultMode: "off",
    gate: "仅 `skill` 工具加载时问，且候选清单非空才问",
    trigger: "每次加载技能",
    triggerEn: "every skill load",
    label: "技能选择",
    labelEn: "Skill selection",
    summary: "判断该装哪个技能。装错再换等于付两遍技能正文的 token。",
    summaryEn: "Decide which skill to load; a wrong pick pays the skill body twice.",
    saving: "省 2–5k / 次误加载",
    savingEn: "Saves 2–5k per wrong load",
  },
  {
    id: "cotTranslate",
    key: "pointCotTranslate",
    hook: "cotTranslation.translate()",
    hotPath: true,
    available: true,
    defaultMode: "off",
    gate: "超长文本采样头部判断；同一文本摘要命中缓存即复用",
    trigger: "每条消息",
    triggerEn: "every message",
    label: "思维链翻译门槛",
    labelEn: "COT translation gate",
    summary: "判断这条内容是否真的需要翻译，避免逐条调用翻译模型。",
    summaryEn: "Decide whether content truly needs translation, avoiding a model call per message.",
    saving: "按条省翻译调用",
    savingEn: "Saves per-message translation calls",
  },
];

/** 按 id 取决策点。 */
export function findPoint(id) {
  return DECISION_POINTS.find((point) => point.id === id);
}

/**
 * 把配置里的 `pointXxx` 字段读成一张 id → 模式 的表。
 *
 * 未知值一律退回 off：宁可少判断一次，也不要因为配置写错而在热路径上
 * 意外开始发请求。
 *
 * @param cfg - 已合并的配置。
 * @returns 记录每个决策点当前模式的普通对象。
 */
export function readPointModes(cfg) {
  /** @type {Record<string, string>} */
  const modes = {};
  for (const point of DECISION_POINTS) {
    const raw = cfg?.[point.key];
    modes[point.id] = POINT_MODES.includes(raw) ? raw : "off";
  }
  return modes;
}

/**
 * 某个决策点此刻是否应当真的调用决策模型。
 * observe 也调用（否则无从记录「本该怎样」），只是不改变行为。
 */
export function shouldInvoke(cfg, id) {
  const mode = readPointModes(cfg)[id];
  return mode === "observe" || mode === "enforce";
}

/** 某个决策点此刻是否允许改变行为。 */
export function shouldEnforce(cfg, id) {
  return readPointModes(cfg)[id] === "enforce";
}
