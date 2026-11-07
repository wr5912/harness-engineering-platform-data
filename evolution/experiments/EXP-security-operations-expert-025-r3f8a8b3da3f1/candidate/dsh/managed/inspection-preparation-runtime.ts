import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { hasSpillNotice } from '@deepseek-ai/dsh-spill-policy/notice'

type Value = Record<string, any>
type State = { input: Value; context: Value; requestId: string; preparation: Value;
  attempted?: boolean; receipt?: Value }
export const name = 'inspection-preparation-runtime'
export const inject = ['tools', 'mcpSessionManager']
const LIST = 'list_executable_inspections', PREPARE = 'prepare_inspection', START = 'start_inspection', QUERY = 'get_inspection_result'
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

export function reportLink(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return
  try {
    const url = new URL(value)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return value
  } catch { /* 不拼造下载地址。 */ }
}

function userContext(agent: any): Value {
  const events = agent.session.snapshotEvents()
  const user = events.slice().reverse().find((event: Value) => event.type === 'user/message'
    && ['user', 'schedule'].includes(event.data?.source?.kind))?.data
  if (!agent.id || !user?.id || (agent.session.header?.delegationDepth ?? 0) !== 0) throw new Error('巡检缺少真实主会话与用户或原生定时消息')
  return { conversationRef: agent.id, userMessageRef: user.id }
}

function requestId(context: Value, input: Value, agent: any): string {
  const user = agent.session.snapshotEvents().slice().reverse().find((event: Value) => event.type === 'user/message')?.data
  // 原生定时消息的完整内容包含提醒编号与到期时点；重复投递仍绑定同一次到期。
  const identity = user?.source?.kind === 'schedule' ? { conversationRef: context.conversationRef, schedule: user.content } : context
  const stable = (value: any): any => Array.isArray(value) ? value.map(stable)
    : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
  const hex = createHash('sha256').update(JSON.stringify(stable({ context: identity, input }))).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** 原生 HOME 内只保存提交状态，不回流为 Harness 资产。 */
export function createInspectionExecution(directory: string) {
  const locks = new Map<string, Promise<void>>()
  const path = (id: string) => join(directory, `${createHash('sha256').update(id).digest('hex')}.json`)
  async function load(id: string): Promise<State | undefined> {
    try { return JSON.parse(await readFile(path(id), 'utf8')) } catch (error: any) {
      if (error?.code !== 'ENOENT') throw new Error('巡检提交状态无法读取，先核对原请求，不重复发起')
    }
  }
  async function save(id: string, value: State) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const temporary = `${path(id)}.${randomUUID()}.tmp`
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    await rename(temporary, path(id))
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
  function verify(value: Value | undefined, input: Value) {
    if (!value?.preparationId || value.taskId !== input.taskId || value.definitionVersion !== input.definitionVersion) throw new Error('准备回执缺少同一模板、版本或准备标识，未启动巡检')
    return value
  }
  return {
    prepare(input: Value, exec: Value, invoke: (args: Value) => Promise<Value>) {
      return locked(exec.agent.id, async () => {
        if (Object.keys(input).some(key => !['taskId', 'definitionVersion', 'deviceSelector', 'businessInputs'].includes(key))) throw new Error('准备参数只接受真实目录声明的模板、版本、设备选择器和业务输入')
        if (!object(input.deviceSelector) || !['ALL', 'ASSET_IDS', 'IP', 'CIDR', 'TOPOLOGY_GROUP', 'ASSET_CLASS', 'FILTER'].includes(input.deviceSelector.kind)) throw new Error('先明确本次设备范围并提供原始选择器，不能默认全部资产')
        const context = userContext(exec.agent), previous = await load(exec.agent.id)
        if (previous?.attempted && !previous.receipt) throw new Error(`原提交状态未知；请按原 requestId ${previous.requestId} 查账，不重新准备或启动`)
        const id = requestId(context, input, exec.agent)
        if (previous?.requestId === id && previous.attempted) throw new Error(`本次请求已发起；只查询原 runId ${inspectionValue(previous.receipt)?.runId ?? '未知'}`)
        const receipt = await invoke({ ...input, context })
        const preparation = inspectionValue(receipt)
        if (!preparation) throw new Error('准备未返回可识别回执，未启动巡检')
        if (preparation.status === 'READY') verify(preparation, input)
        await save(exec.agent.id, { input: structuredClone(input), context, requestId: id, preparation })
        return receipt
      })
    },
    start(input: Value, exec: Value, prepare: (args: Value) => Promise<Value>, invoke: (args: Value) => Promise<Value>) {
      return locked(exec.agent.id, async () => {
        if (Object.keys(input).some(key => !['taskId', 'definitionVersion', 'preparationId'].includes(key))) throw new Error('启动只接受已准备的模板、版本和准备编号，范围与 requestId 由运行时绑定')
        const state = await load(exec.agent.id)
        if (!state || state.preparation.preparationId !== input.preparationId
          || state.input.taskId !== input.taskId || state.input.definitionVersion !== input.definitionVersion) throw new Error('先准备本次模板与原始范围，不能启动其他准备')
        if (state.attempted) {
          if (state.receipt) return state.receipt
          throw new Error(`原提交状态未知；请按原 requestId ${state.requestId} 查账，不重复启动`)
        }
        const context = userContext(exec.agent)
        if (context.userMessageRef !== state.context.userMessageRef) throw new Error('用户请求已变化；按当前请求重新准备，不能沿用旧范围')
        if (state.preparation.status !== 'READY') throw new Error('准备未就绪；只澄清服务返回的范围歧义或业务缺项')
        const expires = Date.parse(state.preparation.expiresAt)
        if (!Number.isFinite(expires)) throw new Error('准备缺少可核对的有效期，未启动巡检')
        if (Date.now() >= expires) {
          const receipt = await prepare({ ...state.input, context: state.context })
          state.preparation = verify(inspectionValue(receipt), state.input)
          await save(exec.agent.id, state)
          if (state.preparation.status !== 'READY' || !(Date.parse(state.preparation.expiresAt) > Date.now())) throw new Error('按原选择器重新准备后仍未就绪或已过期，未启动巡检')
        }
        exec.signal?.throwIfAborted()
        state.attempted = true
        await save(exec.agent.id, state) // 先记录未知提交；断线或进程退出不能产生第二次启动。
        const receipt = await invoke({ taskId: state.input.taskId, definitionVersion: state.input.definitionVersion,
          preparationId: state.preparation.preparationId, requestId: state.requestId, context: state.context })
        if (!inspectionValue(receipt)?.runId) throw new Error(`未取得真实 runId；原 requestId ${state.requestId} 的提交状态待查账，不重复启动`)
        state.receipt = receipt
        await save(exec.agent.id, state)
        return receipt
      })
    },
  }
}

export function apply(ctx: any) {
  const execution = createInspectionExecution(join(process.env.DSH_HOME || homedir(), 'inspection-operations'))
  const mounted = new WeakMap<object, Map<string, { visible: any; upstream: any; dispose: () => void }>>()
  const pending = new Map<string, { exec: any; full: Value; spilled: boolean }>()
  const actual = (raw: string) => ctx.mcpSessionManager.resolveTool('inspection', raw)
  const isSpilled = (content: any[]) => content?.some(part => part.type === 'text' && typeof part.text === 'string' && hasSpillNotice(part.text))
  ctx.on('agent/disposed', ({ agent }: Value) => { pending.delete(agent.id) })
  ctx.on('agent/pre-step', async ({ agent, messages }: Value, next: () => Promise<any>) => {
    if (messages?.some((message: Value) => ['user', 'schedule'].includes(message.source?.kind))) pending.delete(agent.id)
    if ((agent.session.header?.delegationDepth ?? 0) === 0) {
      let entries = mounted.get(agent)
      if (!entries) { entries = new Map(); mounted.set(agent, entries) }
      for (const raw of [LIST, PREPARE, START]) {
        const toolName = actual(raw), original = toolName && ctx.tools.get(toolName, agent)
        const entry = entries.get(raw)
        if (entry && original === entry.visible) continue
        if (entry) { entry.dispose(); entries.delete(raw) }
        if (!original) continue // MCP 异步挂载和单服务失败不阻断 Agent。
        const properties = { ...original.parameters.properties }
        delete properties.context; delete properties.requestId
        if (raw === START) delete properties.scope
        const wrapper = { ...original,
          description: raw === LIST ? '查询已发布且启用的巡检目录，只读；执行请求由主 Agent 选择唯一模板并核对实际范围后同轮准备和启动。' : raw === PREPARE ? '按真实目录与原始范围准备巡检；READY 后明确执行请求可在同轮启动，缺项只澄清。'
            : '按本轮明确执行请求消费真实 READY 准备；同轮启动，无额外确认；已发起只续查，回执未知先查账。',
          parameters: { ...original.parameters, properties, additionalProperties: false,
            required: raw === LIST ? original.parameters.required : raw === START ? ['taskId', 'definitionVersion', 'preparationId'] : ['taskId', 'definitionVersion', 'deviceSelector'] },
          execute(args: Value, exec: Value) {
            if (raw === LIST) return original.execute(args, exec)
            if (raw === PREPARE) return execution.prepare(args, exec, value => original.execute(value, exec))
            const prepareName = actual(PREPARE), prepared = prepareName && entries!.get(PREPARE)?.upstream
            if (!prepared) throw new Error('当前巡检准备工具不可用，未启动巡检；其他业务可继续使用')
            return execution.start(args, exec, value => prepared.execute(value, exec), value => original.execute(value, exec))
          },
        }
        const dispose = agent.ctx.tools.register(wrapper)
        entries.set(raw, { visible: wrapper, upstream: original, dispose })
        // 原生作用域注册归属于插件；热卸载不能留下旧包装器。
        ctx.effect(() => dispose)
      }
    }
    return next()
  })
  ctx.on('tools/result', (exec: Value, result: Value) => {
    if (!exec.agent) return
    if (exec.name === actual(QUERY) && exec.arguments?.includeReport === true && !result.isError) {
      const full = inspectionValue(result.value)
      if (full && full.runId === exec.arguments.runId && typeof full.reportMarkdown === 'string') {
        pending.set(exec.agent.id, { exec, full, spilled: !!isSpilled(result.content) })
      }
    } else if (exec.parent === undefined) {
      const delivery = pending.get(exec.agent.id)
      const workflow = ['inspection_workflow', 'security_operations_code_workflow', 'security_operations_hybrid_workflow'].includes(exec.name)
      if (workflow && delivery && !result.isError && delivery.exec.rootCallId === exec.rootCallId) delivery.spilled ||= !!isSpilled(result.content)
      else pending.delete(exec.agent.id)
    }
  })
  // 固定交付器先注册，await next() 后读取这里排入的同次结果。
  ctx.on('agent/request', async ({ agent, signal }: Value, next: () => Promise<any>) => {
    const config = await next(), delivery = pending.get(agent.id)
    pending.delete(agent.id)
    if (!delivery?.spilled || signal?.aborted) return config
    const { exec, full } = delivery, link = reportLink(full.reportDownloadUrl)
    let markdown = '完整报告已由 DSH 按实际内联预算截断，本条未内联全文。'
    try {
      // 这是受管派生只读查询；独立经过原生结果预算，不冒充模型发起的调用。
      const result = await ctx.tools.execute({ name: actual(QUERY), arguments: { runId: full.runId, includeReport: false },
        callId: `inspection-summary-${randomUUID()}`, rootCallId: exec.rootCallId, agent, signal })
      const summary = result.isError ? undefined : inspectionValue(result.value)
      if (summary && summary.runId === full.runId && link && summary.reportDownloadUrl === link
        && typeof summary.reportSummaryMarkdown === 'string' && summary.reportSummaryMarkdown.trim() && !isSpilled(result.content)) {
        markdown += '\n\n以下为另行只读取得的同次已存报告摘要：\n\n' + summary.reportSummaryMarkdown
      } else markdown += '\n未取得可核验且可完整内联的同次摘要，请使用原报告链接。'
      ctx.logger?.info?.(`巡检派生摘要读取：runId=${full.runId}；同次摘要核验=${!!summary && summary.runId === full.runId && summary.reportDownloadUrl === link && !isSpilled(result.content)}`)
    } catch { markdown += '\n同次摘要补读失败，原报告状态保持不变，可继续查询原 runId。' }
    if (link) markdown += '\n\n[下载完整报告](<' + link + '>)'
    else markdown += '\n未取得有效的原报告下载链接。'
    if (!signal?.aborted) {
      // 动态读取既有模块，避免 AOT 打包复制交付队列而无法交付。
      const { queueControlledOutput } = await import(new URL('./operation-result-delivery.mjs', import.meta.url).href)
      queueControlledOutput(agent.id, markdown)
    }
    return config
  })
}
