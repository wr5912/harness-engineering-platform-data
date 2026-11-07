import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

type Value = Record<string, any>
type Entry = { input: Value; context: Value; requestId: string; phase: 'UNKNOWN' | 'ACCEPTED' | 'NOT_CREATED'; receipt?: Value }
type Ledger = { version: 1; entries: Entry[] }
export const name = 'security-operations-diagnosis-runtime'
export const inject = ['tools', 'mcpSessionManager']
const LIST = 'list_troubleshooting_playbooks', START = 'start_diagnosis', QUERY = 'get_diagnosis_result'
const object = (value: any): value is Value => value !== null && typeof value === 'object' && !Array.isArray(value)
const stable = (value: any): any => Array.isArray(value) ? value.map(stable)
  : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const equal = (a: any, b: any) => JSON.stringify(stable(a)) === JSON.stringify(stable(b))
export function diagnosisCatalog(value: any): Value[] | undefined {
  if (value?.isError) return
  if (value?.structuredContent !== undefined) value = value.structuredContent
  else if (Array.isArray(value?.content)) {
    try { value = JSON.parse(value.content.filter((part: Value) => part.type === 'text').map((part: Value) => part.text).join('')) }
    catch { return }
  }
  if (object(value) && value.code !== undefined) value = String(value.code) === '200' ? value.data : undefined
  return Array.isArray(value) ? value : undefined
}
export function diagnosisValue(value: any): Value | undefined {
  if (value?.isError) return
  if (value?.structuredContent !== undefined) value = value.structuredContent
  else if (Array.isArray(value?.content)) {
    try { value = JSON.parse(value.content.filter((part: Value) => part.type === 'text').map((part: Value) => part.text).join('')) }
    catch { return }
  }
  if (object(value) && value.code !== undefined) value = String(value.code) === '200' ? value.data : undefined
  return object(value) ? value : undefined
}
function current(agent: any) {
  const events: Value[] = agent?.session?.snapshotEvents?.()
  if (typeof agent?.id !== 'string' || !agent.id || agent.id.length > 128
    || !Array.isArray(events) || (agent.session.header?.delegationDepth ?? 0) !== 0) {
    throw new Error('诊断缺少有效的真实主会话')
  }
  let index = -1
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'user/message' && events[i].data?.source?.kind === 'user') { index = i; break }
  }
  const user = events[index]?.data
  if (typeof user?.id !== 'string' || !user.id || user.id.length > 128) throw new Error('诊断缺少真实用户消息引用')
  const text = typeof user.content === 'string' ? user.content : Array.isArray(user.content)
    && user.content.every((part: Value) => part?.type === 'text' && typeof part.text === 'string')
      ? user.content.map((part: Value) => part.text).join('') : ''
  return { events, index, user, text, context: { conversationRef: agent.id, userMessageRef: user.id } }
}
function explicit(text: string) {
  if (!text.trim() || /(?:取消|停止|撤销|只(?:查|看|分析)|仅(?:查|看|分析)|不(?:要|需|必|再).{0,8}(?:执行|启动|诊断)|[？?]|会影响|如何|怎么)/u.test(text)) return false
  return /(?:发起|执行|启动|运行|开始|开展|生成).{0,50}(?:诊断|平台排查|故障排查报告)|(?:诊断|平台排查).{0,30}(?:执行|启动|运行)/u.test(text)
}
function allowed(message: ReturnType<typeof current>, entries: Entry[]) {
  if (explicit(message.text)) return true
  const prior = message.events.slice(0, message.index).reverse()
    .find(event => event.type === 'user/message' && event.data?.source?.kind === 'user')?.data
  const text = typeof prior?.content === 'string' ? prior.content : Array.isArray(prior?.content)
    ? prior.content.filter((part: Value) => part?.type === 'text').map((part: Value) => part.text).join('') : ''
  const last = entries.at(-1), status = diagnosisValue(last?.receipt)?.acceptanceStatus
  if (last?.phase === 'UNKNOWN' && /(?:重试|核对原请求).{0,30}诊断/u.test(message.text)
    && !/(?:取消|停止|不(?:要|再)|[？?])/u.test(message.text)) return true
  return !!prior && last?.context.userMessageRef === prior.id && explicit(text)
    && last?.phase === 'NOT_CREATED' && ['NEEDS_INPUT', 'NEEDS_SELECTION'].includes(status)
    && !!message.text.trim() && !/(?:取消|停止|不(?:要|再)|只(?:查|看)|仅(?:查|看)|[？?])/u.test(message.text)
}
export function createDiagnosisExecution(directory: string) {
  const locks = new Map<string, Promise<void>>()
  const path = (id: string) => join(directory, `${createHash('sha256').update(id).digest('hex')}.v1.json`)
  async function load(id: string): Promise<Ledger> {
    let text: string
    try { text = await readFile(path(id), 'utf8') } catch (error: any) {
      if (error?.code === 'ENOENT') return { version: 1, entries: [] }
      throw new Error('诊断请求账本不可读取；未发起新运行')
    }
    let value: any
    try { value = JSON.parse(text) } catch { throw new Error('诊断请求账本损坏；保留并停止提交') }
    if (!object(value) || value.version !== 1 || !Array.isArray(value.entries)
      || !value.entries.every((entry: any) => object(entry) && object(entry.input) && object(entry.context)
        && typeof entry.requestId === 'string' && ['UNKNOWN', 'ACCEPTED', 'NOT_CREATED'].includes(entry.phase))) {
      throw new Error('诊断请求账本不可信；保留并停止提交')
    }
    return value as Ledger
  }
  async function save(id: string, ledger: Ledger) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = `${path(id)}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(ledger), { flag: 'wx', mode: 0o600 })
    await rename(temporary, path(id))
  }
  async function locked<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve()
    let release!: () => void
    const tail = previous.then(() => new Promise<void>(resolve => { release = resolve }))
    locks.set(id, tail)
    await previous
    try { return await work() } finally { release(); if (locks.get(id) === tail) locks.delete(id) }
  }
  const startSchema = (schema: Value) => Array.isArray(schema?.required) && schema.required.length === 4
    && ['playbookId', 'request', 'requestId', 'context'].every(field => schema.required.includes(field))
    && object(schema.properties) && ['playbookId', 'request', 'requestId', 'context', 'probePlanHash'].every(field => object(schema.properties[field]))
    && Object.keys(schema.properties).every(field => ['playbookId', 'request', 'requestId', 'context', 'probePlanHash'].includes(field))
  const resultSchema = (schema: Value) => Array.isArray(schema?.required) && schema.required.length === 2
    && ['runId', 'context'].every(field => schema.required.includes(field)) && object(schema.properties)
    && ['runId', 'context'].every(field => object(schema.properties[field]))
    && Object.keys(schema.properties).every(field => ['runId', 'context'].includes(field))
  return {
    startSchema, resultSchema,
    start(input: Value, exec: Value, invoke: (args: Value) => Promise<Value>, schema: Value) {
      return locked(exec.agent.id, async () => {
        if (!startSchema(schema)) throw new Error('排查服务未提供目标三工具诊断合同，未执行')
        if (!object(input) || Object.keys(input).some(field => !['playbookId', 'request'].includes(field))
          || typeof input.playbookId !== 'string' || !input.playbookId.trim() || !object(input.request)) {
          throw new Error('模型只能提供真实剧本与业务请求；会话、请求身份及主动取证授权不可由模型填写')
        }
        const message = current(exec.agent), ledger = await load(exec.agent.id)
        if (!allowed(message, ledger.entries)) throw new Error('仅咨询、否定或未明确要求平台执行诊断，未创建运行')
        const previous = message.events.slice(0, message.index).reverse()
          .find(event => event.type === 'user/message' && event.data?.source?.kind === 'user')?.data
        const last = ledger.entries.at(-1)
        if (!explicit(message.text) && last?.phase === 'NOT_CREATED' && last.context.userMessageRef === previous?.id
          && ['NEEDS_INPUT', 'NEEDS_SELECTION'].includes(diagnosisValue(last.receipt)?.acceptanceStatus)) {
          input = { ...last.input, ...input, request: { ...last.input.request, ...input.request,
            ...(object(last.input.request.runInputs) && object(input.request.runInputs)
              ? { runInputs: { ...last.input.request.runInputs, ...input.request.runInputs } } : {}) } }
        }
        const unknown = ledger.entries.find(entry => entry.phase === 'UNKNOWN')
        if (unknown && !equal(unknown.input, input)) throw new Error('原诊断提交状态未知；必须沿原请求和原输入核对，不能换号改参')
        const hash = createHash('sha256').update(JSON.stringify(stable({ context: message.context, input }))).digest('hex')
        const id = unknown?.requestId ?? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
        let entry = unknown ?? ledger.entries.find(item => item.requestId === id)
        if (!entry) {
          if (ledger.entries.some(item => item.context.userMessageRef === message.user.id)) throw new Error('本轮诊断已有提交，禁止更换参数重建')
          exec.signal?.throwIfAborted()
          entry = { input: structuredClone(input), context: message.context, requestId: id, phase: 'UNKNOWN' }
          ledger.entries.push(entry)
          await save(exec.agent.id, ledger)
        } else if (!equal(entry.input, input)) throw new Error('诊断请求输入已冻结，不可改变已受理请求')
        if (entry.phase !== 'UNKNOWN') return entry.receipt
        exec.signal?.throwIfAborted()
        let receipt: Value
        try { receipt = await invoke({ ...entry.input, requestId: entry.requestId, context: entry.context }) }
        catch {
          await save(exec.agent.id, ledger)
          throw new Error('诊断提交状态未知，保留原请求身份；不可换号或断言未创建运行')
        }
        const value = diagnosisValue(receipt)
        if (value?.acceptanceStatus === 'ACCEPTED' && typeof value.runId === 'string' && value.runId) {
          entry.phase = 'ACCEPTED'; entry.receipt = receipt
        } else if (value && ['NEEDS_INPUT', 'NEEDS_SELECTION', 'NEEDS_AUTHORIZATION', 'BLOCKED'].includes(value.acceptanceStatus) && !value.runId) {
          entry.phase = 'NOT_CREATED'; entry.receipt = receipt
        } else {
          await save(exec.agent.id, ledger)
          throw new Error('诊断受理状态未知，原请求身份已保留')
        }
        await save(exec.agent.id, ledger)
        return receipt
      })
    },
    async result(input: Value, exec: Value, invoke: (args: Value) => Promise<Value>, schema: Value) {
      if (!resultSchema(schema) || !object(input) || Object.keys(input).some(field => field !== 'runId')
        || typeof input.runId !== 'string' || !input.runId.trim()) throw new Error('诊断结果仅接受原 runId，真实会话由运行时注入')
      const message = current(exec.agent), ledger = await load(exec.agent.id)
      if (!ledger.entries.some(entry => entry.phase === 'ACCEPTED'
        && diagnosisValue(entry.receipt)?.runId === input.runId && entry.context.conversationRef === message.context.conversationRef)) {
        throw new Error('此会话没有可核验的同次诊断运行，禁止跨会话读取')
      }
      return invoke({ runId: input.runId, context: { conversationRef: message.context.conversationRef } })
    },
  }
}

export function apply(ctx: any) {
  const execution = createDiagnosisExecution(join(process.env.DSH_HOME || homedir(), 'diagnosis-operations'))
  const mounted = new WeakMap<object, Map<string, { visible: any; dispose: () => void }>>()
  const actual = (raw: string) => ctx.mcpSessionManager.resolveTool('troubleshooting', raw)
  function mount(agent: any) {
    if ((agent?.session?.header?.delegationDepth ?? 0) !== 0) return
    let entries = mounted.get(agent)
    if (!entries) { entries = new Map(); mounted.set(agent, entries) }
    for (const raw of [LIST, START, QUERY]) {
      const toolName = actual(raw), original = toolName && ctx.tools.get(toolName, agent), previous = entries.get(raw)
      if (previous && original === previous.visible) continue
      if (previous) { previous.dispose(); entries.delete(raw) }
      if (!original) continue
      const schema = original.parameters ?? {}
      const modern = raw === LIST ? true : raw === START ? execution.startSchema(schema) : execution.resultSchema(schema)
      const properties = modern ? { ...schema.properties } : {}
      delete properties.requestId
      delete properties.context
      delete properties.probePlanHash
      const wrapper = { ...original,
        parameters: raw === LIST ? schema : modern
          ? { ...schema, properties, required: schema.required.filter((field: string) => !['requestId', 'context'].includes(field)) }
          : { type: 'object', properties: {}, required: [], additionalProperties: false },
        execute(args: Value, exec: Value) {
          if (raw === LIST) return original.execute(args, exec)
          if (!modern) throw new Error('排查服务尚未提供目标三工具合同，禁止旧调用')
          if (raw === START) return execution.start(args, exec, value => original.execute(value, exec), schema)
          return execution.result(args, exec, value => original.execute(value, exec), schema)
        },
      }
      Object.defineProperty(wrapper, Symbol.for('security-operations.diagnosis.runtime'), { value: true })
      const dispose = agent.ctx.tools.register(wrapper)
      entries.set(raw, { visible: wrapper, dispose })
      ctx.effect(() => dispose)
    }
  }
  ctx.on('agent/created', ({ agent }: Value) => { mount(agent) })
  ctx.on('agent/pre-step', async ({ agent }: Value, next: () => Promise<any>) => { mount(agent); return next() })
}
