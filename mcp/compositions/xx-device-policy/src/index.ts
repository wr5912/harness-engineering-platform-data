import { api, data, prepare as prepareSoc, type Soc } from '@harness-platform/security-operations/action-api.ts'
import policySchema from '../assets/policy-schema.json' with { type: 'json' }
import realToolContract from '../assets/real-tool-contract.json' with { type: 'json' }

type MapName = keyof typeof policySchema.maps
type StringMap = Record<string, string>
type PolicyMaps = Record<MapName, StringMap>
type Input = { hostip: string; delta: Partial<PolicyMaps>; stop: 'preview' | 'apply' }
type Body = { hostid: string; hostip: string } & PolicyMaps
type FieldRule = { type: string; description?: string; values?: string[] | Record<string, string> }
type Difference = { map: MapName; field: string; before: string; after: string }
type UpstreamCall = { operationKey: string; operation: string; parameters: Record<string, unknown> }
type RunState = { upstreamCalls: UpstreamCall[]; writeAttempted: boolean; connection_fingerprints?: Record<string, string> }
type Prepared = Input & { source: 'real-upstream'; template: Body; body: Body; differences: Difference[]; receipt?: unknown }
type Config = { connections?: Record<string, string> }
type Context = { shared: RunState; signal: AbortSignal; call: (fn: () => Promise<unknown>) => Promise<unknown> }
type Contract = { connectionAlias: string; operations: { readPolicyTemplate: string | null; writePolicyTemplate: string | null } }

const definitions = policySchema.maps as Record<MapName, { description: string; fields: Record<string, FieldRule> }>
const mapNames = Object.keys(definitions) as MapName[]
const bodyKeys = [...policySchema.identityFields, ...mapNames]
const contract = realToolContract as Contract

function enumValues(rule: FieldRule): string[] | undefined {
  return rule.values ? (Array.isArray(rule.values) ? rule.values : Object.keys(rule.values)) : undefined
}
function fieldSchema(rule: FieldRule) {
  const values = enumValues(rule)
  const meanings = rule.values && !Array.isArray(rule.values)
    ? Object.entries(rule.values).map(([value, meaning]) => `${value}：${meaning}`).join('；') : ''
  const description = [rule.description, meanings].filter(Boolean).join(' ')
  return { type: rule.type, ...(values ? { enum: values } : {}), ...(description ? { description } : {}) }
}
const mapSchemas = Object.fromEntries(mapNames.map(name => [name, {
  type: 'object', additionalProperties: false, description: definitions[name].description,
  properties: Object.fromEntries(Object.entries(definitions[name].fields).map(([field, rule]) => [field, fieldSchema(rule)])),
}]))

export const inputSchema = {
  type: 'object', additionalProperties: false, required: ['hostip', 'delta', 'stop'],
  description: '真实XX模板组合：preview读取真实模板并生成本地差异草案；apply在原生确认后调用真实写入工具一次。',
  properties: {
    hostip: { type: 'string', minLength: 1, description: '精确匹配真实模板主机，不做IP规范化。' },
    delta: {
      type: 'object', additionalProperties: false,
      description: '只提供本次修改的Map和字段；未修改Map按真实inputSchema显式传{}或由组合补齐。所有配置值均为string。',
      properties: mapSchemas,
    },
    stop: { type: 'string', enum: ['preview', 'apply'] },
  },
  anyOf: [
    { properties: { stop: { const: 'preview' } } },
    { properties: { stop: { const: 'apply' }, delta: { anyOf: mapNames.map(name => ({ required: [name], properties: { [name]: { minProperties: 1 } } })) } } },
  ],
}

function record(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function assertObject(value: unknown, path: string): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path}必须是对象`)
}
function assertKeys(value: Record<string, any>, expected: string[], path: string) {
  for (const key of expected) if (!Object.hasOwn(value, key)) throw new Error(`${path}缺少${key}`)
  for (const key of Object.keys(value)) if (!expected.includes(key)) throw new Error(`${path}不支持字段${key}`)
}
function assertIdentity(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${path}必须是非空string`)
}
function validateMaps(value: unknown, path: string, requireAnyField: boolean, requireAllFields = false): asserts value is PolicyMaps {
  assertObject(value, path)
  assertKeys(value, mapNames, path)
  let fields = 0
  for (const name of mapNames) {
    const map = value[name]
    assertObject(map, `${path}.${name}`)
    const rules = definitions[name].fields
    if (requireAllFields) assertKeys(map, Object.keys(rules), `${path}.${name}`)
    for (const [field, item] of Object.entries(map)) {
      if (!Object.hasOwn(rules, field)) throw new Error(`${path}.${name}不支持字段${field}`)
      if (typeof item !== 'string') throw new Error(`${path}.${name}.${field}必须是string，不自动转换`)
      const values = enumValues(rules[field])
      if (values && !values.includes(item)) throw new Error(`${path}.${name}.${field}不在已确认取值中`)
      fields++
    }
  }
  if (requireAnyField && fields === 0) throw new Error(`${path}至少提供一个字段`)
}
function completeDelta(value: unknown): PolicyMaps {
  assertObject(value, 'delta')
  for (const name of Object.keys(value)) if (!mapNames.includes(name as MapName)) throw new Error(`delta不支持字段${name}`)
  return Object.fromEntries(mapNames.map(name => [name, Object.hasOwn(value, name) ? value[name] : {}])) as PolicyMaps
}
function validateInput(value: unknown): asserts value is Input {
  assertObject(value, 'input')
  assertKeys(value, ['hostip', 'delta', 'stop'], 'input')
  assertIdentity(value.hostip, 'hostip')
  if (value.stop !== 'preview' && value.stop !== 'apply') throw new Error('stop仅支持preview/apply')
  validateMaps(completeDelta(value.delta), 'delta', value.stop === 'apply')
}
function inputOf(value: unknown): Input {
  validateInput(value)
  return { hostip: value.hostip, delta: structuredClone(completeDelta(value.delta)), stop: value.stop }
}
function pickMaps(value: Body): PolicyMaps {
  return Object.fromEntries(mapNames.map(name => [name, structuredClone(value[name])])) as PolicyMaps
}
function validateBody(value: unknown, requireAllFields = false): asserts value is Body {
  assertObject(value, 'body')
  assertKeys(value, bodyKeys, 'body')
  assertIdentity(value.hostid, 'body.hostid')
  assertIdentity(value.hostip, 'body.hostip')
  validateMaps(pickMaps(value as Body), 'body.maps', false, requireAllFields)
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
function stateOf(context: Context): RunState {
  context.signal.throwIfAborted()
  const state = context.shared
  if (!state || !Array.isArray(state.upstreamCalls) || typeof state.writeAttempted !== 'boolean') throw new Error('缺少本次运行的真实上游状态')
  return state
}
function recordCall(context: Context, operationKey: string, operationName: string, parameters: Record<string, unknown>) {
  stateOf(context).upstreamCalls.push({ operationKey, operation: operationName, parameters: structuredClone(parameters) })
}
function callsOf(context: Context): UpstreamCall[] {
  return stateOf(context).upstreamCalls.map(call => ({ ...call, parameters: structuredClone(call.parameters) }))
}
async function sourceCall(soc: Soc, config: Config, context: Context, key: keyof Contract['operations'], parameters: Record<string, unknown>, read: boolean) {
  const operationName = operation(key)
  sourceConnection(config)
  recordCall(context, key, operationName, parameters)
  const call = api(soc, sourceConfig(config), context)
  return call(contract.connectionAlias, operationName, parameters, read)
}
function realTemplate(value: unknown): Body {
  const candidate = data(value)
  validateBody(candidate, true)
  return structuredClone(candidate)
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
        ? { ...prepareSoc(soc, input, sourceConfig(config)), upstreamCalls: [], writeAttempted: false }
        : { connection_fingerprints: {}, upstreamCalls: [], writeAttempted: false }
    },
    components: {
      async readTemplate(input: unknown, config: Config, context: Context) {
        validateInput(input)
        const template = realTemplate(await sourceCall(soc, config, context, 'readPolicyTemplate', { hostip: input.hostip }, true))
        return { ...structuredClone(input), delta: structuredClone(completeDelta(input.delta)), source: 'real-upstream' as const, template }
      },
      assemble(value: Input & { source: 'real-upstream'; template: Body }): Prepared {
        validateInput({ hostip: value.hostip, delta: value.delta, stop: value.stop })
        validateBody(value.template, true)
        if (value.template.hostip !== value.hostip) throw new Error('真实模板hostip与本次输入不一致')
        const body: Body = { hostid: value.template.hostid, hostip: value.template.hostip, ...structuredClone(completeDelta(value.delta)) }
        validateBody(body)
        const differences: Difference[] = []
        for (const name of mapNames) for (const [field, after] of Object.entries(body[name])) {
          const before = value.template[name][field]
          if (before !== after) differences.push({ map: name, field, before, after })
        }
        if (value.stop === 'apply' && differences.length === 0) throw new Error('apply至少需要一项实际差异，不执行无修改的真实写入')
        return { ...value, body, differences }
      },
      result(value: Prepared, _config?: Config, context?: Context) {
        const written = value.receipt !== undefined
        if (!written) {
          return {
            source: 'real-upstream', success: true, stage: 'preview', stop: value.stop,
            previewType: 'local-parameters-and-diff', upstreamPreview: false,
            realWriteAttempted: false, target: { hostid: value.body.hostid, hostip: value.body.hostip },
            template: structuredClone(value.template), body: structuredClone(value.body), differences: structuredClone(value.differences),
            receipt: null, upstreamCalls: context ? callsOf(context) : [],
            message: '真实模板已读取并生成本地参数/差异草案；未调用真实写入工具。',
          }
        }
        const state = context ? stateOf(context) : undefined
        if (value.stop !== 'apply' || !state?.writeAttempted || state.upstreamCalls.filter(call => call.operationKey === 'writePolicyTemplate').length !== 1) {
          throw new Error('缺少本次运行的一次真实模板写入调用')
        }
        return {
          source: 'real-upstream', success: true, stage: 'submitted', stop: 'apply',
          previewType: 'local-parameters-and-diff', upstreamPreview: false,
          realWriteAttempted: true, target: { hostid: value.body.hostid, hostip: value.body.hostip },
          template: structuredClone(value.template), body: structuredClone(value.body), differences: structuredClone(value.differences),
          receipt: structuredClone(value.receipt), upstreamCalls: callsOf(context!),
          message: '真实模板写入工具已返回；设备效果尚未独立核对。',
        }
      },
      async apply(value: Prepared, config: Config, context: Context): Promise<Prepared> {
        const state = stateOf(context)
        if (value.stop !== 'apply') throw new Error('preview停点禁止调用真实模板写入工具')
        if (state.writeAttempted) throw new Error('本次运行已尝试真实模板写入，不重复调用')
        validateBody(value.body)
        if (value.body.hostid !== value.template.hostid || value.body.hostip !== value.hostip) throw new Error('真实写入目标与已读取模板不一致')
        state.writeAttempted = true
        const receipt = await sourceCall(soc, config, context, 'writePolicyTemplate', value.body, false)
        return { ...value, receipt }
      },
      applyResult(value: Prepared, context: Context) {
        const state = stateOf(context)
        if (value.stop !== 'apply' || !state.writeAttempted || state.upstreamCalls.filter(call => call.operationKey === 'writePolicyTemplate').length !== 1) {
          throw new Error('缺少本次运行的一次真实模板写入调用')
        }
        return {
          source: 'real-upstream', success: true, stage: 'submitted', stop: 'apply',
          previewType: 'local-parameters-and-diff', upstreamPreview: false,
          realWriteAttempted: true, target: { hostid: value.body.hostid, hostip: value.body.hostip },
          template: structuredClone(value.template), body: structuredClone(value.body), differences: structuredClone(value.differences),
          receipt: structuredClone(value.receipt), upstreamCalls: callsOf(context),
          message: '真实模板写入工具已返回；设备效果尚未独立核对。',
        }
      },
    },
  }
}
