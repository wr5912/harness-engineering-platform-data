/**
 * convert_length —— 米/厘米换算原生工具 + 最终答复强制结构校验 guard（LangChain 迁移）
 * 来源：source-4d12592a-9148-4ad0-b554-3d450a3b4ed1 / agent.ts（langchain tool + zod schema + responseFormat）。
 * 工具契约：DSH 原生工具 ToolDefinition —— name/description/parameters + output.schema/render + async execute
 * （已对照官方 @deepseek-ai/dsh-tools 的 ToolDefinition/defineTool 合同，687f282e 与运行时 source.lock 一致）。
 * 语义保留：value 非负（错误语义保留）、from/to 仅 m|cm 枚举、同单位原样返回、m→cm ×100、cm→m ÷100、结构化成功输出 {value, unit}。
 *
 * 最终输出 guard（来源 responseFormat 强制最终结构的原生等价实现，补齐关键输出校验）：
 * - agent/turn-stopping serial 钩子（dsh-agent runtime-types.d.ts 公开签名）在 turn 关闭前检查本 turn 最后 assistant 文本；
 * - 仅在本 turn 成功调用 convert_length 的成功分支做 JSON.parse + dsh-tools.validateJsonSchemaValue，
 *   校验 {value:number, unit:'m'|'cm', explanation:非空 string}；缺单位澄清、工具失败、不支持单位分支保持已适配行为，不校验；
 * - 不合格时 agent.steer(createUserMessage(...))（dsh-llm 公开工厂）在同 turn 纠正输出，最多 2 次，耗尽抛明确错误；
 * - 补正消息使用专用来源 kind migration-output-validation（form:'notice'），不冒充人工用户输入；
 * - 纠正回合不得重放 convert_length（tools.guard 同步拒绝）；计数按 Session+turn 隔离并在 turn/end、session/disposed 清理；
 * - 已有合法 JSON 不重试。不复制角色正文；不包装 LangChain 运行时，无需来源框架。
 * 验证范围：运行时最终结果文本的结构校验；不声称供应商约束解码，也不校验中间流式字节的合法性。
 */

import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ContextFormed, UserMessage } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** 本迁移最终输出 guard 的自动补正消息来源：notice 形态，summary 一行说明；不冒充人工用户输入。 */
    'migration-output-validation': { kind: 'migration-output-validation' } & Extract<ContextFormed, { form: 'notice' }>
  }
}

/** 单位枚举，与来源 z.enum(['m', 'cm']) 对应。 */
type LengthUnit = 'm' | 'cm'

interface ConvertLengthArgs {
  value: number
  from: LengthUnit
  to: LengthUnit
}

interface ConvertLengthResult {
  value: number
  unit: LengthUnit
}

/** 本地结构化契约（与官方 ToolDefinition 对应）。 */
interface TextBlock {
  type: 'text'
  text: string
}

interface ConvertLengthToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render: (args: ConvertLengthArgs, value: ConvertLengthResult) => TextBlock[]
  }
  execute: (args: ConvertLengthArgs, exec: unknown) => Promise<ConvertLengthResult>
}

const convertLengthTool: ConvertLengthToolDefinition = {
  name: 'convert_length',
  description: '米与厘米换算',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['value', 'from', 'to'],
    properties: {
      value: { type: 'number', description: '待换算数值，必须为非负数' },
      from: { type: 'string', enum: ['m', 'cm'], description: '来源单位：m 或 cm' },
      to: { type: 'string', enum: ['m', 'cm'], description: '目标单位：m 或 cm' },
    },
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['value', 'unit'],
      properties: {
        value: { type: 'number', description: '换算结果数值' },
        unit: { type: 'string', enum: ['m', 'cm'], description: '结果单位' },
      },
    },
    render: (_args: ConvertLengthArgs, value: ConvertLengthResult): TextBlock[] => {
      return [{ type: 'text', text: JSON.stringify(value) }]
    },
  },
  execute: async (args: ConvertLengthArgs, _exec: unknown): Promise<ConvertLengthResult> => {
    const { value, from, to } = (args ?? {}) as ConvertLengthArgs
    // 来源 z.number().nonnegative() 的错误语义：受强制 JSON Schema 子集无 minimum 关键字限制，在此保留拒绝语义。
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('convert_length 参数错误：value 必须是数值')
    }
    if (value < 0) {
      throw new Error('convert_length 参数错误：value 必须为非负数值')
    }
    if (from !== 'm' && from !== 'cm') {
      throw new Error('convert_length 参数错误：from 仅支持 m 或 cm')
    }
    if (to !== 'm' && to !== 'cm') {
      throw new Error('convert_length 参数错误：to 仅支持 m 或 cm')
    }
    // 同单位原样返回（来源语义保留）
    if (from === to) {
      return { value, unit: to }
    }
    return { value: from === 'm' ? value * 100 : value / 100, unit: to }
  },
}

// ===== 最终答复强制结构校验 guard（responseFormat 等价实现） =====

/** 成功分支最终答复的输出契约；explanation 非空在解析后另行判定（强制子集无 minLength）。 */
const FINAL_OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'unit', 'explanation'],
  properties: {
    value: { type: 'number', description: '换算结果数值' },
    unit: { type: 'string', enum: ['m', 'cm'], description: '结果单位' },
    explanation: { type: 'string', description: '非空中文说明' },
  },
}

/** 同 turn 纠正次数上限；耗尽后抛明确错误。 */
const MAX_CORRECTIONS = 2

interface SessionLike {
  readonly id?: unknown
}

interface SessionEventLike {
  type: string
  data?: {
    turn?: unknown
    name?: unknown
    callId?: unknown
    message?: { content?: unknown; toolCallId?: unknown; isError?: unknown }
  }
}

interface AgentLike {
  session: SessionLike
  steer: (message: UserMessage) => void
}

interface GuardExecutionLike {
  name: string
  agent?: { session?: SessionLike }
}

interface PluginContext {
  tools: {
    register: (definition: ConvertLengthToolDefinition) => unknown
    guard: (check: (execution: GuardExecutionLike) => string | undefined) => unknown
  }
  on: (event: string, listener: (...args: any[]) => unknown) => unknown
}

interface TurnGuardState {
  /** 本 turn 是否成功调用过 convert_length（成功分支唯一入口条件）。 */
  convertSucceeded: boolean
  /** 本 turn 尚未配对结果的 convert_length 调用。 */
  pendingCallIds: Set<string>
  /** 本 turn 最后一条 assistant 文本。 */
  lastAssistantText: string
  /** 本 turn 已用纠正次数（按 Session+turn 隔离）。 */
  corrections: number
}

/** 计数与状态按 Session（Agent 唯一会话）+ turn 隔离；turn/end、session/disposed 清理。 */
const turnStates = new Map<SessionLike, Map<number, TurnGuardState>>()
/** 处于纠正回合、禁止重放 convert_length 的会话（同上清理）。 */
const replayBlockedSessions = new Set<SessionLike>()

function guardState(session: SessionLike, turn: number): TurnGuardState {
  let byTurn = turnStates.get(session)
  if (byTurn === undefined) {
    byTurn = new Map()
    turnStates.set(session, byTurn)
  }
  let state = byTurn.get(turn)
  if (state === undefined) {
    state = { convertSucceeded: false, pendingCallIds: new Set(), lastAssistantText: '', corrections: 0 }
    byTurn.set(turn, state)
  }
  return state
}

function dropTurn(session: SessionLike, turn: number): void {
  const byTurn = turnStates.get(session)
  byTurn?.delete(turn)
  if (byTurn !== undefined && byTurn.size === 0) turnStates.delete(session)
  replayBlockedSessions.delete(session)
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content as Array<{ type?: unknown; text?: unknown }>) {
    if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/** 成功分支最终答复的结构校验；返回违规清单，空清单表示合格。 */
function finalOutputViolations(text: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return ['最终答复不是合法 JSON']
  }
  const violations = validateJsonSchemaValue(FINAL_OUTPUT_SCHEMA, parsed)
  if (violations.length > 0) return violations
  const explanation = (parsed as { explanation?: unknown }).explanation
  if (typeof explanation !== 'string' || explanation.trim() === '') {
    return ['explanation 必须为非空字符串']
  }
  return []
}

function installFinalOutputGuard(ctx: PluginContext): void {
  ctx.on('session/event', (session: SessionLike, event: SessionEventLike) => {
    const data = event?.data
    const turn = typeof data?.turn === 'number' ? data.turn : undefined
    if (event?.type === 'tool/call' && turn !== undefined && data?.name === 'convert_length' && typeof data.callId === 'string') {
      guardState(session, turn).pendingCallIds.add(data.callId)
    } else if (event?.type === 'tool/result' && turn !== undefined) {
      const message = data?.message
      const callId = message?.toolCallId
      const state = turnStates.get(session)?.get(turn)
      if (state !== undefined && typeof callId === 'string' && state.pendingCallIds.delete(callId) && message?.isError !== true) {
        state.convertSucceeded = true
      }
    } else if (event?.type === 'assistant/message' && turn !== undefined) {
      guardState(session, turn).lastAssistantText = textOf(data?.message?.content)
    } else if (event?.type === 'turn/end' && turn !== undefined) {
      dropTurn(session, turn)
    }
  })
  ctx.on('session/disposed', (session: SessionLike) => {
    turnStates.delete(session)
    replayBlockedSessions.delete(session)
  })
  // 纠正回合不得重放 convert_length：工具重放被同步拒绝，纠正只改写最终输出。
  ctx.tools.guard((execution: GuardExecutionLike): string | undefined => {
    if (execution.name !== 'convert_length') return undefined
    const session = execution.agent?.session
    if (session !== undefined && replayBlockedSessions.has(session)) {
      return '纠正回合不得重放 convert_length：请只输出修正后的最终 JSON，不要重新调用换算工具'
    }
    return undefined
  })
  ctx.on('agent/turn-stopping', (payload: { agent: AgentLike; turn: number }) => {
    const { agent, turn } = payload
    const state = turnStates.get(agent.session)?.get(turn)
    if (state === undefined) return
    // 仅成功分支强制最终结构；缺单位澄清、工具失败、不支持单位分支保持已适配行为，不校验。
    if (!state.convertSucceeded) return
    const violations = finalOutputViolations(state.lastAssistantText)
    if (violations.length === 0) return // 既有合法 JSON 不重试
    if (state.corrections >= MAX_CORRECTIONS) {
      dropTurn(agent.session, turn)
      throw new Error(`最终答复结构校验失败（convert_length 成功分支）：${violations.join('；')}。已同轮纠正 ${MAX_CORRECTIONS} 次仍不合格，停止本 turn。`)
    }
    state.corrections += 1
    replayBlockedSessions.add(agent.session)
    agent.steer(createUserMessage({
      content: [{
        type: 'text',
        text: `最终答复结构纠正（第 ${state.corrections}/${MAX_CORRECTIONS} 次）：上一条最终答复不符合约定输出结构：${violations.join('；')}。请只输出修正后的最终 JSON 对象，仅含三个字段：value（换算数值）、unit（"m" 或 "cm"）、explanation（非空中文说明）；不要输出任何其它文字，也不要调用任何工具（包括 convert_length）。`,
      }],
      // 专用来源 kind（notice 形态）：如实归因为最终输出 guard 的自动补正，不冒充人工用户输入。
      source: { kind: 'migration-output-validation', form: 'notice', summary: '最终输出需要格式补正' },
    }))
  })
}

/** Cordis 插件名。 */
const name = 'convert-length-tool'
/** 该插件使用的服务。 */
const inject = ['tools']

/** 注册 convert_length 原生工具，并安装最终答复强制结构校验 guard。 */
function apply(ctx: PluginContext): void {
  ctx.tools.register(convertLengthTool)
  installFinalOutputGuard(ctx)
}

export { apply, inject, name }
