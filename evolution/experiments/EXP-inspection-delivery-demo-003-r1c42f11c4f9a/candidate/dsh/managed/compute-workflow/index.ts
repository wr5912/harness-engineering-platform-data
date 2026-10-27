import { readFileSync } from 'node:fs'
import { Annotation, StateGraph, START, END, defineWorkflow, registerCodeOnlyWorkflowAgent, type WorkflowContext } from '@harness-platform/workflow-runtime'
import { classifyRequest, executeIntent, type Intent } from './logic.ts'

export const name = 'inspection-delivery-code-only'
export const inject = ['tools', 'llm', 'sessionTitle']
const fixture = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
if (!/^[0-9a-f]{64}$/.test(fixture.projected_source_sha256 ?? '')) throw new Error('固定 Mock 输入缺少资产投影摘要')

async function traceNode<T>(context: WorkflowContext, node: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    context.signal.throwIfAborted()
    const result = await run()
    context.signal.throwIfAborted()
    context.trace.push({ node, status: 'completed', elapsed_ms: Date.now() - started })
    return result
  } catch (error) {
    context.trace.push({ node, status: context.signal.aborted ? 'cancelled' : 'failed', elapsed_ms: Date.now() - started })
    throw error
  }
}

export const workflow = defineWorkflow({
  id: 'inspection-delivery-code-only', toolName: 'inspection_code_only',
  description: '通过显式条件图选择身份、职责、完整巡检、第一页或中止；复用真实分页工具，不调用模型。',
  inputSchema: { type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false },
  async run(context: WorkflowContext) {
    const inFlight = new Set<Promise<unknown>>()
    const node = <T>(id: string, run: () => Promise<T>) => {
      const pending = traceNode(context, id, run)
      inFlight.add(pending)
      pending.then(() => inFlight.delete(pending), () => inFlight.delete(pending))
      return pending
    }
    const State = Annotation.Root({
      intent: Annotation<Intent>(),
      result: Annotation<Awaited<ReturnType<typeof executeIntent>> | null>(),
    })
    const graph = new StateGraph(State)
      .addNode('route-request', () => node('route-request', async () => ({
        intent: classifyRequest(String(context.input.request ?? '')),
      })))
      .addNode('identity', () => node('identity', async () => ({
        result: await executeIntent('identity', context, fixture.projected_source_sha256),
      })))
      .addNode('role', () => node('role', async () => ({
        result: await executeIntent('role', context, fixture.projected_source_sha256),
      })))
      .addNode('full-inspection', () => node('full-inspection', async () => ({
        result: await executeIntent('full', context, fixture.projected_source_sha256),
      })))
      .addNode('first-page', () => node('first-page', async () => ({
        result: await executeIntent('first-page', context, fixture.projected_source_sha256),
      })))
      .addNode('unsupported', () => node('unsupported', async () => ({
        result: await executeIntent('unsupported', context, fixture.projected_source_sha256),
      })))
      .addEdge(START, 'route-request')
      .addConditionalEdges('route-request', state => {
        if (state.intent === 'identity') {
          return 'identity'
        } else if (state.intent === 'role') {
          return 'role'
        } else if (state.intent === 'full') {
          return 'full-inspection'
        } else if (state.intent === 'first-page') {
          return 'first-page'
        } else {
          return 'unsupported'
        }
      }, ['identity', 'role', 'full-inspection', 'first-page', 'unsupported'])
      .addEdge('identity', END)
      .addEdge('role', END)
      .addEdge('full-inspection', END)
      .addEdge('first-page', END)
      .addEdge('unsupported', END)
      .compile()
    try {
      const state = await graph.invoke({ intent: 'unsupported', result: null }, { signal: context.signal })
      if (state.result === null) throw new Error('条件图未返回业务结果')
      return state.result
    } finally {
      // LangGraph 可先传播取消，等待已启动节点收尾，确保 SDK 快照包含终态轨迹。
      await Promise.allSettled(inFlight)
    }
  },
})

export function apply(ctx: any) {
  registerCodeOnlyWorkflowAgent(ctx, { presetId: 'inspection-delivery-demo', workflow })
}
