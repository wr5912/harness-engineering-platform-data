import { base, assetItem, summary, type Soc } from '../../../src/inspection/index.ts'
import { classifyStatus } from '../../../src/inspection/status.ts'

export function create(soc: Soc) {
  return { ...base(soc), components: {
    status: (_value: any, _config: any, context: any) => summary('status', context.shared.assets.map((asset: any) => assetItem(asset, classifyStatus(asset))), context, 'completed'),
    summary: (value: any) => value.status,
  } }
}
