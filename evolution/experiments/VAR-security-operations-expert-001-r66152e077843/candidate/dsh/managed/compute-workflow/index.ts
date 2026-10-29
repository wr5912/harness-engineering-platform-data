import { registerHybridWorkflowAgent, type WorkflowModelRoles } from '@harness-platform/workflow-runtime'
import { DECISION_SITES, questionsFor } from './decision-questions.ts'
import { registerKevDecisionTool, type KevDecisionConfig } from './kev-decision-tool.ts'
import { createSecurityOpsWorkflow, decisionToolName, type MediumWorkflowConfig } from './security-ops-workflow.ts'
import { registerSecurityOpsContext, ROOT_PRESET } from './security-ops-context.ts'
import { registerQwenHttpAdapter } from './qwen-http-adapter.ts'
import { invariant } from './language-understanding.ts'
export { prepareInitialDecisionReplay, replayInitialDecision } from './decision-replay.ts'

export const name = 'security-ops-medium-workflow'
export const inject = ['tools', 'llm', 'sessionTitle', 'sessionQuery', 'mcpSessionManager']
export interface MediumPluginConfig extends MediumWorkflowConfig {
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
  registerSecurityOpsContext(ctx, config.experiment_id)
  registerQwenHttpAdapter(ctx, { endpoint: config.qwen_endpoint, model: config.qwen, expected_response_model: config.qwen_expected_response_model })
  for (const site of DECISION_SITES) registerKevDecisionTool(ctx, { name: decisionToolName(site), endpoint: config.kev_endpoint,
    binding: config.model_roles.decision, serving: config.kev_serving, encoding: config.kev_encoding, questions: questionsFor(site) })
  registerHybridWorkflowAgent(ctx, { presetId: ROOT_PRESET, workflow, modelRoles: config.model_roles })
}
