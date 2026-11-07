import { BlockList, isIP } from 'node:net'
import type { CompositionWorkflow, WorkflowContext } from '@harness-platform/mcp/extension'


export type Soc = ((connection: string, operation: string, args: Record<string, any>, signal: AbortSignal, expected?: string) => Promise<any>) & { fingerprint?(connection: string): string }
const requestsByRun = new WeakMap<Function, Map<string, Promise<any>>>()
type RequestContext = Pick<WorkflowContext, 'call'> & Partial<Pick<WorkflowContext, 'shared'>>
export const inputSchema = {
  type: 'object', additionalProperties: false, required: ['scope'], properties: {
    scope: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      all: { type: 'boolean', const: true },
      assetIds: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 }, uniqueItems: true },
      ips: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, uniqueItems: true },
      cidrs: { type: 'array', minItems: 1, items: { type: 'string', minLength: 3 }, uniqueItems: true },
      assetTypes: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, uniqueItems: true },
      layerIds: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, uniqueItems: true },
      networkTiers: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 }, uniqueItems: true },
      deptIds: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1 }, uniqueItems: true },
    } },
    reachability: { type: 'object', additionalProperties: false, required: ['srcIp', 'dstIp'], properties: {
      srcIp: { type: 'string' }, dstIp: { type: 'string' }, mode: { type: 'string', enum: ['FULL', 'MUST_PASS'] },
      via: { type: 'array', minItems: 1, items: { type: 'string' } }, port: { type: 'integer', minimum: 1, maximum: 65535 }, protocol: { type: 'string', enum: ['tcp', 'udp', 'icmp'] },
    } },
  },
}
export function decode(value: any): any {
  if (value?.isError) throw new Error('上游 MCP 工具执行失败')
  if (value?.structuredContent) value = value.structuredContent
  else if (Array.isArray(value?.content) || Array.isArray(value?.contents)) {
    const text = (value.content ?? value.contents).filter((item: any) => typeof item.text === 'string').map((item: any) => item.text).join('\n')
    try { value = JSON.parse(text) } catch { throw new Error('上游未返回可解析的结构化数据') }
  }
  if (!value || typeof value !== 'object' || value.code !== undefined && ![0, 200].includes(value.code)) throw new Error(`上游业务请求失败：${value?.code ?? 'invalid-response'}`)
  return value
}
export function rows(value: any): any[] {
  const result = value.rows ?? value.data?.rows ?? value.data?.records ?? value.data?.list ?? value.data
  if (!Array.isArray(result)) throw new Error('上游响应缺少列表，不能作为空结果')
  return result
}
export function cidrMatch(ip: string, cidr: string) {
  const [address, prefix, extra] = cidr.split('/'), family = isIP(address), bits = family === 4 ? 32 : 128
  if (!family || prefix === undefined || extra !== undefined || !/^\d+$/.test(prefix) || +prefix > bits) throw new Error(`CIDR 无效：${cidr}`)
  const block = new BlockList(); block.addSubnet(address, +prefix, family === 4 ? 'ipv4' : 'ipv6')
  return isIP(ip) === family && block.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}
export function tools(soc: Soc) {
  async function request(connection: string, operation: string, args: Record<string, any>, signal: AbortSignal, context?: RequestContext) {
    const invoke = async () => { signal.throwIfAborted(); return decode(await soc(connection, operation, args, AbortSignal.any([signal, AbortSignal.timeout(30_000)]), context?.shared?.connection_fingerprints?.[connection])) }
    // GET 仅对明确的瞬时网络失败重试一次，业务错误保留原结果。
    const attempt = () => context ? context.call(invoke) : invoke()
    const call = async () => { try { return await attempt() } catch (error: any) { if (!signal.aborted && /ECONNRESET|ETIMEDOUT|fetch failed/.test(error.message)) return attempt(); throw error } }
    if (!context) return call()
    let cache = requestsByRun.get(context.call)
    if (!cache) { cache = new Map(); requestsByRun.set(context.call, cache) }
    const key = JSON.stringify([connection, operation, args])
    if (!cache.has(key)) cache.set(key, call())
    return cache.get(key)!
  }
  async function listAssets(connection: string, signal: AbortSignal, deptId?: number, context?: RequestContext) {
    const assets = new Map<string, any>()
    let expected: number | undefined
    for (let pageNum = 1; ; pageNum++) {
      signal.throwIfAborted()
      const reply = await request(connection, 'list_soc_asset', { pageNum, pageSize: 200, includeUnits: true, ...(deptId ? { deptId } : {}) }, signal, context)
      const page = rows(reply), total = reply.total ?? reply.data?.total
      if (!Number.isSafeInteger(total) || total < 0 || expected !== undefined && expected !== total) throw new Error('资产分页总数缺失或运行期间变化，请重新提交')
      expected = total
      const before = assets.size
      for (const asset of page) {
        if (!Number.isSafeInteger(asset.assetId) || asset.assetId <= 0) throw new Error('资产记录缺少稳定 ID')
        assets.set(String(asset.assetId), asset)
      }
      if (assets.size > total) throw new Error('资产分页结果超过声明总数，请重新提交')
      if (assets.size === total) return [...assets.values()]
      if (!page.length || assets.size === before) throw new Error('资产分页未完整返回，未创建运行')
    }
  }
  async function prepare(input: any, config: any, signal: AbortSignal, context?: RequestContext) {
    const scope = input.scope
    if (!scope || !Object.keys(scope).length || scope.all && Object.keys(scope).length > 1) throw new Error('须提供明确范围；全部资产不能与其他筛选混用')
    for (const ip of scope.ips ?? []) if (!isIP(ip)) throw new Error(`IP 无效：${ip}`)
    for (const cidr of scope.cidrs ?? []) cidrMatch('', cidr)
    if (input.reachability) {
      if (!isIP(input.reachability.srcIp) || !isIP(input.reachability.dstIp)) throw new Error('可达性源、目的必须为有效 IP')
      if (input.reachability.mode === 'MUST_PASS' && !input.reachability.via?.length) throw new Error('MUST_PASS 模式须提供途经节点')
    }
    const connection = config.connections?.master
    if (!connection) throw new Error('未绑定资产连接')
    const groups: any[][] = []
    if (scope.assetIds && !scope.deptIds) {
      groups.push(await Promise.all(scope.assetIds.map(async (assetId: number) => {
        const reply = await request(connection, 'get_soc_asset_by_asset_id', { assetId }, signal, context)
        if (reply.data?.assetId !== assetId) throw new Error('指定资产不存在或返回身份不一致；请核对 ID，本次未创建运行')
        return reply.data
      })))
    } else {
      // 部门列表包含下级部门，保留上游范围语义。
      for (const deptId of scope.deptIds ?? [undefined]) groups.push(await listAssets(connection, signal, deptId, context))
    }
    const unique = new Map(groups.flat().map(asset => [asset.assetId, asset]))
    const assets = [...unique.values()].filter(asset => (!scope.assetIds || scope.assetIds.includes(asset.assetId)) && (!scope.ips || scope.ips.includes(asset.ip)) && (!scope.cidrs || scope.cidrs.some((cidr: string) => cidrMatch(asset.ip ?? '', cidr))) && (!scope.assetTypes || scope.assetTypes.includes(asset.assetType)) && (!scope.layerIds || scope.layerIds.includes(String(asset.layerId))) && (!scope.networkTiers || scope.networkTiers.includes(asset.networkTier))).sort((a, b) => a.assetId - b.assetId)
    if (!assets.length) throw new Error('所选范围没有资产；请核对范围，本次未创建运行')
    if (scope.assetIds?.some((id: number) => !unique.has(id))) throw new Error('部分指定资产不存在或不在部门范围内；请核对 ID')
    if (scope.ips?.some((ip: string) => ![...unique.values()].some(asset => asset.ip === ip))) throw new Error('部分指定 IP 没有对应资产；请核对 IP')
    const fields = ['assetId', 'ip', 'hostname', 'assetType', 'hostAssetId', 'deptId', 'layerId', 'networkTier', 'status', 'online', 'onlineBasis', 'lastSeenAt', 'lastProbeAt', 'probeState', 'onlineWindowMinutes', 'heartbeatWindowSeconds', 'stateEvidence']
    return { connection, scope: { requested: scope, frozen_at: new Date().toISOString(), count: assets.length, assetIds: assets.map(asset => asset.assetId) }, assets: assets.map(asset => Object.fromEntries(fields.filter(key => Object.hasOwn(asset, key)).map(key => [key, asset[key]]))) }
  }
  async function prepareInspection(input: any, config: any, signal: AbortSignal, withRules = false, context?: RequestContext) {
    const fingerprints = Object.fromEntries([...new Set<string>(Object.values(config.connections ?? {}))].map(id => [id, soc.fingerprint?.(id)]))
    const snapshot = { ...await prepare(input, config, signal, context), connection_fingerprints: fingerprints }
    const verify = () => { for (const [id, value] of Object.entries(fingerprints)) if (value !== soc.fingerprint?.(id)) throw new Error('准备期间连接已变化，请重新提交') }
    verify()
    if (withRules && !input.reachability) {
      let rules: any[] = [], rules_error: string | undefined
      try { rules = rows(await request(config.connections.graph, 'get_graph_compliance_rules', {}, signal, context)) }
      catch (error: any) { signal.throwIfAborted(); rules_error = error.message }
      verify()
      return { ...snapshot, rules, rules_error, rules_frozen_at: new Date().toISOString(), graphConnection: config.connections.graph }
    }
    return snapshot
  }
  async function snapshot(input: any, config: any, context: WorkflowContext, withRules = false) {
    const shared = context.shared
    if (!shared) return prepareInspection(input, config, context.signal, withRules, context)
    if (shared.connection !== config.connections.master || JSON.stringify(shared.scope?.requested) !== JSON.stringify(input.scope) || !Object.values(config.connections ?? {}).every(id => Object.hasOwn(shared.connection_fingerprints ?? {}, String(id)) && shared.connection_fingerprints[id as string] === soc.fingerprint?.(String(id))) || withRules && !input.reachability && (!Array.isArray(shared.rules) || shared.graphConnection !== config.connections.graph)) throw new Error('运行快照与范围、规则或连接不一致；保留原范围，本次不重新准备')
    return shared
  }
  return { request, prepare: prepareInspection, snapshot }
}
export function summary(kind: string, items: any[], context: WorkflowContext) {
  return { kind, scope: context.shared.scope, status: items.some(item => ['failed', 'unknown'].includes(item.status)) ? 'incomplete' : 'completed',
    counts: Object.fromEntries(['normal', 'abnormal', 'unknown', 'not_applicable', 'failed'].map(status => [status, items.filter(item => item.status === status).length])), items }
}
export function artifacts(result: Record<string, any>) {
  const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
  const labels: Record<string, string> = { normal: '正常', abnormal: '异常', unknown: '未知', not_applicable: '不适用', failed: '失败' }
  const sections = result.checks ?? { [result.kind ?? 'inspection']: result }
  const body = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>巡检报告</title><style>body{font:16px/1.6 system-ui;max-width:1120px;margin:32px auto;padding:0 20px;color:#20242c}table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ddd;padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere}h2{margin-top:32px}</style><h1>巡检报告</h1><p>冻结时间：${escape(result.scope?.frozen_at)}；范围资产数：${escape(result.scope?.count)}；执行状态：${escape(result.status)}</p><p>未知与未返回数据不表示正常。检查基于已有 SOC 事实，不执行主动探测。</p>${Object.entries(sections).map(([name, section]: [string, any]) => `<h2>${escape(name)}</h2><p>${escape(Object.entries(section.counts ?? {}).map(([key, count]) => `${labels[key] ?? key} ${count}`).join('，'))}</p><table><thead><tr><th>对象</th><th>结论</th><th>说明与建议</th></tr></thead><tbody>${(section.items ?? [section]).map((item: any) => `<tr><td>${escape(item.hostname ?? item.ruleName ?? item.assetId ?? item.srcIp ?? name)} ${escape(item.ip ?? item.dstIp ?? '')}</td><td>${escape(labels[item.status] ?? item.status)}</td><td>${escape(item.message ?? item.error)}<br>${escape(item.recommendation)}</td></tr>`).join('')}</tbody></table>`).join('')}<details><summary>完整归档事实</summary><pre>${escape(JSON.stringify(result, null, 2))}</pre></details></html>`
  return [{ id: 'report', filename: 'inspection-report.html', contentType: 'text/html; charset=utf-8', body }, { id: 'details', filename: 'inspection-details.json', contentType: 'application/json', body: JSON.stringify(result, null, 2) }]
}
export function base(soc: Soc, withRules = false): Pick<CompositionWorkflow, 'inputSchema' | 'connections' | 'prepare' | 'artifacts'> {
  return { inputSchema, connections: config => [...new Set(Object.values(config.connections ?? {}))], prepare: (input, config, signal, context) => tools(soc).prepare(input, config, signal, withRules, context), artifacts }
}

export function assetItem(asset: any, result: any) {
  return { assetId: asset.assetId, ip: asset.ip, hostname: asset.hostname, observed_at: new Date().toISOString(), ...result }
}
export function scopeComponent(soc: Soc, withRules = false) {
  return async (input: any, config: any, context: WorkflowContext) => {
    const frozen = await tools(soc).snapshot(input, config, context, withRules)
    return { ...input, items: frozen.assets }
  }
}
