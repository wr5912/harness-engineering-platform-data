import { createRequire } from 'node:module'
import { fail, isRecord } from './data.js'

// 逻辑查询只匹配已发现的公开资源路径；不猜工具名，不接受页面传入 URL。
export const QUERIES = Object.freeze({
  assets: ['ai-soc-master', '/soc/asset/list'], asset: ['ai-soc-master', '/soc/asset/{assetId}'],
  topology: ['ai-soc-graph', '/graph/composed'], coverage: ['ai-soc-graph', '/graph/coverage'], node: ['ai-soc-graph', '/graph/node-detail'],
  incidents: ['ai-soc-correlate', '/correlate/incident'], threats: ['ai-soc-correlate', '/correlate/incident'],
  stats: ['ai-soc-correlate', '/correlate/incident/stats'],
  trend: ['ai-soc-correlate', '/correlate/incident/trend'], severity: ['ai-soc-correlate', '/correlate/incident/severity-distribution'],
  incident: ['ai-soc-correlate', '/correlate/incident/{incidentId}'], reasoning: ['ai-soc-correlate', '/correlate/incident/{incidentId}/reasoning-chain'],
  judgements: ['ai-soc-correlate', '/correlate/incident/{incidentId}/judgements'],
  evidence: ['ai-soc-correlate', '/correlate/incident/{incidentId}/evidence/{ref}'], report: ['ai-soc-correlate', '/correlate/incident/judgement/{judgementId}/report'],
})
const TARGET_META = 'io.deepseek.dsh/mcp-group-target'
function httpStatus(error) {
  const match = /HTTP\s*[:=]?\s*([1-5]\d\d)/i.exec(error?.message || '')
  if (match) return Number(match[1])
  for (const value of [error?.status, error?.statusCode, error?.data?.status]) if (Number.isInteger(value) && value >= 100 && value <= 599) return value
  return undefined
}
function readerError(error, stage) {
  // 某些 SDK 错误将 status 定义为只读访问器；不能把它原地 Object.assign 回 Error。
  const wrapped = new Error(error?.message || 'MCP 查询失败')
  if (error?.code !== undefined) wrapped.code = error.code
  if (error?.upstreamCode !== undefined) wrapped.upstreamCode = error.upstreamCode
  wrapped.stage = stage
  const dispatchStatus = error?.status ?? error?.statusCode
  if (dispatchStatus !== undefined) wrapped.dispatchStatus = dispatchStatus
  const status = httpStatus(error)
  if (status !== undefined) wrapped.statusCode = status
  return wrapped
}
function gate(limit) {
  let active = 0
  const waiting = []
  const cancelled = () => fail('QUERY_ABORTED', '等待查询额度时取消或超时', { stage: 'queue' })
  const wake = () => {
    while (active < limit && waiting.length) {
      const row = waiting.shift(); row.signal.removeEventListener('abort', row.cancel)
      if (row.signal.aborted) { row.reject(cancelled()); continue }
      active++
      let released = false
      row.resolve(() => { if (!released) { released = true; active--; wake() } })
    }
  }
  return signal => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(cancelled()); return }
    if (waiting.length >= 32) { reject(fail('QUERY_BUSY', '只读查询队列已满', { stage: 'queue' })); return }
    const row = { resolve, reject, signal, cancel: null }
    row.cancel = () => { const index = waiting.indexOf(row); if (index >= 0) waiting.splice(index, 1); reject(cancelled()) }
    signal.addEventListener('abort', row.cancel, { once: true }); waiting.push(row); wake()
  })
}
function sourcePath(template, prefix) {
  // 使用公开 mcp-group URI 合同仅定位来源，不自行构造或调用上游地址。
  if (typeof template !== 'string' || !template.startsWith(prefix)) return null
  const encoded = /^([A-Za-z0-9_-]+)(?:\{\?[A-Za-z0-9_,.-]+\})?$/.exec(template.slice(prefix.length))
  if (!encoded) return null
  const original = Buffer.from(encoded[1], 'base64url').toString('utf8')
  const path = /^https?:\/\/[^/]+(\/.*)$/.exec(original)?.[1]
  return path ? path.replace(/\{\?[^}]*\}$/, '').split('?')[0] : null
}
function parseJson(content) {
  // Node 24 reviver 的 source 保留原始大整数，避免 int64 对象 ID 精度丢失。
  return JSON.parse(content, (_key, value, context) => {
    if (typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      if (!context?.source || !/^-?[0-9]+$/.test(context.source)) throw fail('SOURCE_ID_PRECISION', '上游大整数无法精确恢复')
      return context.source
    }
    return value
  })
}
export function createReader(config, manager, shutdownSignal) {
  const enter = gate(4)
  return async function read(key, args, requestSignal) {
    const selected = QUERIES[key]
    if (!selected) throw fail('QUERY_NOT_ALLOWED', '查询未在只读目录中声明')
    if (typeof manager?.groupUrl !== 'function' || typeof manager?.groupFetch !== 'function') throw fail('CONNECTION_NOT_CONFIGURED', '监控 MCP 分组传输服务不可用', { stage: 'connect' })
    const signal = AbortSignal.any([shutdownSignal, requestSignal, AbortSignal.timeout(10000)])
    const release = await enter(signal)
    let client, stage = 'connect'
    try {
      const require = createRequire(process.env.DSH_MCP_CLIENT_ANCHOR || '/opt/dsh/packages/mcp/mcp-client/package.json')
      const { Client, StreamableHTTPClientTransport, UriTemplate } = require('@modelcontextprotocol/client')
      client = new Client({ name: 'security-network-space', version: '1.0.0' }, { versionNegotiation: { mode: 'auto' } })
      const groupFetch = manager.groupFetch(config.groupId)
      await client.connect(new StreamableHTTPClientTransport(new URL(manager.groupUrl(config.groupId)), {
        fetch: (input, init) => groupFetch(input, { ...init, redirect: 'error', signal }),
      }), { signal, timeout: 10000 })
      stage = 'discovery'
      const templates = []
      let cursor, digest, pages = 0
      do {
        const response = await client.listResourceTemplates(cursor ? { cursor } : undefined, { signal, timeout: 10000 })
        const meta = response._meta?.[TARGET_META]
        if (meta?.version !== 2 || !/^[a-f0-9]{64}$/.test(meta?.digest || '') || digest && meta.digest !== digest) throw fail('GROUP_TARGET_CHANGED', '监控分组目标不可核对或已变化')
        digest = meta.digest; templates.push(...(response.resourceTemplates || [])); cursor = response.nextCursor
        if (++pages > 32) throw fail('DISCOVERY_LIMIT', '资源发现分页超过上限，未完整发现')
      } while (cursor)
      const [source, path] = selected, prefix = `mcp-group:/${config.groupId}/${source}/t/`
      const matches = templates.filter(item => sourcePath(item.uriTemplate, prefix) === path)
      if (matches.length !== 1) throw fail('RESOURCE_NOT_AVAILABLE', `监控分组未唯一公开 ${source}${path}`)
      const variables = Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)]))
      const uri = new UriTemplate(matches[0].uriTemplate).expand(variables)
      if (!uri.startsWith(prefix)) throw fail('RESOURCE_OWNER_MISMATCH', '展开后的资源归属不匹配')
      stage = 'read'
      const result = await client.readResource({ uri, _meta: { [TARGET_META]: { digest } } }, { signal, timeout: 10000 })
      if (!Array.isArray(result.contents) || result.contents.length !== 1 || typeof result.contents[0].text !== 'string') throw fail('SOURCE_SHAPE_UNVERIFIED', '上游未返回唯一文本资源')
      const content = result.contents[0]
      if (Buffer.byteLength(content.text, 'utf8') > 8 * 1024 * 1024) throw fail('SOURCE_RESPONSE_TOO_LARGE', '响应超过8 MiB，未完整展示')
      if (key === 'report' && content.mimeType?.includes('html')) return { reportText: content.text, contentType: 'text/html' }
      try { return parseJson(content.text) }
      catch (error) { if (error?.code) throw error; throw fail('SOURCE_SHAPE_UNVERIFIED', '上游不是可识别 JSON；未假定业务成功') }
    } catch (error) {
      if (signal.aborted) throw fail('QUERY_ABORTED', '查询取消或超时，原结果未改变', { stage })
      throw readerError(error, stage)
    } finally {
      let timer
      try { if (client) await Promise.race([client.close(), new Promise(resolve => { timer = setTimeout(resolve, 500) })]) }
      catch {} finally { clearTimeout(timer); release() }
    }
  }
}
export function parseConfig(value = {}) {
  if (!isRecord(value)) throw new Error('security-network-space config must be an object')
  const groupId = value.groupId || 'network-space-monitoring'
  if (groupId !== 'network-space-monitoring') throw new Error('unexpected monitoring group id')
  return { groupId }
}
