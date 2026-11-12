import { base, assetItem, summary, type Soc } from '../../../src/inspection/index.ts'
import { classifyStatus } from '../../../src/inspection/status.ts'
import { checkComplete } from '../../../src/inspection/completion.ts'
export { classifyStatus } from '../../../src/inspection/status.ts'

export function create(soc: Soc) {
  return { ...base(soc, true), components: {
    status: (_value: any, _config: any, context: any) => summary('status', context.shared.assets.map((asset: any) => assetItem(asset, classifyStatus(asset))), context, 'completed'),
    summary: (steps: Record<string, any>, _config: any, context: any) => {
      const checks = Object.fromEntries(['status', 'baseline', 'reachability'].map(id => [id, steps[id] ?? { status: 'failed', error: '缺少子检查结果' }]))
      const { items: _items, counts: _counts, ...metadata } = summary('routine', [], context, 'completed')
      const complete = Object.values(checks).every(checkComplete)
      return { ...metadata, source: { connections: [...new Set(Object.values(_config.connections ?? {}))].map(connectionId => ({ connectionId })) }, complete, status: complete ? 'completed' : 'incomplete', checks }
    },
  } }
}
