import { createReader, parseConfig, QUERIES } from './mcp.js'
import { assetsView, topologyView, coverageView, incidentsView, threatsView, trendView, severityView, reasoningView, judgementsView, reportView, platformView, detailView, safeError, fail } from './data.js'
import { mountTimeline, readTimeline, readTimelineAll } from './timeline.js'

export const name = 'dsh-security-network-space'
export const inject = ['connection', 'sessionController', 'mcpSessionManager']
const PREFIX = '/api/security-operations/network-space/'
const MAX_AGE = { assets: 60000, topology: 60000, coverage: 60000, incidents: 30000, threats: 60000, stats: 30000, trend: 30000, severity: 30000 }
const NUMBER_KEYS = new Set(['pageNum', 'pageSize', 'bizId', 'zoneId', 'deptId', 'days'])
const ID_KEYS = new Set(['assetId', 'incidentId', 'judgementId', 'vid', 'ref', 'sessionId'])
const FIELDS = {
  assets: ['pageNum', 'pageSize', 'keyword', 'online', 'assetType'], asset: ['assetId'],
  topology: ['bizId', 'zoneId', 'deptId', 'assetIds', 'showEndpoints', 'includeSegments', 'relationType', 'timeFrom', 'timeTo'],
  coverage: ['bizId', 'zoneId', 'deptId', 'assetIds', 'showEndpoints', 'timeFrom', 'timeTo'], node: ['vid'],
  incidents: ['pageNum', 'pageSize', 'createdFrom', 'createdTo', 'severity', 'judgeStatus'],
  stats: ['createdFrom', 'createdTo', 'severity'], trend: ['createdFrom', 'createdTo', 'severity', 'days'],
  severity: ['createdFrom', 'createdTo'], incident: ['incidentId'], reasoning: ['incidentId'],
  judgements: ['incidentId'], evidence: ['incidentId', 'ref'], report: ['judgementId'], timeline: ['sessionId', 'scope'], threats: [], platform: [],
}
export function queryArgs(key, search, now = Date.now()) {
  const allowed = FIELDS[key]
  if (!allowed) throw fail('QUERY_NOT_ALLOWED', '查询未声明')
  const args = {}
  for (const [field, value] of search) {
    if (!allowed.includes(field) || Object.hasOwn(args, field)) throw fail('INVALID_QUERY', '存在未知或重复查询参数')
    if (!value || value.length > 1000) throw fail('INVALID_QUERY', '查询参数为空或过长')
    if (NUMBER_KEYS.has(field)) {
      if (!/^[1-9][0-9]{0,6}$/.test(value)) throw fail('INVALID_QUERY', '查询数字必须是正整数')
      args[field] = Number(value)
    } else if (['showEndpoints', 'includeSegments'].includes(field)) {
      if (!['true', 'false'].includes(value)) throw fail('INVALID_QUERY', '布尔参数无效')
      args[field] = value === 'true'
    } else {
      if (ID_KEYS.has(field) && !/^[A-Za-z0-9_.:@-]{1,160}$/.test(value)) throw fail('INVALID_QUERY', '对象标识不符合只读查询边界')
      args[field] = value
    }
  }
  if (['assets', 'incidents'].includes(key)) {
    args.pageNum ??= 1; args.pageSize ??= 20
    if (args.pageSize > 100 || args.pageNum > 100000) throw fail('INVALID_QUERY', '分页超出允许范围')
  }
  if (key === 'assets') args.includeUnits = false
  if (args.online && !['online', 'offline', 'unknown'].includes(args.online)) throw fail('INVALID_QUERY', '在线状态无效')
  if (args.relationType && !['all', 'network', 'communication', 'deployment'].includes(args.relationType)) throw fail('INVALID_QUERY', '关系类型无效')
  if (key === 'topology') { args.showEndpoints ??= false; args.includeSegments ??= true; args.relationType ??= 'all' }
  if (['incidents', 'stats', 'trend', 'severity'].includes(key)) {
    args.createdTo ??= new Date(now).toISOString(); args.createdFrom ??= new Date(now - 86400000).toISOString()
    for (const field of ['createdFrom', 'createdTo']) {
      if (!/(Z|[+-][0-9]{2}:[0-9]{2})$/.test(args[field]) || !Number.isFinite(Date.parse(args[field]))) throw fail('INVALID_QUERY', '时间必须包含时区')
    }
    if (Date.parse(args.createdFrom) > Date.parse(args.createdTo) || Date.parse(args.createdTo) - Date.parse(args.createdFrom) > 31 * 86400000) throw fail('INVALID_QUERY', '事件查询窗口无效或超过31天')
  }
  for (const field of ['timeFrom', 'timeTo']) {
    if (args[field] && (!/(Z|[+-][0-9]{2}:[0-9]{2})$/.test(args[field]) || !Number.isFinite(Date.parse(args[field])))) throw fail('INVALID_QUERY', '拓扑时间必须包含时区')
  }
  if (args.timeFrom && !args.timeTo || args.timeTo && !args.timeFrom) throw fail('INVALID_QUERY', '拓扑时间窗口需要同时提供起止')
  if (args.timeFrom && Date.parse(args.timeFrom) > Date.parse(args.timeTo)) throw fail('INVALID_QUERY', '拓扑时间起止无效')
  if (key === 'timeline') {
    if (args.scope !== undefined && args.scope !== 'all') throw fail('INVALID_QUERY', '聚合范围无效')
    if (args.scope === 'all' && args.sessionId) throw fail('INVALID_QUERY', '聚合范围不应指定会话')
    if (args.scope !== 'all' && !args.sessionId) throw fail('INVALID_QUERY', '缺少对象标识')
  }
  const required = { asset: ['assetId'], node: ['vid'], incident: ['incidentId'], reasoning: ['incidentId'], judgements: ['incidentId'], evidence: ['incidentId', 'ref'], report: ['judgementId'] }[key]
  if (required?.some(field => !args[field])) throw fail('INVALID_QUERY', '缺少对象标识')
  return args
}
function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
function moduleStatus(data) {
  if (data?.issues?.length || data?.complete === false || data?.omitted > 0) return 'partial'
  if (data === null || Array.isArray(data) && data.length === 0 || data?.items?.length === 0 || data?.nodes?.length === 0 || data?.rows?.length === 0 || data?.steps?.length === 0 || data?.buckets?.length === 0) return 'empty'
  return 'ok'
}
export function apply(ctx, rawConfig) {
  const configured = parseConfig(rawConfig)
  const shutdown = new AbortController(), read = createReader(configured, ctx.mcpSessionManager, shutdown.signal)
  ctx.effect(() => () => shutdown.abort(), 'network-space: cancel queries on unload')
  mountTimeline(ctx)
  for (const key of [...Object.keys(QUERIES), 'timeline']) {
    ctx.effect(() => ctx.connection.fetch.register({
      path: PREFIX + key, methods: ['GET'], requestBody: 'buffered',
      // 原生 Connection 精确路由负责 Host/Origin、鉴权和 owner Peer 权限；不另造资格校验。
      async fetch(request) {
        const sampledAt = new Date().toISOString(), [source, operation] = QUERIES[key] || ['DSH', 'sessionController.projections']
        let args
        try { args = queryArgs(key, new URL(request.url).searchParams) }
        catch (error) { return response({ status: 'unavailable', sampledAt, data: null, error: safeError(error, source, operation, 'input') }, 400) }
        if (key === 'threats' && Object.keys(args).length) return response({ status: 'unavailable', sampledAt, data: null, error: safeError(fail('INVALID_QUERY', '重点威胁为固定查询，不接受页面参数'), source, operation, 'input') }, 400)
        try {
          const signal = AbortSignal.any([shutdown.signal, request.signal, AbortSignal.timeout(12000)])
          const query = key === 'threats'
            ? { judgeStatus: 'DONE', judgeVerdict: 'TRUE_POSITIVE', severity: 'CRITICAL', pageNum: 1, pageSize: 50 }
            : args
          const body = key === 'timeline'
            ? (args.scope === 'all' ? await readTimelineAll(ctx, signal) : await readTimeline(ctx, args.sessionId, signal))
            : await read(key, query, signal)
          const data = key === 'assets' ? assetsView(body, args.pageNum, args.pageSize) : key === 'topology' ? topologyView(body)
            : key === 'coverage' ? coverageView(body) : key === 'incidents' ? incidentsView(body, args.pageNum, args.pageSize)
              : key === 'threats' ? threatsView(body)
                : key === 'trend' ? trendView(body) : key === 'severity' ? severityView(body) : key === 'reasoning' ? reasoningView(body, args.incidentId)
                : key === 'judgements' ? judgementsView(body) : key === 'report' ? reportView(body) : key === 'timeline' ? body : detailView(body)
          if (key === 'asset' && data && String(data.assetId) !== args.assetId || key === 'incident' && data && data.incidentId !== args.incidentId) throw fail('RESOURCE_ID_MISMATCH', '上游详情与请求对象不一致')
          return response({ status: moduleStatus(data), source, operation, sampledAt,
            expiresAt: new Date(Date.now() + (key === 'timeline' ? 10000 : MAX_AGE[key] || 60000)).toISOString(), query: args,
            data, error: null, simulation: false, limitation: '已按管理环境真实回执适配；目标实例装载、界面和业务效果另行核对。' })
        } catch (error) {
          return response({ status: 'unavailable', source, operation, sampledAt, query: args, data: null, simulation: false, error: safeError(error, source, operation) })
        }
      },
    }), `network-space: readonly ${key}`)
  }

  // 平台自身智能体与模型：服务缺失时不注册路由，前端得到 404 并显示不可用，不影响其他查询。
  ctx.inject(['agentPresets', 'llm'], inner => {
    inner.effect(() => inner.connection.fetch.register({
      path: PREFIX + 'platform', methods: ['GET'], requestBody: 'buffered',
      async fetch() {
        const sampledAt = new Date().toISOString(), operation = 'agentPresets.list/llm.listModels'
        try {
          let agents = [], models = []
          try {
            const presets = await inner.agentPresets.list()
            const defaultId = inner.agentPresets.defaultId
            agents = (Array.isArray(presets) ? presets : []).map(row => ({ ...row, isDefault: row.id === defaultId }))
          } catch (error) { if (error?.code) throw error }
          try {
            const providers = await inner.llm.listProviders()
            for (const provider of Array.isArray(providers) ? providers : []) {
              const id = typeof provider === 'string' ? provider : provider?.id ?? provider?.name
              if (!id) continue
              try {
                for (const model of await inner.llm.listModels(id)) {
                  models.push({ provider: id, model: model?.id ?? model?.model ?? String(model), name: model?.name })
                }
              } catch {}
            }
          } catch {}
          const data = platformView(agents, models)
          return response({ status: moduleStatus(data), source: 'DSH', operation, sampledAt,
            expiresAt: new Date(Date.now() + 60000).toISOString(), query: {}, data, error: null, simulation: false })
        } catch (error) {
          return response({ status: 'unavailable', source: 'DSH', operation, sampledAt, query: {}, data: null, simulation: false,
            error: safeError(error, 'DSH', operation) })
        }
      },
    }), 'network-space: readonly platform')
  })
}
