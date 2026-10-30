import { invariant, jsonCopy, sha256, type SourceOrigin } from './language-understanding.ts'
import type { Json } from './decision-questions.ts'

export const CONTEXT_TOOL = 'read_security_ops_context'
export const ROOT_PRESET = 'security-operations-expert'
export const WORKFLOW_TOOL = 'security_ops_medium_workflow'
export const WORKFLOW_ID = 'security-ops-medium-v1'
export const READ_ROUTES = {
  inspection_catalog: { group: 'inspection', operation: 'list_executable_inspections' },
  schedule_list: { name: 'schedule_list' },
} as const
export const decisionToolName = (site: string) => `security_ops_decide_${site}`
export type NativeQueryRoute = keyof typeof READ_ROUTES
export interface RuntimeTool { name: string; inputSchema: Record<string, any>; route: NativeQueryRoute }
export interface SessionFacts { binding: Record<string, Json>; progress: { run_status: string; tool_attempts: Json[] }; observations: Json[]; pending_calls: string[] }
export interface NativeContext {
  origin: SourceOrigin; request: string; sequence: number
  capabilities: { status: 'discovered'; tools: RuntimeTool[] }
  projection: SessionFacts
}
/** 只读查询的显式范围：catalog_only/list_only；业务执行仍由固定父版办理。 */
export const NATIVE_QUERY_SCOPE = {
  inspection_catalog: { scope: 'catalog_only', title: '巡检目录查询', first: '本次仅查询可执行巡检目录，未启动任何巡检，也未创建、修改或删除任何调度；巡检执行等完整业务请继续使用固定父版办理。' },
  schedule_list: { scope: 'list_only', title: '当前调度列表查询', first: '本次仅查询当前调度列表，未创建、修改或删除任何调度，也未启动任何巡检；调度变更等完整业务请继续使用固定父版办理。' },
} as const
/** 真实无参合同：空参数定义{}或JSON schema object且无required；仍拒绝未绑定的必填参数。 */
export function noArgumentQuery(tool: RuntimeTool): Record<string, never> {
  const schema = tool.inputSchema
  invariant(schema && typeof schema === 'object' && !Array.isArray(schema), 'READ_QUERY_CONTRACT_MISSING')
  invariant(Object.keys(schema).length === 0 || schema.type === 'object', 'READ_QUERY_REQUIRES_UNBOUND_ARGUMENTS')
  const required = schema.required
  invariant(required === undefined || Array.isArray(required) && required.length === 0, 'READ_QUERY_REQUIRES_BOUND_ARGUMENTS')
  return {}
}
const QUERY_FAILURE_STATUS = new Set(['failed', 'failure', 'error', 'cancelled'])
const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
function queryFailure(value: unknown): string | null {
  if (!isRecord(value)) return null
  if (value.isError === true) return 'tool_is_error'
  if (value.ok === false) return 'tool_ok_false'
  if (value.success === false) return 'tool_success_false'
  if (typeof value.error === 'string' && value.error.trim()) return 'tool_error_text'
  if (value.error && typeof value.error === 'object' && (Array.isArray(value.error) ? value.error.length > 0 : Object.keys(value.error).length > 0)) return 'tool_error_object'
  if (typeof value.status === 'string' && QUERY_FAILURE_STATUS.has(value.status.toLowerCase())) return `tool_status_${value.status}`
  if (typeof value.state === 'string' && QUERY_FAILURE_STATUS.has(value.state.toLowerCase())) return `tool_state_${value.state}`
  return null
}
function parseText(value: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof value !== 'string') return { ok: false }
  try { return { ok: true, value: JSON.parse(value) } } catch { return { ok: false } }
}
/** 已核对有效目录/列表才 completed；显式错误 failed；空/不可解析/未知结构 unknown，均保留原回执。 */
export function judgeNativeQuery(route: NativeQueryRoute, receipt: unknown): NativeQueryJudgement {
  const preserved = receipt === undefined ? null : jsonCopy(receipt)
  const direct = queryFailure(receipt)
  if (direct) return { status: 'failed', reason: direct, receipt: preserved }
  const candidates: unknown[] = []
  let sawText = false, sawParsedText = false, emptyContent = false
  if (isRecord(receipt)) {
    if (receipt.structuredContent !== undefined && receipt.structuredContent !== null) candidates.push(receipt.structuredContent)
    if (Array.isArray(receipt.content)) {
      emptyContent = receipt.content.length === 0 && (receipt.structuredContent === undefined || receipt.structuredContent === null) && receipt.items === undefined
      for (const block of receipt.content) if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
        sawText = true
        const parsed = parseText(block.text)
        if (parsed.ok) { sawParsedText = true; candidates.push(parsed.value) }
      }
    }
  } else if (typeof receipt === 'string') {
    sawText = true
    const parsed = parseText(receipt)
    if (parsed.ok) { sawParsedText = true; candidates.push(parsed.value) }
  }
  if (receipt !== undefined && receipt !== null) candidates.push(receipt)
  for (const candidate of candidates) {
    const failure = queryFailure(candidate)
    if (failure) return { status: 'failed', reason: failure, receipt: preserved }
  }
  for (const candidate of candidates) {
    if (route === 'inspection_catalog' && isRecord(candidate) && Array.isArray(candidate.items) && (candidate.total === undefined || typeof candidate.total === 'number')) {
      const total = typeof candidate.total === 'number' ? candidate.total : undefined
      return { status: 'completed', reason: 'inspection_catalog_items', items: jsonCopy(candidate.items) as Json[], ...(total === undefined ? {} : { total }), receipt: preserved }
    }
    if (route === 'schedule_list' && Array.isArray(candidate)) return { status: 'completed', reason: 'schedule_list_array', items: jsonCopy(candidate) as Json[], receipt: preserved }
  }
  const reason = emptyContent || receipt === undefined || receipt === null ? 'empty_content' : sawText && !sawParsedText ? 'unparsable_content' : 'unrecognized_shape'
  return { status: 'unknown', reason, receipt: preserved }
}
/** 回复只用已核对事实：查询完成不等于业务执行；错误与未知不得折叠为空结果。 */
export function nativeQueryReply(route: NativeQueryRoute, judgement: NativeQueryJudgement): string {
  const scope = NATIVE_QUERY_SCOPE[route]
  const head = `${scope.first}\nscope=${scope.scope}；本次业务未执行。`
  if (judgement.status === 'completed') {
    const count = judgement.items?.length ?? 0, empty = count === 0 ? '；空目录/空列表本身是有效查询结果' : ''
    return `${head}\n${scope.title}查询已完成（仅查询完成，业务 run 未启动或未变更）${empty}，返回 ${count} 项：\n${JSON.stringify(judgement.items ?? [])}`
  }
  if (judgement.status === 'failed') return `${head}\n${scope.title}失败（${judgement.reason}）；已保留原回执，未把错误当作空结果。`
  return `${head}\n${scope.title}结果未知（${judgement.reason}）；已保留原回执，未把无法解析或未知结构当作成功或空列表。`
}
export interface NativeQueryJudgement { status: 'completed' | 'failed' | 'unknown'; reason: string; items?: Json[]; total?: number; receipt: Json }
const empty = (): SessionFacts => ({ binding: {}, progress: { run_status: 'unknown', tool_attempts: [] }, observations: [], pending_calls: [] })

/** 仅从原生工作流最终工具回执折叠只读事实，不制造业务tool/result或其他Session事件。 */
export function foldMediumState(state: SessionFacts, event: any): SessionFacts {
  if (event.type === 'tool/call' && event.data?.name === WORKFLOW_TOOL && typeof event.data.callId === 'string') return { ...state, pending_calls: [...state.pending_calls, event.data.callId] }
  if (event.type !== 'tool/result') return state
  const message = event.data?.message
  const callId = message?.source?.kind === 'tool' ? message.source.callId : null
  if (typeof callId !== 'string' || !state.pending_calls.includes(callId)) return state
  const settled = { ...state, pending_calls: state.pending_calls.filter(id => id !== callId) }
  if (message?.isError || event.data?.error) return settled
  const blocks = message?.content
  if (!Array.isArray(blocks) || blocks.length !== 1 || blocks[0]?.type !== 'text') return settled
  let value: any
  try { value = JSON.parse(blocks[0].text) } catch { return settled }
  const graph = value?.graph_execution
  if (value?.ok !== true || graph?.workflow_id !== WORKFLOW_ID || graph.complete !== true || graph.status !== 'completed'
    || graph.tool_call_id !== callId) return settled
  const next = value.result?.session_state
  if (!next || !next.binding || !next.progress || !Array.isArray(next.progress.tool_attempts) || !Array.isArray(next.observations)) return settled
  return { ...jsonCopy(next) as unknown as Omit<SessionFacts, 'pending_calls'>, pending_calls: settled.pending_calls }
}

export function registerSecurityOpsContext(ctx: any, experimentId: string) {
  invariant(/^(?:EXP|VAR)-security-operations-expert-\d{3}-r[0-9a-f]{12}$/.test(experimentId), 'ACTUAL_TARGET_EXPERIMENT_REQUIRED')
  return ctx.tools.register({ name: CONTEXT_TOOL, description: '读取当前主Session的真实请求、已完成只读事实与本轮可见工具合同。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }] },
    isConcurrencySafe: () => true,
    async execute(_input: unknown, exec: any): Promise<NativeContext> {
      exec.signal.throwIfAborted()
      const agent = exec.agent, session = agent?.session
      invariant(session?.header?.agentPreset === ROOT_PRESET && session.header.origin !== 'subagent'
        && (session.header.delegationDepth ?? 0) === 0 && session.header.isSeeded !== true, 'ROOT_SESSION_CONTEXT_REQUIRED')
      const asOfSeq = session.seq - 1
      const messages = session.deriveMessages()
      let position = -1
      for (let index = messages.length - 1; index >= 0; index--) if (messages[index]?.role === 'user' && messages[index].source?.kind === 'user') { position = index; break }
      invariant(position >= 0, 'NATIVE_USER_REQUEST_MISSING')
      const content = messages[position].content
      invariant(Array.isArray(content) && content.length === 1 && content[0]?.type === 'text' && typeof content[0].text === 'string', 'MULTIPART_REQUEST_NOT_SUPPORTED')
      const tools: RuntimeTool[] = []
      for (const [route, binding] of Object.entries(READ_ROUTES)) {
        const name = 'name' in binding ? binding.name : ctx.mcpSessionManager.resolveTool(binding.group, binding.operation)
        const definition = name && ctx.tools.get(name, agent)
        if (definition) tools.push({ route: route as RuntimeTool['route'], name, inputSchema: jsonCopy(definition.parameters) as Record<string, any> })
      }
      const history = await ctx.sessionQuery.readSession(session.id)
      exec.signal.throwIfAborted()
      invariant(history.session?.id === session.id && Array.isArray(history.events), 'CURRENT_SESSION_HISTORY_MISMATCH')
      const projection = history.events.filter((event: any) => event.seq <= asOfSeq).reduce(foldMediumState, empty()) as SessionFacts
      const snapshot = jsonCopy({ header: session.header, messages, projection, tools })
      const source_sha256 = sha256(JSON.stringify(snapshot))
      return { origin: { kind: 'live_session', agent_id: 'security-operations-expert', experiment_id: experimentId, session_id: session.id,
        source_path: `native-session:${session.id}@${asOfSeq}`, source_sha256,
        source_identity_sha256: sha256(JSON.stringify({ header: session.header, experiment_id: experimentId, source_sha256 })),
        decision_ref: jsonCopy({ session_id: session.id, as_of_seq: asOfSeq, source_position: position, source: messages[position].source }), prefix_selection: 'current_request_with_session_facts' },
        request: content[0].text, sequence: position, capabilities: { status: 'discovered', tools }, projection }
    },
  })
}
