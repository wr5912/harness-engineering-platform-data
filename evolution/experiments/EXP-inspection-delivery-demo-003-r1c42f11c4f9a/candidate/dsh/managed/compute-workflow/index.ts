import { readFileSync } from 'node:fs'
import { defineWorkflow, runWorkflow, registerCodeOnlyWorkflowAgent } from '@harness-platform/workflow-runtime'
import { classifyRequest, executeIntent, type Intent } from './logic.ts'

export const name = 'inspection-delivery-code-only'
export const inject = ['tools', 'llm', 'sessionTitle']
const fixture = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
if (!/^[0-9a-f]{64}$/.test(fixture.projected_source_sha256 ?? '')) throw new Error('固定 Mock 输入缺少资产投影摘要')

const workflow = defineWorkflow({
  id: 'inspection-delivery-code-only', toolName: 'inspection_code_only',
  description: '用本地规则和真实分页工具执行基础台账业务；不调用模型，未覆盖输入中止。',
  inputSchema: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false },
  async run(context) {
    const values = await runWorkflow(context, [
      { id: 'route-request', run: async () => ({ intent: classifyRequest(String(context.input.request ?? '')) }) },
      { id: 'execute-business', run: async values => executeIntent(values['route-request'].intent as Intent, context, fixture.projected_source_sha256) },
    ])
    return values['execute-business']
  },
})

export function apply(ctx: any) {
  registerCodeOnlyWorkflowAgent(ctx, { presetId: 'inspection-delivery-demo', workflow })
}
