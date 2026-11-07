import { base, type Soc } from '../../../src/inspection/index.ts'

export function create(soc: Soc) {
  return { ...base(soc, true), components: {
    summary: (steps: Record<string, any>, _config: any, context: any) => {
    const checks = { ...(steps.routine?.checks ?? { routine: steps.routine ?? { status: 'failed', error: '缺少常规巡检结果' } }), vulnerabilities: steps.vulnerabilities ?? { status: 'failed', error: '缺少漏洞检查结果' } }
    return { kind: 'deep', scope: context.shared.scope, status: Object.values(checks).every((value: any) => value.status === 'completed') ? 'completed' : 'incomplete', checks }
    },
  } }
}
