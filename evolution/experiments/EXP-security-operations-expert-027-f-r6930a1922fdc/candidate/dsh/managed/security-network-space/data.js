// 来源字段依据公开合同与真实只读回执；不嵌入业务样例或原型模拟值。
export const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null
export const text = value => typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null
export function fail(code, message, details = {}) { return Object.assign(new Error(message), { code, ...details }) }
function identity(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw fail('SOURCE_ID_PRECISION', '对象 ID 超过 JavaScript 精确整数范围')
  return text(value)
}
export function payload(body) {
  if (!isRecord(body) && !Array.isArray(body)) throw fail('SOURCE_SHAPE_UNVERIFIED', '上游未返回 JSON 对象或列表，不能解释为零数据。')
  if (isRecord(body) && body.code !== undefined && ![0, 200, '0', '200'].includes(body.code)) throw fail('UPSTREAM_BUSINESS_ERROR', text(body.msg) || text(body.message) || '上游业务失败', { upstreamCode: text(body.code) })
  if (isRecord(body) && body.success === false) throw fail('UPSTREAM_BUSINESS_ERROR', text(body.message) || '上游返回失败')
  return isRecord(body) && Object.hasOwn(body, 'data') ? body.data : body
}
export function listPayload(body) {
  const data = payload(body)
  const rows = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.rows) ? data.rows : isRecord(data) && Array.isArray(data.records) ? data.records : null
  if (rows === null) throw fail('SOURCE_SHAPE_UNVERIFIED', '需要 data 数组、rows 或 records，未知结构不作为空成功')
  const total = finite(isRecord(data) ? data.total : null) ?? finite(isRecord(body) ? body.total : null)
  if (total !== null && (!Number.isSafeInteger(total) || total < rows.length)) throw fail('SOURCE_SHAPE_UNVERIFIED', '上游总量与列表长度不一致')
  return { rows, total }
}
export function onlineState(value) { return value === 'online' || value === true ? 'online' : value === 'offline' || value === false ? 'offline' : 'unknown' }
const SMART_TYPES = new Set(['ai_agent', 'agent', 'llm', 'large_model', 'rag', 'knowledge_base', 'model_service'])
const TRADITIONAL_TYPES = new Set(['host', 'server', 'workstation', 'endpoint', 'firewall', 'switch', 'router', 'database', 'storage', 'network_device', 'security_device', 'terminal', 'vuln_scanner', 'edr', 'waf'])
export function categoryOf(row) {
  const kind = text(row.assetType)?.toLowerCase()
  return SMART_TYPES.has(kind) ? 'smart' : TRADITIONAL_TYPES.has(kind) ? 'traditional' : 'unclassified'
}
export function assetView(row) {
  if (!isRecord(row) || !identity(row.assetId)) throw fail('SOURCE_SHAPE_UNVERIFIED', '资产缺少精确稳定 assetId')
  const id = identity(row.assetId)
  return { id, vid: `asset:${id}`, name: text(row.assetName) || text(row.hostname) || id,
    ip: text(row.ip), assetType: text(row.assetType), category: categoryOf(row), online: onlineState(row.online),
    onlineBasis: text(row.onlineBasis), stateTime: text(row.stateEvaluatedAt), timeBasis: text(row.stateEvidence?.timeBasis),
    nestingKind: finite(row.nestingKind), source: 'ai-soc-master', virtual: false }
}
export function assetsView(body, pageNum, pageSize) {
  const { rows, total } = listPayload(body), items = [], seen = new Set(), issues = []
  for (const row of rows) {
    try { const item = assetView(row); if (seen.has(item.id)) { issues.push('当前页存在重复资产 ID'); continue } seen.add(item.id); items.push(item) }
    catch (error) { issues.push(error.message) }
  }
  const counts = { online: 0, offline: 0, unknown: 0 }, categories = { smart: 0, traditional: 0, unclassified: 0 }
  for (const item of items) { counts[item.online]++; categories[item.category]++ }
  return { items, total, counts, categories, pageNum, pageSize, loaded: items.length,
    hasMore: total === null ? rows.length === pageSize : pageNum * pageSize < total,
    complete: pageNum === 1 && total !== null && total === items.length && issues.length === 0, countsScope: 'current-page', issues,
    notice: '总量取上游 total；状态与分类仅统计当前页。列表默认不含软件单元，图谱包含的软件节点不得混入该设备总数。在线依据不等于同步成功或安全通过。' }
}
export function topologyView(body) {
  const data = payload(body)
  if (!isRecord(data) || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) throw fail('SOURCE_SHAPE_UNVERIFIED', '拓扑需要 nodes 与 edges；未知结构不作为空成功')
  const nodes = [], edges = [], issues = [], ids = new Set()
  for (const raw of data.nodes) {
    if (!isRecord(raw)) { issues.push('存在非对象节点'); continue }
    const id = identity(raw.vid) || identity(raw.id)
    if (!id || ids.has(id)) { issues.push('存在缺失或重复的节点 ID'); continue }
    const props = isRecord(raw.props) ? raw.props : isRecord(raw.properties) ? raw.properties : raw
    let assetId = null
    try { assetId = identity(props.asset_id ?? props.assetId) || (/^asset:[0-9]+$/.test(id) ? id.slice(6) : null) }
    catch { issues.push('节点资产 ID 精度不足，未绑定任务动效') }
    const type = text(props.asset_type) || text(props.assetType)
    ids.add(id)
    nodes.push({ id, vid: id, assetId, name: text(props.asset_name) || text(props.assetName) || text(props.name) || id,
      ip: text(props.ip), assetType: type, category: categoryOf({ assetType: type }), online: onlineState(props.online),
      health: text(raw.healthStatus) || 'UNKNOWN', alertCount: finite(raw.alertCount), nestingKind: finite(props.nesting_kind),
      virtual: props.virtual === true || props.isVirtual === true || raw.tag !== 'asset' && !assetId,
      source: 'ai-soc-graph', provenance: safeData(raw.attr || {}), layerId: identity(raw.layerId) })
  }
  const edgeIds = new Set()
  for (const raw of data.edges) {
    if (!isRecord(raw)) { issues.push('存在非对象关系'); continue }
    const source = identity(raw.source) || identity(raw.src), target = identity(raw.target) || identity(raw.dst)
    if (!source || !target || !ids.has(source) || !ids.has(target)) { issues.push('关系端点不在当前视图'); continue }
    const props = isRecord(raw.props) ? raw.props : isRecord(raw.properties) ? raw.properties : raw
    const attr = isRecord(raw.attr) ? raw.attr : {}, kind = text(raw.type) || text(raw.label) || 'unknown'
    const id = identity(raw.edgeId) || identity(raw.id) || `${source}|${kind}|${target}`
    if (edgeIds.has(id)) { issues.push('存在重复关系 ID'); continue } edgeIds.add(id)
    const evidence = props.observed === true ? 'observed' : props.inferred === true || kind === 'potential' || typeof attr.derived_from === 'string' ? 'inferred' : 'unknown'
    edges.push({ id, source, target, kind, evidence, provenance: safeData(attr), properties: safeData(props), sourceSystem: 'ai-soc-graph' })
  }
  return { nodes, edges, issues, complete: data.truncated === false && issues.length === 0,
    upstreamTruncated: typeof data.truncated === 'boolean' ? data.truncated : null, overrideVersion: text(data.overrideVersion), stats: safeData(data.stats || {}),
    notice: '骨架图含软件单元；完整仅指该查询视图未截断，不代表全网覆盖。登记推导或证据未知的边不等于实测连通；健康枚举不等于最终研判结论，布局不代表地理位置。' }
}
export function coverageView(body) {
  const data = payload(body)
  if (!isRecord(data)) throw fail('SOURCE_SHAPE_UNVERIFIED', '覆盖率结构未匹配')
  const registered = finite(data.registered), collected = finite(data.collected), percent = finite(data.coveragePct)
  if ([registered, collected, percent].every(value => value === null)) throw fail('SOURCE_SHAPE_UNVERIFIED', '无明确覆盖率字段，不推算百分比')
  if (percent !== null && (percent < 0 || percent > 100)) throw fail('SOURCE_SHAPE_UNVERIFIED', '覆盖率不在0到100范围')
  return { registered, collected, discovered: data.discoveredAvailable === false ? null : finite(data.discovered),
    discoveredAvailable: data.discoveredAvailable === true, percent,
    notice: '直接显示上游 coveragePct，不由 collected/registered 重新计算。discoveredAvailable=false 时发现数为未知；采集覆盖不等于全域可见率或资产在线率。' }
}
export function incidentsView(body, pageNum, pageSize) {
  const { rows, total } = listPayload(body), items = [], ids = new Set(), issues = []
  for (const row of rows) {
    if (!isRecord(row) || !identity(row.incidentId)) { issues.push('事件缺少 incidentId'); continue }
    const id = identity(row.incidentId)
    if (ids.has(id)) { issues.push('当前页事件重复'); continue } ids.add(id)
    items.push({ id, title: text(row.title) || text(row.name) || `${text(row.incidentType) || 'Incident'} · ${id}`,
      incidentType: text(row.incidentType), severity: text(row.severity) || 'unknown', status: text(row.status) || 'unknown',
      judgeStatus: text(row.judgeStatus) || 'unknown', verdict: text(row.judgeVerdict), summary: text(row.judgeSummary),
      latestJudgementId: identity(row.latestJudgementId), assetId: identity(row.affectedAssetId),
      createdAt: text(row.createdTime) || text(row.createTime), source: 'ai-soc-correlate' })
  }
  return { items, total, issues, pageNum, pageSize, loaded: items.length, hasMore: total === null ? rows.length === pageSize : pageNum * pageSize < total,
    notice: '事件等级、研判状态与结论分别展示。未标时区的上游时间保留原文；过期结论不作为当前确认，规则主张不等于已证实攻击。' }
}
export function threatsView(body) {
  const { rows, total } = listPayload(body), items = [], issues = []
  for (const row of rows) {
    if (!isRecord(row) || !identity(row.incidentId)) { issues.push('威胁缺少 incidentId'); continue }
    let techniques = 0
    try { const value = JSON.parse(row.attackTechniquesJson || '[]'); techniques = Array.isArray(value) ? value.length : 0 } catch {}
    items.push({
      id: identity(row.incidentId),
      incidentType: text(row.incidentType) || 'unknown',
      severity: text(row.severity) || 'unknown',
      riskLevel: text(row.riskLevel) || 'unknown',
      riskScore: finite(row.riskScore),
      confidence: finite(row.confidence),
      judgeConfidence: finite(row.judgeConfidence),
      verdict: text(row.judgeVerdict) || 'unknown',
      validation: text(row.judgeValidationStatus) || 'unknown',
      judgeTime: text(row.judgeTime),
      createdTime: text(row.createdTime),
      summary: text(row.judgeSummary).slice(0, 160),
      group: text(row.groupValue),
      alerts: finite(row.contributingAlertCount),
      techniques,
      assetId: identity(row.affectedAssetId),
      latestJudgementId: identity(row.latestJudgementId),
    })
  }
  items.sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1))
  return { items, total, issues, loaded: items.length,
    notice: '仅展示已研判为真实告警且等级为 CRITICAL 的事件，按风险分排序；未标时区的上游时间保留原文；模型校验未通过表示需要人工复核。' }
}
export function trendView(body) {
  const rows = payload(body)
  if (!Array.isArray(rows) || rows.some(row => !isRecord(row) || typeof row.date !== 'string' || finite(row.count) === null || row.count < 0)) throw fail('SOURCE_SHAPE_UNVERIFIED', '趋势需要 date/count 列表')
  return { buckets: rows.map(row => ({ date: row.date, count: row.count })), issues: ['按日聚合的边界口径与精确24小时事件列表未一致验证，不以柱状图求和代替事件总数。'],
    notice: '上游按日趋势；日期和数量原样展示，未声明时区不擅自转换。' }
}
export function severityView(body) {
  const data = payload(body), keys = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
  if (!isRecord(data) || keys.some(key => finite(data[key]) === null || data[key] < 0)) throw fail('SOURCE_SHAPE_UNVERIFIED', '等级分布结构未匹配')
  return { buckets: keys.map(key => ({ name: key, count: data[key] })), total: keys.reduce((sum, key) => sum + data[key], 0), notice: '展示上游同查询范围等级分布；不能作为研判确认的攻击数量。' }
}
export function reasoningView(body, incidentId) {
  const data = payload(body)
  if (!isRecord(data) || data.incidentId !== incidentId || !Array.isArray(data.steps)) throw fail('SOURCE_SHAPE_UNVERIFIED', '推理链结构或事件归属未匹配')
  const steps = data.steps.map((step, index) => {
    if (!isRecord(step)) throw fail('SOURCE_SHAPE_UNVERIFIED', '推理链含非对象步骤')
    const bindings = (Array.isArray(step.chain?.steps) ? step.chain.steps : []).flatMap(row => Array.isArray(row.boundArgs) ? row.boundArgs : [])
    const assetIds = [...new Set(bindings.filter(value => typeof value === 'string' && /^host:[1-9][0-9]*$/.test(value)).map(value => value.slice(5)))]
    return { id: `${index}:${text(step.ruleId) || ''}`, title: text(step.threatType) || text(step.ruleId) || String(index + 1),
      ruleId: text(step.ruleId), occurredAt: finite(step.occurredAt), source: text(step.source), assetIds,
      evidenceRefs: Array.isArray(step.evidenceRefs) ? step.evidenceRefs.filter(value => typeof value === 'string') : [], chain: safeData(step.chain || {}) }
  })
  return { incidentId, steps, replayAvailable: steps.length > 0 && steps.every(step => step.occurredAt !== null),
    notice: '此处为案内规则推理主张，不是智能体执行日志或已确认攻击链；必须结合历次研判、反向证据与结论解释。回放只读，不重新执行。' }
}
export function judgementsView(body) {
  const rows = payload(body)
  if (!Array.isArray(rows)) throw fail('SOURCE_SHAPE_UNVERIFIED', '历次研判需要列表')
  return { items: rows.map(row => {
    if (!isRecord(row) || !identity(row.judgementId)) throw fail('SOURCE_SHAPE_UNVERIFIED', '研判缺少稳定 ID')
    return { id: identity(row.judgementId), incidentId: identity(row.incidentId), runId: identity(row.runId), round: finite(row.roundNo), status: text(row.status), verdict: text(row.verdict),
      confidence: finite(row.confidence), validationStatus: text(row.validationStatus), summary: text(row.summary),
      model: text(row.llmModel), startedAt: text(row.startedAt), finishedAt: text(row.finishedAt), reportBytes: finite(row.reportBytes) }
  }), notice: '历史研判是当次证据下的结论；保存、校验通过不等于生产处置已执行。' }
}
function decodeEntities(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}
export function parseReportHtml(html) {
  if (typeof html !== 'string' || !/<html/i.test(html)) return null
  const clean = (value) => decodeEntities(String(value).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
  const section = (start, end) => { const from = html.indexOf(start); if (from < 0) return ''; const to = end ? html.indexOf(end, from) : html.length; return html.slice(from, to < 0 ? html.length : to) }
  const hero = section('class="hero', '<section class="metrics"')
  const verdict = clean(/<div class="verdict-value">([\s\S]*?)<\/div>/.exec(hero)?.[1] || '')
  const meta = clean(/<div class="verdict-meta">([\s\S]*?)<\/div>/.exec(hero)?.[1] || '')
  const confidence = /置信度\s*([0-9.]+)/.exec(html)?.[1]
  const summary = clean(/<p class="hero-summary-text">([\s\S]*?)<\/p>/.exec(hero)?.[1] || '')
  const metrics = [...(section('class="metrics"', '<h2>').matchAll(/<div class="metric"><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span>/g) || [])]
    .map(match => ({ label: clean(match[2]), value: clean(match[1]) }))
  const factsBlock = section('<h2>已观察事实</h2>', '<h2>研判依据与缺口</h2>')
  const facts = [...factsBlock.matchAll(/<tr><td>([^<]*)<\/td><td>([\s\S]*?)<\/td><td>([^<]*)<\/td><\/tr>/g)]
    .map(match => ({ id: clean(match[1]), text: clean(match[2]), source: clean(match[3]) }))
  const claimsBlock = section('<h2>研判依据与缺口</h2>', '<h2>攻击链分析</h2>')
  const claims = [...claimsBlock.matchAll(/<tr><td>([\s\S]*?)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)]
    .map(match => ({ text: clean(match[1]), result: clean(match[2]), weight: finite(clean(match[3])) }))
  const chainBlock = section('<h2>攻击链分析</h2>', '<h2>处置建议</h2>')
  const chain = []
  const heads = [...chainBlock.matchAll(/<div class="chain-step (observed|speculative)">/g)]
  for (let index = 0; index < heads.length; index++) {
    const start = heads[index].index
    const end = index + 1 < heads.length ? heads[index + 1].index : chainBlock.length
    const body = chainBlock.slice(start, end)
    chain.push({
      index: finite(clean(/<div class="step-index">([\s\S]*?)<\/div>/.exec(body)?.[1] || '')) || chain.length + 1,
      type: heads[index][1], badge: clean(/<span class="step-badge">([\s\S]*?)<\/span>/.exec(body)?.[1] || ''),
      refs: clean(/<span class="step-refs">([\s\S]*?)<\/span>/.exec(body)?.[1] || ''),
      text: clean(/<div class="step-text">([\s\S]*?)<\/div>/.exec(body)?.[1] || ''),
    })
  }
  const actionBlock = section('<h2>处置建议</h2>', '<h2>规则优化建议</h2>')
  const actions = [...actionBlock.matchAll(/<div class="action-card">([\s\S]*?)(?=<div class="action-card">|<\/div><\/div><\/div><h2>|$)/g)]
    .map(match => {
      const body = match[1]
      return {
        priority: clean(/<span class="priority [^"]*">([\s\S]*?)<\/span>/.exec(body)?.[1] || ''),
        title: clean(/<div class="action-title">([\s\S]*?)<\/div>/.exec(body)?.[1] || ''),
        targets: [...body.matchAll(/<span class="badge">([\s\S]*?)<\/span>/g)].map(item => clean(item[1])),
        reason: clean(/<div class="action-reason">([\s\S]*?)<\/div>/.exec(body)?.[1] || ''),
      }
    })
    .filter(item => item.title)
  if (!verdict && !chain.length) return null
  return { verdict, confidence: confidence === undefined ? null : finite(Number(confidence)), summary, metrics, facts, claims, chain, actions,
    parsed: { chain: chain.length, facts: facts.length, claims: claims.length, actions: actions.length } }
}
export function platformView(agents, models) {
  const list = Array.isArray(agents) ? agents : []
  const nodes = list.map(row => ({ id: `platform:agent:${text(row.id)}`, agentId: text(row.id), name: text(row.name) || text(row.id),
    description: (text(row.description) || '').slice(0, 160), isDefault: row.isDefault === true, broken: row.broken !== undefined,
    kind: 'agent', category: 'smart' }))
  const modelNodes = (Array.isArray(models) ? models : []).map(row => ({ id: `platform:model:${text(row.provider)}/${text(row.model)}`,
    provider: text(row.provider), model: text(row.model), name: text(row.name) || text(row.model), kind: 'model', category: 'smart' }))
  return { agents: nodes, models: modelNodes, total: nodes.length + modelNodes.length,
    notice: '这些是当前实例运行时的智能体与模型，属于监控平台自身，不计入业务资产总数。' }
}
export function reportView(body) {
  const data = typeof body === 'string' ? body : isRecord(body) && typeof body.reportText === 'string' ? body.reportText : payload(body)
  const original = typeof data === 'string' ? data : isRecord(data) ? text(data.reportText) : null
  if (original === null || original.length > 1024 * 1024) throw fail('SOURCE_SHAPE_UNVERIFIED', '报告格式未匹配或超过展示配额')
  const cleaned = redactText(original)
  const format = /^\s*<!doctype\s+html|^\s*<html/i.test(original) ? 'html' : 'text'
  return { text: cleaned, format, redacted: cleaned !== original, parsed: format === 'html' ? parseReportHtml(cleaned) : null,
    notice: '只读上游历史报告；解析失败时回退原文。报告中的建议尚未执行，推测步骤不代表已发生。' }
}
export function detailView(body) {
  const data = payload(body)
  if (data === null) return null
  if (!isRecord(data) && !Array.isArray(data)) throw fail('SOURCE_SHAPE_UNVERIFIED', '详情结构未匹配')
  return safeData(data)
}
export function redactText(value) {
  return value.replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [已隐藏]')
    .replace(/((?:["']?)(?:api[_-]?key|token|password|secret|authorization|credential)(?:["']?)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1"[已隐藏]"')
    .replace(/([?&](?:api[_-]?key|token|signature|secret|credential)=)[^&\s"']+/gi, '$1[已隐藏]')
}
export function safeData(value, depth = 0) {
  if (depth > 12) return '[层级超限，未完整展示]'
  if (Array.isArray(value)) { const items = value.slice(0, 500).map(item => safeData(item, depth + 1)); return value.length > 500 ? { items, truncated: true, total: value.length } : items }
  if (!isRecord(value)) return typeof value === 'string' ? redactText(value.length > 32000 ? value.slice(0, 32000) + '\n[内容超限，未完整展示]' : value) : value
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    if (/password|secret|token|authorization|api.?key|credential|cookie/i.test(key)) { out[key] = '[已隐藏]'; continue }
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
    out[key] = safeData(item, depth + 1)
  }
  return out
}
export function safeError(error, source, operation, stage = 'read') {
  return { source, operation, stage: error?.stage || stage, code: text(error?.code) || 'SOURCE_UNAVAILABLE',
    message: redactText(text(error?.message) || '来源查询失败').slice(0, 600), upstreamCode: text(error?.upstreamCode),
    httpStatus: finite(error?.status) ?? finite(error?.statusCode), dispatchStatus: finite(error?.dispatchStatus) }
}
