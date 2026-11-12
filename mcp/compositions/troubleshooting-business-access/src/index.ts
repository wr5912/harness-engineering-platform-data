import { isIP } from 'node:net'
import { evidenceLoop } from './evidence-loop.ts'
import { controlledDiagnosticProposal } from '../../../src/controlled-diagnostic-proposal.ts'
import { businessConfirmCriteria, normalizeDiagnosticAtoms } from '../../../src/diagnostic-atoms.ts'
import { unpack, rows, type Soc } from '../../../src/action-api.ts'
import { renderTroubleshootingReport } from '../../../src/reports/troubleshooting.ts'
import { buildConclusion } from '../../../src/reports/conclusion.ts'
import { escapeHtml } from '../../../src/reports/common.ts'
import { diagnosticTime, candidateStates, evaluateCandidate } from '../../../src/diagnostic-context.ts'

type Value = Record<string, any>
/** 按当前真实响应结构给具体缺口；SOC自带gaps与日志窗原样保留。 */
export function evidenceSummary(input: Value) {
      const p = input.payload ?? {}, iso = (v: any) => Number.isFinite(v) ? new Date(v).toISOString() : null
      const list = (v: any) => Array.isArray(v) ? v : []
      if (input.check === 'portEvidence') {
        const empty = !p.recordedAt && !p.source && !p.service
        return { status: p.status ?? 'unknown', source_window: null, gaps: [
          `SOC端口证据 status=${p.status ?? '缺失'}${empty ? '，recordedAt/source/service 均为空' : ''}`,
          '端口无记录不等于未监听；也不证明端口开放或服务正常'] }
      }
      if (input.check === 'policyEvidence') {
        const exact = list(p.exact), destination = list(p.destination)
        return { status: p.status ?? 'unknown', source_window: p.sinceEpochMs ? { from: iso(p.sinceEpochMs), scope: 'POLICY_FLOW', note: 'SOC日志查询起始，不等于用户故障起点或历史窗' } : null, gaps: [
          `SOC策略流证据 status=${p.status ?? '缺失'}，exact=${exact.length}项，destination=${destination.length}项`,
          exact.length || destination.length ? '静态候选策略不等于实际生效，未证明该五元组被阻断' : '无精确目的项可评估；空结果不证明放行，也不证明阻断'] }
      }
      if (input.check === 'pathEvidence') {
        const tv = p.trafficEvidence ?? {}, candidates = list(p.candidatePolicies)
        const applicability = [...new Set(candidates.map((c: Value) => c?.applicability).filter(Boolean))].join('/') || '无候选'
        return { status: p.status ?? 'unknown', source_window: Number.isFinite(tv.windowStartMs) || Number.isFinite(tv.windowEndMs) ? { from: iso(tv.windowStartMs), to: iso(tv.windowEndMs), scope: tv.scope ?? '未知范围', note: 'SOC返回的日志查询窗，不代表用户故障起点或历史窗' } : null, gaps: [
          `pathEvidence sameSessionConfirmed=${p.sameSessionConfirmed === true}，logQueryAttempts=${p.logQueryAttempts ?? 0}，probeWindowRequested=${p.probeWindowRequested === true}`,
          ...list(tv.gaps),
          `候选策略${candidates.length}项，applicability=${applicability}；适用性未确认，不作为策略阻断确认`] }
      }
      if (input.check === 'routeEvidence') {
        return { status: p.status ?? 'unknown', source_window: null, gaps: [
          `SOC路由候选 status=${p.status ?? '缺失'}，candidates=${list(p.candidates).length}项`,
          ...list(p.gaps),
          '静态路由候选不证明实际转发、首跳或回程'] }
      }
      return { status: 'unknown', source_window: null, gaps: ['当前检查无已适配的响应结构；保留原文，不推断'] }
}

// 原生分支分别推进各自的证据依赖；这里只核对最终终结分支，不生成固定检查清单。
export const branchItems = Object.freeze(['source', 'target', 'path'] as const)
const optionalBranchItems = Object.freeze(['source-state', 'target-state', 'source-alerts', 'target-alerts', 'path', 'tcp'] as const)
const acceptedBranchItems = new Set([...branchItems, ...optionalBranchItems])
const causeDefinitions = [
  ['source-abnormal', '源端异常'], ['target-offline', '目标离线'],
  ['service-not-listening', '服务未监听'], ['policy-block', '策略阻挡'],
  ['link-abnormal', '链路异常'], ['authentication', '认证问题'], ['insufficient-evidence', '证据不足'],
] as const
const causeStates = candidateStates
const candidateRules = [
  { id: 'source-abnormal', title: '源端异常', support: [{ predicate: 'source-online', value: false }], confirm: [], refute: [{ predicate: 'source-online', value: true }] },
  { id: 'target-offline', title: '目标离线', support: [{ predicate: 'target-online', value: false }], confirm: [], refute: [{ predicate: 'target-online', value: true }] },
  { id: 'service-not-listening', title: '服务未监听', support: [{ predicate: 'listener-state', value: 'not-listening' }], confirm: [], refute: [{ predicate: 'listener-state', value: 'listening' }] },
  { id: 'policy-block', title: '策略阻挡', support: [{ predicate: 'path-verdict', value: 'BLOCKED' }, { predicate: 'path-verdict', value: 'DENY' }], confirm: [], refute: [{ predicate: 'path-verdict', value: 'ALLOW' }, { predicate: 'path-verdict', value: 'REACHABLE' }] },
  { id: 'link-abnormal', title: '链路异常', support: [{ predicate: 'path-verdict', value: 'UNREACHABLE' }], confirm: [], refute: [{ predicate: 'path-verdict', value: 'REACHABLE' }] },
  { id: 'authentication', title: '认证问题', support: [{ predicate: 'business-auth', value: 'failed' }], confirm: [], refute: [{ predicate: 'business-auth', value: 'passed' }] },
  { id: 'insufficient-evidence', title: '证据不足', support: [], confirm: [], refute: [] },
] as const
const allowedReads = Object.freeze({ master: ['list_soc_asset', 'get_soc_asset_by_asset_id', 'get_soc_asset_port_evidence', 'get_soc_asset_collection_capability', 'get_soc_asset_online_transitions'], detect: ['list_detect_alert', 'get_detect_alert_group_members'], graph: ['get_graph_path_query', 'get_reachability_route_candidates', 'get_reachability_policy_flow_evidence', 'get_graph_path_evidence'] })
const policy = Object.freeze({ readonly: true, active_probes: false, automatic_remediation: false, request_limit: 48, max_branch_rounds: 2 })
type Context = { runId: string; nodeId: string; signal: AbortSignal; shared: Value; progress(value: Value): void; call<T>(call: () => Promise<T>): Promise<T> }
const endpoint = { type: 'object', additionalProperties: false, required: ['ip'], properties: { ip: { type: 'string', minLength: 1 }, assetId: { type: 'integer', minimum: 1 } } }
export const inputSchema = { type: 'object', additionalProperties: false, required: ['source', 'target', 'protocol', 'port'], properties: {
  source: endpoint, target: endpoint, protocol: { type: 'string', enum: ['tcp', 'udp'] }, port: { type: 'integer', minimum: 1, maximum: 65535 },
  resume_run_id: { type: 'string', pattern: '^run-[0-9a-f-]{36}$', description: '公开延续入口：继承同冻结范围、同版本已保存诊断；未知执行不重放。' },
   faultStartedAt: { type: ['string', 'null'], description: '故障开始时间；未知可省略或null，不阻挡当前状态检查。' },
  from: { type: 'string', description: '可选历史证据查询窗，与to同时提供；不代表故障起点。' }, to: { type: 'string', description: '固定窗口终点，ISO-8601且带Z或UTC偏移。' },
} }
const timed = (value: unknown): value is string => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value))
const object = (value: any): value is Value => value !== null && typeof value === 'object' && !Array.isArray(value)
function redact(value: any): any {
  if (Array.isArray(value)) return value.map(redact)
  if (typeof value === 'string') return value.replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [REDACTED]').replace(/((?:password|passwd|token|api[_-]?key|secret|authorization|cookie)\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&<>]+)/gi, '$1[REDACTED]')
  if (!object(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, /password|passwd|token|api.?key|secret|private.?key|credential|authorization|cookie/i.test(key) ? '[REDACTED]' : redact(entry)]))
}
function recordProgress(context: Context, value: Value) {
  try { context.progress(value) }
  catch (cause: any) { throw Object.assign(new Error(cause instanceof Error ? cause.message : String(cause)), { cause, persistenceFailure: true }) }
}
function store(context: Context, check: string, status: string, facts: Value, receipts: Value[] = []) {
  context.signal.throwIfAborted()
  const attemptedReceipts = receipts.filter(receipt => receipt.attempted === true)
  const receivedReceipts = attemptedReceipts.filter(receipt => receipt.response_received === true)
  const requestFailed = receipts.some(receipt => receipt.error)
  const requestStarted = attemptedReceipts.length > 0
  const sequence = ++context.shared.evidence_sequence
  const id = `${context.runId}:${context.nodeId}:${sequence}`
  // 快照asOf是读取快照时间，不冒充告警发生或终端观测时间。
  const times = [...(facts.source_observations ?? []).map((entry: Value) => entry.observedAt)].filter(timed)
  const fact = { ...redact(facts), id, node_id: context.nodeId, check, status, run_id: context.runId, recorded_at: new Date().toISOString(),
    observed_at: times.length === 1 ? times[0] : null, source_timezone: times.length === 1 ? times[0].match(/(?:Z|[+-]\d{2}:\d{2})$/i)?.[0] : 'unknown',
    executed: receivedReceipts.length > 0 ? true : requestStarted ? null : false,
    execution_status: !requestStarted ? 'not_executed' : requestFailed ? 'failed' : receivedReceipts.length ? 'completed' : 'unknown',
    business_result: 'inconclusive', protocol: context.shared.input.protocol, port: context.shared.input.port,
    execution_point: { kind: attemptedReceipts.length ? 'SOC_READONLY' : 'PLATFORM_ANALYSIS', services: [...new Set(attemptedReceipts.map(receipt => receipt.serverId))], message: 'SOC查询服务不是业务源终端执行点' },
    applicability: facts.applicability ?? { status: attemptedReceipts.length ? 'applicable' : 'unknown', reason: '只对冻结对象读取既有SOC记录；不推定终端动作可用' },
    source: redact(facts.source) ?? receivedReceipts.map(receipt => ({ source_id: receipt.serverId, name: receipt.operation, id: receipt.id })),
    evidence_sources: receivedReceipts.map(receipt => ({ source_id: receipt.serverId, name: receipt.operation, id: receipt.id })),
    request_attempts: attemptedReceipts.map(receipt => ({ id: receipt.id, source_id: receipt.serverId, name: receipt.operation, response_received: receipt.response_received, status: receipt.error ? 'failed' : 'completed' })),
    gaps: [...(facts.gaps ?? []), ...(!times.length ? [{ status: 'unknown', reason: '上游未提供可核带时区观测时间；查询窗口和记录时间不替代观测时间' }] : [])],
    conflicts: facts.conflicts ?? [], atoms: Array.isArray(facts.atoms) ? facts.atoms : [], raw_receipt_refs: attemptedReceipts.filter(receipt => receipt.response_received).map(receipt => ({ run_id: context.runId, node_id: context.nodeId, receipt_id: receipt.id })) }
  recordProgress(context, { status: 'completed', completed: 1, total: 1, result: { kind: 'fault-check', status, item_count: 1, items: [fact], raw_receipts: receipts } })
  if (context.shared.diagnostic_loop?.defer_append) {
    context.shared.diagnostic_loop.staged.push({ fact, receipts })
  } else {
    context.shared.facts[id] = fact
    for (const receipt of receipts) context.shared.receipts[receipt.id] = receipt
    reassess(context, fact)
  }
  return fact
}
function reassess(context: Context, fact: Value) {
  const all = Object.values<Value>(context.shared.facts)
  const atoms = all.flatMap(item => Array.isArray(item.atoms) ? item.atoms : [])
  const permissionGaps = all.filter(item => /(?:401|403|forbidden|unauthorized|权限拒绝)/i.test(JSON.stringify(item.error ?? item.message ?? ''))).map(item => item.id)
  const causes = candidateRules.map(rule => {
    const objectId = rule.id === 'source-abnormal' ? `asset:${context.shared.assets.source?.assetId}`
      : rule.id === 'target-offline' ? `asset:${context.shared.assets.target?.assetId}` : `pair:${context.shared.input.source.ip}->${context.shared.input.target.ip}`
    // SOC接入认证失败是本次取证停点，不能污染每个业务根因的六态。
    const evaluation = evaluateCandidate({ ...rule, confirm: businessConfirmCriteria[rule.id] ?? [] }, atoms, objectId, [])
    const message = rule.id === 'authentication'
      ? '只有业务应用自身认证原子才可支持该候选；SOC通道401/403仅记录能力/权限缺口。'
      : evaluation.status === 'supported' ? '已有适用、带来源和观测时间的原子支持候选，但尚无完整确认判据。'
      : evaluation.status === 'refuted' ? '已有同对象、同适用时间范围内的反驳原子；仍保留原证据链。'
      : evaluation.status === 'insufficient_capability' ? '仅因明确权限拒绝进入能力/权限不足；传输失败和NO_DATA不作此结论。'
      : '没有满足该候选判据的适用原子；未知不等于反驳。'
    return { ...evaluation, message, support: { status: evaluation.status === 'supported' ? 'supported' : 'unknown', evidence_ids: evaluation.support_evidence_ids },
      refutation: { status: evaluation.status === 'refuted' ? 'refuted' : 'unknown', evidence_ids: evaluation.refutation_evidence_ids } }
  })
  context.shared.causes = causes
  const round = { id: `round-${context.shared.rounds.length + 1}`, node_id: context.nodeId, recorded_at: new Date().toISOString(),
    known_facts: all.map(item => item.id), candidates: structuredClone(causes), evidence_ids: [fact.id], gaps: fact.gaps ?? [],
    distinguishing_next_check: null, next_check: null, reason: fact.message ?? fact.check }
  context.shared.rounds.push(round)
  recordProgress(context, { status: 'completed', result: { kind: 'fault-check', status: fact.status, item_count: 1, items: [fact], raw_receipts: Object.values<Value>(context.shared.receipts).filter(receipt => fact.raw_receipt_refs.some((ref: Value) => ref.receipt_id === receipt.id)), causes, rounds: [round] } })
}
function report(input: Value, context: Context, terminal: string) {
  const confirmed = context.shared.causes.some((cause: Value) => cause.status === 'confirmed') && !context.shared.causes.some((cause: Value) => cause.status === 'conflict')
  const items = (Object.values(context.shared.facts) as Value[]).sort((left, right) => left.id.localeCompare(right.id))
  const readonlyChecksExecuted = items.some(item => item.execution_point?.kind === 'SOC_READONLY' && item.execution_status !== 'not_executed')
  const result: Value = { kind: 'business-access', status: confirmed ? 'complete' : 'incomplete', conclusion: confirmed ? 'confirmed' : 'inconclusive', terminal, run_id: context.runId, diagnostic_id: context.shared.diagnostic_id ?? context.runId, generated_at: new Date().toISOString(), input, scope: context.shared.scope,
    execution_status: 'unverified', readonly_checks_executed: readonlyChecksExecuted, active_probes_executed: false,
    message: '本稿保留冻结对象、时间分离、原子事实、候选状态和每轮判断；外层执行状态仍由受管Run回执确认，业务结论保持无法判定，不代表SOC能力不足或业务故障已确认。',
    items, item_count: items.length, causes: context.shared.causes, rounds: context.shared.rounds, raw_receipts: Object.values(context.shared.receipts),
    gaps: [...items.flatMap(item => item.gaps ?? []), ...items.filter(item => ['unknown', 'unavailable', 'failed', 'partial'].includes(item.status)).map(item => ({ check: item.check, status: item.status, reason: item.message ?? item.reason })),
      { status: 'not_checked', reason: '当前编排未取得真实能力目录、监听/服务原子或主动探测授权；不能据此认定这些能力不存在。主动探测和自动处置明确未执行。' }],
    recommendations: [{ title: '后续复验（未执行）', message: '仅在取得真实只读能力合同、适用性、前置和预算后由用户发起新验收；不改策略、不重启、不自动处置。' }],
    recovery: '按原run_id查询已完成节点与原HTML，不重新诊断；本包不提交外部写请求。' }
  return { ...result, unified_conclusion: buildConclusion(result) }
}
function artifacts(result: Value) {
  const enriched = { ...result, generated_at: new Date().toISOString() }
  const reasoning = { policy: enriched.scope?.policy, candidate_states: causeStates, causes: enriched.causes, rounds: enriched.rounds,
    atoms: enriched.items.map((item: Value) => ({ id: item.id, node_id: item.node_id, source: item.source, applicability: item.applicability, conflicts: item.conflicts, gaps: item.gaps, protocol: item.protocol, port: item.port })) }
  // 仅本包已构造字段；不扩大共享报告白名单，也不将原始回执写入此附录。
  const body = renderTroubleshootingReport(enriched).replace('</body>', `<section><h2>本Run逐次事实、候选与下一检查记录</h2><pre>${escapeHtml(JSON.stringify(reasoning, null, 2))}</pre></section></body>`)
  return [{ id: 'report', filename: 'business-access-report.html', contentType: 'text/html; charset=utf-8', body },
    { id: 'details', filename: 'business-access-details.json', contentType: 'application/json', body: JSON.stringify(enriched, null, 2) }]
}

export function create(soc: Soc) {
  async function read(alias: string, operation: string, args: Value, config: Value, context: Context, receipts: Value[]) {
    const serverId = config.connections[alias], started_at = new Date().toISOString()
    const id = `${context.nodeId}:round:${context.shared.diagnostic_loop?.round ?? 0}:receipt:${receipts.length + 1}`
    let raw: any, attempted = false
    try {
      if (!serverId) throw new Error(`未绑定只读连接：${alias}`)
      if (!(allowedReads as Value)[alias]?.includes(operation)) throw new Error('动作不在本次冻结只读能力中')
      if (context.shared.request_count >= policy.request_limit) throw new Error('本Run只读请求预算已到限；保留已取得事实和未覆盖缺口')
      raw = await context.call(() => {
        if (context.shared.request_count >= policy.request_limit) throw new Error('本Run只读请求预算已到限')
        context.shared.request_count++; attempted = true
        return soc(serverId, operation, args, AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]), context.shared.connection_fingerprints[serverId])
      })
      const value = unpack(raw)
      receipts.push({ id, serverId, operation, attempted, response_received: raw !== undefined, arguments: args, started_at, finished_at: new Date().toISOString(), raw: redact(raw), request_id: value.requestId ?? value.traceId ?? null, execution_id: value.executionId ?? null })
      recordProgress(context, { status: 'running', result: { kind: 'fault-evidence', items: [], raw_receipts: receipts } })
      return value
    } catch (error: any) {
      if (error?.persistenceFailure) throw error
      context.signal.throwIfAborted()
      receipts.push({ id, serverId, operation, attempted, response_received: raw !== undefined, arguments: args, started_at, finished_at: new Date().toISOString(), raw: redact(error.receipt ?? raw ?? null), error: redact(String(error.message)), request_id: null, execution_id: null })
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
        stateEvidence: evidence ?? null, source_observations: observed, assetType: current.assetType ?? asset.assetType ?? null, os: current.os ?? current.osType ?? asset.os ?? null,
        applicability: { status: 'applicable', reason: '既有SOC资产状态查询；不推定该形态具有心跳或终端动作能力', assetType: current.assetType ?? null, os: current.os ?? current.osType ?? null },
        conflicts: [],
        atoms: observed.filter((signal: Value) => timed(signal.observedAt) && signal.validity === 'VALID' && typeof signal.supportsOnline === 'boolean').map((signal: Value, index: number) => ({ id: `${which}-online-${index}`, object_id: `asset:${asset.assetId}`, predicate: `${which}-online`, cause_id: which === 'source' ? 'source-abnormal' : 'target-offline', value: signal.supportsOnline, observed_at: signal.observedAt, applicability: 'applicable', result: 'observed', provenance_verified: true })),
        message: '保留SOC状态来源；不以在线标签或历史探测代替本次响应。DATABASE_LOCAL未核时区或心跳/同步缺口均不判正常。' }, receipts)
    } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); return store(context, `${which}-soc-state`, 'failed', { assetId: asset.assetId, ip: asset.ip, message: String(error.message) }, receipts) }
  }
  async function alerts(which: 'source' | 'target', config: Value, context: Context) {
    if (!context.shared.scope.time.query_window) return store(context, `${which}-alerts`, 'not_checked', { executed: false, gaps: [{ status: 'not_checked', reason: '未提供历史查询窗；不猜时间或发告警请求，当前状态检查独立继续' }] })
    const receipts: Value[] = [], asset = context.shared.assets[which], groups: Value[] = [], members: Value[] = []
    let snapshotId: string | undefined, expected: number | undefined, expectedAlerts: number | undefined, asOf: string | undefined
    const groupKeys = new Set<string>()
    try {
      for (let pageNum = 1; ; pageNum++) {
        const reply = await read('detect', 'list_detect_alert', { req: { assetId: String(asset.assetId), from: context.shared.input.from, to: context.shared.input.to, pageNum, pageSize: 100, ...(snapshotId ? { snapshotId } : {}) } }, config, context, receipts)
        const page = reply.data
        if (!object(page) || !Array.isArray(page.groups) || !Number.isSafeInteger(page.totalGroups) || page.totalGroups < 0 || page.truncated !== false || typeof page.snapshotId !== 'string' || !timed(page.asOf)) throw new Error('告警缺少完整分页、快照或明确时间合同')
        if (snapshotId && snapshotId !== page.snapshotId || expected !== undefined && expected !== page.totalGroups) throw new Error('告警快照或总组数发生变化')
        if (asOf && asOf !== page.asOf) throw new Error('告警快照观测时间发生变化')
        snapshotId = page.snapshotId; expected = page.totalGroups; asOf = page.asOf
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
      return store(context, `${which}-alerts`, 'observed', { assetId: asset.assetId, ip: asset.ip, snapshotId, asOf, totalGroups: expected, totalAlerts: expectedAlerts, groups, groupMemberResponses: members, member_count: memberCount,
        from: context.shared.input.from, to: context.shared.input.to, message: groups.length ? '已在同一窗口和快照下续读所有组页及可核完整的成员页；仅为告警事实，不直接判根因。' : '该对象固定窗口内无告警组且未截断；不证明无故障。' }, receipts)
    } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); return store(context, `${which}-alerts`, 'partial', { assetId: asset.assetId, ip: asset.ip, snapshotId: snapshotId ?? null, groups, groupMemberResponses: members, totalGroups: expected ?? null, totalAlerts: expectedAlerts ?? null, message: String(error.message) }, receipts) }
  }
  function summary(input: Value, _config: Value, context: Context) {
    const values = input.values ?? input.items
    const names = Array.isArray(values) ? values.map((item: Value) => item.branch) : []
    const validThree = names.length === branchItems.length && new Set(names).size === branchItems.length && names.every(name => branchItems.includes(name))
    const validSix = names.length === optionalBranchItems.length && new Set(names).size === optionalBranchItems.length && names.every(name => optionalBranchItems.includes(name))
    if (!validThree && !validSix) throw new Error('原生独立分支终结缺项或重复')
    return { ...report(context.shared.input, context, 'evidence-summary'), branches: values }
  }
  function decide(which: 'source' | 'target', fact: Value, context: Context) {
    const asset = context.shared.assets[which]
    const applicability = { assetId: asset.assetId, ip: asset.ip, assetType: asset.assetType ?? null, os: asset.os ?? asset.osType ?? null,
      status: fact.status === 'failed' ? 'unavailable' : 'applicable', reason: '仅选择现有SOC资产告警数据，不要求终端OS动作；OS/采集绑定未知时不授权终端执行' }
    const more = !!context.shared.scope.time.query_window && !['failed', 'partial', 'unavailable'].includes(fact.status) && context.shared.request_count < policy.request_limit
    const decision = { continue: more, branch: which, evidence_ids: [fact.id], applicability,
      next_check: more ? `${which}-alerts` : null,
      reason: more ? 'SOC状态不足以区分当前异常；读取同对象固定窗口已有告警，区分是否存在相关观测，不视为必查清单' : '状态取证失败或预算耗尽，缺少有效前置；不绕过停点另取底层证据' }
    context.shared.rounds.push({ id: `round-${context.shared.rounds.length + 1}`, node_id: context.nodeId, facts: Object.keys(context.shared.facts), causes: structuredClone(context.shared.causes), ...decision })
    recordProgress(context, { status: 'completed', result: { kind: 'fault-decision', items: [], ...decision } })
    return decision
  }
  function assess(fact: Value, context: Context, branch: string) {
    const decision = { branch, continue: false, evidence_ids: [fact.id], next_check: null,
      reason: '本稿尚未实现依据候选状态选取监听/服务/绑定等后继；目录核对受阻，不能认定这些能力不存在。本分支以未实现范围停止，不声称设计验收通过，不自动探测或处置' }
    context.shared.rounds.push({ id: `round-${context.shared.rounds.length + 1}`, node_id: context.nodeId, facts: Object.keys(context.shared.facts), causes: structuredClone(context.shared.causes), ...decision })
    recordProgress(context, { status: 'completed', result: { kind: 'fault-decision', items: [], ...decision } })
    return decision
  }
  const finish = (name: string) => (_input: Value, _config: Value, context: Context) => report(context.shared.input, context, name)
  const workflow = {
    inputSchema,
    connections: (config: Value) => [...new Set<string>(Object.values(config.connections))],
    prepare(input: Value, config: Value) {
      if (!isIP(input.source?.ip ?? '') || !isIP(input.target?.ip ?? '') || !['tcp', 'udp'].includes(input.protocol) || !Number.isSafeInteger(input.port) || input.port < 1 || input.port > 65535) throw new Error('必须提供已确认的源/目标IP、协议和单个端口；缺DNS不猜IP')
      const time = diagnosticTime(input)
      return { input: structuredClone(input), scope: { time, requested: structuredClone(input), frozen_at: new Date().toISOString(), source: structuredClone(input.source), target: structuredClone(input.target), protocol: input.protocol, port: input.port, from: input.from, to: input.to, playbook: 'soc-existing-business-access', policy, allowed_reads: allowedReads, candidate_states: causeStates }, assets: {}, facts: {}, receipts: {}, evidence_sequence: 0, request_count: 0, diagnostic_loop: { round: 0, round_limit: 24, attempts: {}, pending: null, stop_reason: null }, rounds: [], causes: causeDefinitions.map(([id, title]) => ({ id, title, status: 'unknown', support: { evidence_ids: [] }, refutation: { evidence_ids: [] } })), connection_fingerprints: Object.fromEntries(Object.values<string>(config.connections).map(id => [id, soc.fingerprint?.(id)])) }
    },
    artifacts,
    components: {
      async resolve(input: Value, config: Value, context: Context) {
        const receipts: Value[] = []
        try {
          // 同一节点顺序限定两次对象解析，不做全库枚举，不跨Run复用结果。
          const frozen = context.shared.input
          // 两端各自独立核验：一端未匹配只保留自身 unknown，不阻断另一端已唯一对象的只读检查。
          const attempt = async (selector: Value) => {
            try { return { ok: true as const, value: await resolveOne(selector, config, context, receipts) } }
            catch (error: any) {
              if (error?.persistenceFailure) throw error
              context.signal.throwIfAborted()
              return { ok: false as const, error: String(error?.message ?? error) }
            }
          }
          const source = await attempt(frozen.source), target = await attempt(frozen.target)
          context.shared.assets = { ...(source.ok ? { source: source.value } : {}), ...(target.ok ? { target: target.value } : {}) }
          Object.assign(context.shared.scope, {
            ...(source.ok ? { source: { assetId: source.value.assetId, ip: source.value.ip } } : {}),
            ...(target.ok ? { target: { assetId: target.value.assetId, ip: target.value.ip } } : {}) })
          const ready = source.ok || target.ok
          // 只对实际未解析的一侧列缺口；两端都唯一时不得添加虚假身份缺口。
          const gaps = [
            ...(source.ok ? [] : [{ check: 'unique-endpoints', side: 'source', status: 'unknown', reason: source.error }]),
            ...(target.ok ? [] : [{ check: 'unique-endpoints', side: 'target', status: 'unknown', reason: target.error }]),
          ]
          store(context, 'unique-endpoints', ready ? (source.ok && target.ok ? 'observed' : 'partial') : 'unknown', {
            ...(source.ok ? { source: { assetId: source.value.assetId, ip: source.value.ip, hostname: source.value.hostname } } : {}),
            ...(target.ok ? { target: { assetId: target.value.assetId, ip: target.value.ip, hostname: target.value.hostname } } : {}),
            identity: { source: source.ok ? 'resolved' : 'unknown', target: target.ok ? 'resolved' : 'unknown' },
            message: source.ok && target.ok ? '源、目标已由完整限定候选唯一解析。' : '仅一侧唯一解析；另一侧保留 unknown，后续只执行不依赖该侧的前置检查。',
            gaps }, receipts)
          return { ready, playbook: 'soc-existing-business-access', scope: context.shared.scope, identity: { source: source.ok, target: target.ok } }
        } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); store(context, 'unique-endpoints', 'unknown', { message: String(error.message) }, receipts); return { ready: false, items: [] } }
      },
      reassessSource: (input: Value, _config: Value, context: Context) => decide('source', input, context),
      reassessTarget: (input: Value, _config: Value, context: Context) => decide('target', input, context),
      assessSourceAlerts: (input: Value, _config: Value, context: Context) => assess(input, context, 'source'),
      assessTargetAlerts: (input: Value, _config: Value, context: Context) => assess(input, context, 'target'),
      assessPath: (input: Value, _config: Value, context: Context) => assess(input, context, 'path'),
      sourceState: (_input: Value, config: Value, context: Context) => status('source', config, context),
      targetState: (_input: Value, config: Value, context: Context) => status('target', config, context),
      sourceAlerts: (_input: Value, config: Value, context: Context) => alerts('source', config, context),
      targetAlerts: (_input: Value, config: Value, context: Context) => alerts('target', config, context),
      sourceTcp: (_input: Value, _config: Value, context: Context) => {
        const fact = store(context, 'source-tcp', 'unavailable', { status: 'unavailable', route: 'UNKNOWN', message: '未取得受控TCP主动探测能力；本次不发起主动连接或探测。', gaps: [{ status: 'not_executed', reason: '主动探测不在当前只读能力合同内' }] })
        return { route: 'UNKNOWN', fact }
      },
      unavailable: (input: Value) => input,
      branchResult(input: Value, _config: Value, context: Context) {
        if (!acceptedBranchItems.has(input.branch)) throw new Error('分支终态不属于冻结检查项')
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
           const verdict = typeof diagnosis?.verdict === 'string' ? diagnosis.verdict : null
           const atoms = exact && verdict && timed(diagnosis.observedAt) ? [{ id: 'path-verdict', object_id: `pair:${input.source.ip}->${input.target.ip}`, predicate: 'path-verdict', value: verdict, observed_at: diagnosis.observedAt, applicability: 'applicable', result: 'observed', provenance_verified: true }] : []
          return store(context, 'configuration-path', exact && ['ALLOW', 'DENY', 'REACHABLE', 'BLOCKED'].includes(verdict) ? 'observed' : 'unknown', { model: value, exactConnectionEvaluated: exact, atoms, message: '仅保留配置路径模型、原始判据和缺口；不是当前源端连接，不以reachable=false覆盖UNKNOWN，不从NAT候选扩张对象。' }, receipts)
        } catch (error: any) { if (error?.persistenceFailure) throw error; context.signal.throwIfAborted(); return store(context, 'configuration-path', 'failed', { message: String(error.message) }, receipts) }
      },
      blockedResult: finish('identity-blocked'),
      loopFinalReport: (input: Value, _config: Value, context: Context) => report(context.shared.input, context, input.terminal),
      async availability(_input: Value, config: Value, context: Context) {
        const dependency=config.options?.fixedDependencies?.find((item:Value)=>item.compositionId==='troubleshooting-device-offline')
        if(!dependency || !(context as any).composition) return store(context,'fixed-availability','unavailable',{gaps:['未声明固定可用性依赖或公开执行合同未装载']})
        const source=context.shared.causes.find((cause:Value)=>cause.id==='source-abnormal'&&cause.status==='supported')
        const asset=source?context.shared.input.source:context.shared.input.target
        const result=await (context as any).composition(dependency,{asset,...(context.shared.input.from?{from:context.shared.input.from,to:context.shared.input.to}:{})})
        // 只把子诊断中同目标、带来源和观测时间的SOC状态原子并入父候选；子原因不直接成为访问根因。
        const target=source?context.shared.assets.source:context.shared.assets.target, cause=source?'source-abnormal':'target-offline'
        const objectId=`asset:${target?.assetId}`
        const childAtoms=(result.items??[]).flatMap((item:Value)=>Array.isArray(item.atoms)?item.atoms:[])
        const atoms=childAtoms.filter((atom:Value)=>atom.object_id===objectId&&atom.predicate==='soc-online'&&atom.provenance_verified===true&&typeof atom.observed_at==='string')
          .map((atom:Value,index:number)=>({...atom,id:`child:${result.run_id}:${atom.id??index}`,predicate:source?'source-online':'target-online',cause_id:cause,child_run_id:result.run_id}))
        const discarded=childAtoms.length-atoms.length
        context.shared.diagnostic_loop.offline_reuse={...dependency,status:'completed',child_run_id:result.run_id,cause,mapped_atoms:atoms.length,discarded_atoms:discarded}
        return store(context,'fixed-availability',atoms.length?'observed':'unknown',{fixed_dependency:dependency,availability:{...result,items:undefined,atoms:[]},atoms,gaps:[...(result.gaps??[]),...(atoms.length?[]:['子诊断未提供同目标、带来源与观测时间的SOC状态原子；其结论不作为父候选确认']),
          ...(discarded?[`${discarded}项子原子对象/谓词/来源不适用，未并入父候选`]:[])],
          message:'固定版本子结果已关联同诊断；仅同目标可核原子并入父候选，子诊断原因不改写为访问根因'})
      },
      evidenceSummary: (input: Value) => evidenceSummary(input),
      controlledProposal(input: Value, config: Value, context: Context) {
        const frozen=context.shared.input
        return controlledDiagnosticProposal(soc, {
          portEvidence:['master','get_soc_asset_port_evidence',{ip:frozen.target.ip,port:frozen.port,protocol:frozen.protocol}],
          routeEvidence:['graph','get_reachability_route_candidates',{srcIp:frozen.source.ip,dstIp:frozen.target.ip}],
          policyEvidence:['graph','get_reachability_policy_flow_evidence',{srcIp:frozen.source.ip,dstIp:frozen.target.ip,port:frozen.port,protocol:frozen.protocol}],
          pathEvidence:['graph','get_graph_path_evidence',{srcIp:frozen.source.ip,dstIp:frozen.target.ip,port:frozen.port,protocol:frozen.protocol}],
          collectionCapability:['master','get_soc_asset_collection_capability',{assetId:context.shared.assets.target?.assetId}],
        },input,config,context)
      },
      async readonlyEvidence(input: Value, config: Value, context: Context) {
        const receipts: Value[] = []
        const frozen = context.shared.input
        const mapping: Value = {
          portEvidence: ['master', 'get_soc_asset_port_evidence', { ip: frozen.target.ip, port: frozen.port, protocol: frozen.protocol }],
          routeEvidence: ['graph', 'get_reachability_route_candidates', { srcIp: frozen.source.ip, dstIp: frozen.target.ip }],
          policyEvidence: ['graph', 'get_reachability_policy_flow_evidence', { srcIp: frozen.source.ip, dstIp: frozen.target.ip, port: frozen.port, protocol: frozen.protocol }],
          pathEvidence: ['graph', 'get_graph_path_evidence', { srcIp: frozen.source.ip, dstIp: frozen.target.ip, port: frozen.port, protocol: frozen.protocol }],
          collectionCapability: ['master', 'get_soc_asset_collection_capability', { assetId: context.shared.assets.target?.assetId }],
        }
        const entry = mapping[input.check]
        if (!entry) throw new Error('没有已核只读取证映射')
        try {
          const reply = await read(entry[0], entry[1], entry[2], config, context, receipts)
          const objectId = input.check === 'collectionCapability' ? `asset:${context.shared.assets.target.assetId}` : `pair:${frozen.source.ip}->${frozen.target.ip}`
          const atoms = normalizeDiagnosticAtoms(reply.data, { objectId, sourceId: config.connections[entry[0]], receiptId: receipts.at(-1)!.id, ...(input.check === 'portEvidence' ? { ip: frozen.target.ip, port: frozen.port, protocol: frozen.protocol } : {}) })
          const summary = evidenceSummary({ check: input.check, payload: reply.data })
          return store(context, input.check, 'unknown', { evidence: reply.data, atoms, status_detail: summary.status, source_query_window: summary.source_window,
            message: '已接真实只读接口并按当前响应结构解析；无记录、空结果或静态候选均不构成因果确认', gaps: summary.gaps.map((reason: string) => ({ check: input.check, status: 'unknown', reason })) }, receipts)
        } catch (error: any) {
          if (error?.persistenceFailure) throw error
          context.signal.throwIfAborted()
          return store(context, input.check, 'failed', { message: String(error.message) }, receipts)
        }
      },
    },
  }
  Object.assign(workflow.components, evidenceLoop(workflow.components, policy, reassess))
  return workflow
}
