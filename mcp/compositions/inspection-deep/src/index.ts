import { base, summary, type Soc } from '@harness-platform/security-operations/inspection/index.ts'
import { checkComplete } from '@harness-platform/security-operations/inspection/completion.ts'

export function create(soc: Soc) {
  return { ...base(soc, true), components: {
    summary: (steps: Record<string, any>, _config: any, context: any) => {
    const checks = { ...(steps.routine?.checks ?? { routine: steps.routine ?? { status: 'failed', error: '缺少常规巡检结果' } }), vulnerabilities: steps.vulnerabilities ?? { status: 'failed', error: '缺少漏洞检查结果' } }
    const { items: _items, counts: _counts, ...metadata } = summary('deep', [], context, 'completed')
    const complete = Object.values(checks).every(checkComplete) && (!steps.routine || checkComplete(steps.routine))
    return { ...metadata, source: { connections: [...new Set(Object.values(_config.connections ?? {}))].map(connectionId => ({ connectionId })) }, complete, status: complete ? 'completed' : 'incomplete', checks }
    },
  } }
}
