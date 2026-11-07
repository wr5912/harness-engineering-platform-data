/**
 * 思维链翻译门槛：包住 `translator.translate()`。
 *
 * 翻译链路没有提供任何 hook —— `ctx.translator` 是一个 Service，`cotTranslation`
 * 直接调用它的 `translate(spec, signal)`。所以这里只能包住那个方法。
 *
 * 包装是「有边界的、可撤销的」，不是野生 monkeypatch：
 *
 *   - 用 `ctx.effect(...)` 注册，卸载时一定把原方法装回去；
 *   - 原方法的 `this` 保持为 translator 实例，签名与返回值完全不变；
 *   - 判定失败一律调用原方法（fail-open），绝不让翻译因为守卫而不可用；
 *   - 返回一个空串表示「不需要翻译」会破坏调用方语义，因此**跳过翻译时
 *     返回原文**——调用方拿到的是「已经是目标语言」的合理解释。
 *
 * 生效方式与省 token 的关系：翻译按条计费。判为 skip 时直接返回原文，
 * 那条就完全不发请求；判为 translate 时正常走下原方法。
 *
 * @module dsh-decision-engine/adapters/translate
 */

/** 判断一段文本里「值得翻译的正文」占比是否够高（本地预筛，免费的）。 */
function looksLikeProse(text) {
  if (typeof text !== "string" || text.length === 0) return false;
  // 去掉代码块、行内代码、URL —— 这些不需要翻译。
  const prose = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
  // 统计字母/汉字数量；纯符号/数字/路径不值得发一次翻译请求。
  let letters = 0;
  for (const char of prose) {
    if (/[\p{L}]/u.test(char)) letters += 1;
  }
  return letters >= 4;
}

/**
 * 包住 translator.translate。
 *
 * @param ctx - cordis 插件上下文。
 * @param deps - 运行期依赖。
 * @returns 是否成功挂载。
 */
export function mountCotTranslatePoint(ctx, deps) {
  const { runner, getConfig, telemetry } = deps;

  const translator = ctx.get?.("translator");
  if (translator === undefined || typeof translator.translate !== "function") {
    ctx.logger?.info?.("dsh-decision-engine: 未找到 translator 服务，思维链翻译门槛不挂载");
    return false;
  }

  const original = translator.translate;
  /** 命中缓存的「需要翻译」判断：同一段文本重复翻译时不再问模型。 */
  const decisions = new Map();
  const MAX_DECISIONS = 256;

  const remember = (key, value) => {
    if (decisions.has(key)) decisions.delete(key);
    decisions.set(key, value);
    while (decisions.size > MAX_DECISIONS) {
      const oldest = decisions.keys().next();
      if (oldest.done) break;
      decisions.delete(oldest.value);
    }
  };

  const wrapped = async function translate(spec, signal) {
    // 这个点关掉时连一次判断都不做，直接走原路径。
    if (!runner.participates("cotTranslate")) return original.call(this, spec, signal);

    try {
      const text = typeof spec?.text === "string" ? spec.text : "";
      // 本地预筛：明显不需要翻译的文本零成本跳过，不必问模型。
      if (!looksLikeProse(text)) {
        await telemetry.log({
          ts: new Date().toISOString(),
          point: "cotTranslate",
          tag: "cotTranslate",
          action: "skip",
          detail: "decision-engine-cot: 本地预筛判定为无正文，跳过翻译",
          latencyMs: 0,
          cached: false,
        });
        return text;
      }

      // 缓存键：目标语言 + 文本摘要。同一段文本重复翻译（重放、重渲染）很常见。
      const key = `${spec.targetLanguage ?? "auto"}|${text.length}|${text.slice(0, 64)}`;
      let verdict = decisions.get(key);
      if (verdict === undefined) {
        const cfg = getConfig();
        const result = await runner.ask(
          "cotTranslate",
          {
            text,
            targetLanguage: spec.targetLanguage,
            sourceLanguage: spec.sourceLanguage,
            head: text.slice(0, 400),
          },
          { signal },
        );
        // 降级 / observe / 关闭：一律按「需要翻译」处理，走原方法。
        if (result.action === undefined || !runner.enforces("cotTranslate")) {
          return original.call(this, spec, signal);
        }
        verdict = result.action.kind === "translate";
        remember(key, verdict);
      }

      if (verdict === true) return original.call(this, spec, signal);

      // 判为不需要翻译：返回原文。这与「已经是目标语言」的语义一致，
      // 调用方不会看到异常，用户看到的还是那段文本。
      await telemetry.log({
        ts: new Date().toISOString(),
        point: "cotTranslate",
        tag: "cotTranslate",
        action: "skip",
        detail: "decision-engine-cot: 决策判定无需翻译，返回原文",
        latencyMs: 0,
        cached: true,
      });
      return text;
    } catch (error) {
      telemetry.noteAdapterError("cotTranslate", error, ctx);
      // 任何意外都必须回到原生行为：翻译不能因为守卫而不可用。
      return original.call(this, spec, signal);
    }
  };

  translator.translate = wrapped;
  // 卸载时恢复原方法：否则插件热卸载后 translator 会一直指着我们的包装。
  ctx.effect(() => () => {
    if (translator.translate === wrapped) translator.translate = original;
  });
  return true;
}
