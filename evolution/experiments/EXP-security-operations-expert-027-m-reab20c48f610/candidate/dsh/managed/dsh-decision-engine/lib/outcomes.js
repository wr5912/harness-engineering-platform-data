/**
 * 裁决（verdict）的三分类：**allow / ask / reject**。
 *
 * ## 为什么需要这一层映射
 *
 * 九个决策点各有自己的裁决词：
 *
 *   authorize   delegate / ask / deny
 *   route       keep / switch
 *   delegate    inline / advise
 *   compact     summarize / prune
 *   turnStop    continue / stop
 *   retrieval   allow / skip
 *   skillPick   allow / redirect
 *   cotTranslate translate / skip
 *
 * 但「这次裁决到底让事情过去了，还是被拦下了」这个问题，在九个点上
 * 问的是同一件事。没有统一映射时，只能逐点硬编码一份清单——而那份清单
 * 会随新增决策点而腐烂：新增一个 kind 忘了加，统计就少一类，而且
 * **少得悄无声息**（数字看着仍然合理，只是偏小）。
 *
 * 因此映射集中在这里一处，`lib/stats.js` 的聚合与 `lib/index.js` 的
 * 统计接口都从这里取，不各自抄一份。
 *
 * ## 映射口径
 *
 * 一句话：**这次裁决对待办的用户动作做了什么**。
 *
 *   allow   动作照常进行——不打断用户，也不拦下任何东西。
 *   ask     动作被升级到人工确认（用户会被打断）。
 *   reject  动作被拦下，不执行。
 *
 * 这个口径与实际生效行为一一对应：适配器里真正返回
 * `{ kind: "ask" }` 的只有工具授权的 ask，真正返回 `{ kind: "deny" }`
 * （即拦截）的只有授权的 deny、检索的 skip、技能选择的 redirect。
 * 三张表对得上，是因为它们本来就描述同一件事。
 *
 * ## 关键细节：同一个 kind 在不同点上含义不同
 *
 * 所以映射按 **（point, kind）** 而不是只按 kind：
 *
 *   retrieval.skip     → reject（这次 web_search 被拦下，不执行）
 *   cotTranslate.skip  → allow （消息照常送达，只是没翻译）
 *
 * 只按 kind 映射会把「不翻译一句话」和「拦下一次危险检索」算进同一格，
 * 而这两件事的严重程度天差地别——混在一起的「拦截次数」没有意义。
 *
 * @module dsh-decision-engine/outcomes
 */

/** 三种裁决结果的固定顺序（界面与接口都按这个顺序渲染）。 */
export const OUTCOMES = ["allow", "ask", "reject"];

/**
 * 裁决结果的显示名。
 *
 * `none` 表示「没有裁决」——降级（模型没给出可用的答案）不是第四种裁决，
 * 它是「这次根本没有裁决」，不能混进三个计数里。
 */
export const OUTCOME_LABELS = {
  allow: "放行",
  ask: "询问",
  reject: "拦截",
  none: "未裁决",
};

/**
 * （决策点, 裁决词）→ 裁决结果。
 *
 * 覆盖九个决策点的全部裁决词。**新增决策点或新增裁决词时必须在这里
 * 登记**：漏登记不会报错，只会让那个裁决悄悄不计入任何一格。
 * `lib/stats.js` 的聚合会把「有裁决但没登记」的情形单独计入
 * `otherVerdicts`，界面上会显式提示，不会被静默吞掉。
 */
export const OUTCOME_MATRIX = {
  // 工具授权：唯一真正会打断用户或拦下工具调用的点。
  authorize: {
    delegate: "allow",
    ask: "ask",
    deny: "reject",
  },
  // 模型路由：两种处置都照常发请求，只是目标模型不同。
  route: {
    keep: "allow",
    switch: "allow",
  },
  // 子任务分派：只注入建议，从不替模型开子代理。
  delegate: {
    inline: "allow",
    advise: "allow",
  },
  // 上下文压缩：摘要是省钱的做法，裁剪更省钱，两种都不拦下什么。
  compact: {
    summarize: "allow",
    prune: "allow",
  },
  // 轮次延续：收束轮次是正常结束，不是拦下用户的请求。
  turnStop: {
    continue: "allow",
    stop: "allow",
  },
  // 检索必要性：skip 会真的拦下这次检索工具调用。
  retrieval: {
    allow: "allow",
    skip: "reject",
  },
  // 技能选择：redirect 会真的拦下这次 skill 调用并指路。
  skillPick: {
    allow: "allow",
    redirect: "reject",
  },
  // 思维链翻译门槛：skip 只是不翻译，消息照常送达。
  cotTranslate: {
    translate: "allow",
    skip: "allow",
  },
};

/**
 * 老遥测回填记录的裁决分类**兜底**。
 *
 * 老遥测里有一批记录**没有 `point` 字段**——那批来自工具授权守卫，
 * `tag` 是 `guard`，但 `point` 字段是后来才加的。回填后它们的 point 变成
 * `"unknown"`，走不了（point, kind）矩阵。
 *
 * 这批记录只可能来自授权守卫，因此只有授权的三个裁决词会出现。其它裁决词
 * 在 unknown point 下一律**不猜**：同一个词在不同点上含义可能相反——
 * `retrieval.skip` 拦下了一次检索，`cotTranslate.skip` 只是没翻译一句话。
 * 把它们混在一起算「拦截次数」，得到的数字没有意义。
 */
export const LEGACY_UNKNOWN_POINT_OUTCOMES = {
  delegate: "allow",
  ask: "ask",
  deny: "reject",
};

/**
 * 查一次裁决的分类结果。
 *
 * 查不到的（没登记的 point 或 kind）返回 `"none"`——**不猜**。
 * 猜一个默认分类会让一个未知裁决看起来像「放行」，而放行是三格里
 * 看起来最无害、实则最能掩盖问题的一格。
 *
 * @param point - 决策点 id。
 * @param kind - 裁决词（`spec.decide()` 返回的 `action.kind`）。
 * @returns `"allow"` / `"ask"` / `"reject"` / `"none"`。
 */
export function outcomeOf(point, kind) {
  if (typeof point !== "string" || typeof kind !== "string") return "none";
  if (typeof kind.length !== "number" || kind.length === 0) return "none";
  const bucket = OUTCOME_MATRIX[point];
  if (bucket !== undefined) {
    const outcome = bucket[kind];
    if (outcome === "allow" || outcome === "ask" || outcome === "reject") return outcome;
    return "none";
  }
  // point 为 unknown 的老记录：只认授权那三个裁决词。
  if (point === "unknown") {
    const fallback = LEGACY_UNKNOWN_POINT_OUTCOMES[kind];
    if (fallback === "allow" || fallback === "ask" || fallback === "reject") return fallback;
  }
  return "none";
}
