import assert from 'node:assert/strict'
import test from 'node:test'
import { continuationPlan, sourceBinding, validateChildResult, validateCompletionEvent } from '../dsh/managed/continuation-helper.mjs'

// 仅合成事件和纯函数；不读取真实日志、不调用模型、SOC 或处置工具。
const [firstId, secondId] = ['INC-20260102-000101', 'INC-20260102-000202']
const parentId = 'parent-single-fixture', childId = 'child-single-fixture', childCreatedAt = 100
const runId = 'run-single-fixture'
const blocks = text => [{ type: 'text', text }]
const toolCall = (seq, name, callId, args, turn = 2, step = 1) => ({ type: 'tool/call', seq,
  data: { turn, step, name, callId, arguments: JSON.stringify(args) } })
const receipt = (seq, call, text, meta) => ({ type: 'tool/result', seq, sourceEventSeqs: [call.seq], data: {
  turn: call.data.turn, step: call.data.step, message: { role: 'tool', toolCallId: call.data.callId,
    source: { kind: 'tool', callId: call.data.callId }, isError: false, content: blocks(text) },
  ...(meta ? { meta } : {}),
} })
function parentEvents({ queryIds = [firstId, secondId], displayIds = [secondId, firstId],
  request = '研判第一条威胁事件。', delegatedId = displayIds[0], withQuery = true, withDisplay = true } = {}) {
  const events = []
  const add = (type, data) => events.push({ type, seq: events.length, data })
  add('session', { id: parentId })
  add('turn/start', { turn: 1 })
  add('user/message', { id: 'query-user', role: 'user', source: { kind: 'user' }, content: blocks('查询待研判威胁事件。') })
  if (withQuery) {
    const call = toolCall(events.length, 'mcp__ai-soc-correlate__get_correlate_incident_judge_pending', 'query-call', {}, 1)
    events.push(call, receipt(events.length + 1, call, JSON.stringify({ code: 200, data: { rows: queryIds.map(incidentId => ({ incidentId })) } })))
  }
  if (withDisplay) for (const order of [[...displayIds].reverse(), displayIds]) {
    add('assistant/message', { turn: 1, step: 2, message: { role: 'assistant',
      content: blocks(order.map((id, index) => `${index + 1}. ${id}`).join('\n')) } })
  }
  add('turn/end', { turn: 1, reason: { kind: 'completed' } })
  add('user/message', { id: 'analysis-user', role: 'user', source: { kind: 'user' }, content: blocks(request) })
  add('turn/start', { turn: 2 })
  const call = toolCall(events.length, 'delegate_threat_analysis', 'delegate-call', { prompt: `请研判 ${delegatedId}` })
  events.push(call)
  add('subagent/catalog', { childId, version: 0, mode: 'continuable', childCreatedAt })
  events.push(receipt(events.length, call, `started subagent ${childId}`))
  add('user/message', { id: 'settled-notice', role: 'user', source: { kind: 'subagent-settled', senderSessionId: childId }, content: blocks('completed') })
  return events
}
const completion = (events, options = {}) => validateCompletionEvent({ parentId, parentEvents: events, turn: 2, requirePreparation: false, ...options })
function childSnapshot(incidentId, { failed = false, markdown } = {}) {
  const analysis = { schema_version: '1.0', status: failed ? 'claim_failed' : 'completed', incident_id: incidentId, run_id: runId,
    delivery: { markdown: markdown ?? (failed ? `SOC 认领失败：${incidentId}，未形成正式结论。` : `研判结果：${incidentId}。未处置。`) },
    ...(failed ? { error_code: 409 } : { result: { unified_event_id: incidentId, recommended_actions: ['核对合成测试资产'] } }),
  }
  const call = toolCall(2, 'analyze_threat_incident', 'analysis-call', { incident_id: incidentId }, 1)
  return { session: { id: childId, createdAt: childCreatedAt, origin: 'subagent', isSeeded: false }, inheritedEventCount: 0,
    events: [call, receipt(3, call, '研判工具回执', { threat_analysis: analysis })] }
}
const analysisOf = snapshot => snapshot.events.find(event => event.type === 'tool/result').data.meta.threat_analysis
const planFor = (gate, snapshot, events) => continuationPlan({ gate, snapshot, parentEvents: events })
function assertDelivery(plan, markdown) {
  assert.equal(plan.kind, 'deliver')
  assert.equal(plan.markdown, markdown)
  assert.equal(plan.message, undefined, '正式结果不夹带已知准备授权提示')
  assert.equal(plan.call, undefined, '仅研判不得产生 preview 或 prepare 调用计划')
}

test('查询首项 A、最后正式展示首项 B，第一条按展示 B 绑定', () => {
  for (const ordinal of ['第一条', '第一个', '首条', '首个']) {
    const gate = completion(parentEvents({ request: `研判${ordinal}威胁事件。` }))
    assert.equal(gate.kind, 'read-child', ordinal)
    assert.equal(gate.incidentId, secondId)
    assert.ok(gate.preparationStop, '序号不取得准备授权')
  }
})
test('同一对 ID 反向重排时仍按最后正式展示首项绑定', () => {
  const gate = completion(parentEvents({ queryIds: [secondId, firstId], displayIds: [firstId, secondId], request: '研判第1项威胁事件。' }))
  assert.equal(gate.kind, 'read-child')
  assert.equal(gate.incidentId, firstId)
})
test('委派原始查询首项而非展示首项时拒绝，不信任委派 prompt', () => {
  for (const [queryIds, displayIds] of [[[firstId, secondId], [secondId, firstId]], [[secondId, firstId], [firstId, secondId]]]) {
    const gate = completion(parentEvents({ queryIds, displayIds, delegatedId: queryIds[0] }))
    assert.equal(gate.code, 'DELEGATE_INCIDENT_MISMATCH')
    assert.equal(gate.read, undefined)
  }
})
test('缺少查询、展示或真实候选时停止', () => {
  for (const options of [{ withQuery: false }, { withDisplay: false }, { queryIds: [firstId] }]) {
    const gate = completion(parentEvents(options))
    assert.equal(gate.kind, 'stop')
    assert.equal(gate.read, undefined)
  }
})
test('多个明确 ID、多个序号或不支持的序号不能进入单条续接', () => {
  for (const request of [`研判 ${firstId} 和 ${secondId}。`, '研判第一条和第二条威胁事件。', '研判第二条威胁事件。', '研判前三条威胁事件。']) {
    const gate = completion(parentEvents({ request }))
    assert.equal(gate.kind, 'stop', request)
    assert.equal(gate.read, undefined)
  }
})
test('默认准备门禁仍拒绝仅由序号表达的准备授权', () => {
  const gate = completion(parentEvents({ request: '研判第一条威胁事件后准备处置草案。' }), { requirePreparation: true })
  assert.equal(gate.kind, 'stop')
  assert.equal(gate.code, 'SINGLE_INCIDENT_REQUIRED')
})
test('仅研判静默交付正式摘要，不产生预览、准备或事件写入', () => {
  for (const request of ['研判第一条威胁事件。', `仅研判 ${secondId}。`]) {
    const events = parentEvents({ request }), snapshot = childSnapshot(secondId)
    const before = JSON.stringify({ events, snapshot })
    const gate = completion(events)
    assert.equal(gate.kind, 'read-child')
    assertDelivery(planFor(gate, snapshot, events), analysisOf(snapshot).delivery.markdown)
    assert.equal(JSON.stringify({ events, snapshot }), before)
  }
})
test('认领失败交付原始失败摘要，不要求处置授权或正式 result', () => {
  const events = parentEvents(), snapshot = childSnapshot(secondId, { failed: true })
  assertDelivery(planFor(completion(events), snapshot, events), analysisOf(snapshot).delivery.markdown)
})
test('无正式摘要时返回真实研判错误，而非准备授权提示', () => {
  const events = parentEvents(), gate = completion(events), snapshot = childSnapshot(secondId, { failed: true, markdown: '' })
  const checked = validateChildResult(gate, snapshot), plan = planFor(gate, snapshot, events)
  assert.equal(checked.code, 'STRUCTURED_RESULT_REQUIRED')
  assert.equal(plan.message, checked.message)
  assert.notEqual(plan.message, gate.preparationStop.message)
  assert.ok(!plan.markdown)
  assert.equal(plan.call, undefined)
})
test('子调用、metadata 或 structured result 的事件错配均不交付正文', () => {
  const events = parentEvents(), gate = completion(events)
  for (const [code, mutate] of [
    ['ANALYSIS_TOOL_PAIR_MISMATCH', snapshot => { snapshot.events[0].data.arguments = JSON.stringify({ incident_id: firstId }) }],
    ['RESULT_ID_MISMATCH', snapshot => { analysisOf(snapshot).incident_id = firstId }],
    ['STRUCTURED_RESULT_REQUIRED', snapshot => { analysisOf(snapshot).result.unified_event_id = firstId }],
  ]) {
    const snapshot = childSnapshot(secondId)
    mutate(snapshot)
    const checked = validateChildResult(gate, snapshot), plan = planFor(gate, snapshot, events)
    assert.equal(checked.code, code)
    assert.ok(!plan.markdown, code)
    assert.equal(plan.message, checked.message)
    assert.equal(plan.call, undefined)
  }
})
test('显式唯一 ID 严格比对且仅研判正常交付', () => {
  const events = parentEvents({ request: `研判 ${firstId}。`, delegatedId: firstId }), gate = completion(events), snapshot = childSnapshot(firstId)
  assert.equal(gate.incidentId, firstId)
  assertDelivery(planFor(gate, snapshot, events), analysisOf(snapshot).delivery.markdown)
  assert.equal(completion(parentEvents({ request: `研判 ${firstId}。`, delegatedId: secondId })).code, 'DELEGATE_INCIDENT_MISMATCH')
})
test('已授权显式 ID 仍按原流程预览、一次准备并交还原生草案', () => {
  const events = parentEvents({ request: `研判 ${firstId} 后准备处置草案。`, delegatedId: firstId })
  const gate = completion(events, { requirePreparation: true }), snapshot = childSnapshot(firstId)
  assert.equal(gate.kind, 'read-child')
  assert.equal(gate.preparationStop, undefined)
  const preview = planFor(gate, snapshot, events)
  assert.equal(preview.kind, 'preview-only')
  assert.equal(preview.call.name, 'disposition_preview')
  assert.equal(preview.confirmed, false)
  assert.equal(preview.submitted, false)
  const previewCall = toolCall(events.at(-1).seq + 1, preview.call.name, 'preview-call', preview.call.arguments, 2, 2)
  events.push(previewCall, receipt(previewCall.seq + 1, previewCall, JSON.stringify({ source: 'THREAT_ANALYSIS', resultRef: firstId,
    executed: false, source_binding: sourceBinding(preview), items: [{ action: 'block_ip', action_key: 'block_ip', executable: true,
      manual: false, params: { ip: '192.0.2.10' } }] })))
  const prepare = planFor(gate, snapshot, events)
  assert.equal(prepare.kind, 'prepare-once')
  assert.equal(prepare.call.name, 'disposition_prepare')
  assert.equal(prepare.call.arguments.request_id, preview.requestId)
  assert.equal(prepare.confirmed, false)
  assert.equal(prepare.submitted, false)
  const prepareCall = toolCall(events.at(-1).seq + 1, prepare.call.name, 'prepare-call', prepare.call.arguments, 2, 3)
  events.push(prepareCall, receipt(prepareCall.seq + 1, prepareCall, JSON.stringify({ prepared: true, operation_id: 'operation-single-fixture',
    phase: 'READY', execution_status: 'NOT_SUBMITTED', ready: true, source_binding: sourceBinding(preview) })))
  const delivered = planFor(gate, snapshot, events)
  assert.equal(delivered.kind, 'native-draft')
  assert.equal(delivered.operationId, 'operation-single-fixture')
  assert.equal(delivered.call, undefined)
  assert.equal(events.filter(event => event.data?.name === 'disposition_prepare').length, 1)
})
test('查询失败、错误业务码、失败文本或回执不配对均不能证明候选存在', () => {
  for (const mode of ['isError', 'business-error', 'failure-text', 'unpaired']) {
    const events = parentEvents()
    const result = events.find(event => event.type === 'tool/result')
    if (mode === 'isError') result.data.message.isError = true
    if (mode === 'business-error') result.data.message.content = blocks(JSON.stringify({ code: 500, data: { rows: [{ incidentId: secondId }] } }))
    if (mode === 'failure-text') result.data.message.content = blocks(`查询失败，未找到事件 ${secondId}`)
    if (mode === 'unpaired') result.data.message.source.callId = 'another-call'
    const gate = completion(events)
    assert.equal(gate.kind, 'stop', mode)
    assert.equal(gate.code, 'SINGLE_CANDIDATE_BINDING_REQUIRED', mode)
    assert.equal(gate.read, undefined)
  }
})
