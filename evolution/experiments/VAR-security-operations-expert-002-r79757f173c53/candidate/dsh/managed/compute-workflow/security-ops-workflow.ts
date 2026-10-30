import { Annotation, END, START, StateGraph, defineWorkflow, type WorkflowContext, type WorkflowModelRoles } from '@harness-platform/workflow-runtime'
import { DECISION_QUESTIONS, DECISION_SITES, type Json } from './decision-questions.ts'
import { constructDecisionRecord, type DecisionFacts, type ConstructorIdentity } from './decision-state.ts'
import { buildUnderstandingRequest, invariant, jsonCopy, recordQwenResponse, sha256, type QwenModelIdentity } from './language-understanding.ts'
import { CONTEXT_TOOL, NATIVE_QUERY_SCOPE, WORKFLOW_ID, WORKFLOW_TOOL, decisionToolName, judgeNativeQuery, nativeQueryReply, noArgumentQuery, type NativeContext, type NativeQueryRoute } from './security-ops-context.ts'

export interface MediumWorkflowConfig {
  experiment_id: string
  model_roles: WorkflowModelRoles
  qwen: QwenModelIdentity
  constructor: ConstructorIdentity
}
type Values = { native?: NativeContext; record?: ReturnType<typeof constructDecisionRecord>; route?: string; result?: Record<string, any> }
const pointer = (source_id: string, pointer: string, value: Json) => ({ source_id, pointer, value })
/** 纯命名函数与判别放在无SDK依赖的context模块；此处原样re-export保持调用兼容。 */
export { decisionToolName }
export const uncoveredSites = DECISION_SITES.filter(site => site !== 'main_route')

/** 实际LangGraph条件边控制业务分支；没有决策模型结果时不会调用业务工具。 */
export function createSecurityOpsWorkflow(config: MediumWorkflowConfig) {
  invariant(config.qwen.provider === config.model_roles.language.provider && config.qwen.model === config.model_roles.language.model
    && config.model_roles.language.reasoning_effort === 'off' && config.model_roles.decision.state_constructor_sha256 === config.constructor.state_constructor_sha256, 'WORKFLOW_MODEL_OR_CONSTRUCTOR_BINDING_MISMATCH')
  return defineWorkflow({ id: WORKFLOW_ID, toolName: WORKFLOW_TOOL, description: 'Qwen忠实理解、KEV主路由建议与原生MiMo业务接续。',
    inputSchema: { type: 'object', properties: { request: { type: 'string', minLength: 1 } }, required: ['request'], additionalProperties: false },
    async run(context: WorkflowContext) {
      const State = Annotation.Root({ values: Annotation<Values>() })
      const node = (id: string, run: (values: Values) => Promise<Values>) => async (state: typeof State.State) => {
        context.signal.throwIfAborted()
        const started = Date.now()
        try { const value = await run(state.values); context.trace.push({ node: id, status: 'completed', elapsed_ms: Date.now() - started }); return { values: { ...state.values, ...value } } }
        catch (error) { context.trace.push({ node: id, status: context.signal.aborted ? 'cancelled' : 'failed', elapsed_ms: Date.now() - started }); throw error }
      }
      const graph = new StateGraph(State)
        .addNode('native_context', node('native_context', async () => {
          const native = await context.callTool(CONTEXT_TOOL, {}) as NativeContext
          invariant(native.origin?.experiment_id === config.experiment_id && native.request === context.input.request, 'WORKFLOW_CURRENT_REQUEST_OR_SOURCE_MISMATCH')
          return { native }
        }))
        .addNode('qwen_understanding', node('qwen_understanding', async values => {
          const native = values.native!
          const request = buildUnderstandingRequest({ origin: native.origin, sequence_basis: 'normalized_prefix_position', cutoff_sequence: 3, request_source_id: 'current-request', model: config.qwen,
            sources: [
              { id: 'current-request', role: 'target', kind: 'current_user', sequence: 0, content: native.request },
              { id: 'session-facts', role: 'target', kind: 'session_projection', sequence: 1, content: jsonCopy({ binding: native.projection.binding, progress: native.projection.progress }) },
              { id: 'current-tools', role: 'target', kind: 'capability_catalog', sequence: 2, content: jsonCopy(native.capabilities) },
            ] })
          const raw = await context.infer({ provider: config.qwen.provider, model: config.qwen.model, reasoningEffort: 'off' }, request.payload)
          const response = recordQwenResponse(request, { record_mode: 'sdk_graph', execution_id: `${context.executionId}:qwen-understanding:1`, model: config.qwen, content: raw.content })
          // 无效模型响应仍留在真实图回执中，不能用教师或字符串修复替换。
          context.trace.push({ node: 'qwen_understanding_receipt', status: response.status, supervision: jsonCopy(response.supervision) })
          invariant(response.status === 'parsed', 'QWEN_UNDERSTANDING_INVALID')
          const facts: DecisionFacts = { request, response,
            session_binding: Object.fromEntries(Object.entries(native.projection.binding).map(([key, value]) => [key, pointer('session-facts', `/binding/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, value)])),
            capabilities: { status: pointer('current-tools', '/status', 'discovered'), tools: native.capabilities.tools.map((_tool, index) => ({ source_id: 'current-tools', pointer: `/tools/${index}`, arguments: {} })) },
            observations: [], candidates: [], progress: Object.fromEntries(Object.entries(native.projection.progress).map(([key, value]) => [key, pointer('session-facts', `/progress/${key}`, jsonCopy(value))])) }
          return { record: constructDecisionRecord('main_route', facts, config.constructor, 'online') }
        }))
        .addNode('kev_main_route', node('kev_main_route', async values => {
          const state = values.record!.state
          const answer = await context.decide(decisionToolName('main_route'), { state })
          const route = answer.route?.choice
          invariant(answer.route?.type === 'choice' && typeof route === 'string' && Object.hasOwn(DECISION_QUESTIONS.main_route.route.criteria, route), 'KEV_MAIN_ROUTE_INVALID')
          return { route }
        }))
        .addNode('native_fallback', node('native_fallback', async values => ({ result: { reply: '已保留小模型理解与路由回执，继续由原生业务模型办理本轮任务。', outcome: 'native_business_handoff', native_fallback: true, advisory_route: values.route, trained_sites: ['main_route'], untrained_sites: uncoveredSites } })))
        .addEdge(START, 'native_context').addEdge('native_context', 'qwen_understanding').addEdge('qwen_understanding', 'kev_main_route')
        .addEdge('kev_main_route', 'native_fallback').addEdge('native_fallback', END)
        .compile({ checkpointer: false })
      const output = await graph.invoke({ values: {} }, { signal: context.signal })
      invariant(output.values.result, 'WORKFLOW_RESULT_MISSING')
      return { ...output.values.result, decision_record: jsonCopy(output.values.record) }
    },
  })
}
