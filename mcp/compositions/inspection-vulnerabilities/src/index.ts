import { base, assetItem, scopeComponent, summary, rows, tools, type Soc } from '../../../src/inspection/index.ts'

export function create(soc: Soc) {
  const api = tools(soc)
  return { ...base(soc), components: {
    scope: scopeComponent(soc),
    summary: (value: any, _config: any, context: any) => summary('vulnerabilities', value.items, context, 'completed'),
    children: async (value: any, config: any, context: any) => {
      const asset = value.item, errors: string[] = []
      const targets = new Map([[asset.assetId, asset]])
      try {
        let expected: number | undefined
        for (let page = 1; ; page++) {
          const reply = await api.request(config.connections.master, 'get_soc_asset_registration_children', { assetId: asset.assetId, page }, context.signal, context)
          const data = reply.data, children = rows(reply), total = data?.total
          if (!Number.isSafeInteger(total) || total < 0 || expected !== undefined && expected !== total) throw new Error('子资产分页总数无效或变化')
          expected = total
          const before = targets.size
          for (const child of children) {
            if (!Number.isSafeInteger(child.assetId) || child.assetId <= 0 || child.assetId === asset.assetId || child.hostAssetId !== asset.assetId) throw new Error('子资产标识或宿主归属不一致')
            targets.set(child.assetId, child)
          }
          if (targets.size - 1 > total) throw new Error('子资产返回超过声明总数')
          if (targets.size - 1 === total) break
          if (!children.length || targets.size === before) throw new Error('子资产分页不完整')
        }
      } catch (error: any) { context.signal.throwIfAborted(); errors.push(error.message) }

      return { ...value, asset, items: [...targets.values()], errors }
    },
    observations: async (value: any, config: any, context: any) => {
      const assetId = value.item.assetId, hostAssetId = value.item.hostAssetId
      try {
        const records = rows(await api.request(config.connections.master, 'get_soc_asset_vulnerabilities', { assetId }, context.signal, context))
        if (records.some(record => !record || typeof record !== 'object' || Array.isArray(record))) throw new Error('漏洞明细不是对象')
        return { assetId, ...(hostAssetId === undefined ? {} : { hostAssetId }), observed_at: new Date().toISOString(), records }
      } catch (error: any) { context.signal.throwIfAborted(); return { assetId, ...(hostAssetId === undefined ? {} : { hostAssetId }), error: error.message } }
    },
    assess: (value: any) => {
      const errors = [...value.errors], sources: any[] = [], observations = new Map<string, any>()
      for (const source of value.items) {
        if (source.assetId !== value.asset.assetId && source.hostAssetId !== value.asset.assetId) {
          errors.push(`来源归属不一致：资产 ${value.asset.assetId} 未绑定来源 ${source.assetId}；不纳入该来源观测`)
          continue
        }
        if (source.error) { errors.push(`资产 ${source.assetId}：${source.assetId === value.asset.assetId ? '' : `（宿主 ${source.hostAssetId}）`}${source.error}`); continue }
        sources.push({ ...source, records: source.records.length })
        for (const record of source.records) {
          const identity = record.id ?? record.vulnerabilityId ?? record.cveId ?? JSON.stringify(Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))))
          const key = String(identity), observation = { sourceAssetId: source.assetId, record }
          if (observations.has(key)) observations.get(key).observations.push(observation)
          else observations.set(key, { identity: key, observations: [observation] })
        }
      }
      const findings = [...observations.values()].sort((a, b) => a.identity.localeCompare(b.identity)).map(finding => ({ ...finding,
        observations: finding.observations.sort((a: any, b: any) => a.sourceAssetId - b.sourceAssetId || JSON.stringify(a.record).localeCompare(JSON.stringify(b.record))),
        sourceAssetIds: [...new Set<number>(finding.observations.map((item: any) => item.sourceAssetId))].sort((a, b) => a - b) }))
      return assetItem(value.asset, { status: errors.length ? 'failed' : findings.length ? 'abnormal' : 'normal',
        message: errors.length ? '漏洞数据未完整读取' : findings.length ? `查询到 ${findings.length} 条去重漏洞记录` : '没有漏洞',
        recommendation: errors.length ? '核对读取失败原因；尚未执行补采或扫描。' : findings.length ? '核对已有漏洞的处置状态；尚未执行整改。' : undefined, findings, sources: sources.sort((a, b) => a.assetId - b.assetId), errors, coverage: errors.length ? 'incomplete' : 'existing_records_only' })
    },
  } }
}
