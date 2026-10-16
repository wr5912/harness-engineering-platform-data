import type { CompositionFlow } from '@harness-platform/mcp/extension'

/** SOC 的操作名称、响应业务码和分页字段仅由业务扩展维护。 */
export const assetAlertsFlow: CompositionFlow = {
  steps(config) {
    return [
      { step: 'asset', title: '查询资产', connectionId: config.connectionId, operationId: 'get_soc_asset_by_asset_id', input: { assetId: '$input.asset' }, output: 'asset' },
      { step: 'alerts', title: '查询近 30 天关联告警分组', connectionId: config.alertsConnectionId, operationId: 'list_detect_alert', input: { 'req.assetId': '$state.assetId', 'req.pageNum': 1, 'req.pageSize': '$input.limit', 'req.windowSeconds': 2592000 }, output: 'alerts' },
    ]
  },
  assetArguments: input => ({ assetId: Number(input.asset) }),
  assetResult(reply, input) {
    const asset = reply.json?.data, assetId = asset?.assetId
    const error = reply.json?.code !== 200 ? { code: 'business_failed', message: `查询资产业务失败：code ${reply.json?.code ?? '缺失'}` }
      : !Number.isSafeInteger(assetId) || assetId !== Number(input.asset) ? { code: 'mapping_failed', message: '第一步结果缺少或不匹配所查询的资产 ID' } : undefined
    return { asset, assetId, error }
  },
  alertsArguments: (input, assetId) => ({ req: { assetId: String(assetId), pageNum: 1, pageSize: input.limit, windowSeconds: 2592000 } }),
  alertsResult(reply) {
    return { items: reply.json?.data?.groups,
      summary: reply.json?.code === 200 ? Object.fromEntries(['totalGroups', 'totalAlerts', 'truncated', 'from', 'to', 'pageNum', 'pageSize'].map(key => [key, reply.json.data[key]])) : undefined,
      ...(reply.json?.code !== 200 ? { error: { code: 'business_failed', message: `查询告警业务失败：code ${reply.json?.code ?? '缺失'}` } } : {}),
    }
  },
  succeeded: reply => reply.ok && reply.json?.code === 200,
}
