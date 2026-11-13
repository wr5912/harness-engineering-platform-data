import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import * as threatDelivery from '../../threat-analysis.mjs'

const compiled = await build({ entryPoints: ['src/speech-summary.ts'], bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' })
const { SpeechSummaryQueue, summarySource, SUMMARY_DEFAULTS } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const header = (provider, model) => ({ type: 'request/header', data: { header: { config: { provider, model } } } })
const text = '基础健康巡检已完成，详细结果待人工查看。'
const finish = { type: 'finish', reason: { kind: 'stop' } }
const message = (provider, model, stream = [finish], body = text) => ({
  type: 'assistant/message', surfaceOp: 'append',
  data: { turn: 1, step: 2, message: { id: 'basic-delivery', source: { kind: 'model', provider, model }, content: [{ type: 'text', text: body }] },
    stream: stream.map(chunk => ({ type: 'chunk', chunk })) },
})
const waitFor = async check => {
  const until = Date.now() + 2000
  while (!check()) { assert.ok(Date.now() < until, '摘要队列未完成'); await new Promise(resolve => setTimeout(resolve, 5)) }
}
const job = (source, settings = SUMMARY_DEFAULTS) => ({ sessionId: 'basic-session', sourceMessageId: 'basic-delivery', turn: 1, step: 2, targetTabId: 'basic-tab', ...source, settings })

async function delivered(kind, history = [header('previous-native', 'old-model'), header('selected-native', 'current-model')]) {
  const hooks = new Map(), adapters = new Map(), steered = []
  let questions = 0, deliveredText = text
  const agent = { id: 'basic-session', session: { snapshotEvents: () => history }, steer: value => steered.push(value) }
  const ctx = { on: (name, hook) => hooks.set(name, hook), tools: { register() {} },
    userQuestions: { ask: async ({ questions: [question] }) => { questions++; return { answers: [{ id: question.id, selected: [question.options[0].label] }] } } },
    llm: { registerAdapter: (names, adapter) => names.forEach(name => adapters.set(name, adapter)) } }
  threatDelivery.apply(ctx)
  history.push({ type: 'tool/result', data: { turn: 1, meta: { threat_analysis: { delivery: { markdown: text } } } } })
  const signal = new AbortController().signal
  const route = await hooks.get('agent/request')({ agent, turn: 1, signal }, async () => ({ provider: 'selected-native', model: 'current-model' }))
  history.push(header(route.provider, route.model))
  const chunks = []
  for await (const chunk of adapters.get(route.provider).stream({ sessionId: agent.id, signal })) chunks.push(chunk)
  assert.equal(chunks.at(-1).reason.kind, 'stop', '固定正文必须真实完成后才能摘要')
  assert.equal(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), deliveredText)
  const event = message(route.provider, route.model, chunks, deliveredText)
  history.push(event)
  return { adapters, history, event, route, hooks, agent, deliveredText, questions, steered }
}

for (const kind of ['threat']) {
  test(`真实 ${kind} 固定交付已消费后：旧摘要路由失败，默认摘要恢复最近原生模型`, async () => {
    const { adapters, history, event, route } = await delivered(kind)
    const requests = [], emitted = [], spoken = [], failures = []
    const queue = new SpeechSummaryQueue(async function* (options) {
      requests.push(options)
      const adapter = adapters.get(options.provider)
      if (adapter) { yield* adapter.stream(options); return }
      assert.equal(options.provider, 'selected-native')
      assert.equal(options.model, 'current-model')
      assert.equal(options.sessionId, undefined)
      assert.equal(options.tools, undefined)
      assert.equal(options.messages.length, 1)
      assert.equal(options.messages[0].content[0].text, text)
      yield { type: 'text-delta', text: '巡检已完成，结果待查看。' }
      yield finish
    }, value => emitted.push(value), (...args) => spoken.push(args), (...args) => failures.push(args))
    try {
      // 真实一次性适配器不能接辅助调用；保留该反例，防止以补 sessionId 回归主会话来规避。
      queue.enqueue(job({ text, ...route }))
      await waitFor(() => failures.length === 1)
      assert.equal(requests[0].sessionId, undefined)
      assert.equal(failures[0][2], '摘要生成失败')
      assert.equal(emitted.length, 0)
      assert.equal(spoken.length, 0)
      const source = summarySource(event, history)
      assert.deepEqual(source, { text, provider: 'selected-native', model: 'current-model' })
      queue.enqueue(job(source))
      await waitFor(() => emitted.length === 1)
      assert.equal(requests.length, 2)
      assert.equal(spoken.length, 1)
      assert.equal(emitted[0].sourceMessageId, event.data.message.id)
      assert.equal(failures.length, 1)
    } finally { queue.dispose() }
  })
}

test('显式摘要模型优先；固定交付没有历史原生模型时也能独立使用', async () => {
  const source = summarySource(message('security-operation-delivery', 'fixed-operation-result'), [])
  assert.deepEqual(source, { text })
  const requests = [], emitted = []
  const queue = new SpeechSummaryQueue(async function* (options) {
    requests.push(options)
    yield { type: 'text-delta', text: '结果待查看。' }; yield finish
  }, value => emitted.push(value), () => {}, () => assert.fail('显式摘要模型不应依赖固定交付路由'))
  try {
    queue.enqueue(job(source, { ...SUMMARY_DEFAULTS, summaryModel: { provider: 'explicit-native', model: 'summary-model' } }))
    await waitFor(() => emitted.length === 1)
    assert.equal(requests[0].provider, 'explicit-native')
    assert.equal(requests[0].model, 'summary-model')
    assert.equal(requests[0].sessionId, undefined)
    assert.equal(requests[0].tools, undefined)
  } finally { queue.dispose() }
})

test('没有真实原生路由时受控失败，不猜默认模型、不调用一次性交付或自动工具适配器', async () => {
  const failures = []
  const history = [header('threat-analysis-delivery', 'fixed-summary'), header('threat-analysis-automation', 'scheduled-batch'), header('security-operation-delivery', 'fixed-operation-result')]
  const source = summarySource(message('threat-analysis-delivery', 'fixed-summary'), history)
  assert.deepEqual(source, { text })
  assert.deepEqual(summarySource(message('threat-analysis-delivery', 'fixed-summary'), history,
    { provider: 'security-operation-delivery', model: 'fixed-operation-result' }), { text })
  const queue = new SpeechSummaryQueue(async function* () { assert.fail('缺少原生路由不应请求模型') }, () => assert.fail(), () => assert.fail(), (...args) => failures.push(args), async () => assert.fail('缺少原生路由不应解析适配器'))
  try {
    queue.enqueue(job(source))
    await waitFor(() => failures.length === 1)
    assert.equal(failures[0][2], '摘要生成失败')
    assert.deepEqual(summarySource(message('another-native', 'another-model')), { text, provider: 'another-native', model: 'another-model' })
  } finally { queue.dispose() }
})

test('切换原生模型后采用最近实际设置，未正常完成正文仍不允许摘要', () => {
  const history = [header('native-one', 'model-one'), header('threat-analysis-automation', 'scheduled-batch'), header('native-two', 'model-two'), header('threat-analysis-delivery', 'fixed-summary')]
  assert.deepEqual(summarySource(message('threat-analysis-delivery', 'fixed-summary'), history), { text, provider: 'native-two', model: 'model-two' })
  assert.deepEqual(summarySource(message('security-operation-delivery', 'fixed-operation-result'), history,
    { provider: 'native-three', model: 'model-three' }), { text, provider: 'native-three', model: 'model-three' })
  assert.equal(summarySource(message('threat-analysis-delivery', 'fixed-summary', [{ type: 'finish', reason: { kind: 'max-tokens' } }]), history), null)
  assert.equal(summarySource(message('security-operation-delivery', 'fixed-operation-result', []), history), null)
})
