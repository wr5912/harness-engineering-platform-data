import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { apply } from './threat-analysis.mjs'
import { incidentIds, manualThreatDelivery, settledThreatMarkdown, startedThreatMarkdown, threatTaskGroups } from './threat-task-delivery.mjs'

const ids = ['INC-20261020-000183', 'INC-20261020-000184', 'INC-20261020-000185']
const content = text => [{ type: 'text', text }]
const user = (text, source = { kind: 'user' }) => ({ id: randomUUID(), role: 'user', source, content: content(text) })
function ledger() {
  const events = []
  return { events, add(type, data) { const event = { type, seq: events.length + 1, time: 1000 + events.length, data }; events.push(event); return event } }
}
function result(id, status = 'completed') {
  const run = `run-${randomUUID()}`
  return { incident_id: id, run_id: run, status, ...(status === 'claim_failed' ? { error_code: 409 } : {}),
    result: { verdict: '可疑', confidence_score: 0.55 },
    delivery: { markdown: status === 'completed' ? `已核验的原始摘要：${id}\n\n[下载 HTML 报告](http://192.0.2.1/assistant/api/threat-analysis/reports/${run}/download)` : `原始失败原因：${status}`,
      storage: { report: { download_url: `http://192.0.2.1/assistant/api/threat-analysis/reports/${run}/download` } } } }
}
function toolResult(log, id, value, turn = 1, error = false) {
  const callId = randomUUID()
  const call = log.add('tool/call', { turn, step: log.events.length, callId, name: 'analyze_threat_incident', arguments: JSON.stringify({ incident_id: id }) })
  return log.add('tool/result', { turn, step: call.data.step,
    message: { role: 'tool', toolCallId: callId, source: { kind: 'tool', callId }, content: content('固定工具回执'), isError: error },
    meta: value ? { threat_analysis: value } : {} })
}
function fixture(requestIds = [ids[0]], statuses = requestIds.map(() => 'completed'), existing) {
  const parent = existing ?? ledger(), child = ledger(), childId = randomUUID()
  const request = `请研判 ${requestIds.join('、')}`, prompt = `研判 ${requestIds.join(' ')}`
  parent.add('turn/start', { turn: 1 })
  parent.add('user/message', user(request))
  const callId = randomUUID()
  parent.add('tool/call', { turn: 1, step: 1, callId, name: 'delegate_threat_analysis', arguments: JSON.stringify({ prompt, description: request }) })
  parent.add('subagent/catalog', { version: 0, mode: 'continuable', childId, childCreatedAt: 900 })
  parent.add('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: callId, source: { kind: 'tool', callId }, content: content(`started subagent ${childId}`), isError: false } })
  parent.add('turn/end', { turn: 1, reason: { kind: 'completed' } })
  child.add('turn/start', { turn: 1 })
  child.add('user/message', user(prompt))
  const values = statuses.map((status, index) => result(requestIds[index], status))
  values.forEach(value => toolResult(child, value.incident_id, value))
  if (statuses.length === requestIds.length) child.add('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const snapshot = { session: { id: childId, createdAt: 900, parentSession: 'parent', origin: 'subagent', isSeeded: false,
    delegationDepth: 1, agentPreset: 'security-operations-threat-analysis' }, events: child.events, inheritedEventCount: 0 }
  const notice = user('不可信的回执正文：全部真实告警', { kind: 'subagent-settled', form: 'notice', summary: 'finished', senderSessionId: childId })
  return { parent, child, values, snapshot, notice, request, prompt, childId }
}
const settled = f => settledThreatMarkdown('parent', f.parent.events, [f.notice], async id => { assert.equal(id, f.childId); return f.snapshot })

test('单事件结果带回原始请求及同次报告，不受中途闲聊和统计影响', async () => {
  const f = fixture()
  f.parent.add('user/message', user('你好'))
  f.parent.add('user/message', user('按等级统计一下'))
  const markdown = await settled(f)
  assert.ok(markdown.startsWith('**研判任务 #1 · 已结束**'))
  assert.ok(markdown.includes(`原始请求：${f.request}`))
  assert.ok(markdown.includes(f.values[0].delivery.markdown))
  assert.doesNotMatch(markdown, /全部真实告警|累计|队列剩余|按等级统计/)
  const start = startedThreatMarkdown(f.parent.events, 1)
  assert.match(start, /研判任务 #1 · 已开始/)
  assert.ok(start.includes(f.request))
  assert.ok(!start.includes(f.childId))
})

test('同次多事件统一汇总，执行状态与结论分列，失败及冲突保留真实原因', async () => {
  const f = fixture(ids, ['completed', 'preflight_failed', 'claim_failed'])
  const markdown = await settled(f)
  assert.match(markdown, /共 3 个事件：完成 1，失败 1，跳过 1/)
  assert.match(markdown, /执行状态 \| 研判结论 \| 置信度/)
  assert.ok(markdown.includes(`| ${ids[1]} | 执行失败 | — | — |`))
  assert.ok(markdown.includes(`| ${ids[2]} | 已跳过（认领冲突） | — | — |`))
  assert.ok(markdown.includes(f.values[0].run_id))
  assert.match(markdown, /原始失败原因：preflight_failed/)
  assert.doesNotMatch(markdown, /全部成功|全部完成/)
})

test('分别请求与同一事件重跑保持各自来源及运行结果', async () => {
  const first = fixture(), second = fixture([ids[0]], ['completed'], first.parent)
  const snapshots = new Map([[first.childId, first.snapshot], [second.childId, second.snapshot]])
  const markdown = await settledThreatMarkdown('parent', first.parent.events, [second.notice], async id => snapshots.get(id))
  assert.ok(markdown.startsWith('**研判任务 #2 · 已结束**'))
  assert.ok(markdown.includes(second.values[0].run_id))
  assert.ok(!markdown.includes(first.values[0].run_id))
  first.child.add('turn/start', { turn: 2 })
  first.child.add('user/message', user(`重新研判 ${ids[0]}`))
  const rerun = result(ids[0]); toolResult(first.child, ids[0], rerun, 2)
  first.child.add('turn/end', { turn: 2, reason: { kind: 'completed' } })
  const original = await settledThreatMarkdown('parent', first.parent.events, [first.notice], async id => snapshots.get(id))
  assert.ok(original.includes(first.values[0].run_id))
  assert.ok(!original.includes(rerun.run_id))
})

test('一个批次分成多个旧式子任务时等待全部结束，再交付一次并去重通知', async () => {
  const f = fixture(), g = fixture([ids[1]])
  const extra = g.parent.events.filter(event => ['tool/call', 'subagent/catalog', 'tool/result'].includes(event.type))
  extra.forEach(event => f.parent.add(event.type, event.data))
  const snapshots = new Map([[f.childId, f.snapshot], [g.childId, g.snapshot]])
  g.child.events.pop()
  assert.equal(await settledThreatMarkdown('parent', f.parent.events, [f.notice], async id => snapshots.get(id)), '')
  g.child.add('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const markdown = await settledThreatMarkdown('parent', f.parent.events, [g.notice], async id => snapshots.get(id))
  assert.match(markdown, /共 2 个事件：完成 2/)
  f.parent.add('assistant/message', { message: { role: 'assistant', content: content(markdown) } })
  assert.equal(await settledThreatMarkdown('parent', f.parent.events, [f.notice, g.notice], async () => assert.fail('已交付任务不重复读取')), '')
})

test('未知通知不读其他会话；身份、事件或调用链不匹配时不泄露结论及报告', async () => {
  const f = fixture(ids.slice(0, 2))
  const fake = user(`started subagent ${f.childId}`)
  assert.equal(await settledThreatMarkdown('parent', f.parent.events, [fake], async () => assert.fail('普通输入不读取子会话')), undefined)
  const foreign = structuredClone(f.notice); foreign.source.senderSessionId = 'foreign'
  assert.equal(await settledThreatMarkdown('parent', f.parent.events, [foreign], async () => assert.fail('未知会话不读取')), undefined)
  f.snapshot.session.parentSession = 'foreign'
  let markdown = await settled(f)
  assert.match(markdown, /结果待核验/)
  assert.doesNotMatch(markdown, /可疑|run-/)
  f.snapshot.session.parentSession = 'parent'
  f.values[0].incident_id = ids[2]
  f.values[1].delivery.storage.report.download_url = f.values[0].delivery.storage.report.download_url
  markdown = await settled(f)
  assert.ok(markdown.includes(`| ${ids[0]} | 结果待核验 | — | — |`))
  assert.doesNotMatch(markdown, /\[下载 HTML 报告\]/)
})

test('多事件按原顺序继续且不重试已失败事件，主会话不触发子角色续跑', () => {
  const f = fixture(ids, [])
  const header = f.snapshot.session
  const first = result(ids[0]); toolResult(f.child, ids[0], first)
  assert.deepEqual(manualThreatDelivery(f.child.events, 1, header), { incident_id: ids[1] })
  toolResult(f.child, ids[1], undefined, 1, true)
  assert.deepEqual(manualThreatDelivery(f.child.events, 1, header), { incident_id: ids[2] })
  toolResult(f.child, ids[2], result(ids[2]))
  const markdown = manualThreatDelivery(f.child.events, 1, header)
  assert.match(markdown, /完成 2，失败 1/)
  assert.equal(manualThreatDelivery(f.child.events, 1, { origin: 'user' }), undefined)
  assert.deepEqual(incidentIds(`${ids[0]} ${ids[1]} ${ids[0]}`), ids.slice(0, 2))
})

test('百事件保持一个结果消息，每个完成事件均有独立报告入口', async () => {
  const many = Array.from({ length: 100 }, (_, i) => `INC-20261020-${String(i + 1).padStart(6, '0')}`)
  const f = fixture(many)
  const markdown = await settled(f)
  assert.match(markdown, /共 100 个事件：完成 100/)
  assert.equal(markdown.match(/\[下载 HTML 报告\]/g)?.length, 100)
  assert.equal(markdown.match(/· 已结束/g)?.length, 1)
})

test('通知已结束但缺少终态时明确待核验，不虚报成功或永远等待', async () => {
  const f = fixture()
  f.child.events.pop()
  const markdown = await settled(f)
  assert.match(markdown, /未完成或待核验 1/)
  assert.doesNotMatch(markdown, /可疑|run-/)
})

function runtime(f, header = {}) {
  const hooks = new Map(), adapters = new Map()
  const agent = { id: 'parent', session: { header, snapshotEvents: () => f.parent.events },
    inbox: { nextTurn: [], append(_target, message) { this.nextTurn.push(message) } } }
  apply({ on: (name, hook) => hooks.set(name, hook), tools: { register() {} },
    llm: { registerAdapter(names, adapter) { names.forEach(name => adapters.set(name, adapter)) } },
    sessionQuery: { readSession: async () => f.snapshot } })
  return { hooks, adapters, agent }
}
const signal = new AbortController().signal
const route = async () => ({ provider: 'native', model: 'selected-model' })
async function preStep(r, messages, turn = 3, step = 1) {
  return r.hooks.get('agent/pre-step')({ agent: r.agent, turn, step, messages, signal }, async () => ({ kind: 'enter', messages }))
}

test('自动研判完成时插入删除、修改或普通问题，均恢复真实模型处理', async () => {
  for (const text of ['删除改定时任务', '刚才的定时任务改成每3分钟执行', '你好']) {
    const parent = ledger(), r = runtime({ parent }), message = user(text)
    parent.add('tool/result', { turn: 3, step: 1, meta: { threat_analysis: { delivery: { markdown: '自动威胁研判批次完成' } } } })
    r.agent.options = await route()
    const decision = await preStep(r, [message], 3, 2)
    assert.deepEqual(decision.messages, [message])
    // 原生 Runtime 在 agent/request 之后才持久化本步 user/message。
    const selected = await r.hooks.get('agent/request')({ agent: r.agent, turn: 3, step: 2, signal },
      async () => ({ provider: 'threat-analysis-delivery', model: 'fixed-summary' }))
    assert.deepEqual(selected, await route(), text)
    assert.deepEqual(r.agent.inbox.nextTurn, [])
  }
})

test('自动研判没有新用户指令时仍交付固定摘要，原生上下文不算用户插话', async () => {
  const parent = ledger(), r = runtime({ parent })
  const markdown = `自动威胁研判批次完成\n\n[下载 HTML 报告](http://192.0.2.1/report)`
  parent.add('tool/result', { turn: 3, step: 1, meta: { threat_analysis: { delivery: { markdown } } } })
  await preStep(r, [user('原生上下文', { kind: 'runtime-context' })], 3, 2)
  const selected = await r.hooks.get('agent/request')({ agent: r.agent, turn: 3, step: 2, signal }, route)
  assert.equal(selected.provider, 'threat-analysis-delivery')
  const chunks = []
  for await (const chunk of r.adapters.get(selected.provider).stream({ sessionId: r.agent.id, signal })) chunks.push(chunk)
  assert.equal(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), markdown)
})

test('多事件子任务完成一条时收到新用户指令，不再抢先续跑下一条', async () => {
  const f = fixture(ids, []), r = runtime(f, f.snapshot.session)
  toolResult(f.child, ids[0], result(ids[0]))
  r.agent.session.snapshotEvents = () => f.child.events
  const message = user('先暂停，说明目前进度')
  await preStep(r, [message], 1, 2)
  assert.deepEqual(await r.hooks.get('agent/request')({ agent: r.agent, turn: 1, step: 2, signal }, route), await route())
})

test('同轮到达的用户问题先正常回答，完成回执通过原生 inbox 单独交付', async () => {
  const f = fixture(), r = runtime(f), question = user('按等级统计一下')
  const decision = await preStep(r, [question, f.notice])
  assert.deepEqual(decision.messages, [question])
  assert.deepEqual(r.agent.inbox.nextTurn, [f.notice])
  const selected = await r.hooks.get('agent/request')({ agent: r.agent, turn: 3, step: 1, signal }, route)
  assert.deepEqual(selected, await route())
  await preStep(r, [f.notice])
  const delivery = await r.hooks.get('agent/request')({ agent: r.agent, turn: 3, step: 1, signal }, route)
  assert.equal(delivery.provider, 'threat-analysis-delivery')
  const chunks = []
  for await (const chunk of r.adapters.get(delivery.provider).stream({ sessionId: r.agent.id, signal })) chunks.push(chunk)
  assert.match(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), /原始请求：请研判 INC-20261020-000183/)
  assert.equal(chunks.at(-1).reason.kind, 'stop')
})

test('其他子任务的完成通知与研判同时到达时，保留各自交付', async () => {
  const f = fixture(), r = runtime(f)
  const other = user('故障排查完成', { kind: 'subagent-settled', form: 'notice', summary: 'finished', senderSessionId: randomUUID() })
  assert.equal(await settledThreatMarkdown('parent', f.parent.events, [other, f.notice], async () => assert.fail('混合通知不接管')), undefined)
  const decision = await preStep(r, [other, f.notice])
  assert.deepEqual(decision.messages, [other])
  assert.deepEqual(r.agent.inbox.nextTurn, [f.notice])
  assert.deepEqual(await r.hooks.get('agent/request')({ agent: r.agent, turn: 3, step: 1, signal }, route), await route())
  await preStep(r, [f.notice])
  assert.equal((await r.hooks.get('agent/request')({ agent: r.agent, turn: 3, step: 1, signal }, route)).provider, 'threat-analysis-delivery')
})

test('本地续跑适配器只发原有单事件工具调用，不访问模型或自动研判入口', async () => {
  const f = fixture(ids, []), first = result(ids[0])
  toolResult(f.child, ids[0], first)
  const r = runtime(f, f.snapshot.session)
  r.agent.session.snapshotEvents = () => f.child.events
  const selected = await r.hooks.get('agent/request')({ agent: r.agent, turn: 1, step: 2, signal }, route)
  const chunks = []
  for await (const chunk of r.adapters.get(selected.provider).stream({ sessionId: r.agent.id, signal })) chunks.push(chunk)
  const call = chunks.find(chunk => chunk.type === 'block-end').block
  assert.equal(call.name, 'analyze_threat_incident')
  assert.deepEqual(JSON.parse(call.arguments), { incident_id: ids[1] })
  assert.equal(chunks.at(-1).reason.kind, 'tool-calls')
})
