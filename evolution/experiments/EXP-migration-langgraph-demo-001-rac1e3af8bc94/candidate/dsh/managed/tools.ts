// 订单报价业务图（迁移自固定 LangGraph 来源 graph.ts，@langchain/langgraph 1.5.0，
// source-0d679f43-b034-4b42-bfac-0b690cefbf15 / fffd1dc6aadf614e58ad4a7e60567a4783cc5cc53edc0130fd4071ea17e96edf）。
// 显式有向图：START --(quantity>=10 ? bulk : regular)--> ...；
// bulk/regular 之后 calc_tax 与 calc_shipping 两节点并行；join 等待两节点汇合后求 total；join -> END。
// 汇合保持来源的 addEdge(['calc_tax','calc_shipping'],'join') 数组起点屏障写法（LangGraph 1.5.0 addEdge 支持）。
// 修正来源图装配错误：来源 graph.ts 的节点名 tax/shipping 与状态通道同名，LangGraph 构图即失败；
// 本迁移将节点 ID 调整为 calc_tax/calc_shipping，状态字段 tax/shipping 与来源一致不变。
// 来源快照保留原样；原 LangGraph 框架未运行，不声称原图已有效执行。
// 图节点全部为确定性纯函数，不含 LLM 调用；自然语言输入解析与结果解释由主角色 LLM 负责。
// DSH 插件入口：导出 name/inject/apply(ctx)，普通模式在 apply 内 registerWorkflowTool(ctx, workflow)。
import {
  Annotation,
  StateGraph,
  START,
  END,
  defineWorkflow,
  registerWorkflowTool,
} from '@harness-platform/workflow-runtime'

const State = Annotation.Root({
  quantity: Annotation<number>,
  unit_price: Annotation<number>,
  subtotal: Annotation<number>,
  tax: Annotation<number>,
  shipping: Annotation<number>,
  total: Annotation<number>,
  route: Annotation<string>,
})

interface QuoteState {
  quantity: number
  unit_price: number
  subtotal?: number
  tax?: number
  shipping?: number
  total?: number
  route?: string
}

interface NodeRecord {
  node: string
  output: Record<string, number | string>
}

// 与来源 graph.ts 逐行一致的确定性节点函数（仅节点 ID 因命名约束调整）
const bulkNode = (s: QuoteState): Record<string, number | string> => ({
  subtotal: s.quantity * s.unit_price * 0.9,
  route: 'bulk',
})
const regularNode = (s: QuoteState): Record<string, number | string> => ({
  subtotal: s.quantity * s.unit_price,
  route: 'regular',
})
const taxNode = (s: QuoteState): Record<string, number | string> => ({
  tax: Math.round((s.subtotal as number) * 0.1 * 100) / 100,
})
const shippingNode = (s: QuoteState): Record<string, number | string> => ({
  shipping: (s.subtotal as number) >= 100 ? 0 : 5,
})
const joinNode = (s: QuoteState): Record<string, number | string> => ({
  total: Math.round(((s.subtotal as number) + (s.tax as number) + (s.shipping as number)) * 100) / 100,
})

// 节点实际执行时同步写入 context.trace（direct StateGraph 不自动填 trace）；
// 只记录真实执行，不凭空生成 trace，不改业务函数；失败/取消按 signal 真实状态记录并保留原因。
function recordNode(
  nodeName: string,
  fn: (s: QuoteState) => Record<string, number | string>,
  log: NodeRecord[],
  trace: Record<string, any>[],
  signal: { aborted: boolean } | undefined,
): (s: QuoteState) => Record<string, number | string> {
  return (s: QuoteState) => {
    const started = Date.now()
    try {
      const output = fn(s)
      log.push({ node: nodeName, output: { ...output } })
      trace.push({ node: nodeName, status: 'completed', elapsed_ms: Date.now() - started })
      return output
    } catch (error) {
      trace.push({
        node: nodeName,
        status: signal && signal.aborted ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : String(error),
        elapsed_ms: Date.now() - started,
      })
      throw error
    }
  }
}

function buildQuoteGraph(log: NodeRecord[], trace: Record<string, any>[], signal: { aborted: boolean } | undefined): any {
  return new StateGraph(State)
    .addNode('bulk', recordNode('bulk', bulkNode, log, trace, signal))
    .addNode('regular', recordNode('regular', regularNode, log, trace, signal))
    .addNode('calc_tax', recordNode('calc_tax', taxNode, log, trace, signal))
    .addNode('calc_shipping', recordNode('calc_shipping', shippingNode, log, trace, signal))
    .addNode('join', recordNode('join', joinNode, log, trace, signal))
    .addConditionalEdges(START, (s: QuoteState) => (s.quantity >= 10 ? 'bulk' : 'regular'), ['bulk', 'regular'])
    .addEdge('bulk', 'calc_tax')
    .addEdge('bulk', 'calc_shipping')
    .addEdge('regular', 'calc_tax')
    .addEdge('regular', 'calc_shipping')
    .addEdge(['calc_tax', 'calc_shipping'], 'join')
    .addEdge('join', END)
    .compile()
}

const money = (v: number): number => Math.round(v * 100) / 100

const quoteWorkflow = defineWorkflow({
  id: 'quote_graph',
  toolName: 'quote_graph',
  description:
    '订单报价业务图（真实显式有向图）：quantity>=10 命中 bulk 九折分支，否则 regular 常规；tax 与 shipping 并行计算，join 汇合后求总额。',
  inputSchema: {
    type: 'object',
    properties: {
      quantity: { type: 'number', description: '订单数量（>=0）' },
      unit_price: { type: 'number', description: '单价（>=0）' },
    },
    required: ['quantity', 'unit_price'],
    additionalProperties: false,
  },
  run: async (context: any): Promise<any> => {
    const input = (context && context.input ? context.input : {}) as Partial<QuoteState>
    const quantity = input.quantity
    const unit_price = input.unit_price
    if (
      typeof quantity !== 'number' ||
      typeof unit_price !== 'number' ||
      !Number.isFinite(quantity) ||
      !Number.isFinite(unit_price)
    ) {
      return {
        status: 'rejected',
        complete: false,
        reason: 'missing-parameters',
        message: '缺少有效 quantity 或 unit_price，需先补问，不得猜测输入',
      }
    }
    if (quantity < 0 || unit_price < 0) {
      return { status: 'rejected', complete: false, reason: 'negative-input', message: '负数输入，拒绝计算' }
    }
    const log: NodeRecord[] = []
    try {
      const graph = buildQuoteGraph(log, context.trace, context.signal)
      const finalState = (await graph.invoke({ quantity, unit_price }, { signal: context.signal })) as QuoteState
      return {
        status: 'completed',
        complete: true,
        route: finalState.route as string,
        nodes: log,
        subtotal: money(finalState.subtotal as number),
        tax: money(finalState.tax as number),
        shipping: finalState.shipping as number,
        total: money(finalState.total as number),
      }
    } catch (error) {
      // 失败/取消回执携带真实 error.message 与 signal 真实状态，不把取消标成执行失败。
      context.trace.push({
        node: 'quote_graph',
        status: context.signal && context.signal.aborted ? 'cancelled' : 'failed',
        error: error instanceof Error ? error.message : String(error),
        nodes: log,
      })
      throw error
    }
  },
})

export const name = 'migration-langgraph-demo-quote-graph'
export const inject = ['tools', 'llm']

export function apply(ctx: any): void {
  registerWorkflowTool(ctx, quoteWorkflow)
}
