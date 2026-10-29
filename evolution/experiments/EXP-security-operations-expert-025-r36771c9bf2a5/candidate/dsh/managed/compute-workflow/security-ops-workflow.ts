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

function result(reply: string, outcome: string, extra: Record<string, any> = {}) {
  return { reply, outcome, implemented_sites: ['main_route'], uncovered_sites: uncoveredSites, ...extra }
}
async function readNative(context: WorkflowContext, values: Values, route: NativeQueryRoute, title: string) {
  const native = values.native!, tool = native.capabilities.tools.find(tool => tool.route === route), scope = NATIVE_QUERY_SCOPE[route].scope
  if (!tool) return result(`当前实例未发现${title}的可调用工具，本次未启动巡检、未创建或修改调度，也没有取得实际结果；请继续使用固定父版办理完整业务。`, 'capability_unavailable', { route: values.route, scope })
  let args: Record<string, never>
  try { args = noArgumentQuery(tool) } catch (error) {
    return result(`${title}工具合同要求未绑定参数，本变体不猜测参数、未执行查询；本次未启动巡检、未创建或修改调度。请继续使用固定父版办理完整业务。`, 'read_contract_mismatch', { route: values.route, scope, error: error instanceof Error ? error.message : 'READ_QUERY_CONTRACT_MISMATCH' })
  }
  try {
    const receipt = await context.callTool(tool.name, args), judgement = judgeNativeQuery(route, receipt)
    return result(nativeQueryReply(route, judgement), judgement.status === 'completed' ? 'read_completed' : judgement.status === 'failed' ? 'read_failed' : 'read_unknown', {
      route: values.route, scope, tool: tool.name, arguments: args, query_status: judgement.status, query_reason: judgement.reason,
      receipt: jsonCopy(judgement.receipt), items: judgement.items ?? null,
      session_state: { binding: native.projection.binding,
        progress: { ...native.projection.progress, query: { route, scope, status: judgement.status },
          tool_attempts: [...native.projection.progress.tool_attempts, { name: tool.name, arguments_sha256: sha256(JSON.stringify(args)), status: judgement.status }] },
        observations: [...native.projection.observations, { kind: 'tool_observation', tool: tool.name, status: judgement.status, value: jsonCopy(judgement.receipt) }] },
    })
  } catch (error) {
    context.signal.throwIfAborted()
    return result(`${title}调用未完成，未取得可核对的业务回执（既不当作失败，也不当作空结果）；本次未启动巡检、未创建或修改调度。请查看本轮工具节点的实际错误并继续使用固定父版办理完整业务。`, 'read_failed', { route: values.route, scope, tool: tool.name, error: error instanceof Error ? error.message : 'READ_QUERY_FAILED' })
  }
}

/** 实际LangGraph条件边控制业务分支；没有决策模型结果时不会调用业务工具。 */
export function createSecurityOpsWorkflow(config: MediumWorkflowConfig) {
  invariant(config.qwen.provider === config.model_roles.language.provider && config.qwen.model === config.model_roles.language.model
    && config.model_roles.language.reasoning_effort === 'off' && config.model_roles.decision.state_constructor_sha256 === config.constructor.state_constructor_sha256, 'WORKFLOW_MODEL_OR_CONSTRUCTOR_BINDING_MISMATCH')
  return defineWorkflow({ id: WORKFLOW_ID, toolName: WORKFLOW_TOOL, description: 'Qwen忠实理解、KEV固定语义决策及LangGraph原生只读分支。',
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
        .addNode('inspection', node('inspection', async values => ({ result: await readNative(context, values, 'inspection_catalog', '巡检目录查询') })))
        .addNode('schedule', node('schedule', async values => ({ result: await readNative(context, values, 'schedule_list', '当前调度列表查询') })))
        .addNode('clarify', node('clarify', async values => ({ result: result('请明确本轮优先办理的一个请求，以及相互冲突的目标应以哪一个为准。', 'clarification_required', { route: values.route }) })))
        .addNode('answer', node('answer', async values => {
          const raw = await context.infer({ provider: config.qwen.provider, model: config.qwen.model, reasoningEffort: 'off' }, {
            system: '你只回答用户的概念或材料问题，不选择业务工具、不决定业务结论、不声称执行、查询或访问过未提供的材料。忠实保留用户材料中的名称、数值、单位、否定、语言和格式要求；需要实际工具、知识库或会话事实而当前没有证据时，准确说明缺口，不补造事实。',
            messages: [{ role: 'user', content: [{ type: 'text', text: values.native!.request }] }],
          })
          invariant(raw.content.trim(), 'QWEN_ANSWER_EMPTY')
          return { result: result(raw.content, 'language_answer', { route: values.route }) }
        }))
        .addNode('uncovered', node('uncovered', async values => ({ result: result('已完成语言理解与主业务路由。该业务分支的完整编排尚未在本变体中接通，当前没有可交付的业务执行结果。请继续使用固定父版办理。', 'branch_not_implemented', { route: values.route }) })))
        .addEdge(START, 'native_context').addEdge('native_context', 'qwen_understanding').addEdge('qwen_understanding', 'kev_main_route')
        .addConditionalEdges('kev_main_route', state => state.values.route === 'inspection' ? 'inspection' : state.values.route === 'schedule' ? 'schedule'
          : state.values.route === 'clarify_multiple_requests' ? 'clarify' : state.values.route === 'direct_answer' ? 'answer' : 'uncovered', ['inspection', 'schedule', 'clarify', 'answer', 'uncovered'])
        .addEdge('inspection', END).addEdge('schedule', END).addEdge('clarify', END).addEdge('answer', END).addEdge('uncovered', END)
        .compile({ checkpointer: false })
      const output = await graph.invoke({ values: {} }, { signal: context.signal })
      invariant(output.values.result, 'WORKFLOW_RESULT_MISSING')
      return { ...output.values.result, decision_record: jsonCopy(output.values.record) }
    },
  })
}
