import { isRecord, safeData, fail } from './data.js'

export const TIMELINE_KEY = 'security-network-space.timeline.v1'
const LIMIT = 64
const APPROVAL_LIMIT = 20
const SUMMARY_LIMIT = 160
const SEMANTICS = Object.freeze({
  get_graph_path_query: 'path', get_reachability_path_by_ip: 'path',
  list_soc_asset: 'scan', get_soc_asset_by_asset_id: 'scan', get_graph_node_detail: 'scan',
  inspection_routine: 'scan', inspection_deep: 'scan', inspection_baseline: 'policy',
  delegate_threat_analysis: 'analyze', delegate_fault_analysis: 'analyze', delegate_response_planning: 'analyze',
})
// 只保留与只读判读相关的参数，其余一律不进入投影。
const ARG_KEYS = ['assetId', 'assetIds', 'keyword', 'pageNum', 'pageSize', 'createdFrom', 'createdTo',
  'severity', 'incidentId', 'judgementId', 'vid', 'bizId', 'zoneId', 'deptId']
const SECRET_LIKE = /(token|secret|password|passwd|api[-_]?key|authorization|bearer|cookie)/i
function assetIds(argumentsText) {
  try {
    const args = JSON.parse(argumentsText)
    const values = args?.assetId !== undefined ? [args.assetId] : Array.isArray(args?.assetIds) ? args.assetIds : []
    return [...new Set(values.filter(value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value)
      || typeof value === 'number' && Number.isSafeInteger(value) && value > 0).map(String))].slice(0, 100)
  } catch { return [] }
}
function semantic(name) {
  // 仅匹配精确工具标识；不对标题、自然语言、结果文本进行关键词猜测。
  return SEMANTICS[name] || SEMANTICS[name.split('__').at(-1)] || 'unknown'
}
function sanitize(text) {
  // 去掉内部路径、对象标识与凭证片段，只保留可读的业务信息。
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[标识]')
    .replace(/(?:\/[\w.@-]+){3,}/g, '[路径]')
    .replace(/(?:token|secret|password|passwd|api[-_]?key|authorization|bearer|cookie)\s*[:=]?\s*\S+/gi, '[已脱敏]')
}
function clip(value, limit = SUMMARY_LIMIT) {
  if (typeof value !== 'string') return ''
  const text = sanitize(value.replace(/\s+/g, ' ').trim())
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}
function argsOf(argumentsText) {
  try {
    const args = JSON.parse(argumentsText)
    if (!isRecord(args)) return {}
    const summary = {}
    for (const key of ARG_KEYS) {
      const value = args[key]
      if (value === undefined || value === null) continue
      if (typeof value === 'string') summary[key] = clip(value, 60)
      else if (typeof value === 'number' && Number.isFinite(value)) summary[key] = value
      else if (Array.isArray(value)) summary[key] = value.slice(0, 8).map(item => typeof item === 'number' ? item : clip(String(item), 40))
    }
    return summary
  } catch { return {} }
}
const FIXED_RESULT = {
  skill: '技能已加载', send_message: '消息已投递',
  list_mcp_resources: 'MCP 资源目录已读取', list_mcp_resource_templates: 'MCP 模板目录已读取',
}
function messageText(message) {
  const blocks = Array.isArray(message?.content) ? message.content : []
  return blocks
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join(' ')
}
function resultOf(name, text) {
  if (FIXED_RESULT[name]) return FIXED_RESULT[name]
  if (name.startsWith('delegate_')) return '已启动子智能体'
  const raw = typeof text === 'string' ? text : ''
  const status = /"code"\s*:\s*(\d{3})/.exec(raw)
  if (status) return status[1] === '503' ? '服务暂不可用' : `请求失败（${status[1]}）`
  if (/mcp-group-target|"_meta"|digest/i.test(raw)) return 'MCP 目录已读取'
  if (name.startsWith('mcp__')) return '已返回业务数据'
  return clip(raw)
}
function reasonOf(text) {
  const raw = clip(typeof text === 'string' ? text : '', 100)
  if (/sandbox|workspace-write/i.test(raw)) return '需要一次性工作区写权限'
  return raw
}
function errorOf(error, rawText) {
  if (isRecord(error)) {
    const code = typeof error.code === 'string' ? clip(error.code, 64) : ''
    const reason = clip(typeof error.reason === 'string' ? error.reason : typeof error.name === 'string' ? error.name : '', 120)
    if (code || reason) return { ...(code ? { code } : {}), ...(reason ? { reason } : {}) }
  }
  // 业务工具常把状态码放在文本里，只取数字码，不带认证或端点细节。
  const match = /"code"\s*:\s*(\d{3})/.exec(typeof rawText === 'string' ? rawText : '')
  return match ? { code: `HTTP_${match[1]}` } : undefined
}
function validate(value) {
  if (!isRecord(value) || typeof value.sessionId !== 'string' || !Array.isArray(value.rows) || value.rows.length > LIMIT
    || !Number.isSafeInteger(value.omitted) || value.omitted < 0) throw new Error('invalid network-space timeline')
  if (value.approvals !== undefined && (!Array.isArray(value.approvals) || value.approvals.length > APPROVAL_LIMIT)) {
    throw new Error('invalid network-space approvals')
  }
  return value
}
export const timelineDefinition = {
  key: TIMELINE_KEY, stateVersion: 1,
  stateSchema: { parse: validate },
  init: header => ({ sessionId: String(header.id), running: false, turn: null, rows: [], approvals: [], omitted: 0 }),
  apply(state, event) {
    const data = event.data
    if (event.type === 'turn/start') return { ...state, running: true, turn: data.turn }
    if (event.type === 'turn/end') return { ...state, running: false,
      rows: state.rows.map(row => row.status === 'running'
        ? { ...row, status: 'unknown', semantic: 'unknown', endedAt: event.time,
            durationMs: Math.max(0, event.time - row.startedAt) } : row) }
    if (event.type === 'approval/asked') {
      const item = { id: String(data.id), toolName: String(data.toolName || ''), askedAt: event.time,
        ...(data.reason ? { reason: reasonOf(String(data.reason)) } : {}),
        ...(data.callId ? { callId: String(data.callId) } : {}) }
      return { ...state, approvals: [...(state.approvals || []), item].slice(-APPROVAL_LIMIT) }
    }
    if (event.type === 'approval/decided') {
      return { ...state, approvals: (state.approvals || []).map(item => item.id === String(data.id)
        ? { ...item, decidedAt: event.time, outcome: String(data.outcome) } : item) }
    }
    if (event.type === 'tool/call') {
      const rows = [...state.rows, { callId: `${data.turn}:${data.step}:${data.callId}`, rawCallId: String(data.callId),
        name: data.name, turn: data.turn, step: data.step, startedAt: event.time, endedAt: null, seq: event.seq,
        status: 'running', semantic: semantic(data.name), assetIds: assetIds(data.arguments), args: argsOf(data.arguments) }]
      return { ...state, rows: rows.slice(-LIMIT), omitted: state.omitted + Math.max(0, rows.length - LIMIT) }
    }
    if (event.type === 'tool/result') {
      const id = `${data.turn}:${data.step}:${data.message?.toolCallId}`
      if (!state.rows.some(row => row.callId === id)) return state
      const failed = Boolean(data.message?.isError)
      const current = state.rows.find(item => item.callId === id)
      const rawText = messageText(data.message)
      const summary = current ? resultOf(current.name, rawText) : ''
      return { ...state, rows: state.rows.map(row => row.callId === id ? {
        ...row, endedAt: event.time, durationMs: Math.max(0, event.time - row.startedAt),
        status: failed ? 'failed' : 'completed',
        ...(failed ? { semantic: 'unknown' } : {}),
        ...(summary ? { result: { summary, truncated: summary.endsWith('…') } } : {}),
        ...(failed ? { error: errorOf(data.error, rawText) ?? { code: 'TOOL_ERROR' } } : {}),
      } : row) }
    }
    return state
  },
  wire: { viewSchema: { parse: validate }, view: state => state },
}
export function mountTimeline(ctx) {
  ctx.inject(['sessionProjections'], scope => {
    scope.effect(() => scope.sessionProjections.register(timelineDefinition), 'network-space: native log projection')
  })
}
export async function readTimeline(ctx, sessionId, signal) {
  if (!/^[A-Za-z0-9_.:-]{1,160}$/.test(sessionId || '')) throw fail('INVALID_QUERY', '会话标识无效')
  // 公共只读投影接口；不恢复 Agent、不回放业务工具、不直接扫描日志文件。
  const snapshot = await ctx.sessionController.projections({ sessionId }, signal)
  if (!snapshot) throw fail('SESSION_NOT_FOUND', '未找到该实例可读取的会话')
  if (snapshot.kind !== 'sequenced') throw fail('SESSION_MIGRATION_REQUIRED', '当前会话需要迁移，尚不能提供精确执行时间线')
  const value = snapshot.values?.[TIMELINE_KEY]
  if (!value) throw fail('TIMELINE_UNAVAILABLE', '原生投影尚未装载，不以空闲或零记录代替')
  return { ...safeData(value), asOfSeq: snapshot.asOfSeq,
    notice: '仅展示该会话最近64次工具调用；完成表示工具返回，不表示资产检查通过。参数与结果已按只读白名单摘要，未明确绑定的资产不播放任务动效。' }
}

export function mergeTimelines(values, limit = 30) {
  const rows = [], approvals = []
  values.forEach((value, index) => {
    for (const row of value?.rows || []) rows.push({ ...row, sessionIndex: index + 1 })
    for (const item of value?.approvals || []) approvals.push({ ...item, sessionIndex: index + 1 })
  })
  rows.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  approvals.sort((a, b) => (b.askedAt || 0) - (a.askedAt || 0))
  return { rows: rows.slice(0, limit), approvals: approvals.slice(0, Math.max(5, Math.ceil(limit / 3))),
    omitted: Math.max(0, rows.length - limit) }
}
export async function readTimelineAll(ctx, signal) {
  const { items } = await ctx.sessionController.list({}, signal)
  const targets = (items || [])
    .filter(item => item && item.blank !== true && typeof item.sessionId === 'string')
    .slice(0, 20)
  const values = await Promise.all(targets.map(async item => {
    try {
      const snapshot = await ctx.sessionController.projections({ sessionId: item.sessionId }, signal)
      return snapshot?.kind === 'sequenced' ? snapshot.values?.[TIMELINE_KEY] : undefined
    } catch { return undefined }
  }))
  const merged = mergeTimelines(values.filter(Boolean))
  if (!merged.rows.length && !merged.approvals.length) throw fail('TIMELINE_UNAVAILABLE', '原生投影尚未装载，不以空闲或零记录代替')
  return { scope: 'all', sessions: targets.length, asOfSeq: 0, ...merged,
    notice: '跨会话聚合最近工具调用与审批；完成表示工具返回，不表示资产检查通过；参数与结果已按只读白名单摘要。' }
}
