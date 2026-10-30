import { invariant } from './language-understanding.ts'
import { ROOT_PRESET, WORKFLOW_ID, WORKFLOW_TOOL } from './security-ops-context.ts'

export interface NativeFallbackModel { provider: string; model: string; reasoningEffort: string }

/** 只在当前回合真实图回执完成后交还原生模型；继续沿用同一会话、工具和 Guard。 */
export function nativeFallbackForTurn(agent: any, turn: number): boolean {
  if (agent?.session?.header?.agentPreset !== ROOT_PRESET) return false
  const events = agent.session.snapshotEvents()
  const call = events.findLast((event: any) => event.type === 'tool/call' && event.data?.turn === turn && event.data?.name === WORKFLOW_TOOL)
  if (!call) return false
  const receipt = events.findLast((event: any) => event.type === 'tool/result' && event.data?.turn === turn
    && event.data?.message?.toolCallId === call.data.callId && event.data?.message?.source?.callId === call.data.callId)
  if (!receipt || receipt.data.error || receipt.data.message.isError) return false
  const blocks = receipt.data.message.content
  if (!Array.isArray(blocks) || blocks.length !== 1 || blocks[0]?.type !== 'text') return false
  let value: any
  try { value = JSON.parse(blocks[0].text) } catch { return false }
  const graph = value?.graph_execution
  return value?.ok === true && value.result?.native_fallback === true
    && graph?.workflow_id === WORKFLOW_ID && graph.session_id === agent.session.id
    && graph.tool_call_id === call.data.callId && graph.execution_mode === 'hybrid'
    && graph.complete === true && graph.status === 'completed'
}

export function registerNativeFallback(ctx: any, model: NativeFallbackModel) {
  invariant(model?.provider === 'xiaomi-token-plan-cn' && model.model === 'mimo-v2.6-flash' && model.reasoningEffort === 'off', 'BUSINESS_MIMO_BINDING_REQUIRED')
  // 先注册外层中间件，再注册图派发器；图派发器准备原生本地路由后可交还业务模型。
  ctx.on('agent/request', async ({ agent, turn, signal }: any, next: () => Promise<any>) => {
    const route = await next()
    signal.throwIfAborted()
    return nativeFallbackForTurn(agent, turn) ? { ...model } : route
  })
}
