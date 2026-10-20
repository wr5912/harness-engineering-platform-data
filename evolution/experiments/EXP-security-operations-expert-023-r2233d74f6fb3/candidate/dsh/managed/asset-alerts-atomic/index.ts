import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const name = 'asset-alerts-atomic'
export const inject = ['tools']

type Reply = { status: number; json: Record<string, any> }
type Sample = { provenance: string; asset: Reply; alerts: Reply | null }

/** 仅在外部 GET 传输边界重放样本；两侧执行相同的真实原子工具和业务判断。 */
export function apply(ctx: any) {
  const bytes = readFileSync(fileURLToPath(new URL('../compute-workflow/fixtures.json', import.meta.url)))
  const fixture = JSON.parse(bytes.toString('utf8')) as {
    mode: string; tool_schemas: Record<string, Record<string, any>>; cases: Record<string, Sample>
  }
  if (fixture.mode !== 'mock-replay') throw new Error('本次共同基准必须使用已冻结的 Mock/replay 外部样本')
  const fixedInputSha256 = createHash('sha256').update(bytes).digest('hex')
  const operations = ['get_soc_asset_by_asset_id', 'list_detect_alert'] as const
  for (const operation of operations) ctx.tools.register({
    name: operation,
    description: operation === 'get_soc_asset_by_asset_id'
      ? '资产关联告警研究：按整数 assetId 查询资产详情；来自固定 Mock/replay 外部 GET 样本，必须检查 HTTP 状态、业务 code 和 data.assetId。'
      : '资产关联告警研究：按实际资产详情中的 ID 查询近30天首页告警分组；req按原OpenAPI参数传入。来自固定Mock/replay，空结果和失败必须区分。',
    parameters: fixture.tool_schemas[operation],
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    isConcurrencySafe: () => true,
    async execute(args: Record<string, any>, execution: { signal: AbortSignal }) {
      execution.signal.throwIfAborted()
      const assetId = operation === 'get_soc_asset_by_asset_id' ? String(args.assetId) : String(args.req.assetId)
      const sample = fixture.cases[assetId]
      if (!sample) throw new Error('当前资产不在本次固定样本中；未查询在线系统')
      if (operation === 'list_detect_alert' && (args.req.pageNum !== 1 || args.req.pageSize !== 5 || args.req.windowSeconds !== 2592000)) throw new Error('本次冻结样本仅覆盖近30天、第1页、每页5组；未查询其他范围')
      const reply = operation === 'get_soc_asset_by_asset_id' ? sample.asset : sample.alerts
      if (!reply) throw new Error('资产查询失败的样本没有后续告警响应，不得继续查询')
      const ok = reply.status >= 200 && reply.status < 300 && reply.json.code === 200
      return {
        ok, status: reply.status, json: structuredClone(reply.json),
        fixed_input_sha256: fixedInputSha256,
        receipt: { mode: fixture.mode, source_kind: 'basic_mock', fixture_provenance: sample.provenance,
          fixed_input_sha256: fixedInputSha256, operation_id: operation, method: 'GET', arguments: args,
          path: operation === 'get_soc_asset_by_asset_id' ? `/api/v1/security-operations/readonly/assets/${assetId}` : '/api/v1/security-operations/readonly/alerts' },
      }
    },
  })
}
