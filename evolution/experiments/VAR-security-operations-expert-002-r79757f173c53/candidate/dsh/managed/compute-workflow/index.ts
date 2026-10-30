import { registerHybridWorkflowAgent, type WorkflowModelRoles } from '@harness-platform/workflow-runtime'
import { DECISION_SITES, questionsFor } from './decision-questions.ts'
import { registerKevDecisionTool, type KevDecisionConfig } from './kev-decision-tool.ts'
import { createSecurityOpsWorkflow, decisionToolName, type MediumWorkflowConfig } from './security-ops-workflow.ts'
import { registerSecurityOpsContext, ROOT_PRESET } from './security-ops-context.ts'
import { registerQwenHttpAdapter } from './qwen-http-adapter.ts'
import { registerNativeFallback, type NativeFallbackModel } from './native-fallback.ts'
import { invariant } from './language-understanding.ts'
export { prepareInitialDecisionReplay, replayInitialDecision } from './decision-replay.ts'

export const name = 'security-ops-medium-workflow'
export const inject = ['tools', 'llm', 'sessionTitle', 'sessionQuery', 'mcpSessionManager']
export interface MediumPluginConfig extends MediumWorkflowConfig {
  native_fallback_model: NativeFallbackModel
  model_roles: WorkflowModelRoles
  qwen_endpoint: string
  qwen_expected_response_model: string
  kev_endpoint: string
  kev_serving: KevDecisionConfig['serving']
  kev_encoding: KevDecisionConfig['encoding']
}
/** 配置必须来自实际模型部署和平台已冻结计划；本入口不提供虚构默认绑定。 */
export function apply(ctx: any, config: MediumPluginConfig) {
  invariant(config && config.qwen_endpoint && config.kev_endpoint && config.kev_serving && config.kev_encoding, 'ACTUAL_MODEL_DEPLOYMENT_REQUIRED')
  const workflow = createSecurityOpsWorkflow(config)
  const run = workflow.run
  workflow.run = async context => {
    try { return await run(context) } catch (error) {
      context.signal.throwIfAborted()
      return { decision_record: null, native_fallback: true, outcome: "small_model_unavailable", reply: "小模型协同未完成；继续由原生业务模型办理。", reason: error instanceof Error ? error.message : "MODEL_RESULT_UNKNOWN" }
    }
  }
  registerSecurityOpsContext(ctx, config.experiment_id)
  registerQwenHttpAdapter(ctx, { endpoint: config.qwen_endpoint, model: config.qwen, expected_response_model: config.qwen_expected_response_model })
  for (const site of ['main_route'] as const) registerKevDecisionTool(ctx, { name: decisionToolName(site), endpoint: config.kev_endpoint,
    binding: config.model_roles.decision, serving: config.kev_serving, encoding: config.kev_encoding, questions: questionsFor(site) })
  registerNativeFallback(ctx, config.native_fallback_model)
  registerHybridWorkflowAgent(ctx, { presetId: ROOT_PRESET, workflow, modelRoles: config.model_roles })
}
