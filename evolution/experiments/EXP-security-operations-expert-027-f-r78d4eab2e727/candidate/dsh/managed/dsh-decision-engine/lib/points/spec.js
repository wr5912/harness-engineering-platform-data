/**
 * 每个决策点的「问题 / 答案 / 处置」三件套 —— 全部是纯函数。
 *
 * 这一层刻意不含任何 DSH 依赖：不发请求、不碰会话、不读文件。它只做三件事：
 *
 *   build(input)  把某次触发点的现场压成 state + questions（发给决策模型的东西）
 *   parse(answers) 校验决策模型回来的答案形状，不合格一律返回 undefined（→ 降级）
 *   decide(parsed, cfg) 纯函数映射成处置（switch / advise / prune / continue / deny …）
 *
 * 之所以这样切分：决策模型的端点只接受三种题型（choice / score / noul），
 * 每种题型的返回形状都不同，而「答案形状不对」必须降级放行——不能因为模型
 * 返回畸形数据就放宽策略。把形状校验集中在这里，每个决策点都走同一条
 * 「不合格即 undefined」的路径，测试也只需要对着这三个纯函数写。
 *
 * 端点实测约束（写死在这里，避免各决策点各写一套）：
 *
 *   choice  criteria 必须是非空对象或数组 → 回 {type:'choice', choice, confidence,
 *           probabilities, none_probability}
 *   score   criteria 必须是 2–10 个档位 → 回 {type:'score', score: 浮点档位, confidence,
 *           probabilities, legend}
 *   noul    回 {type:'noul', noul: 概率}
 *
 * @module dsh-decision-engine/points/spec
 */

/**
 * 校验一个概率值：必须是 [0,1] 内的有限数，否则返回 undefined。
 *
 * 刻意**不做夹取**：越界值说明响应是畸形的，应当走降级（不改行为）。
 * 夹取会把 `noul: 1.7` 悄悄变成 1.0，等于让畸形数据取得了最强的效果——
 * 与「形状不符即降级」的原则相反。
 *
 * @param value - 待校验的值。
 * @returns 合法的概率，或 undefined。
 */
function unit(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 1) return undefined;
  return value;
}

/**
 * 把浮点比值夹到 [0,1]。
 *
 * 只用于 score 的归一化：`score / (levels-1)` 在浮点边界上可能给出
 * 1.0000000000000002（例如 4/4 的累积误差），那是合法的 1，不该被判畸形。
 *
 * @param value - 比值。
 * @returns 夹取后的值，或 undefined（非有限数）。
 */
function clamp01(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

/**
 * 读一条 choice 答案。
 * @param answers - 端点返回的 answers 对象。
 * @param key - 问题 id。
 * @returns `{choice, confidence, probabilities}`，或 undefined。
 */
export function readChoice(answers, key) {
  const raw = answers?.[key];
  if (raw === null || typeof raw !== "object") return undefined;
  if (raw.type !== "choice") return undefined;
  if (typeof raw.choice !== "string" || raw.choice.length === 0) return undefined;
  const confidence = unit(raw.confidence);
  if (confidence === undefined) return undefined;
  return {
    choice: raw.choice,
    confidence,
    probabilities: raw.probabilities !== null && typeof raw.probabilities === "object" ? raw.probabilities : {},
  };
}

/**
 * 读一条 noul 答案。
 * @param answers - 端点返回的 answers 对象。
 * @param key - 问题 id。
 * @returns 概率，或 undefined。
 */
export function readNoul(answers, key) {
  const raw = answers?.[key];
  if (raw === null || typeof raw !== "object") return undefined;
  if (raw.type !== "noul") return undefined;
  return unit(raw.noul);
}

/**
 * 读一条 score 答案并归一到 [0,1]。
 *
 * 端点把 score 返回成「档位浮点数」（0 …. levels-1），不是概率；例如 5 档时
 * 1.85 表示约 0.46。归一在这里做，下游阈值就都能用 0–1 表达。
 *
 * @param answers - 端点返回的 answers 对象。
 * @param key - 问题 id。
 * @param levels - 该题的档位数。
 * @returns 归一后的分数，或 undefined。
 */
export function readScore(answers, key, levels) {
  const raw = answers?.[key];
  if (raw === null || typeof raw !== "object") return undefined;
  if (raw.type !== "score") return undefined;
  const numeric = Number(raw.score);
  if (!Number.isFinite(numeric)) return undefined;
  // 档位必须落在 [0, levels-1]；越界即畸形，不夹取（同 unit 的理由）。
  const span = Math.max(1, levels - 1);
  if (numeric < 0 || numeric > span) return undefined;
  const score = clamp01(numeric / span);
  if (score === undefined) return undefined;
  return score;
}

/** 统一的证据串：写进 reason 与遥测，方便事后校准时对照。 */
function evidence(parts) {
  return parts
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value.toFixed(2)}`)
    .join(" ");
}

/**
 * 各决策点的规格。
 *
 * 每个条目实现：
 *   build(input)         → { state, questions }
 *   parse(answers)       → 解析结果 或 undefined（形状不合格）
 *   decide(parsed, cfg)  → { kind, reason, … }
 */
export const POINT_SPECS = {
  // ---------------------------------------------------------------- 模型路由
  /**
   * 判断这一步值不值得用强模型。value 在于「机械步骤下沉」：读结果、改格式、
   * 重试这类步骤用便宜模型做等价的事，主通道省 20–40% token。
   *
   * 保守优先：任一「风险偏高」「能力需求超阈值」「不够机械」都保留强模型。
   * 误判成 cheap 的代价是一次坏回答，误判成 strong 的代价只是那一次的钱。
   */
  route: {
    build(input) {
      const state = {
        turn: input.turn,
        step: input.step,
        current: input.current,
        recent: input.recent ?? "",
      };
      return {
        state,
        questions: {
          capability: {
            type: "score",
            instructions:
              "How much reasoning capability does the next reply require? Judge the work, not the topic's importance.",
            criteria: ["trivial", "light", "moderate", "demanding", "hard"],
          },
          mechanical: {
            type: "noul",
            instructions:
              "Is this step mechanical bookkeeping — reformatting, retrying, reading results, or applying an already-decided edit — rather than new reasoning?",
          },
          risky: {
            type: "noul",
            instructions:
              "Would a weaker model plausibly make an error here whose consequences are hard to undo afterwards?",
          },
        },
      };
    },
    parse(answers) {
      const capability = readScore(answers, "capability", 5);
      const mechanical = readNoul(answers, "mechanical");
      const risky = readNoul(answers, "risky");
      if (capability === undefined || mechanical === undefined || risky === undefined) return undefined;
      return { capability, mechanical, risky };
    },
    decide(parsed, cfg) {
      const note = evidence([
        ["cap", parsed.capability],
        ["mech", parsed.mechanical],
        ["risk", parsed.risky],
      ]);
      if (parsed.risky >= cfg.routeRiskFloor) {
        return { kind: "keep", reason: `decision-engine-route: 本步风险偏高，保留强模型（${note}）` };
      }
      if (parsed.capability > cfg.routeMaxScore) {
        return { kind: "keep", reason: `decision-engine-route: 能力需求超过下沉阈值，保留强模型（${note}）` };
      }
      if (parsed.mechanical < cfg.routeMechanicalFloor) {
        return { kind: "keep", reason: `decision-engine-route: 不是机械步骤，保留强模型（${note}）` };
      }
      return {
        kind: "switch",
        reason: `decision-engine-route: 机械步骤下沉到 ${cfg.routeCheapProvider}/${cfg.routeCheapModel}（${note}）`,
        provider: cfg.routeCheapProvider,
        model: cfg.routeCheapModel,
      };
    },
  },

  // ------------------------------------------------------------ 子任务分派
  /**
   * 判断该自己接着做、开 subagent、还是组 agent team。
   *
   * 只在「本轮第一步 + 有新的用户输入」时判断：那是唯一可能改变分派决策的时刻，
   * 每步都问等于每步多等 2 秒。生效时注入一条 runtime-context 提示，而不是
   * 替模型去开子代理——工具选择仍然归模型。
   */
  delegate: {
    build(input) {
      const state = {
        turn: input.turn,
        step: input.step,
        incoming: input.incoming ?? "",
        recent: input.recent ?? "",
      };
      return {
        state,
        questions: {
          scope: {
            type: "choice",
            instructions:
              "Should this work continue inline in the current agent, be delegated to one subagent, or require an agent team working in parallel?",
            criteria: {
              inline: "Small, single-threaded work the current agent can finish directly",
              subagent: "Self-contained but sizeable work with its own context, better isolated from this conversation",
              team: "Several genuinely independent parts that must run in parallel and then be merged",
            },
          },
          parallel: {
            type: "noul",
            instructions:
              "Would this work split into parts that could run concurrently without waiting on each other?",
          },
          blocking: {
            type: "noul",
            instructions:
              "Is the next action blocked on a fact the current agent can only learn by doing the work itself right now?",
          },
        },
      };
    },
    parse(answers) {
      const scope = readChoice(answers, "scope");
      const parallel = readNoul(answers, "parallel");
      const blocking = readNoul(answers, "blocking");
      if (scope === undefined || parallel === undefined || blocking === undefined) return undefined;
      if (scope.choice !== "inline" && scope.choice !== "subagent" && scope.choice !== "team") return undefined;
      return { scope: scope.choice, confidence: scope.confidence, parallel, blocking };
    },
    /**
     * @param parsed - 已校验的答案。
     * @param cfg - 当前配置。
     *
     * 实测校准的重要发现：`choice` 的 `confidence` 是**被选中项的概率**，
     * 三个选项平分时天然只有 0.33。实测「明确可并行的大活」给出
     * team=0.99/conf=0.98（可信），而「需要先看代码」给出 inline=0.69/conf=0.53
     * （模糊）。因此置信门槛必须按选项数校准，不能固定 0.6——否则多选项
     * 场景下永远判不出 advise。这里按 `1/选项数` 的相对倍数判定：
     * 概率至少要显著高于均分才认为模型真有倾向。
     */
    decide(parsed, cfg) {
      const note = evidence([
        ["conf", parsed.confidence],
        ["par", parsed.parallel],
        ["block", parsed.blocking],
      ]);
      // 三个选项 → 均分 0.333；乘 1.5 得 0.5 作为「有倾向」的门槛。
      const floor = Math.max(cfg.delegateConfidenceFloor, 0.5);
      if (parsed.confidence < floor) {
        return { kind: "inline", reason: `decision-engine-delegate: 分派置信不足（低于 ${floor}），接着自己做（${note}）` };
      }
      if (parsed.blocking >= cfg.delegateBlockingFloor) {
        return { kind: "inline", reason: `decision-engine-delegate: 下一步被本地事实阻塞，接着自己做（${note}）` };
      }
      if (parsed.scope === "team") {
        // team 还需要真并行才有意义：串行工作进行组队只是多付上下文。
        if (parsed.parallel >= cfg.delegateParallelFloor) {
          return { kind: "advise", target: "team", reason: `decision-engine-delegate: 建议组 agent team（${note}）` };
        }
        return { kind: "inline", reason: `decision-engine-delegate: 建议组队但并行度不足，接着自己做（${note}）` };
      }
      if (parsed.scope === "subagent") {
        return { kind: "advise", target: "subagent", reason: `decision-engine-delegate: 建议开 subagent（${note}）` };
      }
      return { kind: "inline", reason: `decision-engine-delegate: 继续内联处理（${note}）` };
    },
  },

  // ------------------------------------------------------------ 上下文压缩
  /**
   * 判断现在该摘要压缩，还是只丢掉几条已经没用的工具结果。
   *
   * 后者完全不花摘要的钱：compaction-basic 在每一步都会重新测量压力，
   * 我们把体积压到阈值以下，它就直接跳过摘要（`measure.totalTokens <
   * spec.thresholdTokens → return null`）。这是本决策点唯一真实可执行的动作。
   */
  compact: {
    build(input) {
      const state = {
        totalTokens: input.totalTokens,
        triggerTokens: input.triggerTokens,
        oversized: input.oversized ?? 0,
        nodes: input.nodes ?? 0,
        recent: input.recent ?? "",
      };
      return {
        state,
        questions: {
          /**
           * 实测：问「策略该 prune 还是 summarize」时，两类输入都答 prune
           * （0.98 / 0.86），完全没有区分力——因为从模型视角看，丢工具结果
           * 的中间段永远是「便宜且看起来安全」的。
           *
           * 换成问「结论是否已经被写进对话」之后，两类给出 0.81 / 0.41，
           * 这是真正能分开的事实判断：模型只需要看 recent 里有没有落地的
           * 结论，不需要判断抽象的「策略」。
           */
          distilled: {
            type: "noul",
            instructions:
              "Has the essential information from those oversized tool results already been distilled into the recent conversation — a conclusion, decision, or summary the agent has written down?",
          },
          /**
           * 安全否决项：剩余工作仍需要逐字原文时绝不裁掉中间段。
           * 实测两类都低（0.26 / 0.26），因此它只作否决、不作主判据。
           */
          verbatim_needed: {
            type: "noul",
            instructions:
              "Does the remaining work still require the verbatim middle of those tool outputs — exact line numbers, long identifiers, or values not yet copied into the conversation?",
          },
        },
      };
    },
    parse(answers) {
      const distilled = readNoul(answers, "distilled");
      const verbatim = readNoul(answers, "verbatim_needed");
      if (distilled === undefined || verbatim === undefined) return undefined;
      return { distilled, verbatim };
    },
    decide(parsed, cfg) {
      const note = evidence([
        ["dist", parsed.distilled],
        ["verb", parsed.verbatim],
      ]);
      if (parsed.verbatim >= cfg.compactVerbatinFloor) {
        return { kind: "summarize", reason: `decision-engine-compact: 仍需逐字原文，交给摘要压缩（${note}）` };
      }
      if (parsed.distilled >= cfg.compactDistilledFloor) {
        return { kind: "prune", reason: `decision-engine-compact: 结论已落地，只丢陈旧工具结果并跳过摘要（${note}）` };
      }
      return { kind: "summarize", reason: `decision-engine-compact: 结论尚未落地，交给摘要压缩（${note}）` };
    },
  },

  // ------------------------------------------------------------ 轮次延续
  /**
   * 判断再来一轮还有没有增量价值。生效时用 `agent.steer()` 注入一条提示把
   * 轮次再撑起来；不生效就什么都不做，让这一轮自然结束。
   */
  turnStop: {
    build(input) {
      const state = {
        turn: input.turn,
        last: input.last ?? "",
        pendingTools: input.pendingTools ?? 0,
        steered: input.steered ?? 0,
      };
      return {
        state,
        questions: {
          unfinished: {
            type: "noul",
            instructions:
              "Is there clearly identified remaining work in the user's request that this turn has not done yet?",
          },
          value: {
            type: "noul",
            instructions:
              "Would another round produce a materially better or more complete result, rather than restating or padding what is already said?",
          },
          closed: {
            type: "noul",
            instructions: "Has the user's request been fully answered as stated?",
          },
        },
      };
    },
    parse(answers) {
      const unfinished = readNoul(answers, "unfinished");
      const value = readNoul(answers, "value");
      const closed = readNoul(answers, "closed");
      if (unfinished === undefined || value === undefined || closed === undefined) return undefined;
      return { unfinished, value, closed };
    },
    /**
     * @param parsed - 已校验的答案。
     * @param cfg - 当前配置。
     *
     * 实测（同一轮两种输入）：
     *   已完成    closed 0.74 / unfin 0.09 / value 0.09
     *   未完成    closed 0.28 / unfin 0.83 / value 0.39
     *
     * 判据顺序很关键：**先看 unfin**。若先看 closed，则「未完成」那组
     * 因为 closed=0.28 不达线，会落到最后的默认 stop —— 而它恰恰是该续轮的。
     * 只有 unfin 低（确实没剩活）时才允许按 closed 收束。
     */
    decide(parsed, cfg) {
      const note = evidence([
        ["unfin", parsed.unfinished],
        ["value", parsed.value],
        ["closed", parsed.closed],
      ]);
      // 排在前面：确实还有活，且续一轮有增量价值 → 续。
      if (parsed.unfinished >= cfg.turnStopUnfinishedFloor && parsed.value >= cfg.turnStopValueFloor) {
        return { kind: "continue", reason: `decision-engine-turnstop: 仍有未完成的活，续一轮（${note}）` };
      }
      if (parsed.closed >= cfg.turnStopClosedFloor) {
        return { kind: "stop", reason: `decision-engine-turnstop: 请求已完成，收束轮次（${note}）` };
      }
      return { kind: "stop", reason: `decision-engine-turnstop: 再来一轮没有增量价值（${note}）` };
    },
  },

  // ------------------------------------------------------------ 检索必要性
  /**
   * 判断这条信息是否已经知道、或能否直接从上下文推断，避免不必要的搜索与抓取。
   * 只对检索类工具生效（web_search / web_fetch / research / …），其余工具不打扰。
   */
  retrieval: {
    build(input) {
      const state = {
        tool: input.tool,
        query: input.query ?? "",
        recent: input.recent ?? "",
      };
      return {
        state,
        questions: {
          /**
           * 实测：问「这个信息是否已知道」时，两类输入的答案几乎同值
           * （已知 0.30 / 未知 0.12），完全没有区分力。改成问「recent 里
           * 是否**逐字覆盖**了这个事实，只依据那段文本回答」之后，
           * 两类分别给出 0.92 / 0.01 —— 这是本题唯一有效的问法，
           * 因为模型无法靠常识作答，只能查文本。
           */
          covered: {
            type: "noul",
            instructions:
              "Is the queried fact explicitly covered by the recent conversation text above? Answer strictly from that text; do not use outside knowledge.",
          },
          /**
           * 与 covered 成对：即使文本里提过，重新搜索仍可能带来新信息。
           * 实测 0.63 / 0.98 也分得开，作为第二道确认。
           */
          would_add: {
            type: "noul",
            instructions:
              "Would a fresh web search return substantially new information beyond what the recent conversation already states?",
          },
        },
      };
    },
    parse(answers) {
      const covered = readNoul(answers, "covered");
      const wouldAdd = readNoul(answers, "would_add");
      if (covered === undefined || wouldAdd === undefined) return undefined;
      return { covered, wouldAdd };
    },
    decide(parsed, cfg) {
      const note = evidence([
        ["cov", parsed.covered],
        ["add", parsed.wouldAdd],
      ]);
      // 两个条件都必须满足才跳过：文本已覆盖、且再搜也拿不到新东西。
      if (parsed.covered >= cfg.retrievalCoveredFloor && parsed.wouldAdd <= cfg.retrievalWouldAddCeiling) {
        return {
          kind: "skip",
          reason: `decision-engine-retrieval: 上下文已覆盖该事实且再搜无新信息，跳过检索（${note}）`,
        };
      }
      return { kind: "allow", reason: `decision-engine-retrieval: 检索有必要（${note}）` };
    },
  },

  // ------------------------------------------------------------ 技能选择
  /**
   * 判断该装哪个技能。装错再换等于付两遍技能正文的 token，因此把候选清单
   * 交给决策模型挑一个，比让主模型自己试错便宜。
   */
  skillPick: {
    build(input) {
      const candidates = input.candidates ?? [];
      const criteria = {};
      for (const item of candidates) criteria[item.name] = item.description || item.name;
      criteria.none = "No listed skill applies to the current request";
      const state = {
        requested: input.requested ?? "",
        candidates: candidates.map((item) => item.name),
        recent: input.recent ?? "",
      };
      return {
        state,
        questions: {
          best: {
            type: "choice",
            instructions:
              "Which listed skill best matches what the current request actually needs? Pick the one whose own description covers the work; never pick a skill because its name sounds related.",
            criteria,
          },
        },
      };
    },
    parse(answers) {
      const best = readChoice(answers, "best");
      if (best === undefined) return undefined;
      return { best: best.choice, confidence: best.confidence };
    },
    decide(parsed, cfg) {
      const note = evidence([["conf", parsed.confidence]]);
      if (parsed.best === "none") {
        return { kind: "allow", reason: `decision-engine-skillpick: 没有更匹配的技能，放行（${note}）` };
      }
      if (parsed.confidence < cfg.skillPickConfidenceFloor) {
        return { kind: "allow", reason: `decision-engine-skillpick: 置信不足，放行（${note}）` };
      }
      return {
        kind: "redirect",
        suggest: parsed.best,
        reason: `decision-engine-skillpick: 更匹配的是「${parsed.best}」（${note}）`,
      };
    },
  },

  // ------------------------------------------------------- 思维链翻译门槛
  /**
   * 判断这条内容是否真的需要翻译。翻译链路按条计费，纯代码块、标识符、
   * 已经是目标语言的内容都可以直接跳过。
   */
  cotTranslate: {
    build(input) {
      const state = {
        target: input.targetLanguage ?? "auto",
        source: input.sourceLanguage ?? "auto",
        chars: input.text?.length ?? 0,
        head: input.head ?? "",
      };
      return {
        state,
        questions: {
          prose: {
            type: "noul",
            instructions:
              "Does this text contain natural-language prose that a reader would need translated, rather than code, identifiers, paths, or punctuation?",
          },
          same_language: {
            type: "noul",
            instructions: "Is this text already written in the requested target language?",
          },
        },
      };
    },
    parse(answers) {
      const prose = readNoul(answers, "prose");
      const sameLanguage = readNoul(answers, "same_language");
      if (prose === undefined || sameLanguage === undefined) return undefined;
      return { prose, sameLanguage };
    },
    decide(parsed, cfg) {
      const note = evidence([
        ["prose", parsed.prose],
        ["same", parsed.sameLanguage],
      ]);
      if (parsed.sameLanguage >= cfg.cotSameLanguageFloor) {
        return { kind: "skip", reason: `decision-engine-cot: 已是目标语言，跳过翻译（${note}）` };
      }
      if (parsed.prose < cfg.cotProseFloor) {
        return { kind: "skip", reason: `decision-engine-cot: 没有需要翻译的正文，跳过（${note}）` };
      }
      return { kind: "translate", reason: `decision-engine-cot: 需要翻译（${note}）` };
    },
  },
};

/**
 * 按 id 取规格。
 * @param id - 决策点 id。
 * @returns 规格对象，或 undefined。
 */
export function findSpec(id) {
  return POINT_SPECS[id];
}
