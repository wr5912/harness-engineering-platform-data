import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { selectInspectionRun, selectFaultChild, faultReportSource } from '../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs'
import { reportValue, requireReportRequest, apply } from '../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs'

// 这些是明确隔离外部SOC/Session的原生事件形状fixture，不是线上业务证据。
const epoch = 1804550000000
const run = 'run-11111111-1111-4111-8111-111111111111'
const parent = 'session-parent', child = 'session-fault-child'
const html = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body>未知≠正常</body></html>'
const text = value => [{ type: 'text', text: value }]
const event = (seq, type, data) => ({ seq, time: epoch + seq, type, data })
const user = event(0, 'user/message', { id: 'user-one', role: 'user', source: { kind: 'user' }, content: text('排查设备并生成HTML报告，不主动探测，不处置。') })
function pair(seq, callId, name, args, value, plain = false) {
  return [event(seq, 'tool/call', { turn: 1, step: seq, callId, name, arguments: JSON.stringify(args) }),
    { ...event(seq + 1, 'tool/result', { turn: 1, step: seq, message: { role: 'tool', toolCallId: callId,
      source: { kind: 'tool', callId }, isError: false, content: text(plain ? value : JSON.stringify(value)) } }), sourceEventSeqs: [seq] }]
}
function inspections(status = 'completed') {
  return [user, ...pair(1, 'inspection-start', 'mcp__inspection-compositions__inspection_routine', { scope: { assetIds: [1] } },
    { run_id: run, status: 'accepted', composition_id: 'inspection-routine' }),
  ...pair(3, 'inspection-result', 'mcp__inspection-compositions__get_composition_run', { run_id: run },
    { run_id: run, composition_id: 'inspection-routine', status, result: { status: 'incomplete' },
      artifacts: [{ id: 'report', filename: 'inspection-report.html', contentType: 'text/html; charset=utf-8', bytes: Buffer.byteLength(html) }] })]
}
function faultParent() {
  const p = pair(1, 'fault-call', 'delegate_fault_analysis', { prompt: '只读排查同一设备。' }, `started subagent ${child}`, true)
  p[1].seq = 3; p[1].time = epoch + 3
  return [user, p[0], event(2, 'subagent/catalog', { version: 0, mode: 'continuable', childId: child, childCreatedAt: epoch }), p[1],
    event(8, 'user/message', { id: 'settled-one', role: 'user', source: { kind: 'subagent-settled', form: 'notice', senderSessionId: child, summary: 'completed' }, content: text('原生完成通知') })]
}
function snapshot(body = '事实：没有完整证据。\n推断：尚不能确定原因。\n证据缺口：未返回状态。\n建议：人工复核，尚未执行。') {
  return { session: { id: child, createdAt: epoch, origin: 'subagent', isSeeded: false, delegationDepth: 1, agentPreset: 'security-operations-fault-analysis' }, inheritedEventCount: 0,
    events: [event(0, 'turn/start', { turn: 1 }), event(1, 'assistant/message', { turn: 1, step: 1, message: { id: 'assistant-one', role: 'assistant', source: { kind: 'model', provider: 'fixture', model: 'fixture' }, content: [{ type: 'reasoning', text: 'PRIVATE-REASONING' }, ...text(body)] } }),
      event(2, 'step/end', { turn: 1, step: 1 }), event(3, 'turn/end', { turn: 1, reason: { kind: 'completed' } })] }
}

// 当前合同：选择器只绑定真实启动；运行时重新查询完整canonical值并验证终态/产物。
// 以下SDK/附件服务均为明确的技术Mock，不是线上MCP或浏览器证据。
function inspectionRuntime({ events = inspections(), state, artifact, stateError = false } = {}) {
  let tool
  const calls = [], saves = [], contexts = [], token = {}
  const canonicalState = state ?? JSON.parse(inspections()[4].data.message.content[0].text)
  const canonicalArtifact = artifact ?? { filename: 'inspection-report.html', contentType: 'text/html; charset=utf-8', body: html }
  const agent = { id: parent, session: { id: parent, header: { delegationDepth: 0 }, snapshotEvents: () => events } }
  const resolve = raw => `mcp__inspection-compositions__${raw}`
  apply({
    mcpSessionManager: { resolveTool: (_server, raw) => resolve(raw) },
    tools: {
      register: value => { tool = value }, get: () => true,
      execute: async request => {
        calls.push(request)
        assert.equal(request.parent, token); assert.equal(request.rootCallId, 'root-call')
        assert.equal(request.agent, agent); assert.equal(request.arguments.run_id, run)
        if (request.name === resolve('get_composition_run')) return { isError: stateError,
          value: { ok: true, result: canonicalState }, additionalContexts: ['status-context'] }
        assert.equal(request.name, resolve('get_composition_artifact'))
        assert.equal(request.arguments.artifactId, 'report')
        return { isError: false, value: { content: text(JSON.stringify({ ok: true, result: canonicalArtifact })) } }
      },
    },
    attachments: {
      saveFile: async ({ name, data }) => {
        saves.push({ name, data: Buffer.from(data) })
        return { name, bytes: data.byteLength, attachmentId: `sha256:${createHash('sha256').update(data).digest('hex')}` }
      },
      fileHostPath: attachment => `/workspace/reports/${attachment.name}`,
    },
    sessionQuery: { readSession: () => { throw new Error('巡检不读取子会话') } },
  })
  return { calls, saves, contexts, export: () => tool.execute({ kind: 'inspection', run_id: run }, {
    agent, token, callId: 'export-call', rootCallId: 'root-call', signal: new AbortController().signal,
    deferContext: context => contexts.push(context),
  }) }
}

test('巡检：选择器只绑定真实原运行及流程，不把展示文本当终态', () => {
  assert.deepEqual(selectInspectionRun(inspections(), run), { run_id: run, workflow: 'inspection-routine' })
})
test('巡检：仅查询他人run不能建立本会话来源', () => assert.throws(() => selectInspectionRun([user, ...inspections().slice(3)], run)))
test('巡检：canonical完整回执允许incomplete业务结果，原HTML字节不变', async () => {
  const harness = inspectionRuntime(), value = await harness.export()
  assert.equal(harness.calls.length, 2); assert.equal(harness.saves.length, 1)
  assert.deepEqual(harness.saves[0].data, Buffer.from(html))
  assert.equal(value.bytes, Buffer.byteLength(html)); assert.equal(value.content_type, 'text/html; charset=utf-8')
  assert.equal(value.sha256, createHash('sha256').update(html).digest('hex'))
  assert.equal(value.source.original_sha256, value.sha256)
  assert.deepEqual(harness.contexts, ['status-context'])
})
test('巡检：运行中、失败、缺失报告仍在运行时canonical边界拒绝', async () => {
  const good = JSON.parse(inspections()[4].data.message.content[0].text)
  const states = ['running', 'failed', 'accepted'].map(status => ({ ...good, status }))
  states.push({ ...good, artifacts: [{ id: 'details', filename: 'details.json', contentType: 'application/json', bytes: 1 }] })
  for (const state of states) {
    const harness = inspectionRuntime({ state })
    await assert.rejects(() => harness.export())
    assert.equal(harness.saves.length, 0); assert.equal(harness.calls.length, 1)
  }
})
test('巡检：伪造启动回执callId及指定外部run被拒', () => {
  const events = inspections(); events[2].data.message.source.callId = 'foreign'
  assert.throws(() => selectInspectionRun(events)); assert.throws(() => selectInspectionRun(inspections(), 'run-foreign'))
})
test('巡检：重复启动callId不作为唯一成功回执', () => {
  const events = inspections(); events.push({ ...events[2], seq: 5, time: epoch + 5 })
  assert.throws(() => selectInspectionRun(events))
})
test('巡检：裁剪或不可靠的历史查询文本不替代最新canonical校验', async () => {
  const events = inspections(); events[4].data.message.content = text('spilled/truncated display')
  events[4].data.message.source.callId = 'unreliable-display'
  const harness = inspectionRuntime({ events })
  await harness.export()
  assert.equal(harness.calls.length, 2); assert.equal(harness.saves.length, 1)
  const failed = inspectionRuntime({ events, state: { run_id: run, composition_id: 'inspection-routine', status: 'running' } })
  await assert.rejects(() => failed.export()); assert.equal(failed.saves.length, 0)
})
test('巡检：当前运行身份、元数据和实际HTML不一致时拒绝保存', async () => {
  const good = JSON.parse(inspections()[4].data.message.content[0].text)
  const report = good.artifacts[0]
  const cases = [
    { stateError: true },
    { state: { ...good, run_id: 'foreign' } },
    { state: { ...good, composition_id: 'inspection-deep' } },
    { state: { ...good, artifacts: [report, report] } },
    { state: { ...good, artifacts: [{ ...report, bytes: 0 }] } },
    { state: { ...good, artifacts: [{ ...report, bytes: report.bytes + 1 }] } },
    { artifact: { filename: 'foreign.html', contentType: report.contentType, body: html } },
    { artifact: { filename: report.filename, contentType: 'text/plain', body: html } },
    { artifact: { filename: report.filename, contentType: report.contentType, body: '<p>fragment</p>' } },
  ]
  for (const input of cases) {
    const harness = inspectionRuntime(input)
    await assert.rejects(() => harness.export())
    assert.equal(harness.saves.length, 0)
  }
})
test('故障：真实完成来源生成自包含HTML且重复导出内容稳定', () => {
  const binding = selectFaultChild(parent, faultParent())
  const a = faultReportSource(binding, snapshot()), b = faultReportSource(binding, snapshot())
  assert.equal(a.html, b.html); assert.match(a.html, /^<!doctype html>/)
  assert.match(a.html, /只读取证与分析/); assert.match(a.html, /证据缺口/)
  assert.doesNotMatch(a.html, /PRIVATE-REASONING/); assert.equal(a.source.child_session_id, child)
})
test('故障：子结果和用户文本逐字转义，不执行脚本/图片/链接', () => {
  const body = '<script>alert(1)</script><img src="https://outside.invalid/x"> & "原文"'
  const result = faultReportSource(selectFaultChild(parent, faultParent()), snapshot(body))
  assert.doesNotMatch(result.html, /<script|<img/); assert.match(result.html, /&lt;script&gt;/)
  assert.equal(result.source.content_sha256, createHash('sha256').update(body).digest('hex'))
})
test('故障：子终态失败、运行中、继承或错会话拒绝', () => {
  const binding = selectFaultChild(parent, faultParent())
  for (const change of [s => { s.events.pop() }, s => { s.events[3].data.reason.kind = 'error' },
    s => { s.inheritedEventCount = 1 }, s => { s.session.id = 'foreign' }, s => { s.session.origin = 'fork' }]) {
    const s = snapshot(); change(s); assert.throws(() => faultReportSource(binding, s))
  }
})
test('故障：纯启动文本、空正文、最后未完成attempt拒绝', () => {
  const binding = selectFaultChild(parent, faultParent())
  for (const body of ['', 'started subagent another-child']) assert.throws(() => faultReportSource(binding, snapshot(body)))
  const s = snapshot(); s.events.splice(2, 0, event(2, 'assistant/attempt', { turn: 1, step: 2 })); s.events[3].seq = 3; s.events[4].seq = 4
  assert.throws(() => faultReportSource(binding, s))
})
test('故障：无直接子catalog、错启动回执、用户伪装完成均拒绝', () => {
  const a = faultParent().filter(e => e.type !== 'subagent/catalog'); assert.throws(() => selectFaultChild(parent, a))
  const b = faultParent(); b[3].data.message.content = text('started subagent foreign'); assert.throws(() => selectFaultChild(parent, b))
  const c = faultParent(); c[4].data.source.kind = 'user'; assert.throws(() => selectFaultChild(parent, c))
  assert.throws(() => selectFaultChild(parent, faultParent(), 'foreign'))
})
test('故障：重复原生完成通知允许只读复用，不改变来源哈希', () => {
  const events = faultParent(), first = selectFaultChild(parent, events)
  events.push({ ...events.at(-1), seq: 9, time: epoch + 9 })
  const again = selectFaultChild(parent, events)
  assert.deepEqual(first, again)
})
test('入口：只读咨询或子Agent不生成报告文件', () => {
  const make = (request, depth = 0) => ({ agent: { id: parent, session: { id: parent, header: { delegationDepth: depth }, snapshotEvents: () => [event(0, 'user/message', { id: 'u', source: { kind: 'user' }, content: text(request) })] } } })
  assert.throws(() => requireReportRequest(make('报告能做什么？不要生成文件。')))
  assert.throws(() => requireReportRequest(make('生成HTML报告', 1)))
  assert.equal(requireReportRequest(make('再次下载刚才的HTML报告，不要重新排障。')).agent.id, parent)
})
test('入口：标准MCP回执解析不把错误当报告', () => {
  assert.equal(reportValue({ content: text(JSON.stringify({ filename: 'r.html', contentType: 'text/html', body: html })) }).body, html)
  assert.throws(() => reportValue({ isError: true })); assert.throws(() => reportValue({ code: 500, data: {} }))
})
test('入口：实际平台ok/result报告封装正确解包，失败仍拒绝', () => {
  const artifact = { filename: 'inspection-report.html', contentType: 'text/html; charset=utf-8', body: html }
  assert.equal(reportValue({ ok: true, result: artifact }).body, html)
  assert.equal(reportValue({ content: text(JSON.stringify({ ok: true, result: artifact })) }).body, html)
  assert.throws(() => reportValue({ ok: false, result: artifact }))
  assert.throws(() => reportValue({ ok: true }))
})
test('入口：未绑定故障结果不得保存附件或调用上游', async () => {
  let tool, saves = 0, calls = 0
  apply({ tools: { register: value => { tool = value }, execute: () => { calls++ } }, attachments: { saveFile: () => { saves++ } }, sessionQuery: {}, mcpSessionManager: {} })
  const agent = { id: parent, session: { id: parent, header: { delegationDepth: 0 }, snapshotEvents: () => [user] } }
  await assert.rejects(() => tool.execute({ kind: 'fault' }, { agent, signal: new AbortController().signal }))
  assert.equal(saves, 0); assert.equal(calls, 0)
})
