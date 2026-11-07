import { isIP } from 'node:net'
import { unpack, rows, type Soc } from '../../../src/action-api.ts'

type Value = Record<string, any>
type Context = { runId: string; nodeId: string; signal: AbortSignal; shared: Value; progress(value: Value): void; call<T>(call: () => Promise<T>): Promise<T> }
const endpoint = { type: 'object', additionalProperties: false, required: ['ip'], properties: { ip: { type: 'string', minLength: 1 }, assetId: { type: 'integer', minimum: 1 } } }
export const inputSchema = { type: 'object', additionalProperties: false, required: ['asset', 'from', 'to'], properties: {
  asset: endpoint, observer: endpoint,
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
  const id = context.nodeId
  if (Object.hasOwn(context.shared.facts, id)) throw new Error(`检查节点重复完成：${id}`)
  const fact = { id, node_id: id, path: id.slice(0, id.lastIndexOf('/')), check, status, run_id: context.runId, recorded_at: new Date().toISOString(), observed_at: null, source_timezone: 'unknown',
    execution_point: { kind: receipts.length ? 'SOC_READONLY' : 'PLATFORM_ANALYSIS', services: [...new Set(receipts.map(receipt => receipt.serverId))] },
    raw_receipt_refs: receipts.map(receipt => ({ run_id: context.runId, node_id: id, receipt_id: receipt.id })), ...facts }
  // 先调用既有Run progress；该调用失败则不返回，不释放后继。沿用平台实际持久化语义，不新增存储或flush。
  progress(context, { status: 'completed', completed: 1, total: 1, result: { kind: 'fault-check', status, item_count: 1, items: [fact], raw_receipts: receipts } })
  context.shared.facts[id] = fact
  for (const receipt of receipts) context.shared.receipts[receipt.id] = receipt
  return fact
}
function reader(soc: Soc, config: Value, context: Context, receipts: Value[]) {
  return async (alias: string, operation: string, args: Value) => {
    const serverId = config.connections[alias]
    if (!serverId) throw new Error(`缺少连接：${alias}`)
    const started_at = new Date().toISOString(), id = `${context.nodeId}:receipt:${receipts.length}`
    let raw: any
    try { raw = await context.call(() => soc(serverId, operation, args, AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]), context.shared.connection_fingerprints[serverId])) }
    catch (error: any) {
      context.signal.throwIfAborted()
      receipts.push({ id, serverId, operation, arguments: structuredClone(args), started_at, received_at: new Date().toISOString(), ...errorFields(error), receipt: redact(error?.receipt ?? null) })
      progress(context, { status: 'running', raw_receipts: receipts })
      throw error
    }
    receipts.push({ id, serverId, operation, arguments: structuredClone(args), started_at, received_at: new Date().toISOString(), receipt: redact(raw) })
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
  const items = (Object.values(context.shared.facts) as Value[]).sort((a, b) => a.id.localeCompare(b.id))
  return { kind: 'device-offline', status: 'incomplete', terminal, run_id: context.runId, input: context.shared.input,
    scope: context.shared.scope ?? { requested: context.shared.input, frozen_at: context.shared.frozen_at },
    message: '仅交付本次已保存只读事实及缺口；无响应不判断断电，SOC在线不判正常，没有实施修复或主动探测。',
    items, item_count: items.length, raw_receipts: Object.values(context.shared.receipts), active_checks_executed: false,
    gaps: items.flatMap(item => item.gaps ?? []), next_check: '按已核对象补足真实管理/网络响应与来源时区；没有原子则保留未执行，不以其他执行点代替。' }
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
  return {
    responseMode: 'complete' as const, inputSchema,
    connections: (config: Value) => [...new Set<string>(Object.values(config.connections))],
    prepare(input: Value, config: Value) {
      input = structuredClone(input)
      if (!object(input) || Object.keys(input).some(key => !['asset', 'observer', 'from', 'to'].includes(key))) throw new Error('输入含未声明字段；不接受模型自填响应事实')
      for (const selector of [input.asset, ...(input.observer === undefined ? [] : [input.observer])]) {
        if (!object(selector) || Object.keys(selector).some(key => !['ip', 'assetId'].includes(key)) || typeof selector.ip !== 'string' || !isIP(selector.ip) || selector.assetId !== undefined && (!Number.isSafeInteger(selector.assetId) || selector.assetId <= 0)) throw new Error('仅接受明确合法IP及可选正整数assetId，不猜域名或观察源')
      }
      if (!timed(input.from) || !timed(input.to) || Date.parse(input.from) >= Date.parse(input.to)) throw new Error('from/to须带时区且from早于to')
      const frozen_at = new Date().toISOString()
      return { input: freeze(input), frozen_at, scope: { requested: freeze(structuredClone(input)), frozen_at }, facts: {}, receipts: {},
        connection_fingerprints: Object.fromEntries(Object.values<string>(config.connections).map(id => [id, soc.fingerprint?.(id)])) }
    },
    components: {
      async resolve(_value: Value, config: Value, context: Context) {
        const receipts: Value[] = [], call = reader(soc, config, context, receipts), input = context.shared.input
        try {
          const asset = await locate(input.asset, call), observer = input.observer ? await locate(input.observer, call) : []
          const ready = asset.length === 1 && (!input.observer || observer.length === 1)
          if (ready) Object.assign(context.shared.scope, {
            asset: { assetId: asset[0].assetId, ip: asset[0].ip, hostAssetId: asset[0].hostAssetId ?? null },
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
          return store(context, 'soc-state', 'unknown', { assetId: asset.assetId, reported_state: reply.online, onlineBasis: reply.onlineBasis,
            stateEvidence: reply.stateEvidence, source_time_evidence: reply.stateEvidence?.signals ?? [],
            gaps: ['SOC在线不代表本次真实响应或业务正常；源时区未核不得以评估时间代替观测时间'] }, receipts)
        } catch (error: any) { businessFailure(context, error); return store(context, 'soc-state', 'failed', { ...errorFields(error) }, receipts) }
      },
      async alerts(_value: Value, config: Value, context: Context) {
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
      const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
      const labels: Record<string, string> = { observed: '已取得证据', unknown: '未知', unavailable: '未执行：能力不可用', failed: '查询失败', partial: '部分完成', incomplete: '证据不完整', completed: '检查完成（非故障恢复）' }
      const names: Record<string, string> = { resolve: '对象定位', 'soc-state': 'SOC状态依据', alerts: '关联告警', 'management-observation': '管理侧观察', 'configuration-path': '配置路径', 'collection-capability': '采集适用性', 'collection-binding': '采集绑定', 'collection-run-state': '采集运行态', 'collection-config': '采集配置', 'raw-heartbeat': '原始心跳', 'state-synchronization': '状态同步', 'unknown-management': '管理观察缺口', 'unanswered-observation': '无响应边界' }
      const items: Value[] = Array.isArray(result.items) ? result.items : []
      const scope = result.scope ?? {}, input = result.input ?? {}, asset = scope.asset ?? input.asset ?? {}, observer = scope.observer ?? input.observer
      const summary = (item: Value) => {
        if (item.check === 'resolve') return `设备精确匹配数：${item.exact_matches?.asset ?? '未知'}；观察源精确匹配数：${item.exact_matches?.observer ?? '未指定'}`
        if (item.check === 'soc-state') return `SOC原状态：${item.reported_state ?? '未返回'}；依据：${item.onlineBasis ?? '未返回'}。这不是本次管理响应或设备健康结论。`
        if (item.check === 'alerts') return `快照声明告警组：${Number.isSafeInteger(item.totalGroups) ? item.totalGroups : '未知'}；声明告警条数：${Number.isSafeInteger(item.totalAlerts) ? item.totalAlerts : '未知'}；实际已收组／成员：${Array.isArray(item.groups) ? item.groups.length : '未知'}／${Array.isArray(item.members) ? item.members.length : '未知'}；完整性：${item.complete === true ? '固定快照已核对' : '不完整'}${item.error ? `；原错误：${item.error}` : ''}。不完整数量不作完整告警结论。`
        if (item.check === 'collection-capability') return `来源声明的能力组：${item.collection_capability?.groups?.length ?? '未知'}；空目录不等于设备不可采。`
        if (item.check === 'collection-binding') return `已返回采集设备候选：${Array.isArray(item.devices) ? item.devices.length : '未知'}；不等于采集正常。`
        if (item.check === 'configuration-path') return `配置模型结论：${item.evidence?.verdict ?? item.evidence?.diagnosis?.verdict ?? '未知'}；只解释已有IP对模型，不证明实际响应或断电。`
        if (item.error) return String(item.error)
        if (item.executed === false) return '本项未执行；未将缺失结果解释为正常。'
        if (Array.isArray(item.evidence)) return `已返回记录：${item.evidence.length}条；其时效及适用性仍须核对。`
        return item.message ?? item.reason ?? '本项事实与原始来源已保留，详见下方可展开明细。'
      }
      const gaps = items.flatMap(item => (Array.isArray(item.gaps) ? item.gaps : ['unknown', 'unavailable', 'failed', 'partial'].includes(item.status) ? [item.error ?? item.message ?? '本项证据不足'] : []).map((reason: any) => ({ check: names[item.check] ?? item.check, reason: String(reason) })))
      const checks = items.map(item => `<tr><td>${escape(names[item.check] ?? item.check)}</td><td>${escape(labels[item.status] ?? item.status)}</td><td>${escape(summary(item))}</td><td>${escape(item.recorded_at ?? '未提供')}<br><small>仅为记录时间；源观测及未知时区保留在详情</small></td></tr>`).join('')
      const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>设备不在线排查报告</title><style>body{font:16px/1.65 system-ui;color:#20242c;max-width:1120px;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;border-bottom:1px solid #ddd;padding:.65rem}dt{font-weight:600}dd{margin:0 0 .7rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}.notice{padding:.8rem;background:#fff4da}small{color:#586174}details{margin-top:1rem}</style></head><body>
<h1>设备不在线排查报告</h1><p class="notice">当前状态：${escape(labels[result.status] ?? result.status)}。无响应不判断断电，SOC在线不代表设备正常；未实施修复或主动探测。</p>
<h2>排查对象</h2><dl><dt>设备</dt><dd>${escape(asset.ip ?? '未唯一定位')} · 资产 ${escape(asset.assetId ?? '未核实')}</dd><dt>已有配置路径观察源</dt><dd>${escape(observer?.ip ?? '未指定；不猜源地址')}</dd><dt>查询窗口</dt><dd>${escape(input.from)} 至 ${escape(input.to)}</dd><dt>原运行</dt><dd>${escape(result.run_id)}</dd></dl>
<h2>已得证据与各项状态</h2><p>已保存 ${items.length} 项检查记录；“未知”“未执行”和“查询失败”均不视为正常。</p><table><thead><tr><th>检查</th><th>状态</th><th>已得证据／说明</th><th>记录时间</th></tr></thead><tbody>${checks || '<tr><td colspan="4">尚无已保存检查事实</td></tr>'}</tbody></table>
<h2>证据缺口</h2><ul>${gaps.map(gap => `<li><strong>${escape(gap.check)}</strong>：${escape(gap.reason)}</li>`).join('') || '<li>未记录额外缺口；这不代表所有检查已经完成。</li>'}</ul>
<h2>下一步</h2><ol><li>${escape(result.next_check ?? '沿本对象和原运行补充缺失证据，不自动重跑。')}</li><li>核实来源时区、原始心跳及状态同步；不把查询时间或资产更新时间当源观测时间。</li><li>核对管理观察与采集绑定证据；没有本次真实响应时，不以SOC标签或无回复推断设备电源状态。</li></ol>
<details><summary>展开原始回执、完整事实与技术标识</summary><pre>${escape(JSON.stringify(result, null, 2))}</pre></details><p><small>本报告记录已有证据和缺口，不表示故障已修复；查看原报告不会启动新诊断。</small></p></body></html>`
      return [{ id: 'report', filename: 'device-offline-report.html', contentType: 'text/html; charset=utf-8', body }, { id: 'details', filename: 'device-offline-details.json', contentType: 'application/json', body: JSON.stringify(result, null, 2) }]
    },
  }
}
