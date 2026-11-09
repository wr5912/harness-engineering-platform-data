import { isIP } from 'node:net'
import { unpack, rows, type Soc } from '../../../src/action-api.ts'
import { renderTroubleshootingReport } from '../../../src/reports/troubleshooting.ts'

type Value = Record<string, any>
export const branchItems = Object.freeze(['source-state', 'target-state', 'source-alerts', 'target-alerts', 'path', 'tcp'] as const)
type Context = { runId: string; nodeId: string; signal: AbortSignal; shared: Value; progress(value: Value): void; call<T>(call: () => Promise<T>): Promise<T> }
const endpoint = { type: 'object', additionalProperties: false, required: ['ip'], properties: { ip: { type: 'string', minLength: 1 }, assetId: { type: 'integer', minimum: 1 } } }
export const inputSchema = { type: 'object', additionalProperties: false, required: ['source', 'target', 'protocol', 'port', 'from', 'to'], properties: {
  source: endpoint, target: endpoint, protocol: { type: 'string', enum: ['tcp', 'udp'] }, port: { type: 'integer', minimum: 1, maximum: 65535 },
  from: { type: 'string', description: '告警及已有证据窗口起点，ISO-8601且带Z或UTC偏移。' }, to: { type: 'string', description: '固定窗口终点，ISO-8601且带Z或UTC偏移。' },
} }
const timed = (value: unknown): value is string => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value))
const object = (value: any): value is Value => value !== null && typeof value === 'object' && !Array.isArray(value)
function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact)
  if (!object(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, /password|access.?token|api.?key|secret|private.?key/i.test(key) ? '[REDACTED]' : redact(entry)]))
}
function recordProgress(context: Context, value: Value) {
  try { context.progress(value) }
  catch (cause: any) { throw Object.assign(new Error(cause instanceof Error ? cause.message : String(cause)), { cause, persistenceFailure: true }) }
}
function store(context: Context, check: string, status: string, facts: Value, receipts: Value[] = []) {
  context.signal.throwIfAborted()
  const id = context.nodeId
  if (Object.hasOwn(context.shared.facts, id)) throw new Error(`检查节点重复完成：${id}`)
  const fact = { id, check, status, run_id: context.runId, recorded_at: new Date().toISOString(), observed_at: null, source_timezone: 'unknown',
    execution_point: { kind: receipts.length ? 'SOC_READONLY' : 'PLATFORM_ANALYSIS', services: [...new Set(receipts.map(receipt => receipt.serverId))] },
    raw_receipt_refs: receipts.map(receipt => ({ run_id: context.runId, node_id: id, receipt_id: receipt.id })), ...facts }
  // 组件返回前调用既有progress；失败则抛出。此调用顺序不是运行时即时调度或并行的验证。
  recordProgress(context, { status: 'completed', completed: 1, total: 1, result: { kind: 'fault-check', status, item_count: 1, items: [fact], raw_receipts: receipts } })
  context.shared.facts[id] = fact
  for (const receipt of receipts) context.shared.receipts[receipt.id] = receipt
  return fact
}
function report(input: Value, context: Context, terminal: string) {
  const items = (Object.values(context.shared.facts) as Value[]).sort((left, right) => left.id.localeCompare(right.id))
  return { kind: 'business-access', status: 'incomplete', terminal, run_id: context.runId, input, scope: context.shared.scope,
    message: '仅完成本次已执行的只读取证；没有主动TCP结果，不判断业务正常、故障唯一根因或已修复。',
    items, item_count: items.length, raw_receipts: Object.values(context.shared.receipts), active_checks_executed: false,
    gaps: items.filter(item => ['unknown', 'unavailable', 'failed', 'partial'].includes(item.status)).map(item => ({ check: item.check, status: item.status, reason: item.message ?? item.reason })),
    recovery: '按原run_id查询已完成节点与原HTML，不重新诊断；本包不提交外部写请求。' }
}
function artifacts(result: Value) {
  const body = renderTroubleshootingReport(result)
  return [{ id: 'report', filename: 'business-access-report.html', contentType: 'text/html; charset=utf-8', body },
    { id: 'details', filename: 'business-access-details.json', contentType: 'application/json', body: JSON.stringify(result, null, 2) }]
}

export function create(soc: Soc) {
  async function read(alias: string, operation: string, args: Value, config: Value, context: Context, receipts: Value[]) {
    const serverId = config.connections[alias], started_at = new Date().toISOString()
    const id = `${context.nodeId}:receipt:${receipts.length + 1}`
    let raw: any
    try {
      if (!serverId) throw new Error(`未绑定只读连接：${alias}`)
      raw = await context.call(() => soc(serverId, operation, args, AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]), context.shared.connection_fingerprints[serverId]))
      const value = unpack(raw)
      receipts.push({ id, serverId, operation, arguments: args, started_at, finished_at: new Date().toISOString(), raw: redact(raw), request_id: null, execution_id: null })
      recordProgress(context, { status: 'running', result: { kind: 'fault-evidence', items: [], raw_receipts: receipts } })
      return value
    } catch (error: any) {
      if (error?.persistenceFailure) throw error
      context.signal.throwIfAborted()
      receipts.push({ id, serverId, operation, arguments: args, started_at, finished_at: new Date().toISOString(), raw: redact(error.receipt ?? raw ?? null), error: String(error.message), request_id: null, execution_id: null })
      recordProgress(context, { status: 'running', result: { kind: 'fault-evidence', items: [], raw_receipts: receipts } })
      throw error
    }
  }
  async function resolveOne(request: Value, config: Value, context: Context, receipts: Value[]) {
    const candidates = new Map<number, Value>()
    let expected: number | undefined
    for (let pageNum = 1; ; pageNum++) {
      const reply = await read('master', 'list_soc_asset', { ip: request.ip, pageNum, pageSize: 100, includeUnits: true }, config, context, receipts)
      const page = rows(reply), total = reply.total ?? reply.data?.total
      if (!Number.isSafeInteger(total) || total < 0 || expected !== undefined && expected !== total) throw new Error('资产分页总数缺失或变化，未用部分候选决定对象')
      expected = total
      for (const candidate of page) {
        if (!Number.isSafeInteger(candidate.assetId) || candidate.assetId <= 0 || candidates.has(candidate.assetId)) throw new Error('资产分页含无效或重复ID，未以去重掩盖不完整分页')
        candidates.set(candidate.assetId, candidate)
      }
      if (candidates.size > total || !page.length && candidates.size < total) throw new Error('资产分页不完整')
      if (candidates.size === total) break
    }
    const matches = [...candidates.values()].filter(asset => asset.ip === request.ip && (request.assetId === undefined || asset.assetId === request.assetId))
    if (matches.length !== 1) throw new Error(`资产不能唯一精确匹配已确认IP/ID：${request.ip}`)
    return matches[0]
  }
  async function status(which: 'source' | 'target', config: Value, context: Context) {
    const receipts: Value[] = [], asset = context.shared.assets[which]
    try {
      const reply = await read('master', 'get_soc_asset_by_asset_id', { assetId: asset.assetId }, config, context, receipts), current = reply.data
      if (current?.assetId !== asset.assetId || current?.ip !== asset.ip) throw new Error('状态返回对象与冻结资产不一致')
      const evidence = current.stateEvidence
      const observed = Array.isArray(evidence?.signals) ? evidence.signals.map((signal: Value) => ({ source: signal.source, observedAt: signal.observedAt, validity: signal.validity, supportsOnline: signal.supportsOnline })) : []
      return store(context, `${which}-soc-state`, 'unknown', { assetId: asset.assetId, ip: asset.ip, online: current.online, onlineBasis: current.onlineBasis,
        stateEvidence: evidence ?? null, source_observations: observed, message: '保留SOC状态来源；不以在线标签或历史探测代替本次响应。DATABASE_LOCAL未核时区或心跳/同步缺口均不判正常。' }, receipts)
    } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); return store(context, `${which}-soc-state`, 'failed', { assetId: asset.assetId, ip: asset.ip, message: String(error.message) }, receipts) }
  }
  async function alerts(which: 'source' | 'target', config: Value, context: Context) {
    const receipts: Value[] = [], asset = context.shared.assets[which], groups: Value[] = [], members: Value[] = []
    let snapshotId: string | undefined, expected: number | undefined, expectedAlerts: number | undefined
    const groupKeys = new Set<string>()
    try {
      for (let pageNum = 1; ; pageNum++) {
        const reply = await read('detect', 'list_detect_alert', { req: { assetId: String(asset.assetId), from: context.shared.input.from, to: context.shared.input.to, pageNum, pageSize: 100, ...(snapshotId ? { snapshotId } : {}) } }, config, context, receipts)
        const page = reply.data
        if (!object(page) || !Array.isArray(page.groups) || !Number.isSafeInteger(page.totalGroups) || page.totalGroups < 0 || page.truncated !== false || typeof page.snapshotId !== 'string' || !timed(page.asOf)) throw new Error('告警缺少完整分页、快照或明确时间合同')
        if (snapshotId && snapshotId !== page.snapshotId || expected !== undefined && expected !== page.totalGroups) throw new Error('告警快照或总组数发生变化')
        snapshotId = page.snapshotId; expected = page.totalGroups
        if (!Number.isSafeInteger(page.totalAlerts) || page.totalAlerts < 0 || expectedAlerts !== undefined && expectedAlerts !== page.totalAlerts) throw new Error('告警总条数缺失或变化')
        expectedAlerts = page.totalAlerts
        for (const group of page.groups) {
          if (typeof group.groupKey !== 'string' || groupKeys.has(group.groupKey)) throw new Error('告警组缺少唯一groupKey，未猜字段或去重')
          groupKeys.add(group.groupKey); groups.push(group)
        }
        if (groups.length > expected || !page.groups.length && groups.length < expected) throw new Error('告警组分页未完整返回')
        if (groups.length === expected) break
      }
      let memberCount = 0
      for (const group of groups) {
        const collected: any[] = [], seenCursors = new Set<string>(), seenMembers = new Set<string>()
        const memberRecord = { groupKey: group.groupKey, items: collected, complete: false }
        members.push(memberRecord)
        let cursor: string | undefined, total: number | undefined
        for (let pageNum = 1; ; pageNum++) {
          const reply = await read('detect', 'get_detect_alert_group_members', { req: { assetId: String(asset.assetId), from: context.shared.input.from, to: context.shared.input.to, snapshotId, groupKey: group.groupKey, pageNum, pageSize: 100, ...(cursor ? { cursor } : {}) } }, config, context, receipts)
          const page = reply.data
          if (!object(page) || page.truncated === true || page.snapshotId !== undefined && page.snapshotId !== snapshotId || page.groupKey !== undefined && page.groupKey !== group.groupKey) throw new Error('告警成员返回截断、错组或快照变化')
          // 只接受明确且不冲突的结构化列表；无法核清输出合同就保留partial，不猜成空结果。
          const listFields = ['items', 'members', 'rows', 'records'].filter(key => Array.isArray(page[key]))
          if (listFields.length !== 1) throw new Error('告警成员列表合同未知或歧义；原回执已保存，未宣称成员完整')
          const list = page[listFields[0]], pageTotal = page.total ?? page.totalAlerts
          if (pageTotal !== undefined) {
            if (!Number.isSafeInteger(pageTotal) || pageTotal < 0 || total !== undefined && total !== pageTotal) throw new Error('告警成员总数无效或变化')
            total = pageTotal
          }
          for (const member of list) {
            const key = typeof member.alertId === 'string' || Number.isSafeInteger(member.alertId) ? `alert:${member.alertId}` : typeof member.id === 'string' || Number.isSafeInteger(member.id) ? `id:${member.id}` : JSON.stringify(member)
            if (seenMembers.has(key)) throw new Error('告警成员跨页重复，未以去重掩盖分页异常')
            seenMembers.add(key); collected.push(member)
          }
          if (total !== undefined && collected.length > total) throw new Error('告警成员条数超过声明总数')
          if (Object.hasOwn(page, 'nextCursor')) {
            const next = page.nextCursor
            if (next !== null && next !== '' && next !== undefined) {
              if (typeof next !== 'string' || !list.length || seenCursors.has(next)) throw new Error('告警成员游标无效、重复或未推进')
              seenCursors.add(next); cursor = next; continue
            }
            if (total !== undefined && collected.length !== total) throw new Error('告警成员游标提前结束，未完整返回')
            break
          }
          if (total === undefined) throw new Error('告警成员没有可核终止游标或总数，不将首页当完整结果')
          if (collected.length === total) break
          if (!list.length) throw new Error('告警成员分页提前为空，未完整返回')
        }
        memberRecord.complete = true; memberCount += collected.length
      }
      if (memberCount !== expectedAlerts) throw new Error('完整组成员数与快照总告警数不一致，保留覆盖缺口')
      return store(context, `${which}-alerts`, 'observed', { assetId: asset.assetId, ip: asset.ip, snapshotId, totalGroups: expected, totalAlerts: expectedAlerts, groups, groupMemberResponses: members, member_count: memberCount,
        from: context.shared.input.from, to: context.shared.input.to, message: groups.length ? '已在同一窗口和快照下续读所有组页及可核完整的成员页；仅为告警事实，不直接判根因。' : '该对象固定窗口内无告警组且未截断；不证明无故障。' }, receipts)
    } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); return store(context, `${which}-alerts`, 'partial', { assetId: asset.assetId, ip: asset.ip, snapshotId: snapshotId ?? null, groups, groupMemberResponses: members, totalGroups: expected ?? null, totalAlerts: expectedAlerts ?? null, message: String(error.message) }, receipts) }
  }
  function gap(check: string, message: string, context: Context) {
    return store(context, check, 'unavailable', { executed: false, message, source_observation: null })
  }
  function join(input: Value, context: Context, count: number, name: string) {
    if (!Array.isArray(input.values) || input.values.length !== count || new Set(input.values.map((value: Value) => value.id)).size !== count) throw new Error(`${name}局部汇合输入数量或身份不符`)
    return { kind: name, values: input.values }
  }
  function summary(input: Value, _config: Value, context: Context) {
    if (!Array.isArray(input.items) || input.items.length !== branchItems.length || input.items.some((item: Value, index: number) => item?.branch !== branchItems[index])) throw new Error('原生批次结果缺项、重复或顺序与冻结检查项不一致')
    return { ...report(context.shared.input, context, 'batch-summary'), branches: input.items }
  }
  const finish = (name: string) => (_input: Value, _config: Value, context: Context) => report(context.shared.input, context, name)
  return {
    inputSchema,
    connections: (config: Value) => [...new Set<string>(Object.values(config.connections))],
    prepare(input: Value, config: Value) {
      if (!isIP(input.source?.ip ?? '') || !isIP(input.target?.ip ?? '') || !['tcp', 'udp'].includes(input.protocol) || !Number.isSafeInteger(input.port) || input.port < 1 || input.port > 65535) throw new Error('必须提供已确认的源/目标IP、协议和单个端口；缺DNS不猜IP')
      if (!timed(input.from) || !timed(input.to) || Date.parse(input.from) >= Date.parse(input.to)) throw new Error('证据窗口必须为带时区且有序的ISO-8601时间')
      return { input: structuredClone(input), scope: { requested: structuredClone(input), frozen_at: new Date().toISOString(), source: structuredClone(input.source), target: structuredClone(input.target), protocol: input.protocol, port: input.port, from: input.from, to: input.to }, assets: {}, facts: {}, receipts: {}, connection_fingerprints: Object.fromEntries(Object.values<string>(config.connections).map(id => [id, soc.fingerprint?.(id)])) }
    },
    artifacts,
    components: {
      async resolve(input: Value, config: Value, context: Context) {
        const receipts: Value[] = []
        try {
          // 同一节点顺序限定两次对象解析，不做全库枚举，不跨Run复用结果。
          const frozen = context.shared.input
          const source = await resolveOne(frozen.source, config, context, receipts), target = await resolveOne(frozen.target, config, context, receipts)
          context.shared.assets = { source, target }
          Object.assign(context.shared.scope, { source: { assetId: source.assetId, ip: source.ip }, target: { assetId: target.assetId, ip: target.ip } })
          store(context, 'unique-endpoints', 'observed', { source: { assetId: source.assetId, ip: source.ip, hostname: source.hostname }, target: { assetId: target.assetId, ip: target.ip, hostname: target.hostname }, message: '源、目标已由完整限定候选唯一解析。' }, receipts)
          return { ready: true, items: [...branchItems] }
        } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); store(context, 'unique-endpoints', 'unknown', { message: String(error.message) }, receipts); return { ready: false, items: [] } }
      },
      sourceState: (_input: Value, config: Value, context: Context) => status('source', config, context),
      targetState: (_input: Value, config: Value, context: Context) => status('target', config, context),
      sourceAlerts: (_input: Value, config: Value, context: Context) => alerts('source', config, context),
      targetAlerts: (_input: Value, config: Value, context: Context) => alerts('target', config, context),
      branchResult(input: Value, _config: Value, context: Context) {
        if (!branchItems.includes(input.branch)) throw new Error('分支终态不属于冻结检查项')
        return { branch: input.branch, terminal: context.nodeId, value: input.value }
      },
      summary,
      async path(_input: Value, config: Value, context: Context) {
        const receipts: Value[] = [], input = context.shared.input
        try {
          const reply = await read('graph', 'get_graph_path_query', { srcIp: input.source.ip, dstIp: input.target.ip, port: input.port, protocol: input.protocol }, config, context, receipts), value = reply.data
          if (!object(value)) throw new Error('路径返回缺少data对象')
          const diagnosis = value.diagnosis
          const exact = diagnosis?.sourceIp === input.source.ip && diagnosis?.targetIp === input.target.ip && diagnosis?.port === input.port && diagnosis?.protocol === input.protocol && diagnosis?.portEvaluated === true
          return store(context, 'configuration-path', exact && ['ALLOW', 'DENY', 'REACHABLE', 'BLOCKED'].includes(diagnosis.verdict) ? 'observed' : 'unknown', { model: value, exactConnectionEvaluated: exact, message: '仅保留配置路径模型、原始判据和缺口；不是当前源端连接，不以reachable=false覆盖UNKNOWN，不从NAT候选扩张对象。' }, receipts)
        } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); return store(context, 'configuration-path', 'failed', { message: String(error.message) }, receipts) }
      },
      sourceTcp(_input: Value, _config: Value, context: Context) {
        const fact = gap('current-source-tcp', '本草稿仅只读；未执行主动TCP，也没有本Run核验过的当前源端结果。动作目录启用标志不代表真机可用，不能用历史SOC探测代替。', context)
        return { route: 'UNKNOWN', fact }
      },
      application: (_input: Value, _config: Value, context: Context) => gap('application-response', '尚无已核应用/DNS原子；未发HTTP/TLS请求，TCP成功也不能判业务正常。', context),
      listener: (_input: Value, _config: Value, context: Context) => gap('target-current-listener', '缺少已核目标端当前监听原子；不把历史记录或空列表当本次未监听。', context),
      service: (_input: Value, _config: Value, context: Context) => gap('target-service', '缺少已核服务身份、进程及关联日志原子；未执行服务检查或修复。', context),
      refusalJoin: (input: Value, _config: Value, context: Context) => join(input, context, 2, '拒绝连接补证'),
      route: (_input: Value, _config: Value, context: Context) => gap('current-source-route', '缺少已核真实源端当前路由/ICMP原子；未执行额外探测，不从超时判断网络断点。', context),
      destination: (_input: Value, _config: Value, context: Context) => gap('current-destination-observation', '没有目标本次真实响应或管理侧原子；SOC在线/离线不等同电源或服务状态。', context),
      timeoutJoin: (input: Value, _config: Value, context: Context) => join(input, context, 2, '超时补证'),
      unavailable: (_input: Value, _config: Value, context: Context) => gap('tcp-followup-not-executed', '当前TCP结果不可用，未假定成功、拒绝或超时；三类后继均不冒充已执行。其他已保存检查事实另列，不以TCP未知替代其结果。', context),
      blockedResult: finish('identity-blocked'),
    },
  }
}
