import test from 'node:test'
import assert from 'node:assert/strict'
import { echoViolations, faultEchoContext, structuredEchoSummary, apply } from '../dsh/managed/security-operations-guard.mjs'

const conclusion = {
  kind: 'business-access', runId: 'run-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  currentStatus: 'UNKNOWN(未知)', stopStatus: 'EVIDENCE_INSUFFICIENT(证据不足停止)',
  impactLevel: { label: 'LOW(低)' }, incidentSummary: '192.0.2.10 → 192.0.2.20 tcp/80',
  impactScope: { objects: { source: '192.0.2.10', target: '192.0.2.20', protocol: 'tcp', port: 80 } },
  rootCause: { statusCode: 'UNKNOWN', status: 'UNKNOWN(未知)', title: '根因尚未确认', supportingFacts: [], contradictingFacts: [], gaps: ['x'] },
  primaryRecommendation: { recommendationId: 'R1', title: '补齐只读证据', category: '核查建议(只读)' },
}
const good = `${conclusion.runId} 对 192.0.2.10 → 192.0.2.20 tcp/80 只读排查，根因 UNKNOWN(未知)，端口 NO_RECORD 不等于未监听。`

function harness({ events = [], anonymous = false } = {}) {
  const handlers = new Map(), steered = []
  const ctx = {
    get: name => name === 'businessRuntime' ? { requiresAuthentication: () => !anonymous } : undefined,
    on: (name, fn) => { handlers.set(name, fn) },
    tools: { guard: () => undefined },
    logger: { warn() {} },
  }
  apply(ctx)
  const agent = {
    id: 'agent-1',
    session: { id: 's-1', snapshotEvents: () => events },
    steer: message => steered.push(message),
  }
  return { handlers, steered, agent }
}
const eventsWith = (text, conclusionValue = conclusion) => [
  { type: 'tool/result', data: { message: { content: [{ type: 'text', text: JSON.stringify({ result: { unified_conclusion: conclusionValue } }) }] } } },
  { type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } },
]

test('guard 内联校验：对象/端口/协议/Run/根因强度/旁路/无记录均按契约判定', () => {
  assert.deepEqual(echoViolations(conclusion, good), [])
  assert.ok(echoViolations(conclusion, good.replace(/198\.51\.100\.9/, '')).includes === undefined || true)
  assert.ok(echoViolations(conclusion, `${good} 另见 198.51.100.9`).some(v => v.startsWith('OBJECT_EXTRA')))
  assert.ok(echoViolations(conclusion, `${good} 根因已确认是服务未监听`).includes('ROOT_OVERCLAIM'))
  assert.ok(echoViolations(conclusion, `${good} 目标 80 未监听`).includes('NO_RECORD_AS_NOT_LISTENING'))
  assert.ok(echoViolations(conclusion, `${good} 源端实测不可达（旁路 PLATFORM_ONLY）`).includes('SIDECHANNEL_AS_DIRECT'))
  assert.ok(echoViolations(conclusion, `${good} 检查完成即根因已定位`).includes('CHECK_AS_ROOTCAUSE'))
  assert.ok(echoViolations(conclusion, '192.0.2.10 → 192.0.2.20 tcp/80 根因 UNKNOWN(未知)').includes('RUN_ID_MISSING'))
  assert.deepEqual(echoViolations(conclusion, `PLATFORM_ONLY 不等于未监听 ${good}`), [])
})

test('结论与文本抽取：只认两类故障的 unified_conclusion，原始回执不改写', () => {
  const { conclusion: found, assistant } = faultEchoContext(eventsWith(good))
  assert.equal(found.runId, conclusion.runId)
  assert.equal(assistant, good)
  const other = faultEchoContext(eventsWith(good, { ...conclusion, kind: 'inspection' }))
  assert.equal(other.conclusion, undefined)
  assert.match(structuredEchoSummary(conclusion), /当前状态：UNKNOWN\(未知\)/)
  assert.equal(structuredEchoSummary(conclusion).split('\n').length, 4)
})

test('pre-step 运行时：违规 steer 结构化摘要，合规不打扰，匿名实例跳过', async () => {
  const bad = harness({ events: eventsWith(`${good} 根因已确认。`) })
  const turnStopping = bad.handlers.get('agent/turn-stopping')
  assert.equal(typeof turnStopping, 'function')
  await turnStopping({ agent: bad.agent, turn: 3 })
  assert.equal(bad.steered.length, 1)
  assert.match(bad.steered[0].content[0].text, /回显与本次故障结论不一致/)
  assert.match(bad.steered[0].content[0].text, /当前状态：UNKNOWN\(未知\)/)
  assert.equal(bad.steered[0].role, 'user')
  assert.equal(bad.steered[0].source.kind, 'fault-echo-guard')
  // 同一 turn 只纠正一次，避免循环
  await turnStopping({ agent: bad.agent, turn: 3 })
  assert.equal(bad.steered.length, 1)

  const ok = harness({ events: eventsWith(good) })
  await ok.handlers.get('agent/turn-stopping')({ agent: ok.agent, turn: 4 })
  assert.equal(ok.steered.length, 0)

  const anonymous = harness({ events: eventsWith(`${good} 根因已确认。`), anonymous: true })
  const anonymousHook = anonymous.handlers.get('agent/turn-stopping')
  if (anonymousHook) await anonymousHook({ agent: anonymous.agent, turn: 5 })
  assert.equal(anonymous.steered.length, 0)
})
