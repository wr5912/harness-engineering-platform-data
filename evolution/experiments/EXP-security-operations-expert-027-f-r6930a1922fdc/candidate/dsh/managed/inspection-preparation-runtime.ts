import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

type Value = Record<string, any>
type State = { input: Value; context: Value; requestId: string; phase: 'UNKNOWN' | 'ACCEPTED' | 'NOT_CREATED';
  receipt?: Value; failure?: Value; exception?: { name: string; message: string; code?: string | number } }
type Ledger = { version: 2; entries: State[] }
export const name = 'inspection-preparation-runtime' // 保持现有 Preset 装载身份，不提供任何准备工具。
export const inject = ['tools', 'mcpSessionManager']
const LIST = 'list_executable_inspections', START = 'start_inspection', QUERY = 'get_inspection_result'
const object = (value: any): value is Value => value !== null && typeof value === 'object' && !Array.isArray(value)

/** 只读取真实工具值；保留服务声明的业务失败、摘要与整改建议。 */
export function inspectionValue(value: any): Value | undefined {
  if (value?.isError) return
  if (value?.structuredContent !== undefined) value = value.structuredContent
  else if (Array.isArray(value?.content)) {
    const text = value.content.filter((part: Value) => part.type === 'text').map((part: Value) => part.text).join('')
    try { value = JSON.parse(text) } catch { return }
  }
  if (object(value) && value.code !== undefined) value = String(value.code) === '200' ? value.data : undefined
  return object(value) ? value : undefined
}

export function inspectionCatalog(value: any): Value[] | undefined {
  if (value?.isError) return
  if (value?.structuredContent !== undefined) value = value.structuredContent
  else if (Array.isArray(value?.content)) {
    try { value = JSON.parse(value.content.filter((part: Value) => part.type === 'text').map((part: Value) => part.text).join('')) }
    catch { return }
  }
  if (object(value) && value.code !== undefined) value = String(value.code) === '200' ? value.data : undefined
  return Array.isArray(value) ? value : undefined
}

export function reportLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return
  try {
    const url = new URL(value)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return value
  } catch { /* 不拼造下载地址。 */ }
}

const stable = (value: any): any => Array.isArray(value) ? value.map(stable)
  : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const sameInput = (left: Value, right: Value) => JSON.stringify(stable(left)) === JSON.stringify(stable(right))

function currentUser(agent: any) {
  const events: Value[] = agent?.session?.snapshotEvents?.()
  if (!agent?.id || !Array.isArray(events) || (agent.session.header?.delegationDepth ?? 0) !== 0) {
    throw new Error('巡检缺少真实主会话或用户/原生定时消息')
  }
  let index = -1
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'user/message' && ['user', 'schedule'].includes(events[i].data?.source?.kind)) {
      index = i
      break
    }
  }
  const user = events[index]?.data
  if (!user?.id) throw new Error('巡检缺少真实用户或原生定时消息标识')
  return { events, index, user, context: { conversationRef: agent.id, userMessageRef: user.id } }
}

function userText(user: Value): string {
  if (typeof user.content === 'string') return user.content
  if (Array.isArray(user.content) && user.content.every((part: Value) => part?.type === 'text' && typeof part.text === 'string')) {
    return user.content.map((part: Value) => part.text).join('')
  }
  return ''
}

function explicitExecution(text: string): boolean {
  if (!text.trim() || /(?:取消|停止|撤销)(?:本次|这个|该)?(?:巡检|检查|执行)?/u.test(text)
    || /(?:不|别|暂不|无需|不必|禁止)(?:要|再|用|需)?(?:.{0,8})(?:执行|启动|发起|巡检|检查|核查)/u.test(text)
    || /(?:只|仅|先)(?:需|要|做)?(?:查询|查看|预览|列出|看一下)/u.test(text)
    || /(?:执行|启动|巡检).{0,30}(?:会影响|有什么影响|吗|么|？|\?)/u.test(text)) return false
  return /(?:执行|启动|发起|开展|开始|运行|做一次|检查|核查|做).{0,60}(?:巡检|基线|设备|资产|漏洞|终端|双网|状态)|(?:巡检|基线核查).{0,40}(?:执行|启动|开始)/u.test(text)
}

function executionAuthorized(current: ReturnType<typeof currentUser>, entries: State[]): boolean {
  const text = userText(current.user)
  if (explicitExecution(text)) return true
  // 仅同一会话上一条明确执行被服务确认为缺项/歧义后，才接受下一条补充输入。
  const previous = current.events.slice(0, current.index).reverse().find(event => event.type === 'user/message'
    && ['user', 'schedule'].includes(event.data?.source?.kind))?.data
  const last = entries.at(-1)
  const denied = /(?:取消|停止|撤销|不(?:要|再|需|必|用)?(?:.{0,8})(?:执行|启动|巡检)|(?:只|仅|先)(?:查询|查看|预览|列出)|[？?])/u.test(text)
  if (last?.phase === 'UNKNOWN' && /(?:重试|核对原请求).{0,30}巡检/u.test(text) && !denied) return true
  return !!previous && last?.phase === 'NOT_CREATED'
    && ['NEEDS_INPUT', 'NEEDS_SELECTION'].includes(inspectionValue(last.receipt)?.acceptanceStatus)
    && last.context.userMessageRef === previous.id && explicitExecution(userText(previous))
    && !!text.trim() && !denied
}

function requestId(context: Value, input: Value, user: Value): string {
  // 原生定时消息以原始到期内容标识重复投递；普通用户请求绑定消息 ID。
  const identity = user.source?.kind === 'schedule'
    ? { conversationRef: context.conversationRef, schedule: user.content } : context
  const hex = createHash('sha256').update(JSON.stringify(stable({ context: identity, input }))).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** HOME 旧账本原路径与内容不变；v2 保存完整请求历史与未知提交。 */
export function createInspectionExecution(directory: string) {
  const locks = new Map<string, Promise<void>>()
  const key = (id: string) => createHash('sha256').update(id).digest('hex')
  const legacyPath = (id: string) => join(directory, `${key(id)}.json`)
  const ledgerPath = (id: string) => join(directory, `${key(id)}.v2.json`)
  async function read(path: string): Promise<any | undefined> {
    let text: string
    try { text = await readFile(path, 'utf8') } catch (error: any) {
      if (error?.code === 'ENOENT') return
      throw new Error('巡检请求账本无法读取，未提交新请求')
    }
    try { return JSON.parse(text) } catch { throw new Error('巡检请求账本损坏，未提交新请求') }
  }
  async function load(id: string): Promise<Ledger> {
    const legacy = await read(legacyPath(id))
    if (legacy !== undefined && (!object(legacy) || !object(legacy.input) || !object(legacy.context)
      || typeof legacy.requestId !== 'string' || (legacy.attempted !== undefined && typeof legacy.attempted !== 'boolean'))) {
      throw new Error('旧巡检账本无法核实，保留原文件并停止新提交')
    }
    // 旧请求依赖准备记录；无法安全将旧未知提交转换为新契约重试。
    if (legacy?.attempted && !inspectionValue(legacy.receipt)?.runId) {
      throw new Error('旧版本巡检提交状态未知，保留原请求由维护方核查；不换号重发')
    }
    const value = await read(ledgerPath(id))
    if (value === undefined) return { version: 2, entries: [] }
    if (!object(value) || value.version !== 2 || !Array.isArray(value.entries)
      || !value.entries.every((entry: any) => object(entry) && object(entry.input) && object(entry.context)
        && typeof entry.requestId === 'string' && ['UNKNOWN', 'ACCEPTED', 'NOT_CREATED'].includes(entry.phase))) {
      throw new Error('巡检新请求账本无法核实，保留原文件并停止新提交')
    }
    return value as Ledger
  }
  async function save(id: string, value: Ledger) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = `${ledgerPath(id)}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    await rename(temporary, ledgerPath(id))
  }
  async function locked<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(id) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => current)
    locks.set(id, tail)
    await previous
    try { return await work() } finally { release(); if (locks.get(id) === tail) locks.delete(id) }
  }
  function unconfirmed(): Error {
    return new Error('巡检受理状态未知，原输入与原请求已保留；新契约仅能按同一请求幂等核对，不能换号、改参或称为已启动')
  }
  return {
    start(input: Value, exec: Value, invoke: (args: Value) => Promise<Value>, schema: Value) {
      return locked(exec.agent.id, async () => {
        const required = schema?.required, properties = schema?.properties
        if (!Array.isArray(required) || required.length !== 2
          || !['taskId', 'requestId'].every(field => required.includes(field))
          || !object(properties) || !['taskId', 'requestId', 'deviceSelector', 'businessInputs', 'mode'].every(field => object(properties[field]))
          || Object.keys(properties).some(field => !['taskId', 'requestId', 'deviceSelector', 'businessInputs', 'mode'].includes(field))) {
          throw new Error('巡检服务尚未提供目标四工具直接启动合同，禁止调用')
        }
        if (!object(input) || Object.keys(input).some(field => !['taskId', 'deviceSelector', 'businessInputs', 'mode'].includes(field))
          || typeof input.taskId !== 'string' || !input.taskId.trim()) {
          throw new Error('启动仅接受真实任务及用户选择的范围、业务输入和模式；运行时分配稳定请求身份')
        }
        if (input.deviceSelector !== undefined && (!object(input.deviceSelector)
          || !['ALL', 'ASSET_IDS', 'IP', 'CIDR', 'TOPOLOGY_GROUP', 'ASSET_CLASS', 'FILTER'].includes(input.deviceSelector.kind))) {
          throw new Error('设备选择器无效，不能猜资产编号或改为 ALL')
        }
        if (input.businessInputs !== undefined && !object(input.businessInputs)) throw new Error('业务输入须按服务参数传递')
        if (input.mode !== undefined && !['FULL', 'MUST_PASS'].includes(input.mode)) throw new Error('巡检模式无效，未启动')
        const current = currentUser(exec.agent), record = await load(exec.agent.id)
        const old = await read(legacyPath(exec.agent.id))
        if (old?.attempted && old.context?.userMessageRef === current.context.userMessageRef) {
          throw new Error('当前用户消息已有旧版本巡检提交，保留原运行与账本，不重复启动')
        }
        if (!executionAuthorized(current, record.entries)) throw new Error('当前真实用户仅查询、否定或未明确执行，巡检未启动')
        // 服务明确未创建时，仅将相邻用户澄清合并到前次原始输入；已给范围和业务值不丢失。
        const previous = current.events.slice(0, current.index).reverse().find(event => event.type === 'user/message'
          && ['user', 'schedule'].includes(event.data?.source?.kind))?.data
        const last = record.entries.at(-1)
        if (!explicitExecution(userText(current.user)) && last?.phase === 'NOT_CREATED'
          && ['NEEDS_INPUT', 'NEEDS_SELECTION'].includes(inspectionValue(last.receipt)?.acceptanceStatus)
          && last.context.userMessageRef === previous?.id) {
          input = { ...last.input, ...input,
            ...(object(last.input.businessInputs) && object(input.businessInputs)
              ? { businessInputs: { ...last.input.businessInputs, ...input.businessInputs } } : {}) }
        }
        const unknown = record.entries.find(entry => entry.phase === 'UNKNOWN')
        if (unknown && 'definitionVersion' in unknown.input) {
          throw new Error('旧五工具请求状态未知，原请求含目标服务不接受的版本字段；保留原账本，停止跨合同重试')
        }
        if (unknown && !sameInput(unknown.input, input)) throw new Error('原巡检提交状态未知，不能更换输入或请求编号；保留原请求核对')
        const id = unknown?.requestId ?? requestId(current.context, input, current.user)
        let state = unknown ?? record.entries.find(entry => entry.requestId === id)
        if (!state) {
          if (record.entries.some(entry => entry.context.userMessageRef === current.context.userMessageRef)) {
            throw new Error('同一真实用户消息已有巡检提交，不能改参或另建运行')
          }
          exec.signal?.throwIfAborted()
          state = { input: structuredClone(input), context: current.context, requestId: id, phase: 'UNKNOWN' }
          record.entries.push(state)
          await save(exec.agent.id, record) // 调用前保存未知提交，重启后仍可复用原值。
        } else if (!sameInput(state.input, input)) throw new Error('原请求参数已冻结，不能修改后复用已受理编号')
        if (state.phase !== 'UNKNOWN') return state.receipt
        exec.signal?.throwIfAborted()
        let receipt: Value
        try {
          receipt = await invoke({ ...state.input, requestId: state.requestId })
        } catch (error) {
          // MCP 抛错不证明未入队；仅保存原始故障于私有账本，不暴露请求编号。
          const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined
          state.exception = { name: error instanceof Error ? error.name : 'UnknownError',
            message: error instanceof Error ? error.message : typeof error === 'string' ? error : '调用抛出非 Error 异常',
            ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}) }
          await save(exec.agent.id, record)
          throw unconfirmed()
        }
        const value = inspectionValue(receipt)
        if (value?.acceptanceStatus === 'ACCEPTED' && typeof value.runId === 'string' && value.runId.trim()) {
          state.phase = 'ACCEPTED'
          state.receipt = receipt
        } else if (value && ['NEEDS_INPUT', 'NEEDS_SELECTION', 'BLOCKED'].includes(value.acceptanceStatus) && !value.runId) {
          state.phase = 'NOT_CREATED'
          state.receipt = receipt
        } else {
          state.failure = receipt // 不明或矛盾回执不能认作未创建；同参重试须沿用原号。
          await save(exec.agent.id, record)
          throw unconfirmed()
        }
        await save(exec.agent.id, record)
        return receipt
      })
    },
  }
}

export function apply(ctx: any) {
  const execution = createInspectionExecution(join(process.env.DSH_HOME || homedir(), 'inspection-operations'))
  const mounted = new WeakMap<object, Map<string, { visible: any; upstream: any; dispose: () => void }>>()
  const actual = (raw: string) => ctx.mcpSessionManager.resolveTool('inspection', raw)
  function mount(agent: any) {
    if ((agent.session.header?.delegationDepth ?? 0) !== 0) return
    let entries = mounted.get(agent)
    if (!entries) { entries = new Map(); mounted.set(agent, entries) }
    // 只包装目录对象解包、启动可信字段和结果查询；不添加范围预检、版本输入或降级调用。
    for (const raw of [LIST, START, QUERY]) {
      const toolName = actual(raw), original = toolName && ctx.tools.get(toolName, agent)
      const entry = entries.get(raw)
      if (entry && original === entry.visible) continue
      if (entry) { entry.dispose(); entries.delete(raw) }
      if (!original) continue
      const schema = original.parameters ?? {}, required = schema.required, sourceProperties = schema.properties
      const expected = raw === START ? ['taskId', 'requestId'] : raw === QUERY ? ['runId'] : []
      const allowed = raw === START ? ['taskId', 'requestId', 'deviceSelector', 'businessInputs', 'mode']
        : raw === QUERY ? ['runId'] : []
      // 目录查询只读；其 JSON Schema 可以省略空 required，不因缺少 [] 拒绝真实目录。
      const modern = raw === LIST || (Array.isArray(required) && required.length === expected.length
        && expected.every(field => required.includes(field)) && object(sourceProperties)
        && allowed.every(field => object(sourceProperties[field]))
        && Object.keys(sourceProperties).every(field => allowed.includes(field)))
      const properties = modern && raw !== LIST ? { ...sourceProperties } : {}
      if (raw === START) delete properties.requestId
      const wrapper = { ...original,
        // 仅收紧技术字段与不兼容 schema；其余保留上游说明、原有参数描述和结果。
        parameters: raw === LIST ? schema : modern
          ? { ...schema, properties, required: required.filter((field: string) => field !== 'requestId') }
          : { type: 'object', properties: {}, required: [], additionalProperties: false },
        execute(args: Value, exec: Value) {
          if (!modern) throw new Error('巡检服务仍未提供目标四工具合同，禁止旧契约调用')
          if (raw === LIST) {
            if (!object(args) || Object.keys(args).length) throw new Error('目录查询无需参数')
            return original.execute(args, exec)
          }
          if (raw === START) return execution.start(args, exec, value => original.execute(value, exec), schema)
          if (!object(args) || Object.keys(args).some(field => field !== 'runId')
            || typeof args.runId !== 'string' || !args.runId.trim()) throw new Error('同次巡检查询只能使用真实 runId')
          return original.execute(args, exec)
        },
      }
      Object.defineProperty(wrapper, Symbol.for('security-operations.inspection.runtime'), { value: true })
      const dispose = agent.ctx.tools.register(wrapper)
      entries.set(raw, { visible: wrapper, upstream: original, dispose })
      ctx.effect(() => dispose)
    }
  }
  // rc.5 首帧工具目录在 pre-step 前组装；创建或恢复时挂载，后续异步刷新再核对。
  ctx.on('agent/created', ({ agent }: Value) => { mount(agent) })
  ctx.on('agent/pre-step', async ({ agent }: Value, next: () => Promise<any>) => {
    mount(agent)
    return next()
  })
}
