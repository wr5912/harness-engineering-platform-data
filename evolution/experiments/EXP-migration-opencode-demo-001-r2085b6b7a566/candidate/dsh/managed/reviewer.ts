import { defineTool } from "@deepseek-ai/dsh-tools"

/**
 * reviewer 子角色的阻塞式委派工具。
 * 原生 tool-subagent 为异步委派（不等待子代结果）；本工具使用原生 subagent 服务的
 * 公开等待接口（startActivation 返回的 result/dispose，delivery: 'caller'），
 * 承接来源 OpenCode "完成前调用 reviewer 复核、最后再答复" 的 reviewer-before-finish 语义。
 *
 * 角色模型事实源唯一：harness.yaml 的 model_bindings.presets.reviewer。
 * 本插件入口声明 config.harnessModelRole，由平台模型投影注入 config.agentPreset
 * 与 config.agentOptions（provider/model/reasoningEffort）；本文件不硬编码任何路由，
 * 仅消费注入值，缺失或不合法时明确报错。
 *
 * 生命周期：startActivation 的 signal 只取消未发布工作；发布后监听 abort 并 dispose
 * 本次 activation（已 abort 立即处理，只影响本次 activation 及其后代，不触及其他子代），
 * finally 移除监听并 dispose。子任务非正常完成或结论为空时，本工具明确失败。
 */
const name = "tool-reviewer"
const inject = ["tools", "subagents"]

type ChildAgentOptions = { provider: string; model: string; reasoningEffort: string }

function textOf(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > 3) return ""
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(item => textOf(item, depth + 1)).filter(Boolean).join("\n")
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    for (const key of ["output", "text", "answer", "content", "review"]) {
      if (key in record) {
        const text = textOf(record[key], depth + 1)
        if (text.trim()) return text
      }
    }
  }
  return ""
}

function requireProjectedConfig(config: unknown): { agentPreset: string; agentOptions: ChildAgentOptions } {
  const value = (config ?? {}) as Record<string, unknown>
  const agentPreset = value.agentPreset
  if (typeof agentPreset !== "string" || !agentPreset.trim()) {
    throw new Error(
      "reviewer 工具缺少注入的 config.agentPreset；请由平台模型投影按 harness.yaml model_bindings.presets 提供（入口声明 config.harnessModelRole）",
    )
  }
  const agentOptions = value.agentOptions as Record<string, unknown> | undefined
  if (!agentOptions || typeof agentOptions !== "object") {
    throw new Error(
      "reviewer 工具缺少注入的 config.agentOptions；请由平台模型投影按 harness.yaml model_bindings.presets 提供（入口声明 config.harnessModelRole）",
    )
  }
  const provider = agentOptions.provider
  const model = agentOptions.model
  const reasoningEffort = agentOptions.reasoningEffort
  if (typeof provider !== "string" || !provider.trim() || typeof model !== "string" || !model.trim()) {
    throw new Error("reviewer 工具注入的 config.agentOptions 缺少有效的 provider/model")
  }
  if (typeof reasoningEffort !== "string" || !reasoningEffort.trim()) {
    throw new Error("reviewer 工具注入的 config.agentOptions 缺少有效的 reasoningEffort")
  }
  return {
    agentPreset,
    agentOptions: { provider, model, reasoningEffort },
  }
}

function apply(ctx: any, config: unknown) {
  // 装载即校验注入的模型投影，缺失或不合法明确报错。
  const projected = requireProjectedConfig(config)
  ctx.tools.register(defineTool({
    name: "reviewer",
    description:
      "委派 reviewer 子角色复核实际改动（只读复核，不修改文件）。本调用阻塞等待 reviewer 完成并返回其复核结论；收到复核结论前不得作最终答复。task 需写明 reviewer 要读取的项目文件、实际修改内容与测试结果。",
    parameters: {
      task: {
        type: "string",
        required: true,
        description: "给 reviewer 的复核任务：需要读取的项目文件、实际修改内容与测试结果、复核要求。",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          subagentId: { type: "string", required: true, description: "reviewer 子会话 ID" },
          review: { type: "string", required: true, description: "reviewer 的复核结论" },
        },
      },
      render: (_args: unknown, value: { subagentId: string; review: string }) => [{
        type: "text",
        text: `reviewer ${value.subagentId} 复核结论：\n${value.review}`,
      }],
    },
    async execute(args: { task: string }, exec: { agent?: unknown; signal?: AbortSignal }) {
      const parent = exec.agent
      if (!parent) throw new Error("reviewer 工具需要调用方 Agent（exec.agent 未定义）")
      const signal = exec.signal
      signal?.throwIfAborted()
      const activation = await ctx.subagents.startActivation({
        provider: "spawn",
        label: "reviewer",
        request: {
          prompt: [{ type: "text", text: args.task }],
          parent,
          agentPreset: projected.agentPreset,
          agentOptions: projected.agentOptions,
        },
        signal,
        delivery: "caller",
      })
      // 发布后 signal 不再能取消子代：abort 时仅 dispose 本次 activation（不触及其他子代）。
      const onAbort = () => {
        void Promise.resolve(activation.dispose()).catch(() => undefined)
      }
      if (signal) signal.addEventListener("abort", onAbort, { once: true })
      try {
        if (signal?.aborted) onAbort()
        const outcome: any = await activation.result
        const stop = outcome && typeof outcome === "object"
          ? (outcome.stopReason ?? outcome.stop_reason ?? null)
          : null
        if (stop && stop !== "completed") {
          throw new Error(`reviewer 子任务未正常完成（stopReason=${String(stop)}）`)
        }
        const review = textOf(outcome)
        if (!review.trim()) throw new Error("reviewer 未返回有效复核结论")
        return { subagentId: activation.childId, review }
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort)
        await activation.dispose()
      }
    },
  }))
}

export { apply, inject, name }
