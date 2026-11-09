import { api, prepare as prepareSoc, type Soc } from '../../../src/action-api.ts'
import commandMap from '../assets/command-map.json' with { type: 'json' }
import realToolContract from '../assets/real-tool-contract.json' with { type: 'json' }

type Stop = 'preview' | 'apply'
type Input = { hostIp: string; commandid: string; stop: Stop }
type Host = { hostid: string; hostip: string }
type CommandRequest = Host & { commandid: string }
type UpstreamCall = { operationKey: string; operation: string; parameters: Record<string, unknown> }
type RunState = { upstreamCalls: UpstreamCall[]; submissionAttempted: boolean; connection_fingerprints?: Record<string, string> }
type Context = { shared: RunState; signal: AbortSignal; call: (fn: () => Promise<unknown>) => Promise<unknown> }
type Located = Input & { host: Host }
type Prepared = { stop: Stop; commandName: string; request: CommandRequest }
type Submitted = Prepared & { receipt: unknown }
type Config = { connections?: Record<string, string> }

type Contract = {
  connectionAlias: string
  operations: { lookupHost: string | null; sendCommand: string | null }
}

const commands: Readonly<Record<string, string>> = Object.freeze({ ...commandMap })
const contract = realToolContract as Contract
const inputSchema = {
  type: 'object', additionalProperties: false, required: ['hostIp', 'commandid', 'stop'],
  properties: {
    hostIp: { type: 'string', minLength: 1, description: '目标主机IP；由真实查主机工具核对身份。' },
    commandid: { type: 'string', enum: Object.keys(commands), description: '真实指令ID原样使用字符串，不使用actionKey。当前ID→中文名称目录：' + Object.entries(commands).map(([id, name]) => `${id}：${name}`).join('；') },
    stop: { type: 'string', enum: ['preview', 'apply'], description: 'preview只生成读取后的本地请求草案；apply仅在原生确认后调用真实写工具一次。' },
  },
}

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function stringFields(value: unknown, fields: string[]): value is Record<string, string> {
  return record(value) && Object.keys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field) && typeof value[field] === 'string' && value[field].trim().length > 0)
}
function requiredStringFields(value: unknown, fields: string[], description: string): Record<string, string> {
  if (!record(value)) throw new Error(`${description}必须是对象`)
  const result: Record<string, string> = {}
  for (const field of fields) {
    const item = value[field]
    if (typeof item !== 'string' || !item.trim()) throw new Error(`${description}.${field}必须是非空string`)
    result[field] = item
  }
  return result
}
function inputOf(value: unknown): Input {
  if (!stringFields(value, ['hostIp', 'commandid', 'stop']) || !['preview', 'apply'].includes(value.stop)) {
    throw new Error('仅接受hostIp、commandid、stop三个非空string字段；stop仅preview/apply')
  }
  return { hostIp: value.hostIp, commandid: value.commandid, stop: value.stop as Stop }
}
function commandName(commandid: string): string {
  if (!Object.hasOwn(commands, commandid)) throw new Error('commandid不属于已确认的十一项指令映射')
  return commands[commandid]
}
function requestOf(value: unknown): CommandRequest {
  if (!stringFields(value, ['hostid', 'hostip', 'commandid'])) throw new Error('指令请求仅接受hostid、hostip、commandid三个非空string字段')
  commandName(value.commandid)
  return { hostid: value.hostid, hostip: value.hostip, commandid: value.commandid }
}
function stateOf(context: Context): RunState {
  context.signal.throwIfAborted()
  const state = context.shared
  if (!state || !Array.isArray(state.upstreamCalls) || typeof state.submissionAttempted !== 'boolean') {
    throw new Error('缺少本次运行的真实上游状态')
  }
  return state
}
function sourceConnection(config: Config): string {
  const value = config?.connections?.[contract.connectionAlias]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`真实XX连接未配置：connections.${contract.connectionAlias}`)
  return value
}
function operation(key: keyof Contract['operations']): string {
  const value = contract.operations[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(`真实XX工具未配置：operations.${key}`)
  return value
}
function sourceConfig(config: Config): Config {
  return { ...config, connections: config?.connections ?? {} }
}
function unwrapData(value: unknown): unknown {
  return record(value) && record(value.data) ? value.data : value
}
function hostOf(value: unknown): Host {
  const candidate = unwrapData(value)
  const fields = requiredStringFields(candidate, ['hostid', 'hostip'], '真实查主机返回')
  return { hostid: fields.hostid, hostip: fields.hostip }
}
function callsOf(context: Context): UpstreamCall[] {
  return stateOf(context).upstreamCalls.map(call => ({ ...call, parameters: { ...call.parameters } }))
}
function recordCall(context: Context, operationKey: string, operationName: string, parameters: Record<string, unknown>) {
  stateOf(context).upstreamCalls.push({ operationKey, operation: operationName, parameters: { ...parameters } })
}
async function sourceCall(soc: Soc, config: Config, context: Context, key: keyof Contract['operations'], parameters: Record<string, unknown>, read: boolean) {
  const operationName = operation(key)
  sourceConnection(config)
  recordCall(context, key, operationName, parameters)
  const call = api(soc, sourceConfig(config), context)
  return call(contract.connectionAlias, operationName, parameters, read)
}

export function create(soc: Soc) {
  if (typeof soc !== 'function') throw new Error('真实XX组合需要平台提供soc连接')
  return {
    responseMode: 'complete' as const,
    inputSchema,
    connections: (config: Config = {}) => Object.values(config.connections ?? {}),
    prepare(input: unknown, config: Config = {}): RunState {
      inputOf(input)
      return Object.keys(config.connections ?? {}).length
        ? { ...prepareSoc(soc, input, sourceConfig(config)), upstreamCalls: [], submissionAttempted: false }
        : { connection_fingerprints: {}, upstreamCalls: [], submissionAttempted: false }
    },
    components: {
      async lookupHost(input: unknown, config: Config, context: Context): Promise<Located> {
        const value = inputOf(input), state = stateOf(context)
        if (state.upstreamCalls.length !== 0) throw new Error('本次运行已执行真实上游接口，不重复查主机')
        const host = hostOf(await sourceCall(soc, config, context, 'lookupHost', { hostIp: value.hostIp }, true))
        if (host.hostip !== value.hostIp) throw new Error('真实查主机返回的hostip与请求不一致')
        return { ...value, host }
      },
      assembleCommand(value: Located, _config: Config, context: Context): Prepared {
        const state = stateOf(context)
        if (state.upstreamCalls.length !== 1 || state.upstreamCalls[0].operationKey !== 'lookupHost') throw new Error('缺少本次运行唯一的真实查主机记录')
        const name = commandName(value.commandid)
        return { stop: value.stop, commandName: name, request: requestOf({ ...value.host, commandid: value.commandid }) }
      },
      previewResult(value: Prepared, _config: Config, context: Context) {
        const state = stateOf(context)
        if (value.stop !== 'preview' || state.submissionAttempted || state.upstreamCalls.some(call => call.operationKey === 'sendCommand')) {
          throw new Error('preview分支不得调用真实写入工具')
        }
        return {
          source: 'real-upstream', stop: 'preview', stage: 'preview', submitted: false,
          previewKind: 'local-request-draft', request: requestOf(value.request), commandName: value.commandName,
          message: '已读取真实主机并生成本地请求草案；未调用真实指令写入工具。',
          deviceEffectVerified: false, upstreamCalls: callsOf(context),
        }
      },
      async submitCommand(value: Prepared, config: Config, context: Context): Promise<Submitted> {
        const state = stateOf(context)
        if (value.stop !== 'apply') throw new Error('只有apply分支可调用真实指令写入工具')
        if (state.submissionAttempted) throw new Error('本次运行已尝试真实指令写入，不重复调用')
        state.submissionAttempted = true
        const request = requestOf(value.request)
        const receipt = await sourceCall(soc, config, context, 'sendCommand', request, false)
        return { ...value, request, receipt }
      },
      applyResult(value: Submitted, context: Context) {
        const state = stateOf(context)
        if (value.stop !== 'apply' || !state.submissionAttempted || state.upstreamCalls.filter(call => call.operationKey === 'sendCommand').length !== 1) {
          throw new Error('缺少本次运行的一次真实指令写入调用')
        }
        return {
          source: 'real-upstream', stop: 'apply', stage: 'submitted', submitted: true,
          request: requestOf(value.request), commandName: value.commandName,
          message: '真实指令工具已返回；设备效果尚未独立核对。',
          deviceEffectVerified: false, upstreamReceipt: value.receipt, upstreamCalls: callsOf(context),
        }
      },
    },
  }
}
