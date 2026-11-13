import { isIP } from 'node:net'
import { offlineEvidenceLoop } from './evidence-loop.ts'
import { controlledDiagnosticProposal } from '@harness-platform/security-operations/controlled-diagnostic-proposal.ts'
import { unpack, rows, type Soc } from '@harness-platform/security-operations/action-api.ts'
import { renderTroubleshootingReport } from '@harness-platform/security-operations/reports/troubleshooting.ts'
import { buildConclusion } from '@harness-platform/security-operations/reports/conclusion.ts'
import { diagnosticTime, candidateStates, evaluateCandidate } from '@harness-platform/security-operations/diagnostic-context.ts'

type Value = Record<string, any>
type Context = { runId: string; nodeId: string; signal: AbortSignal; shared: Value; progress(value: Value): void; call<T>(call: () => Promise<T>): Promise<T> }
const endpoint = { type: 'object', additionalProperties: false, required: ['ip'], properties: { ip: { type: 'string', minLength: 1 }, assetId: { type: 'integer', minimum: 1 }, assetType: { type: 'string', minLength: 1 }, physicalVirtual: { type: 'string', enum: ['physical', 'virtual', 'unknown'] }, managementObject: { type: 'string', minLength: 1 } } }
export const inputSchema = { type: 'object', additionalProperties: false, required: ['asset'], properties: {
  asset: endpoint, observer: endpoint,
  resume_run_id: { type: 'string', pattern: '^run-[0-9a-f-]{36}$', description: '公开延续入口：继承同冻结范围、同版本已保存诊断；未知执行不重放。' },
   faultStartedAt: { type: ['string', 'null'], description: '故障起点未知可省略或null；当前观察不强制历史窗口。' },
  from: { type: 'string', description: '固定查询窗口起点，ISO-8601且带Z或UTC偏移。' },
  to: { type: 'string', description: '固定查询窗口终点，ISO-8601且带Z或UTC偏移。' },
} }
const timed = (value: unknown): value is string => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value))
const object = (value: any): value is Value => value !== null && typeof value === 'object' && !Array.isArray(value)
function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact)
  if (!object(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, /password|token|api.?key|secret|private.?key|credential|authorization/i.test(key) ? '[REDACTED]' : redact(entry)]))
}
const OFFLINE_ITEMS = Object.freeze(['soc-state', 'alerts', 'management'])
const COLLECTION_ITEMS = Object.freeze(['run-state', 'config', 'heartbeat', 'synchronization'])
const candidateRules = [
  { id: 'device-offline', title: '设备当前离线', support: [{ predicate: 'soc-online', value: false }], confirm: [], refute: [{ predicate: 'soc-online', value: true }] },
  { id: 'management-unreachable', title: '管理路径不可达', support: [{ predicate: 'management-state', value: 'unreachable' }], confirm: [], refute: [{ predicate: 'management-state', value: 'reachable' }] },
  { id: 'collection-interrupted', title: '采集链中断', support: [{ predicate: 'collection-state', value: 'interrupted' }], confirm: [], refute: [{ predicate: 'collection-state', value: 'healthy' }] },
  { id: 'network-link-abnormal', title: '网络链路异常', support: [{ predicate: 'network-state', value: 'unreachable' }], confirm: [], refute: [{ predicate: 'network-state', value: 'reachable' }] },
  { id: 'soc-data-not-updated', title: 'SOC数据未更新', support: [{ predicate: 'synchronization-state', value: 'stale' }], confirm: [], refute: [{ predicate: 'synchronization-state', value: 'current' }] },
  { id: 'identity-gap', title: '资产身份或管理对象缺口', support: [{ predicate: 'identity-state', value: 'ambiguous' }], confirm: [], refute: [{ predicate: 'identity-state', value: 'unique' }] },
] as const
const message = (error: any) => String(error?.message ?? error?.error ?? error)
const errorFields = (error: any) => ({ error: message(error), message: message(error) })
class ProgressFailure extends Error {
  constructor(cause: unknown) { super(message(cause), { cause }); this.name = 'ProgressFailure' }
}
function progress(context: Context, value: Value) {
  try { context.progress(value) } catch (error) { throw new ProgressFailure(error) }
}
function businessFailure(context: Context, error: unknown) {
  context.signal.throwIfAborted()
  if (error instanceof ProgressFailure) throw error
}
function freeze<T>(value: T): T {
  if (object(value)) { for (const item of Object.values(value)) freeze(item); Object.freeze(value) }
  return value
}
function store(context: Context, check: string, status: string, facts: Value, receipts: Value[] = []) {
  context.signal.throwIfAborted()
  const id = context.shared.diagnostic_loop?.round > 0 ? `${context.runId}:${context.nodeId}:${Object.keys(context.shared.facts).length + (context.shared.diagnostic_loop.staged?.length ?? 0) + 1}` : context.nodeId
  const times = [...(facts.source_observations ?? []).map((entry: Value) => entry.observedAt), ...(timed(facts.observed_at) ? [facts.observed_at] : [])].filter(timed)
  const fact = { id, node_id: id, path: id.slice(0, id.lastIndexOf('/')), check, status, run_id: context.runId, recorded_at: new Date().toISOString(), observed_at: times.length === 1 ? times[0] : null, source_timezone: times.length === 1 ? times[0].match(/(?:Z|[+-]\d{2}:\d{2})$/i)?.[0] : 'unknown',
    ...redact(facts),
    observed_at: times.length === 1 ? times[0] : null,
    source_timezone: times.length === 1 ? times[0].match(/(?:Z|[+-]\d{2}:\d{2})$/i)?.[0] : 'unknown',
    atoms: Array.isArray(facts.atoms) ? facts.atoms : [],
    executed: receipts.some(receipt => receipt.response_received) ? true : receipts.some(receipt => receipt.attempted) ? null : false,
    execution_status: receipts.some(receipt => receipt.error) ? 'failed' : receipts.some(receipt => receipt.response_received) ? 'completed' : 'not_executed',
    execution_point: { kind: receipts.some(receipt => receipt.attempted) ? 'SOC_READONLY' : 'PLATFORM_ANALYSIS', services: [...new Set(receipts.filter(receipt => receipt.attempted).map(receipt => receipt.serverId))] },
    request_attempts: receipts.filter(receipt => receipt.attempted).map(receipt => ({ id: receipt.id, source_id: receipt.serverId, name: receipt.operation, response_received: receipt.response_received, status: receipt.error ? 'failed' : 'completed' })),
    raw_receipt_refs: receipts.filter(receipt => receipt.response_received).map(receipt => ({ run_id: context.runId, node_id: id, receipt_id: receipt.id })) }
  // 先调用既有Run progress；该调用失败则不返回，不释放后继。沿用平台实际持久化语义，不新增存储或flush。
  progress(context, { status: 'completed', completed: 1, total: 1, result: { kind: 'fault-check', status, item_count: 1, items: [fact], raw_receipts: receipts } })
  if (context.shared.diagnostic_loop?.defer_append) { context.shared.diagnostic_loop.staged.push({fact,receipts}); return fact }
  context.shared.facts[id] = fact
  for (const receipt of receipts) context.shared.receipts[receipt.id] = receipt
  reassess(context, fact)
  return fact
}
function reassess(context: Context, fact: Value) {
  const all = Object.values<Value>(context.shared.facts)
  const atoms = all.flatMap(item => Array.isArray(item.atoms) ? item.atoms : [])
  const blocked = all.filter(item => /(?:401|403|forbidden|unauthorized|权限拒绝)/i.test(JSON.stringify(item.error ?? item.message ?? ''))).map(item => item.id)
  if (blocked.length) context.shared.authentication_blocker = { kind: 'soc-authentication', evidence_ids: blocked, retryable: false, reason: 'SOC认证/授权失败；停止依赖取证、不自动重试、不沿用旧资产ID' }
  const objectId = context.shared.scope.asset?.assetId ? `asset:${context.shared.scope.asset.assetId}` : 'asset:unresolved'
  const causes = candidateRules.map(rule => {
    const evaluation = evaluateCandidate(rule, atoms, objectId, [])
    const message = evaluation.status === 'supported' ? '有带来源和观测时间的原子支持，但没有完整确认判据。'
      : evaluation.status === 'refuted' ? '有同对象、同适用时间范围内的反驳原子。'
      : evaluation.status === 'insufficient_capability' ? '只有明确权限拒绝才进入能力/权限不足；传输失败和空数据不作此结论。'
      : '没有满足当前候选的适用原子；未知不等于反驳。'
    return { ...evaluation, message, support: { status: evaluation.status === 'supported' ? 'supported' : 'unknown', evidence_ids: evaluation.support_evidence_ids }, refutation: { status: evaluation.status === 'refuted' ? 'refuted' : 'unknown', evidence_ids: evaluation.refutation_evidence_ids } }
  })
  context.shared.causes = causes
  const round = { id: `round-${context.shared.rounds.length + 1}`, node_id: context.nodeId, recorded_at: new Date().toISOString(), known_facts: all.map(item => item.id), candidates: structuredClone(causes), evidence_ids: [fact.id], gaps: fact.gaps ?? [], distinguishing_next_check: null, next_check: null, reason: fact.message ?? fact.check }
  context.shared.rounds.push(round)
  if (context.shared.diagnostic_loop?.round > 0) progress(context, { status: 'completed', result: { kind: 'fault-check', status: fact.status, item_count: all.length, items: all, raw_receipts:Object.values(context.shared.receipts), causes, rounds: context.shared.rounds } })
}
function reader(soc: Soc, config: Value, context: Context, receipts: Value[]) {
  return async (alias: string, operation: string, args: Value) => {
    const serverId = config.connections[alias]
    if (!serverId) throw new Error(`缺少连接：${alias}`)
    const started_at = new Date().toISOString(), id = `${context.nodeId}:round:${context.shared.diagnostic_loop?.round ?? 0}:receipt:${receipts.length}`
    let raw: any, attempted = false
    try { raw = await context.call(() => {
      if (context.shared.request_count >= 48) throw new Error('本Run只读请求预算到限')
      context.shared.request_count++; attempted = true
      return soc(serverId, operation, args, AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]), context.shared.connection_fingerprints[serverId])
    }) }
    catch (error: any) {
      context.signal.throwIfAborted()
      receipts.push({ id, serverId, operation, attempted, response_received: raw !== undefined, arguments: structuredClone(args), started_at, received_at: new Date().toISOString(), ...errorFields(error), receipt: redact(error?.receipt ?? raw ?? null) })
      progress(context, { status: 'running', raw_receipts: receipts })
      throw error
    }
    receipts.push({ id, serverId, operation, attempted, response_received: raw !== undefined, arguments: structuredClone(args), started_at, received_at: new Date().toISOString(), receipt: redact(raw) })
    progress(context, { status: 'running', raw_receipts: receipts })
    return unpack(raw)
  }
}
const data = (value: any) => value.data ?? value
async function locate(selector: Value, call: ReturnType<typeof reader>) {
  const candidates: Value[] = [], ids = new Set<number>(); let total: number | undefined
  for (let pageNum = 1; ; pageNum++) {
    const reply = await call('master', 'list_soc_asset', { ip: selector.ip, pageNum, pageSize: 100 }), page = rows(reply)
    const currentTotal = reply.total ?? data(reply).total
    if (!Number.isSafeInteger(currentTotal) || currentTotal < 0 || total !== undefined && currentTotal !== total) throw new Error('资产分页总数缺失或变化，未截断或默选')
    total = currentTotal
    for (const item of page) {
      if (!Number.isSafeInteger(item.assetId) || item.assetId <= 0 || ids.has(item.assetId)) throw new Error('资产分页身份缺失或重复')
      ids.add(item.assetId); candidates.push(item)
    }
    if (candidates.length > currentTotal || candidates.length < currentTotal && !page.length) throw new Error('资产分页无进展或不完整')
    if (candidates.length === currentTotal) break
  }
  return candidates.filter(item => item.ip === selector.ip && (selector.assetId === undefined || selector.assetId === item.assetId))
}
function report(context: Context, terminal: string) {
  const confirmed = context.shared.causes.some((cause: Value) => cause.status === 'confirmed') && !context.shared.causes.some((cause: Value) => cause.status === 'conflict')
  const items = (Object.values(context.shared.facts) as Value[]).sort((a, b) => a.id.localeCompare(b.id))
  const result: Value = { kind: 'device-offline', status: confirmed ? 'complete' : 'incomplete', conclusion: confirmed ? 'confirmed' : 'inconclusive', terminal, run_id: context.runId, diagnostic_id: context.shared.diagnostic_id ?? context.runId, input: context.shared.input,
    scope: context.shared.scope ?? { requested: context.shared.input, frozen_at: context.shared.frozen_at }, execution_status: 'unverified',
    message: '仅交付本次同诊断已保存的只读事实、候选状态和缺口；无响应不判断断电，SOC在线不判正常，没有实施修复或主动探测。',
    items, item_count: items.length, causes: context.shared.causes ?? [], rounds: context.shared.rounds ?? [], raw_receipts: Object.values(context.shared.receipts), active_checks_executed: false,
    gaps: items.flatMap(item => item.gaps ?? []), next_check: '按已核对象补足真实管理/网络响应与来源时区；没有原子则保留未执行，不以其他执行点代替。' }
  return { ...result, unified_conclusion: buildConclusion(result) }
}
type BranchDefinition = { item: string; index: number; batch: string; required: [string, string][]; collection?: boolean }
const managementFacts: [string, string][] = [['management', 'management-observation']]
const bindingFacts: [string, string][] = [...managementFacts, ['collection-capability', 'collection-capability'], ['bindings', 'collection-binding']]
const branchDefinitions: Record<string, BranchDefinition> = {
  'soc-result': { item: 'soc-state', index: 0, batch: 'offline-batch', required: [['soc-status', 'soc-state']] },
  'alerts-result': { item: 'alerts', index: 1, batch: 'offline-batch', required: [['alerts', 'alerts']] },
  'unknown-result': { item: 'management', index: 2, batch: 'offline-batch', required: [...managementFacts, ['unknown-gap', 'unknown-management'], ['unknown-path', 'configuration-path']] },
  'no-reply-result': { item: 'management', index: 2, batch: 'offline-batch', required: [...managementFacts, ['no-reply-gap', 'unanswered-observation'], ['no-reply-path', 'configuration-path']] },
  'empty-binding-result': { item: 'management', index: 2, batch: 'offline-batch', required: bindingFacts },
  'bound-result': { item: 'management', index: 2, batch: 'offline-batch', required: bindingFacts, collection: true },
  'run-result': { item: 'run-state', index: 0, batch: 'collection-batch', required: [['run-state', 'collection-run-state']] },
  'config-result': { item: 'config', index: 1, batch: 'collection-batch', required: [['config-state', 'collection-config']] },
  'heartbeat-result': { item: 'heartbeat', index: 2, batch: 'collection-batch', required: [['heartbeat-gap', 'raw-heartbeat']] },
  'synchronization-result': { item: 'synchronization', index: 3, batch: 'collection-batch', required: [['sync-gap', 'state-synchronization']] },
}
function requiredFact(context: Context, id: string, check: string) {
  const fact = context.shared.facts[id]
  if (!object(fact) || fact.id !== id || fact.run_id !== context.runId || fact.check !== check) throw new Error(`分支事实身份缺失或跨Run：${id}`)
  return fact
}
function validateBranch(value: Value, path: string, item: string, index: number, context: Context): string[] {
  if (!object(value) || typeof value.terminal !== 'string') throw new Error('批次分支缺少独立终态')
  const terminal = value.terminal.slice(value.terminal.lastIndexOf('/') + 1), definition = branchDefinitions[terminal]
  if (!definition || definition.item !== item || definition.index !== index || value.kind !== 'evidence-branch' || value.completed !== true || value.run_id !== context.runId || value.path !== path || value.item !== item || value.index !== index || value.terminal !== `${path}/${terminal}` || !path.endsWith(`/${definition.batch}[${index}]`)) throw new Error('批次分支身份、顺序或路径不一致')
  const ids = definition.required.map(([node, check]) => { const id = `${path}/${node}`; requiredFact(context, id, check); return id })
  if (definition.collection) {
    if (!Array.isArray(value.children) || value.children.length !== COLLECTION_ITEMS.length) throw new Error('采集批次四项不完整')
    for (const [childIndex, childItem] of COLLECTION_ITEMS.entries()) ids.push(...validateBranch(value.children[childIndex], `${path}/collection-batch[${childIndex}]`, childItem, childIndex, context))
  } else if (value.children !== undefined) throw new Error('独立终态混入其他分支')
  if (!Array.isArray(value.fact_ids) || value.fact_ids.length !== ids.length || value.fact_ids.some((id: unknown, i: number) => id !== ids[i]) || new Set(ids).size !== ids.length) throw new Error('批次分支事实缺失、重复或顺序变化')
  const actual = Object.keys(context.shared.facts).filter(id => id.startsWith(`${path}/`))
  if (actual.length !== ids.length || actual.some(id => !ids.includes(id))) throw new Error('批次分支混入未选路径或缺少事实')
  return ids
}
function branchResult(value: Value, context: Context) {
  const terminal = context.nodeId.slice(context.nodeId.lastIndexOf('/') + 1), definition = branchDefinitions[terminal]
  if (!definition) throw new Error('未知分支终态')
  const path = context.nodeId.slice(0, context.nodeId.lastIndexOf('/'))
  const children = definition.collection ? value.items : undefined
  if (definition.collection && (!Array.isArray(children) || children.length !== COLLECTION_ITEMS.length)) throw new Error('采集批次四项不完整')
  const result = { kind: 'evidence-branch', completed: true, item: definition.item, index: definition.index, path, terminal: context.nodeId, run_id: context.runId,
    fact_ids: [...definition.required.map(([node]) => `${path}/${node}`), ...(children ?? []).flatMap((child: Value) => child.fact_ids ?? [])], ...(definition.collection ? { children } : {}) }
  validateBranch(result, path, definition.item, definition.index, context)
  progress(context, { status: 'completed', result })
  return result
}
function verifiedResponse(value: Value, context: Context) {
  const id = value.observation_id ?? value.id, fact = context.shared.facts[id]
  return value.response_verified === true && object(fact) && fact.run_id === context.runId && fact.check === 'management-observation' && fact.status === 'observed' && fact.response_verified === true && fact.execution_point?.kind === 'SOC_READONLY' && fact.raw_receipt_refs?.length > 0
}
function memberArray(page: Value): Value[] {
  const names = ['members', 'alerts', 'items', 'records', 'rows'].filter(name => Array.isArray(page[name]))
  if (names.length !== 1) throw new Error(names.length ? '组内成员多个数组字段歧义，未默选' : '组内成员数组结构未知')
  return page[names[0]]
}
function stableTotal(page: Value, previous: number | undefined) {
  const names = ['total', 'totalAlerts', 'totalMembers'].filter(name => Object.hasOwn(page, name))
  const totals = names.map(name => page[name])
  if (totals.some(total => !Number.isSafeInteger(total) || total < 0)) throw new Error('组内成员总数不是非负安全整数')
  if (new Set(totals).size > 1) throw new Error('组内成员同时返回的总数字段冲突')
  const total = totals[0]
  if (total !== undefined && previous !== undefined && total !== previous) throw new Error('组内成员总数在分页中变化')
  return total ?? previous
}
type Paging = { cursor?: string; seen: Set<string>; cursorMode: boolean }
function continuePage(page: Value, count: number, length: number, total: number | undefined, state: Paging, allowEmptySnapshot = false) {
  if (total !== undefined && count > total) throw new Error('告警分页数量超过固定总数')
  if (!length && !(allowEmptySnapshot && total === 0 && count === 0)) throw new Error('告警分页零页或无进展，未按空结果完成')
  if (Object.hasOwn(page, 'nextCursor')) {
    const next = page.nextCursor
    if (next === null || next === '') {
      if (total !== undefined && count !== total) throw new Error('告警数量与显式游标终点矛盾')
      return false
    }
    if (typeof next !== 'string' || !next.trim()) throw new Error('告警续页游标必须为非空字符串或显式终点')
    if (!length || next === state.cursor || state.seen.has(next)) throw new Error('告警游标重复或无进展')
    if (total !== undefined && count >= total) throw new Error('告警总数终点与续页游标矛盾')
    state.seen.add(next); state.cursor = next; state.cursorMode = true
    return true
  }
  if (state.cursorMode) throw new Error('告警游标续页缺少显式终点')
  if (total === undefined) throw new Error('组内成员缺少稳定总数或显式续页合同，未声称完整')
  return count < total
}
function recordMemberIds(items: Value[], seen: Set<string>) {
  for (const item of items) {
    if (!object(item)) throw new Error('告警成员不是对象，无法核实稳定身份')
    const fields = ['alertId', 'id', 'eventId', 'uuid', '_id'].filter(name => Object.hasOwn(item, name))
    if (!fields.length || fields.some(name => !(typeof item[name] === 'string' && item[name].trim() || Number.isSafeInteger(item[name]) && item[name] >= 0))) throw new Error('告警成员缺少可核实稳定ID')
    const ids = [...fields.map(name => `${name}:${String(item[name])}`), `stable:${String(item[fields[0]])}`]
    if (ids.some(id => seen.has(id))) throw new Error('告警成员alertId/稳定ID跨页或跨组重复，未去重后声称完整')
    for (const id of ids) seen.add(id)
  }
}
export function create(soc: Soc) {
  const gap = (check: string, message: string) => (_value: Value, _config: Value, context: Context) => store(context, check, 'unavailable', { executed: false, gaps: [message] })
  const queryCollection = (operation: string, check: string) => async (value: Value, config: Value, context: Context) => {
    const receipts: Value[] = [], call = reader(soc, config, context, receipts)
    try {
      if (!verifiedResponse(value, context) || typeof value.deviceId !== 'string' || !value.deviceId.trim()) throw new Error('没有本次已核真实响应和唯一采集设备，未释放采集查询')
      const reply = await call('ingest', operation, { deviceId: value.deviceId })
      return store(context, check, 'unknown', { deviceId: value.deviceId, evidence: redact(data(reply)), gaps: ['已有配置或运行记录不证明当前采集正常；空记录不能按正常处理'] }, receipts)
    } catch (error: any) { businessFailure(context, error); return store(context, check, 'failed', { ...errorFields(error), gaps: ['本项未完成，其余独立检查保留'] }, receipts) }
  }
  const path = async (_value: Value, config: Value, context: Context) => {
    const receipts: Value[] = [], call = reader(soc, config, context, receipts), scope = context.shared.scope
    if (!scope.observer) return store(context, 'configuration-path', 'unavailable', { executed: false, gaps: ['没有唯一已核观察源，不猜源地址、不从平台发探测'] })
    try {
      const reply = data(await call('graph', 'get_graph_path_query', { srcIp: scope.observer.ip, dstIp: scope.asset.ip }))
      return store(context, 'configuration-path', 'unknown', { source: scope.observer, target: scope.asset, analysis_scope: 'IP_PAIR_ONLY', evidence: reply,
        gaps: ['仅为已有配置IP对模型，不是本次响应，不证明实际路径、端口、断电或设备正常'] }, receipts)
    } catch (error: any) { businessFailure(context, error); return store(context, 'configuration-path', 'failed', { ...errorFields(error), gaps: ['路径查询失败不等于无路径'] }, receipts) }
  }
  const workflow = {
     inputSchema,
    connections: (config: Value) => [...new Set<string>(Object.values(config.connections))],
    prepare(input: Value, config: Value) {
      input = structuredClone(input)
      if (!object(input) || Object.keys(input).some(key => !['asset', 'observer', 'from', 'to', 'faultStartedAt', 'resume_run_id'].includes(key))) throw new Error('输入含未声明字段；不接受模型自填响应事实')
      for (const selector of [input.asset, ...(input.observer === undefined ? [] : [input.observer])]) {
        if (!object(selector) || Object.keys(selector).some(key => !['ip', 'assetId', 'assetType', 'physicalVirtual', 'managementObject'].includes(key)) || typeof selector.ip !== 'string' || !isIP(selector.ip) || selector.assetId !== undefined && (!Number.isSafeInteger(selector.assetId) || selector.assetId <= 0)) throw new Error('仅接受明确合法IP及可选正整数assetId，不猜域名或观察源')
      }
      const time = diagnosticTime(input)
      const frozen_at = new Date().toISOString()
      return { input: freeze(input), frozen_at, scope: { time, requested: freeze(structuredClone(input)), frozen_at, playbook: 'soc-existing-device-availability', candidate_states: candidateStates }, facts: {}, receipts: {}, request_count: 0, rounds: [], causes: candidateRules.map(rule => ({ id: rule.id, title: rule.title, status: 'unknown', support: { evidence_ids: [] }, refutation: { evidence_ids: [] } })),
        diagnostic_loop: {round:0,round_limit:24,attempts:{},staged:[],pending:null},
         connection_fingerprints: Object.fromEntries(Object.values<string>(config.connections).map(id => [id, soc.fingerprint?.(id)])) }
    },
    components: {
      loopFinalReport: (value: Value, _config: Value, context: Context) => report(context,value.terminal),
      controlledProposal: (value: Value, config: Value, context: Context) => controlledDiagnosticProposal(soc, {
        status:['master','get_soc_asset_by_asset_id',{assetId:context.shared.scope.asset?.assetId}],
        path:['graph','get_graph_path_query',{srcIp:context.shared.scope.observer?.ip,dstIp:context.shared.scope.asset?.ip}],
      },value,config,context),
      async resolve(_value: Value, config: Value, context: Context) {
        const receipts: Value[] = [], call = reader(soc, config, context, receipts), input = context.shared.input
        try {
          const asset = await locate(input.asset, call), observer = input.observer ? await locate(input.observer, call) : []
          const ready = asset.length === 1 && (!input.observer || observer.length === 1)
          if (ready) Object.assign(context.shared.scope, {
            asset: { assetId: asset[0].assetId, ip: asset[0].ip, assetType: asset[0].assetType ?? input.asset.assetType ?? null, physicalVirtual: asset[0].physicalVirtual ?? input.asset.physicalVirtual ?? 'unknown', managementObject: input.asset.managementObject ?? null, hostAssetId: asset[0].hostAssetId ?? null },
            observer: input.observer ? { assetId: observer[0].assetId, ip: observer[0].ip } : null })
          const result = store(context, 'resolve', ready ? 'observed' : 'unknown', { ready, exact_matches: { asset: asset.length, observer: observer.length }, candidates: redact({ asset, observer }), gaps: ready ? [] : ['对象不唯一，未执行依赖检查'] }, receipts)
          return { ...result, branch: ready ? 'ready' : 'blocked', ...(ready ? { items: [...OFFLINE_ITEMS] } : {}) }
        } catch (error: any) { businessFailure(context, error); return { ...store(context, 'resolve', 'failed', { ready: false, ...errorFields(error), gaps: ['对象解析失败，未执行依赖检查'] }, receipts), branch: 'blocked' } }
      },
      async status(_value: Value, config: Value, context: Context) {
        const receipts: Value[] = [], call = reader(soc, config, context, receipts), asset = context.shared.scope.asset
        try {
          const reply = data(await call('master', 'get_soc_asset_by_asset_id', { assetId: asset.assetId }))
          if (reply.assetId !== asset.assetId || reply.ip !== asset.ip) throw new Error('状态响应与冻结身份不一致')
          const signals = Array.isArray(reply.stateEvidence?.signals) ? reply.stateEvidence.signals : []
           const atoms = signals.filter((signal: Value) => timed(signal.observedAt) && signal.validity === 'VALID' && typeof signal.supportsOnline === 'boolean').map((signal: Value, index: number) => ({ id: `soc-online-${index}`, object_id: `asset:${asset.assetId}`, predicate: 'soc-online', value: signal.supportsOnline, observed_at: signal.observedAt, applicability: 'applicable', result: 'observed', provenance_verified: true }))
           return store(context, 'soc-state', 'unknown', { assetId: asset.assetId, reported_state: reply.online, onlineBasis: reply.onlineBasis,
            stateEvidence: reply.stateEvidence, source_observations: signals, source_time_evidence: signals, atoms,
            gaps: ['SOC在线不代表本次真实响应或业务正常；源时区未核不得以评估时间代替观测时间'] }, receipts)
        } catch (error: any) { businessFailure(context, error); return store(context, 'soc-state', 'failed', { ...errorFields(error) }, receipts) }
      },
      async alerts(_value: Value, config: Value, context: Context) {
        if (!context.shared.scope.time.query_window) return store(context, 'alerts', 'not_checked', { executed: false, gaps: ['未提供历史查询窗；未猜时间或发告警请求，当前SOC状态检查独立继续'] })
        const receipts: Value[] = [], call = reader(soc, config, context, receipts), assetId = String(context.shared.scope.asset.assetId)
        const groups: Value[] = [], members: Value[] = [], keys = new Set<string>(), memberIds = new Set<string>()
        const raw_pages: Value = { groups: [], members: [] }
        let snapshotId: string | undefined, totalGroups: number | undefined, totalAlerts: number | undefined
        const base = { assetId, from: context.shared.input.from, to: context.shared.input.to, pageSize: 100 }
        try {
          const groupPaging: Paging = { seen: new Set(), cursorMode: false }
          for (let pageNum = 1; ; pageNum++) {
            const req = { ...base, pageNum, ...(snapshotId ? { snapshotId } : {}), ...(groupPaging.cursor ? { cursor: groupPaging.cursor } : {}) }
            const page = data(await call('detect', 'list_detect_alert', { req }))
            raw_pages.groups.push({ request: req, response: redact(page) })
            if (!object(page) || !Array.isArray(page.groups) || !Number.isSafeInteger(page.totalGroups) || page.totalGroups < 0 || !Number.isSafeInteger(page.totalAlerts) || page.totalAlerts < 0 || page.truncated !== false || typeof page.snapshotId !== 'string' || !page.snapshotId.trim()) throw new Error('告警快照结构未知或截断')
            stableTotal(page, totalAlerts)
            groups.push(...page.groups)
            if (snapshotId !== undefined && snapshotId !== page.snapshotId || totalGroups !== undefined && totalGroups !== page.totalGroups || totalAlerts !== undefined && totalAlerts !== page.totalAlerts) throw new Error('告警快照或总数在分页中变化')
            snapshotId = page.snapshotId; totalGroups = page.totalGroups; totalAlerts = page.totalAlerts
            for (const group of page.groups) {
              if (!object(group) || typeof group.groupKey !== 'string' || !group.groupKey.trim() || keys.has(group.groupKey)) throw new Error('告警分组groupKey缺失或重复，未去重后声称完整')
              keys.add(group.groupKey)
            }
            if (!continuePage(page, groups.length, page.groups.length, totalGroups, groupPaging, true)) break
          }
          for (const group of groups) {
            let total: number | undefined, count = 0
            const paging: Paging = { seen: new Set(), cursorMode: false }
            for (let pageNum = 1; ; pageNum++) {
              const req = { ...base, pageNum, snapshotId, groupKey: group.groupKey, ...(paging.cursor ? { cursor: paging.cursor } : {}) }
              const page = data(await call('detect', 'get_detect_alert_group_members', { req }))
              raw_pages.members.push({ request: req, response: redact(page) })
              if (!object(page)) throw new Error('组内成员响应不是对象')
              if (Object.hasOwn(page, 'groupKey') && page.groupKey !== group.groupKey) throw new Error('组内成员响应groupKey与请求不一致')
              if (Object.hasOwn(page, 'snapshotId') && page.snapshotId !== snapshotId) throw new Error('组内成员响应snapshotId与请求不一致')
              if (page.truncated === true) throw new Error('组内成员响应已截断')
              const items = memberArray(page)
              members.push(...items); count += items.length
              if (totalAlerts !== undefined && members.length > totalAlerts) throw new Error('告警成员累计超过固定快照总数，未继续续页')
              recordMemberIds(items, memberIds)
              total = stableTotal(page, total)
              if (!continuePage(page, count, items.length, total, paging)) break
            }
          }
          if (members.length !== totalAlerts) throw new Error('告警成员数与固定快照总数不一致')
          return store(context, 'alerts', 'observed', { assetId, from: base.from, to: base.to, snapshotId, totalGroups, totalAlerts, groups, members, raw_pages, complete: true,
            gaps: ['告警未命中只描述固定窗口，不能排除故障'] }, receipts)
        } catch (error: any) { businessFailure(context, error); return store(context, 'alerts', 'unknown', { assetId, from: base.from, to: base.to, snapshotId, totalGroups, totalAlerts, groups, members, raw_pages, complete: false, ...errorFields(error), gaps: ['告警只取得部分或未知结构；原错误和原始页已保留，未猜空、截断或去重后声称读全'] }, receipts) }
      },
      management: (_value: Value, _config: Value, context: Context) => ({ ...store(context, 'management-observation', 'unavailable', { executed: false, response_verified: false,
        gaps: ['未核得当前管理侧电源/系统/网卡观察原子；SOC标签和历史探测不能替代本次真实响应'] }), branch: 'unknown', response_verified: false }),
      async capability(value: Value, config: Value, context: Context) {
        const receipts: Value[] = [], call = reader(soc, config, context, receipts), asset = context.shared.scope.asset
        const verified = verifiedResponse(value, context), observation_id = value.observation_id ?? value.id
        try {
          if (!verified) throw new Error('没有本次真实响应，不执行响应后的采集适用性查询')
          const capability = data(await call('master', 'get_soc_asset_collection_capability', { assetId: asset.assetId }))
          if (!object(capability) || capability.assetId !== asset.assetId || !Array.isArray(capability.groups)) throw new Error('采集适用性响应身份或目录结构不一致')
          return { ...store(context, 'collection-capability', capability.groups.length ? 'observed' : 'unknown', {
            assetId: asset.assetId, collection_capability: redact(capability), response_verified: true,
            gaps: capability.groups.length ? ['仅核实来源声明的采集能力，不能据此判断采集运行正常'] : ['来源没有声明采集能力；不能据型号缺失或空目录判断硬件不适用，绑定查询仍保留独立价值'],
          }, receipts), response_verified: true, observation_id }
        } catch (error: any) {
          businessFailure(context, error)
          return { ...store(context, 'collection-capability', 'unknown', { assetId: asset.assetId, ...errorFields(error), gaps: ['适用性未核实，不猜不适用；只有真实响应门禁已满足时才继续独立绑定取证'] }, receipts), response_verified: verified, observation_id }
        }
      },
      async bindings(value: Value, config: Value, context: Context) {
        const receipts: Value[] = [], call = reader(soc, config, context, receipts), asset = context.shared.scope.asset
        try {
          if (!verifiedResponse(value, context)) throw new Error('没有本次真实响应，不执行响应后的采集链核查')
          const reply = await call('ingest', 'get_ingest_devices_by_asset_by_asset_id', { assetId: asset.assetId }), devices = rows(reply)
          if (devices.some(device => device.assetId !== asset.assetId)) throw new Error('采集设备关联与冻结资产不一致')
          const bound = devices.length === 1 && typeof devices[0].deviceId === 'string' && !!devices[0].deviceId.trim()
          return { ...store(context, 'collection-binding', bound ? 'observed' : 'unknown', { devices: redact(devices), response_verified: true,
            gaps: bound ? [] : ['未取得唯一采集设备；空绑定或多候选不默选、不宣称采集正常'] }, receipts), branch: bound ? 'bound' : 'none', response_verified: true, observation_id: value.observation_id ?? value.id, ...(bound ? { deviceId: devices[0].deviceId, items: [...COLLECTION_ITEMS] } : {}) }
        } catch (error: any) { businessFailure(context, error); return { ...store(context, 'collection-binding', 'failed', { ...errorFields(error) }, receipts), branch: 'none', response_verified: false } }
      },
      runState: queryCollection('get_admin_ingest_devices_run_state', 'collection-run-state'),
      configState: queryCollection('get_admin_ingest_devices_plugin_configs', 'collection-config'),
      heartbeat: gap('raw-heartbeat', '未核得该对象原始心跳原子；lastSeenAt或任务状态不是原始心跳'),
      synchronization: gap('state-synchronization', '未核得该对象源状态事件与SOC同步关联；资产updateTime不能替代同步观测'),
      unknownPath: path, noReplyPath: path,
      unknownGap: gap('unknown-management', '没有本次管理/网络响应，不能判断电、物理离线或设备正常；未释放响应后的采集检查'),
      noReplyGap: gap('unanswered-observation', '无响应不直接判断电；只保留实际观察和已关联路径证据，采集后继未执行'),
      branchResult: (value: Value, _config: Value, context: Context) => branchResult(value, context),
      summary(value: Value, _config: Value, context: Context) {
        const root = context.nodeId.slice(0, context.nodeId.lastIndexOf('/'))
        const resolved = requiredFact(context, `${root}/resolve`, 'resolve')
        if (resolved.ready !== true || !Array.isArray(value.items) || value.items.length !== OFFLINE_ITEMS.length) throw new Error('根汇总要求唯一对象和三项完整批次结果')
        const ids = [`${root}/resolve`]
        for (const [index, item] of OFFLINE_ITEMS.entries()) ids.push(...validateBranch(value.items[index], `${root}/offline-batch[${index}]`, item, index, context))
        const actual = Object.keys(context.shared.facts)
        if (new Set(ids).size !== ids.length || actual.length !== ids.length || actual.some(id => !ids.includes(id))) throw new Error('根汇总事实缺失、重复、跨Run或混入未选分支')
        const result = { ...report(context, context.nodeId), branch_results: value.items }
        progress(context, { status: 'completed', result })
        return result
      },
      blocked(_value: Value, _config: Value, context: Context) {
        const root = context.nodeId.slice(0, context.nodeId.lastIndexOf('/'))
        const resolved = requiredFact(context, `${root}/resolve`, 'resolve')
        if (resolved.ready !== false || Object.keys(context.shared.facts).length !== 1) throw new Error('解析阻塞终态混入依赖检查')
        const result = report(context, context.nodeId)
        progress(context, { status: 'completed', result })
        return result
      },
    },
    artifacts(result: Value) {
      const body = renderTroubleshootingReport(result)
      return [{ id: 'report', filename: 'device-offline-report.html', contentType: 'text/html; charset=utf-8', body },
        { id: 'details', filename: 'device-offline-details.json', contentType: 'application/json', body: JSON.stringify(result, null, 2) }]
    },
  }
  Object.assign(workflow.components, offlineEvidenceLoop(workflow.components,reassess))
  return workflow
}
