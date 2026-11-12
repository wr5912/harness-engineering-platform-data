/**
 * 巡检报告卡模型：只读、纯函数，浏览器与 Node 测试共用。
 * 事实源是巡检组合返回的结构化结果；建议文案来自共享 advice.mjs。
 */
import { buildAdvice, codeLabel, failureReason, safeText, EXECUTION_BOUNDARY } from './advice.mjs'
export { codeLabel, EXECUTION_BOUNDARY }
const obj = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const list = value => Array.isArray(value) ? value : []
const text = value => ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : ''
const id = value => { const v = text(value).trim(); return /^\d+$/.test(v) && v !== '0' ? v : '' }
const nameOf = item => text(obj(item).hostname ?? obj(item).assetName ?? obj(item).asset_name ?? obj(item).name)
const ipOf = item => text(obj(item).ip ?? obj(item).primary_ip)
const label = (item, fallback) => {
  const name = safeText(nameOf(item)), ip = ipOf(item), asset = id(obj(item).assetId ?? obj(item).asset_id)
  return [name || safeText(fallback) || '未命名资产', ip, asset ? `资产 ${asset}` : ''].filter(Boolean).join('／')
}
const STATUS = { normal: '正常', abnormal: '异常', unknown: '未知', failed: '读取失败', not_applicable: '不适用', partial: '部分完成', incomplete: '未完成' }
const statusText = value => STATUS[text(value)] ?? '结论待核实'
const REASON = {
  NO_TEMPLATE: '设备未绑定基线模板', NO_DATA: 'SOC未采集到基线数据', SOC_STATUS_UNKNOWN: 'SOC未采集到状态数据',
  NO_MATCHING_PAIRS: '本次范围无匹配对象/无适用检查对', NO_MATCHING_RULES: '本次范围无匹配对象/无适用检查对', NO_APPLICABLE_PAIRS: '本次范围无匹配对象/无适用检查对',
}
const NO_MATCH = new Set(['NO_MATCHING_PAIRS', 'NO_MATCHING_RULES', 'NO_APPLICABLE_PAIRS'])
const FAILED = new Set(['failed', 'incomplete', 'partial', 'not_executed', 'not_checked'])
const READ_ERROR = /读取失败|未执行|未完整|不完整|超时|timeout|error|失败/i

function sections(result) {
  const raw = obj(result)
  if (raw.checks && typeof raw.checks === 'object' && !Array.isArray(raw.checks)) {
    return Object.entries(raw.checks).map(([kind, value]) => ({ kind: text(obj(value).kind) || kind, source: obj(value) }))
  }
  return [{ kind: text(raw.kind) || 'inspection', source: raw }]
}
function signal(item) {
  const raw = obj(item), facts = obj(raw.facts), report = obj(facts.report), ready = obj(facts.readiness), run = obj(report.run)
  return {
    status: text(raw.status), error: raw.error ?? facts.error ?? report.error ?? ready.error,
    reason: text(raw.reasonCode ?? raw.not_checked ?? raw.notCheckedReason ?? run.notCheckedReason ?? ready.coverageReason ?? facts.reasonCode),
    message: text(raw.message ?? raw.error),
    online: text(raw.online ?? facts.online),
  }
}
function isReadFailure(item) {
  const s = signal(item)
  return !!s.error || FAILED.has(s.status) || READ_ERROR.test(s.message) && !s.reason
}
function isRealGap(kind, item) {
  const raw = obj(item), s = signal(item)
  if (isReadFailure(item)) return true
  if (kind === 'baseline' && (s.reason === 'NO_TEMPLATE' || s.reason === 'NO_DATA')) return false
  if (kind === 'status' && s.online === 'unknown') return false
  if (kind === 'reachability' && NO_MATCH.has(s.reason)) return false
  if (s.status === 'normal' || s.status === 'abnormal' || s.status === 'not_applicable') return false
  if (kind === 'vulnerabilities' && s.status === 'unknown') return true
  return s.status === 'unknown' || !s.status
}
function findingCount(item) {
  const raw = obj(item)
  let count = 0
  for (const finding of list(raw.findings)) count += list(obj(finding).observations).length || 1
  count += list(raw.vulnerabilities).length + list(raw.records).length
  if (!count) for (const source of list(raw.sources)) count += Number(source?.records) || 0
  return count
}
function checkSummary(kind, item) {
  const s = signal(item)
  if (kind === 'status') {
    if (isReadFailure(item)) return `SOC状态读取失败：${safeText(failureReason(item)) || '未提供原因'}`
    return s.online === 'offline' ? '离线' : s.online === 'online' ? '在线' : REASON.SOC_STATUS_UNKNOWN
  }
  if (kind === 'baseline') {
    if (isReadFailure(item)) return `基线读取失败：${safeText(failureReason(item)) || '未提供原因'}`
    return REASON[s.reason] || (s.status === 'normal' ? '基线通过' : s.status === 'abnormal' ? '基线不达标' : '基线结论待核实')
  }
  if (kind === 'reachability') {
    if (NO_MATCH.has(s.reason)) return REASON.NO_MATCHING_PAIRS
    if (s.status === 'abnormal') return `规则异常：${safeText(s.message) || '连接不符合要求'}`
    if (s.status === 'normal') return '规则正常'
    return safeText(failureReason(item)) || safeText(s.message) || '规则结论待核实'
  }
  if (kind === 'vulnerabilities') {
    if (isReadFailure(item)) {
      const base = s.message, detail = failureReason(item)
      return `漏洞读取失败：${safeText(base && detail && !base.includes(detail) ? `${base}：${detail}` : base || detail || '读取未完成')}`
    }
    const n = findingCount(item)
    return n ? `历史漏洞 ${n} 条，当前待复核` : s.status === 'normal' ? '没有漏洞' : '漏洞结论待核实'
  }
  return safeText(failureReason(item)) || s.message || statusText(s.status)
}

export function buildInspectionCard(result) {
  const raw = obj(result)
  const runId = text(raw.run_id ?? raw.runId)
  const kind = text(raw.kind)
  const script = ({ deep: '全面巡检', routine: '常规巡检', baseline: '基线检查', vulnerabilities: '漏洞检查', reachability: '可达性检查', status: '设备状态巡检' })[kind] || '巡检'
  const scope = obj(raw.scope)
  const scopeCount = Number.isFinite(Number(scope.count)) ? Number(scope.count) : null
  const devices = new Map()
  const rules = new Map()
  const groups = new Map([
    ['offline', []], ['soc_unknown', []], ['no_template', []], ['no_data', []], ['vulnerabilities', []], ['interconnect', []], ['real_gap', []],
  ])
  const realGaps = []
  const seenGap = new Set()
  const addGap = (kindName, objectKey, labelText, reason, advice, verification) => {
    const key = `${kindName}:${objectKey}`
    if (seenGap.has(key)) return
    seenGap.add(key)
    realGaps.push({ kind: kindName, label: labelText, reason: reason || '读取失败或结论缺失', advice: advice || '请核查具体读取失败、未执行或缺失证据。', verification: verification || '取得明确的成功结果或具体失败原因；不能用空结果或正常结论替代。' })
  }
  const ensureDevice = item => {
    const asset = id(obj(item).assetId ?? obj(item).asset_id) || `ip:${ipOf(item) || nameOf(item) || 'unknown'}`
    if (!devices.has(asset)) devices.set(asset, { assetId: asset.startsWith('ip:') ? '' : asset, label: label(item), name: safeText(nameOf(item)), ip: ipOf(item), checks: [], vulnerabilities: 0, online: '', baseline: '', rules: [] })
    return devices.get(asset)
  }
  const addGroup = (group, item, kindName) => {
    const listValue = groups.get(group)
    const key = `${kindName}:${id(obj(item).assetId ?? obj(item).asset_id) || ipOf(item) || nameOf(item) || listValue.length}`
    if (!listValue.some(entry => entry.key === key)) listValue.push({ key, label: label(item, kindName === 'reachability' ? text(item.ruleName) : ''), item })
  }

  const availability = { status: false, baseline: false, vulnerabilities: false, reachability: false }
  const itemAvailability = { status: false, baseline: false, vulnerabilities: false, reachability: false }
  const summaryCounts = {}
  const finiteNumber = value => typeof value === 'number' && Number.isFinite(value) ? value : null
  const sectionMap = sections(raw)
  let missingSections = 0
  for (const { kind: kindName, source } of sectionMap) {
    if (Object.hasOwn(availability, kindName) && (Array.isArray(source.items) || source.counts && typeof source.counts === 'object')) availability[kindName] = true
    if (Object.hasOwn(itemAvailability, kindName) && Array.isArray(source.items)) itemAvailability[kindName] = true
    if (Object.hasOwn(availability, kindName) && source.counts && typeof source.counts === 'object') summaryCounts[kindName] = source.counts
    if (!Array.isArray(source.items)) { if (!(source.counts && typeof source.counts === 'object')) { missingSections++; addGap('维度', kindName, '检查维度', '未返回检查明细数组') } continue }
    for (const item of source.items) {
      const s = signal(item), asset = obj(item)
      if (kindName === 'reachability' || asset.ruleId != null || asset.rule_id != null) {
        const rid = text(asset.ruleId ?? asset.rule_id ?? obj(obj(asset.facts).rule).id) || `connection:${rules.size + 1}`
        const rule = rules.get(rid) ?? { ruleId: rid, name: safeText(text(asset.ruleName ?? obj(obj(asset.facts).rule).name)) || '未命名规则', requirement: text(asset.ruleType ?? obj(obj(asset.facts).rule).ruleType) === 'FORBIDDEN' ? '应阻断' : text(asset.ruleType) === 'REQUIRED' ? '应允许' : '规则要求待核实', checks: [], status: 'normal', noMatch: true, abnormal: false, realGap: false }
        const guidance = buildAdvice('reachability', item, `${rule.name}（规则 ${rid}）`)
        rule.checks.push({ status: s.status, reason: s.reason, message: checkSummary('reachability', item), evidence: obj(asset), observedAt: text(asset.observed_at), advice: guidance.advice, verification: guidance.verification, executionBoundary: guidance.executionBoundary, evidenceSummary: guidance.evidenceSummary })
        if (NO_MATCH.has(s.reason) || s.status === 'not_applicable') {
          rule.noMatch = rule.noMatch && (NO_MATCH.has(s.reason) || s.status === 'not_applicable')
        } else rule.noMatch = false
        if (s.status === 'abnormal') { rule.abnormal = true; rule.status = 'abnormal' }
        else if (s.status === 'failed' || isRealGap('reachability', item)) { rule.realGap = true; if (rule.status !== 'abnormal') rule.status = 'unknown' }
        rules.set(rid, rule)
        if (isRealGap('reachability', item)) addGap('规则', rid, `${rule.name}（规则 ${rid}）`, s.message || s.reason || '规则读取或连接证据不完整', guidance.advice, guidance.verification)
        continue
      }
      const device = ensureDevice(item)
      const guidance = buildAdvice(kindName, item, device.label)
      device.checks.push({ kind: kindName, status: s.status, reason: s.reason, message: checkSummary(kindName, item), evidence: obj(asset), observedAt: text(asset.observed_at), advice: guidance.advice, verification: guidance.verification, executionBoundary: guidance.executionBoundary, evidenceSummary: guidance.evidenceSummary })
      if (kindName === 'status') {
        device.online = s.online || 'unknown'
        if (device.online === 'offline') addGroup('offline', item, kindName)
        else if (device.online !== 'online') addGroup('soc_unknown', item, kindName)
        if (isRealGap('status', item)) addGap('设备', asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || 'SOC状态读取失败或未执行', guidance.advice, guidance.verification)
      } else if (kindName === 'baseline') {
        device.baseline = s.reason === 'NO_TEMPLATE' ? 'NO_TEMPLATE' : s.reason === 'NO_DATA' ? 'NO_DATA' : s.status
        if (s.reason === 'NO_TEMPLATE') addGroup('no_template', item, kindName)
        else if (s.reason === 'NO_DATA') addGroup('no_data', item, kindName)
        else if (isRealGap('baseline', item)) addGap('设备', asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || '基线读取失败或结论缺失', guidance.advice, guidance.verification)
      } else if (kindName === 'vulnerabilities') {
        device.vulnerabilities += findingCount(item)
        if (device.vulnerabilities > 0) addGroup('vulnerabilities', item, kindName)
        if (isRealGap('vulnerabilities', item)) addGap('设备', asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || '漏洞数据读取失败或未执行', guidance.advice, guidance.verification)
      } else if (isRealGap(kindName, item)) addGap('设备', asset.assetId ?? asset.asset_id ?? ipOf(item) ?? nameOf(item), device.label, s.message || '检查读取失败或结论缺失', guidance.advice, guidance.verification)
    }
  }

  for (const rule of rules.values()) {
    if (rule.abnormal) addGroup('interconnect', { ruleName: rule.name, ip: '', hostname: `${rule.name} · 规则 ${rule.ruleId}` }, 'reachability')
  }
  if (missingSections) realGaps.push({ kind: '维度', label: `${missingSections} 个检查维度未返回明细`, reason: '未返回检查明细数组', advice: '请核查缺失检查维度的读取条件后重试。', verification: '取得完整检查明细或具体失败原因；不能用空结果替代。' })
  for (const gap of realGaps) groups.get('real_gap').push({ key: `gap:${gap.kind}:${gap.label}`, label: gap.label, item: { hostname: gap.label, ip: '' } })

  const noMatchRules = [...rules.values()].filter(rule => rule.noMatch).length
  const groupAdvice = key => {
    const first = groups.get(key)[0]
    if (key === 'offline') return '按A1核对资产身份、维护计划和离线／心跳时间；地址无效时先核实真实地址。'
    if (key === 'soc_unknown') return buildAdvice('status', first?.item).advice
    if (key === 'no_template' || key === 'no_data') return buildAdvice('baseline', first?.item).advice
    if (key === 'vulnerabilities') return 'A2：核实本机软件、版本与部署方式，逐项复核历史漏洞适用性。'
    if (key === 'interconnect') return first ? 'A4：核对规则要求、源目的服务及实际路径／策略证据。' : noMatchRules ? '当前范围无适用检查对；无需修改规则或补充图层，如需继续核查请提供适用对象/范围。' : '本次无规则异常。'
    if (key === 'real_gap') return realGaps[0]?.advice || '核对具体读取失败、未执行或缺失证据。'
    return ''
  }
  const groupVerification = key => {
    const first = groups.get(key)[0]
    if (key === 'offline') return '取得新的在线和持续采集记录，受影响业务复测通过。'
    if (key === 'soc_unknown') return buildAdvice('status', first?.item).verification
    if (key === 'no_template' || key === 'no_data') return buildAdvice('baseline', first?.item).verification
    if (key === 'vulnerabilities') return '完成逐条复核并取得处置或接受风险记录；本次未执行扫描或修复。'
    if (key === 'interconnect') return first ? '应允许的业务可用，应阻断的访问被阻断。' : '新增对象或范围变化时重新匹配。'
    if (key === 'real_gap') return realGaps[0]?.verification || '在授权范围内重试后取得明确成功结果或具体拒绝原因；不能用空结果或正常结论替代。'
    return ''
  }
  const groupDefinitions = [
    ['offline', '设备离线', 'danger'],
    ['soc_unknown', 'SOC未采集到状态数据', 'warning'],
    ['no_template', '设备未绑定基线模板', 'warning'],
    ['no_data', 'SOC未采集到基线数据', 'warning'],
    ['vulnerabilities', '历史漏洞待复核', 'warning'],
    ['interconnect', '互联规则异常', 'danger'],
    ['real_gap', '真实执行缺口', 'danger'],
  ].map(([key, title, tone]) => ({ key, title, tone, advice: groupAdvice(key), verification: groupVerification(key), count: groups.get(key).length, items: groups.get(key) }))
  const metricsAvailable = Object.values(availability).some(Boolean)
  const detailAvailable = Object.values(itemAvailability).some(Boolean)
  const deviceAvailable = itemAvailability.status || itemAvailability.baseline || itemAvailability.vulnerabilities
  const realGapCount = detailAvailable ? realGaps.length : null
  const counts = {
    devices: metricsAvailable ? devices.size || scopeCount || 0 : null, scopeCount,
    offline: itemAvailability.status ? groups.get('offline').length : finiteNumber(summaryCounts.status?.abnormal), socUnknown: itemAvailability.status ? groups.get('soc_unknown').length : finiteNumber(summaryCounts.status?.unknown),
    noTemplate: itemAvailability.baseline ? groups.get('no_template').length : null, noData: itemAvailability.baseline ? groups.get('no_data').length : null,
    vulnerabilities: itemAvailability.vulnerabilities ? [...devices.values()].reduce((sum, d) => sum + d.vulnerabilities, 0) : null,
    vulnerabilityDevices: itemAvailability.vulnerabilities ? groups.get('vulnerabilities').length : null,
    rules: itemAvailability.reachability ? rules.size : null, abnormalRules: itemAvailability.reachability ? [...rules.values()].filter(r => r.abnormal).length : null,
    noMatchRules: itemAvailability.reachability ? [...rules.values()].filter(r => r.noMatch).length : null,
    realGapCount,
  }
  const statusText = codeLabel(raw.status) || '未提供'
  const events = {
    schema: 'inspection-report-event/v1',
    runId,
    actions: ['view_problems', 'view_devices', 'view_rules', 'view_vulnerabilities', 'show_markdown', 'download_report', 'follow_up', 'load_details'],
  }
  return {
    schema: 'inspection-report-card/v1', runId, kind, script,
    execution: { status: text(raw.status), statusText, complete: raw.complete !== false && text(raw.status) === 'completed' },
    detailAvailable, metricsAvailable, availability, itemAvailability, deviceAvailable, summaryCounts, detailNodes: obj(raw.detail_nodes), emptyState: detailAvailable ? '' : text(raw.status) === 'failed' ? 'failed' : text(raw.status) === 'completed' ? 'empty' : 'pending',
    counts, groups: groupDefinitions,
    devices: [...devices.values()], rules: [...rules.values()],
    realGaps, events,
    initial: { evidenceVisible: false, deviceRows: 0, rawJsonVisible: false, showGroups: true, showActions: true },
  }
}

export function detailNodeId(model, dimension) {
  return model?.detailNodes?.[dimension]?.[0] || null
}

export function eventFor(model, action, target) {
  return {
    type: 'inspection_report_event', schema: model.events.schema, runId: model.runId, action,
    ...(target ? { target } : {}),
  }
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
/** 首屏概览 HTML：只含概览、问题分组与入口，不含设备全量、原始JSON或证据。 */
export function renderOverviewHtml(model) {
  const metric = (labelText, value) => `<div class="metric"><b>${esc(value ?? '—')}</b><span>${esc(labelText)}</span></div>`
  const groups = model.detailAvailable ? model.groups.filter(group => group.count > 0).map(group => `<button type="button" class="group ${esc(group.tone)}" data-view="${esc(group.key)}"><strong>${esc(group.title)}</strong><span>${esc(group.count)}</span><small>${esc(group.advice || group.items.slice(0, 3).map(item => item.label).join('；') || '无')}</small></button>`).join('') : ''
  return `<div class="head"><h3>巡检概览（30秒速读）</h3><span class="tag">${esc(model.script)}</span><span class="tag">${esc(model.execution.complete ? '执行完成' : `执行状态：${model.execution.statusText || model.execution.status || '未提供'}`)}</span>${model.runId ? `<span class="tag">${esc(model.runId)}</span>` : ''}</div>
${!model.detailAvailable ? `<p class="warning">${model.emptyState === 'failed' ? '执行失败，未取得终态业务明细；不显示设备0台、规则0条或“没有匹配”等伪结论。' : model.emptyState === 'pending' ? '执行已受理或仍在运行，业务明细尚未返回；不显示0业务结论。' : '执行已结束，业务明细未随有界摘要返回；显示真实计数，不伪造明细或0业务结论。'}</p>` : model.execution.complete ? '' : '<p class="warning">执行尚未完成；以下只展示已取得结果，缺失不代表正常。</p>'}
${model.metricsAvailable ? `<div class="metrics">${metric('冻结范围（含单元）', model.counts.scopeCount ?? model.counts.devices)}${metric('真实执行缺口', model.counts.realGapCount)}${metric('设备离线', model.counts.offline)}${metric('SOC未采集状态', model.counts.socUnknown)}${metric('未绑定模板', model.counts.noTemplate)}${metric('未采集基线', model.counts.noData)}</div>` : ''}
<div class="groups">${groups}</div>
<div class="actions"><button type="button" data-view="problems">查看主要问题</button><button type="button" data-view="devices">查看设备明细</button><button type="button" data-view="rules">查看规则</button><button type="button" data-view="vulnerabilities">查看漏洞</button><button type="button" data-view="evidence">展开证据</button><button type="button" class="primary" data-action="download_report">下载同Run报告</button><button type="button" data-action="follow_up">继续追问当前Run</button></div>
<p class="muted">业务结论与真实执行缺口分开；未采集、未绑定、无适用检查对不计为缺口。</p><p class="muted">${esc(EXECUTION_BOUNDARY)}</p>`
}


/** 把报告卡按钮事件写入输入机并提交；只接受本卡事件，失败不吞掉原因。 */
export function dispatchEventToInput(inputActions, event) {
  if (!event || event.type !== 'inspection_report_event' || !event.runId) return false
  inputActions.setDraft(JSON.stringify(event))
  inputActions.submit()
  return true
}


/** 巡检工具在聊天中的实际 wire 名为 mcp__inspection-compositions__<name>，同时兼容短名。 */
export const INSPECTION_TOOL_NAMES = ['inspection_deep', 'inspection_routine', 'inspection_status', 'inspection_baseline', 'inspection_vulnerabilities', 'inspection_reachability', 'get_composition_run']
export function toolViewKeys() {
  return INSPECTION_TOOL_NAMES.flatMap(name => [name, `mcp__inspection-compositions__${name}`])
}
/** 解析 tool.call.toolview 回执内容；只接受文本JSON或meta对象，不联网。 */
export function inspectionPayloadOf(block) {
  if (!block || block.isError) return null
  const content = Array.isArray(block.content) ? block.content : []
  const part = content.find(item => item && item.type === 'text' && typeof item.text === 'string')
  let value
  try { value = part ? JSON.parse(part.text) : block.meta } catch { return null }
  if (value && value.ok === true && value.result) value = value.result
  if (value && value.data && !value.kind && !value.checks) value = value.data
  if (value && value.run_id && (value.nodes || value.nodes_summary) && !value.checks) {
    const result = obj(value.result)
    return { kind: value.composition_id || value.workflow, run_id: value.run_id, status: value.status, execution_status: value.status, scope: value.scope, nodes: value.nodes, nodes_summary: value.nodes_summary, detail_nodes: value.detail_nodes, artifacts: value.artifacts, error: value.error, ...(Object.keys(obj(result.checks)).length ? { checks: result.checks } : {}) }
  }
  return value
}
