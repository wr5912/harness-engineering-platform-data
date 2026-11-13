import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readAssetWorkbook, requireAssetRootAgent } from './asset-workbook.mjs'

type Value = Record<string, any>
export const name = 'asset-onboarding-runtime'
export const inject = ['tools', 'mcpSessionManager']
export const TOOL_NAME = 'asset_onboarding'
export const GROUP_ID = 'asset-management'
const STATE_ROOT = '/var/lib/dsh/asset-onboarding'
const MAX_ASSETS = 200
const MAX_HOSTS = 4096
const MAX_OUTPUT = 128 * 1024
const operations = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const hash = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const text = (value: any) => typeof value?.content === 'string' ? value.content : (value?.content ?? []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('')
const object = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = (value: any) => Number.isSafeInteger(value) && value > 0
export const validSocId = (value: any) => positive(value) || typeof value === 'string' && /^[1-9]\d{0,18}$/u.test(value)
const sameSocId = (left: any, right: any) => validSocId(left) && validSocId(right) && String(left) === String(right)

/** 校验SOC真实start回执的preview→execution关联；不接受模型指定换号。 */
export function executionLink(record: any) {
  const started = record?.facts?.started, task = started?.task
  if (!task) return null
  let coverage = task.coverageJson
  if (typeof coverage === 'string') { try { coverage = JSON.parse(coverage) } catch { return null } }
  const previewId = record.previewTaskId ?? record.facts?.prepared?.taskId ?? record.facts?.prepared?.id
  const executionId = started.taskId
  const ranges = coverage?.includedRanges ?? coverage?.ranges
  try {
    if (!validSocId(executionId) || !sameSocId(task.id, executionId) || !sameSocId(coverage?.previewTaskId, previewId)
      || coverage.autoAdopt !== false || normalizeRange(ranges).ranges !== normalizeRange(record.ranges).ranges
      || (coverage.excludedRanges ? normalizeRange(coverage.excludedRanges).ranges : '') !== (record.excluded_ranges ?? '')) return null
  } catch { return null }
  return { taskId: executionId, previewTaskId: previewId, coverage }
}

/** 仅映射已核SOC前端终态；统计缺项保持null，不采用UI展示默认0。 */
export function discoveryCompletion(facts: any, taskId: any) {
  const task = facts?.task ?? facts
  const identity = sameSocId(task?.taskId ?? task?.id, taskId)
  const status = task?.status
  const counts = Object.fromEntries(['total', 'doneCount', 'adoptedCount', 'pendingCount', 'unreachableCount'].map(key => [key, Number.isSafeInteger(task?.[key]) && task[key] >= 0 ? task[key] : null]))
  const findings = facts?.findings
  const ids = Array.isArray(findings) ? findings.map((row: any) => row?.findingId ?? row?.id) : []
  const complete = identity && status === 'done' && Object.values(counts).every(value => value !== null)
    && counts.doneCount === counts.total && Array.isArray(findings)
    && ids.every(validSocId) && new Set(ids.map(String)).size === ids.length
    && findings.every((row: any) => isIP(row?.ip) === 4 && (row.taskId === undefined || sameSocId(row.taskId, taskId)))
  const eligible = Array.isArray(findings) ? findings.filter((row: any) => !row.adoptedAssetId && !row.identityConflict && row.conflict !== 1 && row.alive === 1 && typeof row.identifyStatus === 'string' && !['pending', 'identifying'].includes(row.identifyStatus)) : []
  return { eligible_findings: eligible, excluded_findings: Array.isArray(findings) ? findings.filter((row: any) => !eligible.includes(row)) : [],
    candidate_selection_gap: Array.isArray(findings) && findings.some((row: any) => row.adoptedAssetId) ? '已纳管记录的C(e)重登记条件尚未核实，不自动选取' : null,
    state: identity && status === 'done' ? 'completed' : identity && status === 'failed' ? 'failed' : identity && status === 'running' ? 'pending' : 'unknown',
    task_status: status ?? null, task_identity_verified: identity,
    completion_contract_verified: identity && ['done', 'failed', 'running'].includes(status), counts,
    candidate_complete: Boolean(complete), evidence_complete: Boolean(complete), registration_ready: Boolean(complete && eligible.length),
    result_shape_valid: Boolean(complete), collection_completeness: 'unknown', displayed_findings: ids.length,
    completeness_gap: '仅对本回执已核实选定子集授权预览，不宣称候选集合全量' }
}
export function candidateEvidenceSummary(evidence: any) {
  let parsed = evidence
  if (typeof evidence === 'string') { try { parsed = JSON.parse(evidence) } catch { /* 原文亦只提取实际匹配片段。 */ } }
  const excerpts: string[] = []
  const visit = (value: any, path = '', depth = 0) => {
    if (depth > 8 || excerpts.join('；').length >= 220) return
    if (value && typeof value === 'object') {
      if (/PING|OPEN[_ -]?PORTS|BANNER|NETBIOS/iu.test(`${path} ${value.type ?? ''} ${value.source ?? ''} ${value.method ?? ''}`)) { excerpts.push(`${path}:${JSON.stringify(value).slice(0, 160)}`); return }
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key, depth + 1)
    } else if (value !== undefined && value !== null) {
      const actual = `${path}:${String(value)}`
      const match = /PING|OPEN[_ -]?PORTS|BANNER|NETBIOS/iu.exec(actual)
      if (match) excerpts.push(actual.slice(Math.max(0, match.index - 16), match.index + 160))
    }
  }
  visit(parsed)
  const combined = excerpts.join('；')
  return { summary: combined ? combined.slice(0, 120) : '未提取到PING/OPEN_PORTS/BANNER/NETBIOS片段；详见原始证据', truncated: combined.length > 120 || excerpts.some(part => part.length >= 160), raw_preserved: true }
}
export function compactDiscovery(facts: any) {
  const findings = Array.isArray(facts?.findings) ? facts.findings : []
  const alive = findings.filter((row: any) => row.alive === 1)
  const task = facts?.task ?? facts
  let coverage = task?.coverageJson
  if (typeof coverage === 'string') { try { coverage = JSON.parse(coverage) } catch { coverage = null } }
  return { candidate_summary: alive.map((row: any) => ({ findingId: row.findingId ?? row.id, ip: row.ip,
      suggestName: row.suggestName ?? null, suggestAssetType: row.suggestAssetType ?? '未知', nameSourceLabel: row.nameSourceLabel ?? row.nameSource ?? null,
      identityConflict: row.identityConflict ?? null, conflict: row.conflict ?? null, adoptedAssetId: row.adoptedAssetId ?? null,
      evidence_summary: candidateEvidenceSummary(row.evidenceJson) })),
    candidate_summary_note: '全部本回执alive候选；证据为有界摘要，不替代原字段。完整事实仅保存在会话受管cache，预览仍回读同execution原始证据核对findingId/IP。',
    facts: { task: Object.fromEntries(['id', 'taskId', 'status', 'stage', 'executionStage', 'total', 'doneCount', 'discoveredCount', 'adoptedCount', 'pendingCount', 'unreachableCount'].filter(key => task?.[key] !== undefined).map(key => [key, task[key]])) },
    discovery_summary: { raw_findings: findings.length, alive: alive.length, not_alive: findings.filter((row: any) => row.alive === 0).length,
      type_suggested: alive.filter((row: any) => typeof row.suggestAssetType === 'string' && row.suggestAssetType).length,
      type_unknown: alive.filter((row: any) => !row.suggestAssetType).length, scanTargetCount: coverage?.scanTargetCount ?? null, managedSkipped: coverage?.managedSkipped ?? null },
    candidate_projection: 'all_returned_alive', collection_completeness: 'unknown' }
}
const cell = (value: any) => value === undefined || value === null ? '未提供' : String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ')

export function mainIdentity(exec: any) {
  const agent = requireAssetRootAgent(exec), header = agent.session.header
  const events = agent.session.snapshotEvents()
  if (!Array.isArray(events)) throw new Error('无法核对当前会话记录')
  const boundary = [...events].reverse().find((event: any) => event.type === 'turn/start' || event.type === 'turn/end')
  if (boundary?.type !== 'turn/start') throw new Error('没有正在办理的真实用户轮次')
  const users = events.slice(events.indexOf(boundary) + 1).filter((event: any) => event.type === 'user/message' && event.data?.source?.kind === 'user')
  const current = users.at(-1)
  if (!current?.data?.id) throw new Error('本轮缺少真实用户消息，历史确认、工具结果、附件正文、内部续办和定时消息均不构成授权')
  if ([...(agent.inbox?.nextTurn ?? []), ...(agent.inbox?.nextStep ?? [])].some((message: any) => message?.source?.kind === 'user')) throw new Error('有新的用户消息正在等待，先处理改参或取消，不继续提交原请求')
  if (exec.signal?.aborted) throw new Error('本次操作已取消')
  return { agent, events, current, sessionId: header.id, messageId: current.data.id, request: text(current.data).trim() }
}

const IPV4_TEXT = String.raw`\d{1,3}(?:\.\d{1,3}){3}`
const RANGE_TOKEN = String.raw`(?<![\w.:/\-])${IPV4_TEXT}(?:-${IPV4_TEXT}|/\d{1,2})?(?![\w.:/\-])`
const canonicalIpv4 = (value: string) => isIP(value) === 4 && value.split('.').every(part => String(Number(part)) === part)

/** 只改完整合法端点间的连接符；不拼接散落IP、不换算CIDR或补齐端点。 */
function normalizeRangeText(raw: string) {
  return raw.replace(new RegExp(String.raw`(?<![\w.:/\-])(${IPV4_TEXT})\s*(?:到|至|-)\s*(${IPV4_TEXT})(?![\w.:/\-])`, 'gu'),
    (original, start: string, end: string) => canonicalIpv4(start) && canonicalIpv4(end) ? `${start}-${end}` : original)
}

export function validateDiscoveryIntent(request: string) {
  // 只消除明确的失败后停机约束，不消除当前取消、否定或咨询。
  const intent = request
    .replace(/(?:如果|若|如|当)(?:发现|任务|请求|执行|返回|结果|调用|状态|为|出现|发生|未受理|失败|未知|不明|异常|超时|或|和|、|\s)*(?:未受理|失败|未知|不明|异常|超时)(?:时|则)?[，,\s]*(?:请)?\s*(?:立即)?停止(?:[，,、\s]*(?:且)?(?:不要|不|禁止)重试)?/gu, '')
    .replace(/(?:暂不|不|不要|无需)(?:导入|纳管)/gu, '')
  const denied = /取消|停止|撤销|如何|怎么|能否|是否|会影响|有什么影响|[?？]|(?:不|别|暂不|无需|禁止|勿)\s*(?:要\s*)?(?:再\s*)?(?:探测|发现|扫描|识别|执行|做任何动作)|(?:只|仅|先)(?:做|生成)?(?:整理|说明|解释|咨询|预览|清单|方案)|(?:只|仅)(?:查询|查看|读取)已有资产|Excel|excel|xlsx|表格|附件|导入/u.test(intent)
  let rangeOnly = false
  try { normalizeRange(intent); rangeOnly = true } catch { /* 不能从混合正文推导纯范围意图。 */ }
  if (denied || !(rangeOnly || /探测|发现|识别|扫描/u.test(intent) || /把[^。！？?\n]+范围的设备纳管/u.test(intent))) throw new Error('没有本轮明确探测授权，咨询和Excel导入不启动扫描')
}

export function normalizeRange(raw: string) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) throw new Error('请提供明确的IPv4、CIDR或起止IPv4范围')
  const number = (ip: string) => ip.split('.').reduce((result, part) => result * 256 + Number(part), 0)
  const ip = canonicalIpv4
  const ranges = [...new Set(normalizeRangeText(raw).trim().split(/[\s,，;；]+/).filter(Boolean))]
  let count = 0
  for (const range of ranges) {
    if (ip(range)) { count++; continue }
    const cidr = /^([^/]+)\/(\d{1,2})$/.exec(range)
    if (cidr && ip(cidr[1])) {
      const bits = Number(cidr[2]), size = 2 ** (32 - bits)
      if (bits > 32 || number(cidr[1]) % size !== 0) throw new Error('CIDR必须是网络地址对齐的IPv4范围')
      count += size; continue
    }
    const bounds = range.split('-')
    if (bounds.length !== 2 || !bounds.every(ip) || number(bounds[1]) < number(bounds[0])) throw new Error('IP范围格式无效，不推导或扩大用户网段')
    count += number(bounds[1]) - number(bounds[0]) + 1
  }
  if (!count || count > MAX_HOSTS) throw new Error(`单次范围最多${MAX_HOSTS}个地址，请明确拆分范围`)
  return { ranges: ranges.join(','), count }
}

/** 仅比较当前用户显式范围片段；意图、真实轮次及取消仍由调用方核对。 */
export function validateDiscoveryRanges(request: string, ranges: string, excludedRanges?: string) {
  const range = normalizeRange(ranges)
  const excluded = excludedRanges ? normalizeRange(excludedRanges).ranges : ''
  const source = normalizeRangeText(request)
  const tokens = [...source.matchAll(new RegExp(RANGE_TOKEN, 'gu'))].map(match => {
    const start = match.index!, end = start + match[0].length
    if (/(?:到|至|-|\/)\s*$/u.test(source.slice(0, start)) || /^\s*(?:到|至|-|\/)/u.test(source.slice(end))) {
      throw new Error('用户范围缺少完整端点，不能借参数补齐或推导范围')
    }
    return { start, end, value: normalizeRange(match[0]).ranges }
  })
  // 只识别紧邻显式列表的排除标记，不解释不明确的自然语言排除条件。
  const list = String.raw`${RANGE_TOKEN}(?:[\s,，、;；和及与]+${RANGE_TOKEN})*`
  const postfixList = list
  const exclusions = [
    ...source.matchAll(new RegExp(String.raw`(?:排除|不含|跳过|除了)\s*(?:(?:IP|地址|范围|网段)\s*[:：]?\s*)?${list}`, 'gu')),
    ...source.matchAll(new RegExp(String.raw`${postfixList}\s*除外`, 'gu')),
  ].map(match => ({ start: match.index!, end: match.index! + match[0].length }))
  for (const marker of source.matchAll(/排除|除外|跳过|不含|除了/gu)) {
    if (!exclusions.some(span => span.start <= marker.index! && span.end >= marker.index! + marker[0].length)) {
      throw new Error('用户含不能准确映射的排除约束，请先澄清，不启动扫描')
    }
  }
  for (const span of exclusions) {
    const next = tokens.find(token => token.start >= span.end)
    if (next && !exclusions.some(other => other.start <= next.start && other.end >= next.end)
      && !/^[,，;；。]\s*(?:仅|只)?(?:对|发现|探测|扫描|识别|包含|包括)\s*$/u.test(source.slice(span.end, next.start))) {
      throw new Error('排除列表后仍有不能明确归属的IP，请先澄清，不静默漏排除')
    }
    if (source.slice(span.start, span.end).endsWith('除外')) {
      const previous = tokens.filter(token => token.end <= span.start).at(-1)
      if (previous && !/[,，;；。!?！？]/u.test(source.slice(previous.end, span.start))) {
        throw new Error('除外列表前仍有不能明确归属的IP，请先澄清，不将排除项当包含项')
      }
    }
  }
  const includedSource = new Set<string>(), excludedSource = new Set<string>()
  for (const token of tokens) {
    const excludedToken = exclusions.some(span => span.start <= token.start && span.end >= token.end)
    ;(excludedToken ? excludedSource : includedSource).add(token.value)
  }
  if (range.ranges.split(',').some(part => !includedSource.has(part))) {
    throw new Error('包含范围必须与当前用户的完整显式范围同值，不拼接、推导或扩大目标')
  }
  const excludedParts = excluded.split(',').filter(Boolean)
  if (excludedParts.length !== excludedSource.size || excludedParts.some(part => !excludedSource.has(part))) {
    throw new Error('排除范围必须完整对应当前用户的排除项，不能缺失、错配或冒充包含范围')
  }
  return { range, excluded }
}

export function normalizeAssets(rows: any[]) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ASSETS) throw new Error(`每批待纳管设备应为1至${MAX_ASSETS}条，不接受空清单或静默截断`)
  const allowed = new Set(['ip', 'hostname', 'assetType', 'os', 'modelId', 'deployForm', 'hostAssetId', 'findingId'])
  const seen = new Set()
  return rows.map((row, index) => {
    if (!object(row) || Object.keys(row).some(key => !allowed.has(key))) throw new Error(`第${index + 1}条含不支持字段；软件资产不能冒用设备新增入口`)
    if (isIP(row.ip) !== 4 || row.ip.split('.').some((part: string) => String(Number(part)) !== part)) throw new Error(`第${index + 1}条缺少规范IPv4，Excel导入不将范围展开为设备`)
    if (seen.has(row.ip)) throw new Error(`IP ${row.ip}重复，请先合并或澄清冲突字段`)
    seen.add(row.ip)
    const value: Value = { ip: row.ip }
    // 可编辑字段保持真实空白：空串/null不写入，也不写“未提供”占位。
    for (const field of ['hostname', 'assetType', 'os']) if (row[field] !== undefined && row[field] !== null && String(row[field]).trim() !== '') {
      const text = String(row[field]).trim()
      if (text.length > 255 || /[\u0000-\u001f]/u.test(text)) throw new Error(`第${index + 1}条${field}无效`)
      value[field] = text
    }
    let deployForm
    try { deployForm = normalizeDeployForm(row.deployForm) } catch { throw new Error(`第${index + 1}条部署形态无效`) }
    if (deployForm !== undefined) value.deployForm = deployForm
    for (const field of ['modelId', 'hostAssetId', 'findingId']) if (row[field] !== undefined) {
      if (!(field === 'findingId' ? validSocId(row[field]) : positive(row[field]))) throw new Error(`第${index + 1}条${field}必须来自真实资料且为无损正整数标识`)
      value[field] = row[field]
    }
    return value
  })
}

class SocFailure extends Error {
  businessFailure: boolean
  constructor(code: any, message: string) { super(message); this.businessFailure = /^4\d\d$/.test(String(code)) }
}
const validAssetId = (value: any) => positive(value) || typeof value === 'string' && /^[1-9]\d*$/.test(value)

export const DEPLOY_FORM_OPTIONS = [
  { value: 'physical', label: '物理设备' },
  { value: 'vm', label: '虚拟机' },
  { value: 'container', label: '容器' },
] as const
const DEPLOY_FORM_LABELS: Record<string, string> = { physical: '物理设备', vm: '虚拟机', container: '容器' }
/** 仅做SOC枚举映射：接受中文标签或枚举值；其余非空文本按用户自定义原样保留，不猜类型。 */
export function normalizeDeployForm(value: any) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new Error('部署形态必须是文本')
  const text = value.trim()
  if (!text) return undefined
  if (text.length > 64 || /[\u0000-\u001f]/u.test(text)) throw new Error('部署形态无效')
  const matched = DEPLOY_FORM_OPTIONS.find(option => option.value === text || option.label === text)
  return matched ? matched.value : text
}
export const deployFormLabel = (value: any) => !value ? '' : DEPLOY_FORM_LABELS[value] ?? String(value)
/** 用户可见文案优先中文；SOC原值保留英文时附中文说明，不改机器字段。 */
const ASSET_TYPE_LABELS: Record<string, string> = { host: '主机', server: '服务器', switch: '交换机', router: '路由器', firewall: '防火墙', database: '数据库', middlebox: '中间件设备' }
export const assetTypeLabel = (value: any) => {
  if (!value) return '未知'
  const text = String(value)
  return ASSET_TYPE_LABELS[text] ? `${text}（${ASSET_TYPE_LABELS[text]}）` : text
}
export const sourceKindLabel = (value: any) => value === 'discovery' ? '网络发现（discovery）' : value === 'excel' ? '附件导入（excel）' : String(value ?? '未知')
/** 状态由本地校验或SOC回执决定，不接受用户编辑。 */
export const STATUS_STYLE: Record<string, { text: string; color: string }> = {
  submittable: { text: '可提交', color: 'green' },
  incomplete: { text: '待补全', color: 'yellow' },
  validating: { text: '校验中', color: 'blue' },
  failed: { text: '提交失败', color: 'red' },
  review: { text: '待核对', color: 'gray' },
  skipped: { text: '已跳过', color: 'gray' },
  submitted: { text: '已提交', color: 'green' },
}
export const TABLE_COLUMNS = ['序号', 'IP', '名称', '设备类型', '操作系统', '部署形态', '状态']
const tableCell = (value: any) => value === undefined || value === null ? '' : String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ')

/** 资源工具assetId仍为integer：仅当可精确还原为同一十进制数时才转number，超安全整数保持null不发送。 */
export function readAssetIdParam(value: any) {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && String(number) === value ? number : null
}

/** 原始批量回执中同finding只有明确error且无有效assetId时返回该error；其余一律null，保持未知防重放。 */
export function rejectedInRaw(raw: any, findingId: any) {
  const rows = Array.isArray(raw?.results) ? raw.results : Array.isArray(raw?.items) ? raw.items : []
  const matches = validSocId(findingId) ? rows.filter((row: any) => sameSocId(row?.findingId, findingId)) : []
  if (matches.length !== 1) return null
  const row = matches[0]
  if (validAssetId(row?.assetId ?? row?.data?.assetId)) return null
  const error = typeof (row?.error ?? row?.data?.error) === 'string' ? String(row?.error ?? row?.data?.error).trim() : ''
  return error ? error.slice(0, 300) : null
}
/** 旧回执仅按原raw派生明确失败，不回写历史文件、不改变聊天与raw原文；真实旧journal无kind字段。 */
export function derivedReceipt(value: any) {
  if (!Array.isArray(value?.results) || value?.raw_adopt_result === undefined) return value
  let changed = false
  const results = value.results.map((row: any) => {
    if (row?.status !== 'unknown') return row
    const error = rejectedInRaw(value.raw_adopt_result, row.findingId)
    if (!error) return row
    changed = true
    return { ...row, status: 'failed', reason: error, derived_from_raw: true }
  })
  return changed ? { ...value, results } : value
}
async function priorRejection(directory: string, previous: any) {
  // 旧settleTarget只存{ip,state,preview_digest,result}，findingId在result内；须与journal同IP、同finding、同预览绑定。
  const findingId = previous?.result?.findingId ?? previous?.findingId
  const ip = previous?.ip ?? previous?.result?.ip
  if (!previous?.preview_digest || !validSocId(findingId) || isIP(ip) !== 4) return null
  let journal
  try { journal = JSON.parse(await readFile(join(directory, `${previous.preview_digest}.json`), 'utf8')) } catch (error: any) { if (error.code === 'ENOENT') return null; throw error }
  if (journal?.preview_digest !== previous.preview_digest) return null
  const rows = Array.isArray(journal?.results) ? journal.results : []
  const matches = rows.filter((row: any) => row?.ip === ip && sameSocId(row?.findingId, findingId) && row?.status === 'unknown')
  if (matches.length !== 1) return null
  return rejectedInRaw(journal.raw_adopt_result, findingId)
}

/** 同一Session按IP跨清单、跨手工/发现路线拦住未核写入；仅原raw明确拒绝且未产出资产ID的目标允许按新确认重试。 */
async function reserveTarget(directory: string, asset: any, preview: any) {
  const path = join(directory, `target-${hash(asset.ip)}.json`)
  let previous
  try { previous = JSON.parse(await readFile(path, 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
  if (previous && !['failed', 'not_submitted'].includes(previous.state)) {
    if (previous.state !== 'unknown' || !(await priorRejection(directory, previous))) return { path, previous }
  }
  const value = { ip: asset.ip, state: 'pending', preview_digest: preview.preview_digest, route: preview.route, taskId: preview.taskId, findingId: asset.findingId ?? null }
  await writeFile(path, JSON.stringify(value), { ...(previous ? {} : { flag: 'wx' }), mode: 0o600, flush: true })
  return { path, previous: null }
}
async function settleTarget(path: string, result: any, preview: any) {
  await writeFile(path, JSON.stringify({ ip: result.ip, state: result.status, preview_digest: preview.preview_digest, result }), { mode: 0o600, flush: true })
}
// 仅投影错误诊断字段，不输出请求头、凭据或完整传输对象。
export function safeDiagnostic(value: any): string {
  return String(value ?? '').replace(/(?:Bearer|Basic)\s+[A-Za-z0-9+\/_.=-]+/giu, '[已隐藏]')
    .replace(/(["']?(?:x-api[-_](?:key|token)|authorization|apiKey|access_token|password|credential|secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/giu, '$1[已隐藏]').slice(0, 1200)
}
export function toolFailure(result: any): Error {
  const blocks = Array.isArray(result?.content) ? result.content.flatMap((part: any) => part.type === 'tool-result' ? part.content ?? [] : [part]) : []
  const raw = blocks.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('\n')
  let parsed: any
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  const detail = result?.error ?? result?.structuredContent?.error ?? parsed?.error ?? parsed ?? result?.structuredContent ?? {}
  const field = (key: string) => detail?.[key] ?? detail?.details?.[key] ?? result?.[key]
  const diagnostic = {
    layer: 'tool', code: safeDiagnostic(field('code')) || null,
    http_status: field('httpStatus') ?? field('status') ?? null,
    message: safeDiagnostic(field('message') ?? field('msg') ?? raw) || '未取得原始错误正文',
    not_sent: field('notSent') === true,
    request_id: safeDiagnostic(field('requestId') ?? field('correlationId') ?? field('traceId')) || null,
  }
  return Object.assign(new Error(`SOC工具返回错误：${diagnostic.message}`), {
    diagnostic, notSent: diagnostic.not_sent, businessFailure: false,
  })
}
export function unpack(result: any): any {
  if (result?.isError) throw toolFailure(result)
  let value = result?.value ?? result?.structuredContent
  if (value === undefined && object(result) && result.code !== undefined) value = result
  if (value === undefined) {
    const blocks = (result?.content ?? []).flatMap((part: any) => part.type === 'tool-result' ? part.content ?? [] : [part])
    const raw = blocks.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('')
    try { value = JSON.parse(raw) } catch { throw new Error('SOC回执不是可核验JSON，不能视为成功') }
  }
  if (object(value) && value.structuredContent !== undefined) value = value.structuredContent
  if (object(value) && Array.isArray(value.content) && value.code === undefined) return unpack(value)
  if (!object(value) || value.code === undefined) throw new Error('SOC回执缺少业务状态')
  if (!['200', '0'].includes(String(value.code))) throw new SocFailure(value.code, `SOC拒绝请求：${String(value.msg ?? value.message ?? value.code).slice(0, 300)}`)
  if (Array.isArray(value.rows) && Number.isSafeInteger(value.total) && value.total >= 0) return value
  return value.data ?? null
}

export function history(events: any[]) {
  const calls = new Map(), records: any[] = []
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event.type === 'tool/call' && event.data?.name === TOOL_NAME) calls.set(event.data.callId, event.data)
    const message = event.data?.message
    if (event.type !== 'tool/result' || message?.source?.kind !== 'tool' || message.isError || !calls.has(message.source.callId)) continue
    const block = message.content?.find((part: any) => part.type === 'tool-result' && part.toolCallId === message.source.callId)
    if (block?.isError) continue
    const raw = (block?.content ?? message.content ?? []).find((part: any) => part.type === 'text')?.text
    try {
      const value = JSON.parse(raw)
      if (value.schema_version === 'asset-onboarding/v1') records.push({ value: derivedReceipt(value), index })
    } catch { /* 非本工具的可重建JSON不作授权依据。 */ }
  }
  return records
}

/** 仅读取本会话该批次的取消标记；其他批次与重新预览不受影响。 */
export async function cancelledBatch(sessionId: string, digest: string) {
  try { await readFile(join(STATE_ROOT, hash([GROUP_ID, sessionId]), `cancelled-${digest}.json`), 'utf8'); return true }
  catch (error: any) { if (error.code === 'ENOENT') return false; throw error }
}
/** 统一取消：仅未提交批次可失效；已提交/提交中/结果未知一律拒绝，不冒充撤回。 */
export async function cancelPreviewBatch(identity: any, preview: any) {
  const directory = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]))
  let journal
  try { journal = JSON.parse(await readFile(join(directory, `${preview.preview_digest}.json`), 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
  if (journal) throw new Error('本批次已提交或提交结果未知，不能取消；请核对SOC原记录后再处理')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(join(directory, `cancelled-${preview.preview_digest}.json`),
    JSON.stringify({ session_id: identity.sessionId, preview_digest: preview.preview_digest, cancelled_at: new Date().toISOString() }), { mode: 0o600, flush: true })
  return preview.preview_digest
}
export function priorPreview(identity: any, expected: string) {
  const records = history(identity.events)
  const record = records.filter(item => item.value.kind === 'preview').at(-1)
  if (!record || record.value.session_id !== identity.sessionId || record.value.group_id !== GROUP_ID || record.value.preview_digest !== expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('没有匹配的本会话最新待导入清单，请先重新预览')
  if (hash([GROUP_ID, identity.sessionId, record.value.preview_user_message_id, record.value.assets, record.value.source, record.value.route, record.value.taskId ?? null]) !== expected) throw new Error('清单摘要与当前会话或冻结字段不符，不能确认继承或改写的清单')
  if (records.some(item => item.index > record.index && item.value.kind === 'cancelled')) throw new Error('本批次已取消，旧确认失效')
  const after = identity.events.slice(record.index + 1).filter((event: any) => event.type === 'user/message' && event.data?.source?.kind === 'user')
  const confirmation = /^确认(?:导入|纳管)$/u
  if (!after.length || after.at(-1)?.data.id !== identity.messageId || !confirmation.test(identity.request)
    || after.some((event: any) => !confirmation.test(text(event.data).trim()))) throw new Error('查看完整清单后请单独回复“确认导入”或“确认纳管”；其他新消息使旧确认失效')
  const confirmedIndex = identity.events.indexOf(after.at(-1))
  // 只忽略无语义空白行；非空行的字符、单元格、批次及顺序均保持精确匹配。
  const nonEmptyLines = (value: string) => value.replace(/\r\n?/gu, '\n').split('\n').filter(line => line.trim().length > 0)
  const expectedLines = typeof record.value.markdown === 'string' ? nonEmptyLines(record.value.markdown) : []
  const visible = expectedLines.length > 0 && identity.events.slice(record.index + 1, confirmedIndex).some((event: any) => {
    if (event.type !== 'assistant/message') return false
    const lines = nonEmptyLines(text(event.data?.message ?? event.data))
    const normalized = (line: string) => line.replace(/`/gu, '').trim()
    if (lines.some((_: string, start: number) => expectedLines.every((line, offset) => lines[start + offset] === line))) return true
    const displayed = lines.map(normalized)
    const heading = displayed.some(line => line.includes(expected.slice(0, 12)))
      && displayed.some(line => new RegExp(`(?:^|[^0-9])${record.value.assets.length}\\s*(?:条|个)(?![0-9])`, 'u').test(line))
    const rows = lines.filter(line => line.trim().startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => normalized(cell)))
    const header = rows.find(row => row.includes('序号') && row.includes('IP'))
    // 新七列表格按冻结table逐行核对；旧批次沿用原七列（型号ID/宿主ID），保持历史清单可回读。
    if (record.value.table?.columns) {
      const columns: string[] = record.value.table.columns
      if (!header || columns.some(key => !header.includes(key))) return false
      return heading && record.value.table.rows.every((expected: string[]) => {
        const matches = rows.filter(row => row[1] === expected[1])
        return matches.length === 1 && expected.every((value, offset) => matches[0][offset] === value)
      }) && rows.filter(row => row.some(value => isIP(value) === 4)).length === record.value.table.rows.length
    }
    if (!header || ['序号', 'IP', '主机名', '资产类型', '型号ID', '部署形态', '宿主ID'].some((key, index) => header[index] !== key)) return false
    return heading && record.value.assets.every((asset: any, index: number) => {
      const matches = rows.filter(row => row.includes(asset.ip))
      const fields = [String(index + 1), asset.ip, cell(asset.hostname), cell(asset.assetType), cell(asset.modelId), cell(asset.deployForm), cell(asset.hostAssetId)]
      return matches.length === 1 && fields.every((field, offset) => matches[0][offset] === field)
    }) && rows.filter(row => row.some(value => isIP(value) === 4)).length === record.value.assets.length
  })
  if (!visible) throw new Error('本清单尚未在确认前完整呈现在聊天正文，请先原样展示清单')
  return record.value
}

function sourceEvidence(identity: any, source: any) {
  const records = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID)
  const record = source?.kind === 'excel'
    ? records.filter(item => item.value.kind === 'workbook' && item.value.attachment_id === source.attachment_id).at(-1)
    : source?.kind === 'discovery'
      ? records.filter(item => ['discovery', 'discovery-result'].includes(item.value.kind) && item.value.evidence_id === source.evidence_id).at(-1) : undefined
  if (!record || record.value.evidence_complete === false || ['pending', 'accepted', 'failed', 'unknown'].includes(record.value.state)
    || source?.kind === 'discovery' && record.value.taskId && (record.value.completion_contract_verified !== true || record.value.candidate_complete !== true)) throw new Error('清单必须引用本会话真实、完整且已核实终态与候选的SOC发现回执，不能使用失败、未知或不完整来源')
  return record.value
}
function contains(value: any, predicate: (item: any) => boolean): boolean {
  if (predicate(value)) return true
  return Array.isArray(value) ? value.some(item => contains(item, predicate)) : object(value) ? Object.values(value).some(item => contains(item, predicate)) : false
}
export function previewAssets(identity: any, args: any, managed?: Map<string, any>) {
  const source = sourceEvidence(identity, args.source), candidates = normalizeAssets(args.assets)
  for (const asset of candidates) {
    if (!contains(source, item => item === asset.ip)) throw new Error(`IP ${asset.ip}没有所选来源依据，不允许补造设备`)
    if (source.taskId && !validSocId(asset.findingId)) throw new Error('任务发现结果必须保留findingId并使用发现纳管，不能改走手工登记')
    if (asset.findingId !== undefined && (!source.taskId || !contains(source.facts, item => object(item) && item.ip === asset.ip && sameSocId(item.findingId ?? item.id, asset.findingId)))) throw new Error('findingId与IP未绑定到同一真实发现结果')
    const alreadyAdopted = Array.isArray(source.facts?.findings) && source.facts.findings.find((row: any) => row.ip === asset.ip && sameSocId(row.findingId ?? row.id, asset.findingId))?.adoptedAssetId
    if (source.taskId && source.facts?.task && !alreadyAdopted
      && !discoveryCompletion(source.facts, source.taskId).eligible_findings.some((row: any) => row.ip === asset.ip && sameSocId(row.findingId ?? row.id, asset.findingId))) throw new Error('所选候选已纳管、不可达、识别未完成或存在冲突，禁止登记')
  }
  const route = source.taskId ? 'adopt' : 'manual'
  const findings = Array.isArray(source.facts?.findings) ? source.facts.findings : []
  const pending: any[] = [], skipped: any[] = [], conflicts: any[] = []
  let baselineUnknown = 0
  for (const asset of candidates) {
    const finding = findings.find((row: any) => row.ip === asset.ip && sameSocId(row.findingId ?? row.id, asset.findingId))
    if (finding?.adoptedAssetId) {
      skipped.push({ ip: asset.ip, name: asset.hostname ?? finding.suggestName ?? '', assetId: finding.adoptedAssetId, reason: 'SOC发现记录已标记纳管' })
      continue
    }
    // 未提供受管查询结果时保持纯函数原样（离线校验）；生产路径总会传入Map。
    if (!(managed instanceof Map)) { pending.push(asset); continue }
    const known = managed.get(asset.ip)
    const rows = Array.isArray(known?.rows) ? known.rows : null
    if (rows === null) { baselineUnknown++; pending.push({ ...asset, lookup: 'unknown' }); continue }
    if (!rows.length) { pending.push({ ...asset, lookup: 'absent' }); continue }
    // 身份一致：名称与设备类型不冲突（候选未提供的字段不参与冲突判定）。
    const consistent = rows.filter((row: any) => (!asset.hostname || !row.hostname || row.hostname === asset.hostname) && (!asset.assetType || !row.assetType || row.assetType === asset.assetType))
    const differing = rows.filter((row: any) => !consistent.includes(row))
    if (consistent.length && !differing.length) {
      skipped.push({ ip: asset.ip, name: asset.hostname ?? consistent[0].hostname ?? '', assetId: consistent[0].assetId ?? consistent[0].id ?? null, reason: 'SOC已有身份一致资产' })
      continue
    }
    if (differing.length) {
      conflicts.push({ ip: asset.ip, candidate: { name: asset.hostname ?? '', assetType: asset.assetType ?? '' },
        existing: rows.map((row: any) => ({ assetId: row.assetId ?? row.id ?? null, hostname: row.hostname ?? '', assetType: row.assetType ?? '', source: row.source ?? null })), reason: '同IP名称或设备类型冲突' })
      continue
    }
    pending.push({ ...asset, lookup: 'absent' })
  }
  const types: Record<string, number> = {}
  for (const asset of pending) { const key = asset.assetType ?? '未知'; types[key] = (types[key] ?? 0) + 1 }
  const summary = {
    source: args.source, ranges: source.ranges ?? null, taskId: source.taskId ?? null,
    candidates: candidates.length, already_managed: skipped.length, pending: pending.length,
    type_distribution: types, missing_deploy_form: pending.filter((asset: any) => !asset.deployForm).length,
    type_unknown: pending.filter((asset: any) => !asset.assetType).length,
    conflicts: conflicts.length, unreachable: findings.filter((row: any) => row.alive !== 1).length, baseline_unknown: baselineUnknown,
  }
  const blocked = conflicts.length > 0
  const preview_digest = hash([GROUP_ID, identity.sessionId, identity.messageId, pending, args.source, route, source.taskId ?? null])
  const rows = pending.map((asset: any, index: number) => {
    const key = !asset.deployForm || !asset.assetType ? 'incomplete' : 'submittable'
    const finding = findings.find((row: any) => row.ip === asset.ip && sameSocId(row.findingId ?? row.id, asset.findingId))
    return { index: index + 1, ip: asset.ip, name: asset.hostname ?? '', assetType: asset.assetType ?? '未知',
      os: asset.os ?? finding?.osName ?? '未识别', deployForm: asset.deployForm ?? '', status_key: key,
      status: STATUS_STYLE[key].text, color: STATUS_STYLE[key].color }
  })
  const table = { columns: TABLE_COLUMNS, rows: rows.map((row: any) => [String(row.index), row.ip, row.name, assetTypeLabel(row.assetType === '未知' ? '' : row.assetType), row.os, deployFormLabel(row.deployForm), row.status].map(tableCell)) }
  const lines = [
    `【纳管预览总结】来源：${sourceKindLabel(args.source?.kind)}${source.taskId ? `；任务编号（taskId）${source.taskId}` : ''}${source.ranges ? `；范围 ${source.ranges}` : ''}`,
    `候选总数 ${summary.candidates}；已纳管 ${summary.already_managed}；待纳管 ${summary.pending}`,
    `设备类型分布：${Object.keys(types).length ? Object.entries(types).map(([key, value]) => `${assetTypeLabel(key === '未知' ? '' : key)} ${value}`).join('；') : '无'}；缺部署形态 ${summary.missing_deploy_form}；类型未知 ${summary.type_unknown}`,
    `冲突 ${summary.conflicts}；未响应 ${summary.unreachable}（未响应不代表无设备）；SOC基线读失败 ${baselineUnknown}（未知不按0处理）`,
    '',
    `待纳管清单 ${pending.length} 条 · 批次 ${preview_digest.slice(0, 12)}`,
    `|${TABLE_COLUMNS.join('|')}|`,
    `|${TABLE_COLUMNS.map(() => '---').join('|')}|`,
    ...table.rows.map((row: string[]) => `|${row.join('|')}|`),
  ]
  if (skipped.length) lines.push('', `已跳过 ${skipped.length} 条：${skipped.map((row: any) => `${row.ip}${row.assetId ? `/${row.assetId}` : ''}（${row.reason}）`).join('；')}`)
  if (conflicts.length) lines.push('', `⚠ 冲突 ${conflicts.length} 条，阻断提交：${conflicts.map((row: any) => `${row.ip}（已有${row.existing.map((item: any) => `${item.hostname || '名称未知'}/${item.assetType || '类型未知'}`).join('、')}；候选${row.candidate.name || '名称未知'}/${row.candidate.assetType || '类型未知'}）`).join('；')}`)
  if (blocked) lines.push('整批已阻断：请先处理同IP冲突，不得带冲突提交。')
  if (!pending.length) lines.push('没有待纳管设备；已纳管或已跳过项不提交。')
  return { kind: 'preview', preview_digest, preview_user_message_id: identity.messageId, assets: pending, source: args.source, route, taskId: source.taskId ?? null,
    summary, rows, table, skipped, conflicts, blocked, block_reason: blocked ? '同IP冲突' : null,
    deploy_form_options: DEPLOY_FORM_OPTIONS, markdown: lines.join('\n'), saved: false }
}

const GROUP_TARGET = 'io.deepseek.dsh/mcp-group-target'
const GROUP_OWNER = 'io.deepseek.dsh/mcp-group-tool'
const TASK_QUERY = 'get_soc_discovery_tasks_by_task_id'
const TASK_SCOPE = 'get_soc_discovery_tasks_scope'
const bindingError = (code: string) => Object.assign(new Error(`资产组接线未就绪：${code}；未发送SOC业务请求，不表示设备离线或SOC无数据`), { code })

/** 复用现有公开组v2合同，不注册底层工具、不猜本地命名、不读取认证或跨作用域取工具。 */
export function createAssetGroupBackend(ctx: any) {
  const pending = new WeakMap<object, Promise<any>>()
  const identity = (exec: any) => {
    mainIdentity(exec)
    if (!exec.agent?.session?.id || typeof exec.callId !== 'string' || !exec.callId) throw bindingError('ASSET_NATIVE_CONTEXT_MISSING')
  }
  const supported = () => typeof ctx.mcpSessionManager?.listGroupTools === 'function' && typeof ctx.mcpSessionManager?.callGroupTool === 'function'
  const catalog = async (exec: any) => {
    identity(exec)
    if (!supported()) throw bindingError('ASSET_GROUP_API_UNAVAILABLE')
    if (!pending.has(exec)) pending.set(exec, (async () => {
      const value = await ctx.mcpSessionManager.listGroupTools(GROUP_ID, 2)
      identity(exec)
      const target = value?._meta?.[GROUP_TARGET]
      if (!Array.isArray(value?.tools) || value.nextCursor || value?._meta?.['io.deepseek.dsh/mcp-group-discovery']?.unavailable?.length
        || target?.version !== 2 || typeof target.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(target.digest)) throw bindingError('ASSET_GROUP_CATALOG_INVALID')
      return { tools: value.tools, meta: { [GROUP_TARGET]: { digest: target.digest, version: 2 } } }
    })())
    const value = await pending.get(exec)
    identity(exec)
    return value
  }
  const matches = (directory: any, operation: string) => directory.tools.filter((tool: any) => tool.name === operation)
  const verified = (tool: any, operation: string) => {
    const owner = tool?._meta?.[GROUP_OWNER]
    return owner?.serverId === 'ai-soc-master' && owner.sourceName === operation && owner.kind === ([TASK_QUERY, TASK_SCOPE].includes(operation) ? 'template' : 'tool')
  }
  const taskContract = (tool: any, operation = TASK_QUERY) => {
    const uri = tool?._meta?.[GROUP_OWNER]?.sourceUri, schema = tool?.inputSchema
    const property = schema?.properties?.taskId
    const type = ['integer', 'number', 'string'].includes(property?.type) ? property.type
      : property?.oneOf?.some((item: any) => item.type === 'string') ? 'string' : undefined
    if (!verified(tool, operation) || typeof uri !== 'string' || !(operation === TASK_SCOPE ? /\/soc\/discovery\/tasks\/\{taskId\}\/scope$/u : /\/soc\/discovery\/tasks\/\{taskId\}$/u).test(uri)
      || /[{}]/u.test(uri.replace('{taskId}', '')) || schema?.type !== 'object' || !Array.isArray(schema.required)
      || schema.required.length !== 1 || schema.required[0] !== 'taskId' || !type) throw bindingError('ASSET_TASK_TEMPLATE_INVALID')
    return { uri, type }
  }
  const lookup = async (operation: string, exec: any) => {
    if (![...operations, TASK_QUERY, TASK_SCOPE].includes(operation)) throw bindingError('ASSET_OPERATION_OUT_OF_SCOPE')
    const directory = await catalog(exec), rows = matches(directory, operation)
    if (rows.length !== 1 || !verified(rows[0], operation)) throw bindingError('ASSET_GROUP_BINDING_NOT_UNIQUE')
    if ([TASK_QUERY, TASK_SCOPE].includes(operation)) taskContract(rows[0], operation)
    return { tool: rows[0], meta: directory.meta }
  }
  const dispatch = async (operation: string, args: any, exec: any) => {
    let binding
    try { identity(exec); binding = await lookup(operation, exec); identity(exec) }
    catch (error: any) { error.notSent = true; throw error }
    // 现有服务内部保持目标摘要、原生Session/callId、叶子许可及取消信号，不重新发现或自动重发。
    try { return await ctx.mcpSessionManager.callGroupTool(GROUP_ID, 2, binding.tool.name, args, binding.meta, exec) }
    catch (error: any) { throw toolFailure({ error: { code: error.code, message: error.message, status: error.status, notSent: error.notSent, requestId: error.requestId } }) }
  }
  return {
    lookup,
    call: async (operation: string, args: any, exec: any) => {
      if (!operations.includes(operation)) throw bindingError('ASSET_OPERATION_OUT_OF_SCOPE')
      return unpack(await dispatch(operation, args, exec))
    },
    resource: async (taskId: string | number, exec: any, operation = TASK_QUERY) => {
      if (!validSocId(taskId)) throw bindingError('ASSET_TASK_ID_INVALID')
      const binding = await lookup(operation, exec), { uri, type } = taskContract(binding.tool, operation)
      const result = await dispatch(operation, { taskId: type === 'string' ? String(taskId) : taskId }, exec)
      if (result?.isError) throw toolFailure(result)
      const value = result?.structuredContent
      // 公开组资源合同保留代理URI，不把上游HTTP URI当组资源回执。
      const proxy = `mcp-group:/${GROUP_ID}/ai-soc-master/t/${Buffer.from(uri).toString('base64url')}`
      const entries = value?.contents?.filter((item: any) => [proxy, `${proxy}?taskId=${encodeURIComponent(String(taskId))}`].includes(item.uri) && typeof item.text === 'string')
      if (!Array.isArray(entries) || entries.length !== 1) throw new Error('发现任务回执与已绑定资源URI不匹配，不能据展示占位或空数组判完成')
      return unpack({ value: JSON.parse(entries[0].text) })
    },
    readAsset: async (operation: string, args: any, exec: any) => {
      if (!['list_soc_asset', 'get_soc_asset_by_asset_id'].includes(operation)) throw bindingError('ASSET_READ_OUT_OF_SCOPE')
      const directory = await catalog(exec), rows = matches(directory, operation)
      if (rows.length !== 1 || rows[0]?._meta?.[GROUP_OWNER]?.serverId !== 'ai-soc-master' || rows[0]?._meta?.[GROUP_OWNER]?.sourceName !== operation) throw bindingError('ASSET_READ_BINDING_NOT_UNIQUE')
      identity(exec)
      const result = await ctx.mcpSessionManager.callGroupTool(GROUP_ID, 2, rows[0].name, args, directory.meta, exec)
      if (result?.isError) throw toolFailure(result)
      const entries = result?.structuredContent?.contents
      if (!Array.isArray(entries) || entries.length !== 1 || typeof entries[0].text !== 'string') throw new Error('资产只读回执正文缺失')
      return unpack({ value: JSON.parse(entries[0].text) })
    },
    status: async (exec: any) => {
      let directory: any, error: string | null = null
      try { directory = await catalog(exec) }
      catch (failure: any) { error = typeof failure.code === 'string' && /^ASSET_[A-Z_]+$/u.test(failure.code) ? failure.code : 'ASSET_GROUP_DIRECTORY_UNAVAILABLE' }
      const interfaces = operations.map(operation => {
        const rows = directory ? matches(directory, operation) : []
        return { operation, registered_count: rows.length, registered_names: rows.map((tool: any) => tool.name), source_verified: rows.length === 1 && verified(rows[0], operation) }
      })
      const templates = directory ? matches(directory, TASK_QUERY) : []
      let templateReady = false
      if (templates.length === 1) try { taskContract(templates[0]); templateReady = true } catch { error ??= 'ASSET_TASK_TEMPLATE_INVALID' }
      const interfacesLoaded = interfaces.every(item => item.source_verified)
      return { configured: null, configuration_check_supported: false, expected_namespace: GROUP_ID, expected_member: 'ai-soc-master',
        transport: 'group-v2-public-service', group_api_supported: supported(), local_tool_registration_required: false,
        interfaces, interfaces_loaded: interfacesLoaded, task_query_resource: templateReady ? 'loaded' : directory ? 'missing_or_ambiguous' : 'unavailable',
        task_query_template_count: directory ? templates.length : null,
        task_scope_template_count: directory ? matches(directory, TASK_SCOPE).length : null,
        readonly_bindings: ['list_soc_asset', 'get_soc_asset_by_asset_id'].map(operation => ({ operation, count: directory ? matches(directory, operation).length : null })),
        binding_error: error, tooling_ready: interfacesLoaded && templateReady }
    },
  }
}

export function apply(ctx: any) {
  const locks = new Map<string, Promise<any>>()
  // 原生高层工具拥有固定流程。底层SOC工具不对模型开放，内部仍沿既有MCP连接，不新增HTTP代理。
  ctx.tools.guard((exec: any) => exec.name.startsWith(`mcp__${GROUP_ID}__`) || exec.name === 'read_mcp_resource' && exec.arguments?.server === GROUP_ID ? '请使用资产纳管高层入口；底层接口不能绕过清单与真实用户确认' : undefined)
  const { lookup, call, resource, status, readAsset } = createAssetGroupBackend(ctx)
  const perform = async (args: any, exec: any) => {
    const identity = mainIdentity(exec)
    const respond = (value: any) => {
      const { raw_adopt_result: _raw, ...projection } = value
      const result = { ...projection, schema_version: 'asset-onboarding/v1', session_id: identity.sessionId, group_id: GROUP_ID }
      if (JSON.stringify(result).length <= MAX_OUTPUT) return result
      if (value.kind === 'receipt') return { schema_version: 'asset-onboarding/v1', session_id: identity.sessionId, group_id: GROUP_ID, kind: 'receipt', preview_digest: value.preview_digest, state: value.state, saved: value.saved, output_limited: true, message: '原批次已保存完整回执，输出超过预算；不能据此判断未提交或重发，请核对原记录。' }
      if (['discovery', 'discovery-result'].includes(value.kind)) return { schema_version: 'asset-onboarding/v1', session_id: identity.sessionId, group_id: GROUP_ID, kind: value.kind, taskId: validSocId(value.taskId) ? value.taskId : null, evidence_id: value.evidence_id, evidence_complete: false, state: value.state ?? 'received', saved: false, autoAdopt: false, message: '已收到发现回执，但完整证据超过展示预算；未新增资产，不生成部分清单或重新扫描，请缩小后续处理范围。' }
      throw new Error('完整清单超过输出预算，尚未生成可确认的预览；请拆分输入，不导入未展示部分')
    }
    if (args.action === 'status') {
      const backend = await status(exec)
      return respond({ kind: 'status', local_entry_loaded: true, evidence_scope: 'current_session_group_v2_directory_only', backend,
        business_verification: 'not_performed', registration_performed: false,
        message: backend.tooling_ready ? '本会话资产组v2六动作及任务模板已唯一绑定；未向模型注册底层工具。这仅是受管目录/调用路径证据，未验证SOC业务或发现、登记闭环，未探测、未新增。' : '本地入口已加载，但受管组v2提供者或精确来源绑定未就绪；请按binding_error核接线，不表示设备离线或SOC无数据。未探测、未新增。' })
    }
    if (args.action === 'read_excel' && typeof args.attachment_id !== 'string') throw new Error('请先列出真实附件，再传入要解析的attachment_id')
    if (['attachments', 'read_excel'].includes(args.action)) return respond({ ...await readAssetWorkbook(ctx, exec, args.action === 'read_excel' ? args.attachment_id : undefined), backend_connection_checked: false, group_id_is_connection_proof: false })
    if (args.action === 'receipt') {
      if (!history(identity.events).some(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.preview_digest === args.preview_digest)) throw new Error('只能读取本会话真实批次的原回执')
      const path = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]), `${args.preview_digest}.json`)
      return respond({ kind: 'receipt', ...JSON.parse(await readFile(path, 'utf8')), replayed: true })
    }
    if (args.action === 'resume') {
      validateDiscoveryIntent(identity.request)
      if (!/继续|续办|恢复/u.test(identity.request)) throw new Error('恢复原任务需要本轮真实用户明确继续授权')
      const { range, excluded } = validateDiscoveryRanges(identity.request, args.ranges, args.excluded_ranges)
      const originals = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.kind === 'discovery'
        && item.value.ranges === range.ranges && item.value.excluded_ranges === excluded)
      const prior = originals.at(-1)?.value, prepared = prior?.facts?.prepared
      const taskId = prepared?.taskId ?? prepared?.task?.taskId ?? prepared?.task?.id
      if (!prior || !validSocId(taskId) || prepared.autoAdopt !== false || prepared.stage !== 'preview' || typeof prepared.previewHash !== 'string'
        || normalizeRange(prepared.includedRanges).ranges !== range.ranges || (prepared.excludedRanges ? normalizeRange(prepared.excludedRanges).ranges : '') !== (excluded ?? '')
        || prior.facts?.started || prior.phase === 'start_soc_discovery_tasks') throw new Error('缺少本会话真实且明确未启动的prepared证据，禁止绑定或重放')
      const facts = await resource(taskId, exec), scope = await resource(taskId, exec, TASK_SCOPE)
      if (!sameSocId(facts?.task?.id ?? facts?.taskId ?? facts?.id, taskId) || !sameSocId(scope?.taskId, taskId)) throw new Error('原任务身份不一致')
      if (['running', 'done', 'failed'].includes((facts?.task ?? facts)?.status)) return respond({ kind: 'discovery-result', taskId, facts, evidence_id: hash([identity.sessionId, taskId, facts]), ...discoveryCompletion(facts, taskId), resumed_query_only: true, saved: false })
      if (scope.stage !== 'preview' || scope.autoAdopt !== false || scope.canStart !== true || scope.requiresConfirmation !== true || scope.previewHash !== prepared.previewHash
        || normalizeRange(scope.includedRanges).ranges !== range.ranges || (scope.excludedRanges ? normalizeRange(scope.excludedRanges).ranges : '') !== (excluded ?? '')) throw new Error('原任务scope与当前授权或原previewHash不一致，禁止启动')
      const directory = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]))
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const path = join(directory, `resume-${String(taskId)}.json`)
      let previous
      try { previous = JSON.parse(await readFile(path, 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
      if (previous) return respond({ ...previous, replayed: true, message: '已记录同任务start意图，只能查询原任务，不再次启动' })
      const state: any = { kind: 'discovery', taskId, evidence_id: hash([identity.sessionId, taskId, 'resume']), ranges: range.ranges, excluded_ranges: excluded,
        autoAdopt: false, saved: false, state: 'pending', phase: 'start_soc_discovery_tasks', recovered_from_evidence: prior.evidence_id, facts: { prepared, scope } }
      await writeFile(path, JSON.stringify(state), { flag: 'wx', mode: 0o600, flush: true })
      try { state.facts.started = await call('start_soc_discovery_tasks', { taskId, body: { previewHash: scope.previewHash } }, exec); state.state = 'accepted' }
      catch (error: any) { state.state = 'unknown'; state.reason = safeDiagnostic(error.message); state.message = '原任务start结果未知，只查询原任务，不重发' }
      await writeFile(path, JSON.stringify(state), { mode: 0o600, flush: true })
      return respond(state)
    }
    if (args.action === 'discover') {
      validateDiscoveryIntent(identity.request)
      const { range, excluded } = validateDiscoveryRanges(identity.request, args.ranges, args.excluded_ranges)
      const prior = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.kind === 'discovery' && item.value.ranges === range.ranges && item.value.excluded_ranges === excluded).at(-1)
      if (prior) return respond({ ...prior.value, replayed: true, hint: '同一范围已有原请求；有taskId仅查询原任务，无taskId须人工核对未知受理，不重新创建或启动' })
      const single = !excluded && range.count === 1 && isIP(range.ranges) === 4
      await lookup(single ? 'create_soc_asset_probe' : 'create_soc_discovery_tasks', exec)
      await lookup(single ? 'create_soc_discovery_identify' : 'start_soc_discovery_tasks', exec)
      const directory = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]))
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const path = join(directory, `discovery-${hash([range.ranges, excluded])}.json`)
      let existing
      try { existing = JSON.parse(await readFile(path, 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
      if (existing) return respond({ ...existing, replayed: true, hint: '本轮已发送发现请求，不重复创建或扫描；有taskId仅查询原任务' })
      const state: any = { kind: 'discovery', evidence_id: hash([identity.sessionId, identity.messageId, range.ranges, excluded]), ranges: range.ranges, excluded_ranges: excluded, autoAdopt: false, saved: false, state: 'pending' }
      let phase = single ? 'create_soc_asset_probe' : 'create_soc_discovery_tasks'
      await writeFile(path, JSON.stringify(state), { flag: 'wx', mode: 0o600 })
      try {
        if (single) {
          state.facts = { ip: range.ranges }
          state.facts.connectivity = await call('create_soc_asset_probe', { ip: range.ranges, mode: 'hybrid' }, exec)
          if (state.facts.connectivity === null) throw new Error('SOC缺少连通性检查结果')
          await writeFile(path, JSON.stringify(state), { mode: 0o600 })
          phase = 'create_soc_discovery_identify'
           state.facts.identification = await call('create_soc_discovery_identify', { ip: range.ranges }, exec)
          if (state.facts.identification === null) throw new Error('SOC缺少设备识别结果')
          state.state = 'completed'
        } else {
          const prepared = await call('create_soc_discovery_tasks', { includedRanges: range.ranges, ...(excluded ? { excludedRanges: excluded } : {}), autoAdopt: false }, exec)
          const taskId = prepared?.taskId ?? prepared?.id ?? prepared?.task?.taskId ?? prepared?.task?.id
          state.taskId = validSocId(taskId) ? taskId : null
          const scope = validSocId(state.taskId) ? await resource(state.taskId, exec, TASK_SCOPE) : null
          if (!scope || !sameSocId(scope.taskId, state.taskId) || scope.stage !== 'preview' || scope.autoAdopt !== false || scope.canStart !== true || scope.requiresConfirmation !== true
            || normalizeRange(scope.includedRanges).ranges !== range.ranges || (scope.excludedRanges ? normalizeRange(scope.excludedRanges).ranges : '') !== (excluded ?? '')) throw new Error('任务scope身份、范围、排除或autoAdopt不符合本轮授权，未启动')
          const previewHash = scope.previewHash
          state.facts = { prepared, scope }
          if (!validSocId(state.taskId) || typeof previewHash !== 'string' || !previewHash) throw new Error('SOC缺少可核实taskId和previewHash，未启动扫描且不能猜测标识重发')
          await writeFile(path, JSON.stringify(state), { mode: 0o600 })
          phase = 'start_soc_discovery_tasks'
           state.previewTaskId = state.taskId
           state.facts.started = await call('start_soc_discovery_tasks', { taskId: state.previewTaskId, body: { previewHash } }, exec)
           const linked = executionLink(state)
           if (state.facts.started?.task && !linked) throw new Error('start回执execution关联不符，禁止重发')
           if (linked) state.taskId = linked.taskId
          state.state = 'accepted'
        }
        state.evidence_complete = single
      } catch (error: any) { state.state = error.notSent ? 'not_submitted' : error.businessFailure ? 'failed' : 'unknown'; state.reason = `${phase}：${safeDiagnostic(error.message)}`; state.diagnostic = error.diagnostic ?? null; state.submission = error.notSent ? 'not_sent' : 'acceptance_unknown'; state.phase = phase; state.evidence_complete = false }
      await writeFile(path, JSON.stringify(state), { mode: 0o600 })
      return respond(state)
    }
    if (args.action === 'query') {
      const records = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID)
      const linkedRecord = records.find(item => item.value.kind === 'discovery' && sameSocId(executionLink(item.value)?.taskId, args.task_id))
      const link = linkedRecord ? executionLink(linkedRecord.value) : null
      const known = Boolean(link) || records.some(item => !item.value.recovered_prepared_query_only && sameSocId(item.value.taskId, args.task_id))
      const preparedRecord = typeof args.task_id === 'string' && records.find(item => item.value.kind === 'discovery' && typeof item.value.facts?.prepared?.taskId === 'string' && item.value.facts.prepared.taskId === args.task_id)
      if (!validSocId(args.task_id) || !known && !preparedRecord) throw new Error('只能查询本会话已受理的发现任务')
      const facts = await resource(args.task_id, exec)
      let executionScope: any = null
      if (link && linkedRecord) {
        executionScope = await resource(link.previewTaskId, exec, TASK_SCOPE)
        const checked = executionLink({ ...linkedRecord.value, facts: { ...linkedRecord.value.facts, started: { taskId: args.task_id, task: facts?.task ?? facts } } })
        if (!checked || !sameSocId(executionScope?.taskId, link.previewTaskId) || executionScope.autoAdopt !== false
          || normalizeRange(executionScope.includedRanges).ranges !== normalizeRange(linkedRecord.value.ranges).ranges
          || (executionScope.excludedRanges ? normalizeRange(executionScope.excludedRanges).ranges : '') !== (linkedRecord.value.excluded_ranges ?? '')) throw new Error('execution与原preview scope关联不符，禁止使用候选')
      }
      let recoveredScope: any = null
      if (!known && preparedRecord) {
        recoveredScope = await resource(args.task_id, exec, TASK_SCOPE)
        const prepared = preparedRecord.value.facts.prepared
        if (!sameSocId(recoveredScope?.taskId, args.task_id) || recoveredScope.autoAdopt !== prepared.autoAdopt
          || normalizeRange(recoveredScope.includedRanges).ranges !== normalizeRange(prepared.includedRanges).ranges
          || (recoveredScope.excludedRanges ? normalizeRange(recoveredScope.excludedRanges).ranges : '') !== (prepared.excludedRanges ? normalizeRange(prepared.excludedRanges).ranges : '')) throw new Error('当前后端scope与历史prepared身份或范围不一致，仅查询不授予写入')
      }
      const returnedId = facts?.taskId ?? facts?.task?.taskId ?? facts?.task?.id ?? facts?.id
      if (returnedId !== undefined && !sameSocId(returnedId, args.task_id)) throw new Error('SOC回执任务号与原任务不符，禁止使用候选或重建任务')
      const evidenceId = hash([identity.sessionId, args.task_id, facts])
      const directory = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]))
      await mkdir(directory, { recursive: true, mode: 0o700 })
      await writeFile(join(directory, `evidence-${evidenceId}.json`), JSON.stringify({ session_id: identity.sessionId, taskId: args.task_id, evidence_id: evidenceId, facts }), { mode: 0o600, flush: true })
      const compact = compactDiscovery(facts)
      const { eligible_findings: _eligible, excluded_findings: _excluded, ...statusProjection } = discoveryCompletion(facts, args.task_id)
      return respond({ kind: 'discovery-result', evidence_id: evidenceId, taskId: args.task_id, ...compact,
        raw_evidence: { digest: hash(facts), storage: 'session_managed_cache', evidence_id: evidenceId },
        ...statusProjection,
        ...(link ? { previewTaskId: link.previewTaskId, execution_scope: executionScope, authorized_ranges: linkedRecord.value.ranges, excluded_ranges: linkedRecord.value.excluded_ranges } : {}),
        ...(!known && preparedRecord ? { recovered_prepared_query_only: true, recovered_scope: recoveredScope, evidence_complete: false, candidate_complete: false, registration_ready: false, write_authorized: false } : {}),
        execution_stage: facts?.executionStage ?? facts?.stage ?? facts?.task?.executionStage ?? facts?.task?.stage ?? null,
        request_correlation: facts?.requestId ?? facts?.task?.requestId ?? null, task_identity_verified: sameSocId(returnedId, args.task_id),
        autoAdopt: false, saved: false,
        message: '已查询原任务并保留SOC原始状态，不把状态缺项填0或推断完成。按done终态及完整统计/findingId/IP核对候选；缺项不补0，未完整时禁止纳管，不重新创建或启动。' })
    }
    if (args.action === 'ui_event') {
      // 表格事件只做服务端复核，不写SOC；隐藏字段一律以服务端冻结记录为准。
      const event = args.event
      if (!object(event) || !['edit', 'confirm', 'cancel'].includes(event.type)) throw new Error('表格事件类型无效')
      if (event.session !== identity.sessionId) throw new Error('表格事件会话与当前会话不一致')
      const records = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.kind === 'preview')
      const record = records.at(-1)
      if (!record || record.value.preview_digest !== args.preview_digest) throw new Error('表格事件引用的预览不是本会话最新预览')
      const preview = record.value
      if (hash([GROUP_ID, identity.sessionId, preview.preview_user_message_id, preview.assets, preview.source, preview.route, preview.taskId ?? null]) !== preview.preview_digest) throw new Error('预览摘要与冻结字段不符')
      if (event.type === 'cancel') {
        await cancelPreviewBatch(identity, preview)
        return respond({ kind: 'ui_event', accepted: true, cancelled: true, preview_digest: preview.preview_digest, write_authorized: false,
          message: '已取消本次纳管预览；未写SOC，旧批次不可再提交，需重新预览确认' })
      }
      if (await cancelledBatch(identity.sessionId, preview.preview_digest)) throw new Error('本批次已取消，不能继续编辑或确认；请重新预览')
      const index = Number(event.row_index)
      if (!Number.isSafeInteger(index) || index < 1 || index > preview.assets.length) throw new Error('表格事件行号越界')
      const asset = preview.assets[index - 1]
      if (event.ip !== asset.ip) throw new Error('表格事件IP与冻结行不一致')
      const fields = event.fields ?? {}
      if (!object(fields) || Object.keys(fields).some(key => !['hostname', 'assetType', 'os', 'deployForm'].includes(key))) throw new Error('表格事件包含不可编辑字段；状态与隐藏字段不能由前端修改')
      if (event.type === 'confirm') {
        return respond({ kind: 'ui_event', accepted: true, requires_user_confirmation: true, preview_digest: preview.preview_digest,
          message: '表格确认只生成待确认摘要，不写SOC；请由用户在对话中明确确认后走既有commit' })
      }
      const edits: any = {}
      if (fields.hostname !== undefined) edits.hostname = String(fields.hostname).trim() || undefined
      if (fields.assetType !== undefined) edits.assetType = String(fields.assetType).trim() || undefined
      if (fields.os !== undefined) edits.os = String(fields.os).trim() || undefined
      if (fields.deployForm !== undefined) { try { edits.deployForm = normalizeDeployForm(fields.deployForm) } catch { throw new Error('部署形态无效') } }
      return respond({ kind: 'ui_event', accepted: true, row_index: index, ip: asset.ip, edits, source: preview.source, taskId: preview.taskId,
        preview_invalidated: true, message: '编辑会改变冻结清单，旧preview_digest已失效；须重新preview并由用户重新确认后再提交' })
    }
    if (args.action === 'preview') {
      let previewIdentity = identity
      if (args.source?.kind === 'discovery') {
        const record = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.evidence_id === args.source.evidence_id).at(-1)
        if (record?.value.raw_evidence) {
          const id = record.value.evidence_id
          if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('发现证据摘要无效')
          const cached = JSON.parse(await readFile(join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]), `evidence-${id}.json`), 'utf8'))
          if (cached.session_id !== identity.sessionId || !sameSocId(cached.taskId, record.value.taskId) || hash(cached.facts) !== record.value.raw_evidence.digest || hash([identity.sessionId, cached.taskId, cached.facts]) !== id) throw new Error('原始发现证据缓存绑定不符')
          // 保留原工具事件/来源，仅将该条受控投影恢复为已校验原事实供预览核对。
          const events = structuredClone(identity.events)
          const event = events[record.index], message = event.data.message
          const block = message.content.find((part: any) => part.type === 'tool-result' && part.toolCallId === message.source.callId)
          const part = (block?.content ?? message.content).find((part: any) => part.type === 'text')
          if (!part) throw new Error('发现证据回执缺少可恢复正文')
          part.text = JSON.stringify({ ...record.value, facts: cached.facts })
          previewIdentity = { ...identity, events }
        }
      }
      // 先查SOC清单再分类：已纳管/冲突不进入待纳管表；读失败保留未知，不当作0。
      const candidates = normalizeAssets(args.assets)
      const managed = new Map<string, any>()
      for (const asset of candidates) {
        try { managed.set(asset.ip, await readAsset('list_soc_asset', { ip: asset.ip, pageNum: 1, pageSize: 200 }, exec)) }
        catch (error: any) { managed.set(asset.ip, null) }
      }
      return respond(previewAssets(previewIdentity, args, managed))
    }
    if (args.action === 'cancel') {
      const records = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.kind === 'preview')
      const target = args.preview_digest ? records.find(item => item.value.preview_digest === args.preview_digest) : records.at(-1)
      if (args.preview_digest && !target) throw new Error('取消引用的预览不是本会话预览；不能取消其他会话或旧批次')
      if (!target) return respond({ kind: 'cancelled', saved: false, message: '当前没有可取消的纳管预览；未写SOC' })
      await cancelPreviewBatch(identity, target.value)
      return respond({ kind: 'cancelled', saved: false, preview_digest: target.value.preview_digest, write_authorized: false,
        message: '已取消本次纳管预览；旧批次不可再提交，需重新预览确认' })
    }
    if (args.action !== 'commit') throw new Error('未知资产纳管动作')
    const preview = priorPreview(identity, args.preview_digest)
    if (await cancelledBatch(identity.sessionId, preview.preview_digest)) throw new Error('本批次已取消，旧确认失效；请重新预览后再确认')
    await lookup(preview.route === 'adopt' ? 'create_soc_discovery_tasks_adopt' : 'create_soc_asset', exec)
    const directory = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId])), path = join(directory, `${preview.preview_digest}.json`)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    let previous
    try { previous = JSON.parse(await readFile(path, 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
    if (previous) return respond({ kind: 'receipt', ...derivedReceipt(previous), replayed: true, hint: '本批次已发送，不重复新增；未知项需核对SOC原记录' })
    // 旧回执优先返回；仅新批次在SOC写入前做整批预检。冲突阻断；缺字段只列序号/IP/字段，不发SOC写请求。
    if (preview.blocked || preview.conflicts?.length) {
      throw new Error(`同IP冲突，阻断提交：${preview.conflicts.map((row: any) => `${row.ip}（已有${row.existing.map((item: any) => `${item.hostname || '名称未知'}/${item.assetType || '类型未知'}`).join('、')}；候选${row.candidate.name || '名称未知'}/${row.candidate.assetType || '类型未知'}）`).join('；')}；请先核对后重新预览`)
    }
    if (!preview.assets?.length) throw new Error('没有待纳管设备；已纳管或已跳过项不提交，也不重建清单')
    if (preview.route === 'adopt') {
      const gaps = preview.assets.map((asset: any, index: number) => ({ index: index + 1, ip: asset.ip, missing: [!asset.deployForm && '部署形态', !asset.assetType && '设备类型'].filter(Boolean) })).filter((row: any) => row.missing.length)
      if (gaps.length) {
        const error: any = new Error(`提交前缺字段，未发送SOC写请求：${gaps.map((row: any) => `第${row.index}条 ${row.ip} 缺${row.missing.join('、')}`).join('；')}；补齐后须重新预览并由用户重新确认`)
        error.required_field_gaps = gaps
        throw error
      }
    }
    const journal: any = { preview_digest: preview.preview_digest, taskId: preview.taskId, state: 'pending', results: [], saved: false }
    await writeFile(path, JSON.stringify(journal), { flag: 'wx', mode: 0o600, flush: true })
    const save = async () => writeFile(path, JSON.stringify(journal), { mode: 0o600, flush: true })
    const previousResult = (asset: any, previous: any) => previous.state === 'registered'
      ? { ip: asset.ip, status: 'previously_registered', previous_receipt: previous.result, reason: '返回此前登记回执，未刷新当前SOC状态，本批次不重复登记或覆盖属性' }
      : { ip: asset.ip, status: 'blocked_unknown', previous_preview_digest: previous.preview_digest, reason: '本会话此前有同IP待核写入，不能换清单、来源或接口重发；先核对SOC原记录' }
    journal.baseline = []
    for (const asset of preview.assets) {
      try { const data = await readAsset('list_soc_asset', { ip: asset.ip, pageNum: 1, pageSize: 200 }, exec); journal.baseline.push({ ip: asset.ip, observed_at: new Date().toISOString(), facts: data }) }
      catch (error: any) { journal.baseline.push({ ip: asset.ip, state: 'unknown', reason: safeDiagnostic(error.message) }) }
    }
    await save()
    if (preview.route === 'adopt') {
      const active: any[] = []
      for (const asset of preview.assets) {
        const reservation = await reserveTarget(directory, asset, preview)
        journal.results.push(reservation.previous ? previousResult(asset, reservation.previous) : { ip: asset.ip, findingId: asset.findingId, status: 'pending' })
        if (!reservation.previous) active.push({ asset, path: reservation.path, index: journal.results.length - 1 })
      }
      await save()
      if (active.length) {
        try {
          // 沿SOC统一登记表单：只传本次已确认并冻结的字段；无型号按真实前端合同显式-1，findingId仍取发现绑定值。
          const data = await call('create_soc_discovery_tasks_adopt', { taskId: preview.taskId, body: active.map(item => {
            const { findingId, ...form } = item.asset
            return { ...form, modelId: form.modelId ?? -1, findingId }
          }) }, exec)
          journal.raw_adopt_result = data
          journal.adopt_summary = { adopted: typeof data?.adopted === 'number' ? data.adopted : null, failed: typeof data?.failed === 'number' ? data.failed : null }
          const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : []
          for (const item of active) {
            const matches = rows.filter((row: any) => sameSocId(row.findingId, item.asset.findingId))
            const row = matches.length === 1 ? matches[0] : null
            const assetId = row?.assetId ?? row?.data?.assetId
            const rejection = typeof (row?.error ?? row?.data?.error) === 'string' ? String(row?.error ?? row?.data?.error).trim() : ''
            journal.results[item.index] = validAssetId(assetId)
              ? { ip: item.asset.ip, findingId: item.asset.findingId, status: 'registered', assetId, created: row.created ?? null }
              : rejection
                ? { ip: item.asset.ip, findingId: item.asset.findingId, status: 'failed', reason: rejection.slice(0, 300), phase: 'create_soc_discovery_tasks_adopt', submission: 'rejected' }
                : { ip: item.asset.ip, findingId: item.asset.findingId, status: 'unknown', reason: '已收到批量回执，但该发现记录缺少唯一可核实资产ID；不重发' }
            await settleTarget(item.path, journal.results[item.index], preview)
          }
        } catch (error: any) {
          for (const item of active) {
            journal.results[item.index] = { ip: item.asset.ip, findingId: item.asset.findingId, status: error.notSent ? 'not_submitted' : error.businessFailure ? 'failed' : 'unknown', reason: safeDiagnostic(error.message), diagnostic: error.diagnostic ?? null, phase: preview.route === 'adopt' ? 'create_soc_discovery_tasks_adopt' : 'create_soc_asset', submission: error.notSent ? 'not_sent' : 'acceptance_unknown' }
            await settleTarget(item.path, journal.results[item.index], preview)
          }
        }
        await save()
      }
    } else {
      for (let index = 0; index < preview.assets.length; index++) {
        try { mainIdentity(exec) } catch (error: any) { journal.interruption_reason = error.message; break }
        const { findingId: _findingId, ...asset } = preview.assets[index]
        const reservation = await reserveTarget(directory, asset, preview)
        if (reservation.previous) { journal.results.push(previousResult(asset, reservation.previous)); await save(); continue }
        journal.results.push({ ip: asset.ip, status: 'pending' }); await save()
        try {
          const data = await call('create_soc_asset', { body: asset }, exec)
          const assetId = validAssetId(data) ? data : data?.assetId
          if (!validAssetId(assetId)) throw new Error('SOC未返回有效资产ID，写入结果未知')
          journal.results[index] = { ip: asset.ip, status: 'registered', assetId, created: object(data) ? data.created ?? null : null }
        } catch (error: any) { journal.results[index] = { ip: asset.ip, status: error.notSent ? 'not_submitted' : error.businessFailure ? 'failed' : 'unknown', reason: safeDiagnostic(error.message), diagnostic: error.diagnostic ?? null, phase: preview.route === 'adopt' ? 'create_soc_discovery_tasks_adopt' : 'create_soc_asset', submission: error.notSent ? 'not_sent' : 'acceptance_unknown' } }
        await settleTarget(reservation.path, journal.results[index], preview)
        await save()
      }
    }
    for (const result of journal.results.filter((row: any) => row.status === 'registered')) {
      const readParam = readAssetIdParam(result.assetId)
      if (readParam === null) {
        // 当前资源模板assetId仍为integer；超出JS安全整数时保留原字符串，不发送失真参数。
        result.readback = { verified: false, state: 'unreadable', reason: '当前资源参数契约为integer且该assetId超出JS安全整数，无法无损读取；原ID保留，不重发写入', assetId_preserved: result.assetId }
      } else try {
        const detail = await readAsset('get_soc_asset_by_asset_id', { assetId: readParam }, exec)
        const expected = preview.assets.find((row: any) => row.ip === result.ip)
        result.readback = { observed_at: new Date().toISOString(), facts: detail,
          verified: sameSocId(detail?.assetId ?? detail?.id, result.assetId) && detail?.ip === expected.ip && (!expected.hostname || detail?.hostname === expected.hostname) && (!expected.assetType || detail?.assetType === expected.assetType) }
      } catch (error: any) { result.readback = { verified: false, state: 'unknown', reason: safeDiagnostic(error.message) } }
      const baseline = journal.baseline.find((row: any) => row.ip === result.ip)?.facts
      result.registration_effect = result.readback?.verified === true && baseline?.total === 0 && Array.isArray(baseline.rows) && baseline.rows.length === 0 ? 'newly_observed'
        : result.readback?.verified === true && Array.isArray(baseline?.rows) && baseline.rows.some((row: any) => sameSocId(row.assetId ?? row.id, result.assetId)) ? 'reused' : 'unknown'
      result.effect_basis = result.registration_effect === 'unknown' ? '前后证据不足，不推断新增或复用' : '提交前SOC基线与提交后同assetId/字段读回'
    }
    journal.results.forEach((row: any, index: number) => {
      const style = row.status === 'registered' ? STATUS_STYLE.submitted : row.status === 'failed' ? STATUS_STYLE.failed : row.status === 'not_submitted' ? STATUS_STYLE.incomplete : STATUS_STYLE.review
      row.index = index + 1
      row.status_key = row.status === 'registered' ? 'submitted' : row.status === 'failed' ? 'failed' : row.status === 'not_submitted' ? 'incomplete' : 'review'
      row.status_label = style.text
      row.status_color = style.color
    })
    journal.registration_complete = journal.results.every((item: any) => item.status === 'registered') && journal.results.length === preview.assets.length
    journal.readback_verified = journal.registration_complete && journal.results.every((item: any) => item.readback?.verified === true)
    const rejected = journal.results.filter((item: any) => item.status === 'failed')
    if (rejected.length) journal.rejections = { count: rejected.length, reasons: [...new Set(rejected.map((item: any) => item.reason).filter(Boolean))] }
    const allRejected = journal.results.length === preview.assets.length && journal.results.every((item: any) => item.status === 'failed')
    journal.state = journal.readback_verified ? 'completed' : journal.registration_complete ? 'registered_readback_unverified' : allRejected ? 'rejected' : 'partial_or_unknown'
    journal.saved = journal.results.some((item: any) => item.status === 'registered') || (journal.adopt_summary?.adopted ?? 0) > 0
    journal.unsubmitted = [...journal.results.filter((item: any) => item.status === 'not_submitted').map((item: any) => item.ip), ...preview.assets.slice(journal.results.length).map((item: any) => item.ip)]
    await save()
    return respond({ kind: 'receipt', ...journal, message: allRejected
      ? `SOC明确拒绝本批${rejected.length}条且均未返回资产ID，不是未知；原因：${journal.rejections.reasons.join('；')}；补齐后需重新预览并由用户重新确认，不重发本批`
      : '逐条以SOC回执及实际资产ID为准；相同IP可能复用已有资产，未返回created不称全部新建；历史回执未刷新，未知项不换批次或接口重发' })
  }
  ctx.tools.register({
    name: TOOL_NAME,
    description: '资产纳管：status仅只读核对本会话后端工具和任务查询模板；attachments/read_excel仅本地附件，不证明SOC接入。按明确IP范围发现，以真实来源完整预览，新用户确认后才登记。Excel不探测，自动纳管关闭，未知写入不重放。',
    parameters: { type: 'object', additionalProperties: false, required: ['action'], properties: {
      action: { type: 'string', enum: ['status', 'attachments', 'read_excel', 'discover', 'resume', 'query', 'preview', 'ui_event', 'commit', 'receipt', 'cancel'] },
      attachment_id: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }, ranges: { type: 'string' }, excluded_ranges: { type: 'string', description: '用户明确排除的IP或范围，不能省略排除约束' }, task_id: { oneOf: [{ type: 'string', pattern: '^[1-9][0-9]{0,18}$' }, { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }] },
      source: { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string', enum: ['excel', 'discovery'] }, attachment_id: { type: 'string' }, evidence_id: { type: 'string' } } },
      assets: { type: 'array', minItems: 1, maxItems: MAX_ASSETS, items: { type: 'object', additionalProperties: false, required: ['ip'], properties: { ip: { type: 'string' }, hostname: { type: 'string' }, assetType: { type: 'string' }, os: { type: 'string' }, modelId: { type: 'integer' }, deployForm: { type: 'string' }, hostAssetId: { type: 'integer' }, findingId: { oneOf: [{ type: 'string', pattern: '^[1-9][0-9]{0,18}$' }, { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER }] } } } },
      preview_digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      event: { type: 'object', additionalProperties: false, required: ['type', 'session'], properties: { type: { type: 'string', enum: ['edit', 'confirm', 'cancel'] }, session: { type: 'string' }, row_index: { type: 'integer', minimum: 1 }, ip: { type: 'string' }, fields: { type: 'object', additionalProperties: false, properties: { hostname: { type: 'string' }, assetType: { type: 'string' }, os: { type: 'string' }, deployForm: { type: 'string' } } } } },
    } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 120000, isConcurrencySafe: () => false,
    async execute(args: any, exec: any) {
      const key = hash(mainIdentity(exec).sessionId)
      const previous = locks.get(key) ?? Promise.resolve()
      const current = previous.catch(() => {}).then(() => perform(args, exec))
      locks.set(key, current)
      try { return await current } finally { if (locks.get(key) === current) locks.delete(key) }
    },
  })
}
