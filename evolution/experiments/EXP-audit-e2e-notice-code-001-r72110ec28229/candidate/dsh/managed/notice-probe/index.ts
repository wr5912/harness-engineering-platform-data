import { setTimeout } from 'node:timers/promises'
import { defineWorkflow, registerCodeOnlyWorkflowAgent, registerHybridWorkflowAgent, type WorkflowModelRoles } from '@harness-platform/workflow-runtime'
export const name = 'audit-native-notice-probe'
export const inject = ['tools', 'llm', 'sessionTitle']
export function apply(ctx: any, config: { presetId: string; mode: 'code-only' | 'hybrid'; modelRoles?: WorkflowModelRoles }) {
  const workflow = defineWorkflow({ id: 'audit-native-notice', toolName: 'audit_notice_workflow', description: '真实原生后台完成通知技术验收',
    inputSchema: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false },
    async run(context) {
      if (context.input.request === 'CHILD-NOTICE-5907') {
        await setTimeout(1200, undefined, { signal: context.signal })
        return { reply: 'CHILD-NOTICE-5907：确定性计算1+2+3=6；子任务已完成。' }
      }
      if (context.input.request === 'RUN-NOTICE-5907') {
        const activation = await context.callTool('delegate_audit_notice', { description: '本地子任务回执验收', prompt: 'CHILD-NOTICE-5907' })
        return { reply: '已委派', activation }
      }
      return { reply: `普通请求回执：${context.input.request}` }
    } })
  if (config.mode === 'hybrid') {
    if (!config.modelRoles) throw new Error('明确的模型角色绑定缺失')
    registerHybridWorkflowAgent(ctx, { presetId: config.presetId, workflow, modelRoles: config.modelRoles })
  } else registerCodeOnlyWorkflowAgent(ctx, { presetId: config.presetId, workflow })
}
