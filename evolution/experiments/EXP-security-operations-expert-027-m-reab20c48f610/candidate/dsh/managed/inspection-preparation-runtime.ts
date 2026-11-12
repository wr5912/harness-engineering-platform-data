import { createHash } from 'node:crypto'

type Value = Record<string, any>
export const name = 'inspection-preparation-runtime'
export const inject = ['tools', 'mcpSessionManager']
const runs = ['inspection_baseline', 'inspection_vulnerabilities', 'inspection_reachability', 'inspection_routine', 'inspection_deep']
const queries = ['get_composition_run', 'get_composition_details', 'get_composition_artifact']
/** 调用身份由真实消息生成；平台负责持久化受理和原请求重放。 */
export function inspectionExecution(raw: string, exec: Value) {
  const agent = exec.agent, events: Value[] = agent?.session?.snapshotEvents?.()
  const messages = events?.filter(event => event.type === 'user/message' && ['user', 'schedule'].includes(event.data?.source?.kind)).map(event => event.data)
  const current = messages?.at(-1)
  if (!agent?.id || !current?.id || (agent.session.header?.delegationDepth ?? 0) !== 0) throw new Error('巡检缺少真实主会话或用户/定时消息')
  const identity = createHash('sha256').update(JSON.stringify([agent.id, current.id, raw])).digest('hex')
  return { ...exec, callId: `inspection-${identity}` }
}

export function apply(ctx: any) {
  const mounted = new WeakMap<object, Map<string, { visible: any; dispose: () => void }>>()
  function mount(agent: any) {
    if ((agent.session.header?.delegationDepth ?? 0) !== 0) return
    let entries = mounted.get(agent)
    if (!entries) { entries = new Map(); mounted.set(agent, entries) }
    for (const raw of [...runs, ...queries]) {
      const toolName = ctx.mcpSessionManager.resolveTool('inspection-compositions', raw)
      const original = toolName && ctx.tools.get(toolName, agent), entry = entries.get(raw)
      if (entry && original === entry.visible) continue
      if (entry) { entry.dispose(); entries.delete(raw) }
      if (!original) continue
      const wrapper = { ...original, execute(args: Value, exec: Value) {
        return original.execute(args, runs.includes(raw) ? inspectionExecution(raw, exec) : exec)
      } }
      Object.defineProperty(wrapper, Symbol.for('security-operations.inspection.runtime'), { value: true })
      const dispose = agent.ctx.tools.register(wrapper)
      entries.set(raw, { visible: wrapper, dispose })
      ctx.effect(() => dispose)
    }
  }
  ctx.on('agent/created', ({ agent }: Value) => mount(agent))
  ctx.on('agent/pre-step', async ({ agent }: Value, next: () => Promise<any>) => { mount(agent); return next() })
}
