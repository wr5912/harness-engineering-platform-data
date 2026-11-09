import assert from 'node:assert/strict'
import test from 'node:test'
import { batchResultMarkdown, validateCompletionEvent } from '../dsh/managed/continuation-helper.mjs'

const ids = [
  'INC-20261107-000008',
  'INC-20261028-000021',
  'INC-20261028-000012',
]

function batchEvents() {
  const events = [
    { type: 'session', seq: 0, data: { id: 'parent' } },
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    { type: 'user/message', seq: 2, data: {
      id: 'user-1', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: `研判三个威胁事件，ID分别是：${ids.join('、')}` }],
    } },
  ]
  ids.forEach((incidentId, index) => {
    const callId = `call-${index + 1}`
    const childId = `child-${index + 1}`
    events.push(
      { type: 'tool/call', seq: 3 + index * 4, data: {
        turn: 1, step: 1, name: 'delegate_threat_analysis', callId,
        arguments: JSON.stringify({ prompt: `请研判 SOC 威胁事件：${incidentId}` }),
      } },
      { type: 'subagent/catalog', seq: 4 + index * 4, data: {
        childId, version: 0, mode: 'continuable', childCreatedAt: 100 + index,
      } },
      { type: 'tool/result', seq: 5 + index * 4, data: { turn: 1, step: 1, message: {
        role: 'tool', toolCallId: callId, source: { kind: 'tool', callId }, isError: false,
        content: [{ type: 'text', text: `started subagent ${childId}` }],
      } } },
      { type: 'user/message', seq: 6 + index * 4, data: {
        id: `settled-${index + 1}`, role: 'user', source: {
          kind: 'subagent-settled', senderSessionId: childId,
        }, content: [{ type: 'text', text: 'completed' }],
      } },
    )
  })
  return events
}

test('批量完成通知可逐子会话绑定，不再触发单委派歧义', () => {
  const events = batchEvents()
  const notices = events.filter(event => event.data?.source?.kind === 'subagent-settled')
  for (const notice of notices) {
    const gate = validateCompletionEvent({
      parentId: 'parent', parentEvents: events, turn: 1,
      allowProgress: true, requirePreparation: false, allowBatch: true,
      noticeOverride: notice,
    })
    assert.equal(gate.kind, 'read-child')
    assert.equal(gate.incidentId, ids[notices.indexOf(notice)])
  }
})

test('前三个事件使用上一轮真实查询候选绑定', () => {
  const events = [
    { type: 'turn/start', seq: 1, data: { turn: 1 } },
    { type: 'user/message', seq: 2, data: {
      id: 'query-user', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: '有哪些需要研判的威胁事件？' }],
    } },
    { type: 'tool/result', seq: 3, data: { message: {
      content: [{ type: 'text', text: JSON.stringify({ rows: ids.map(incidentId => ({ incidentId })) }) }],
    } } },
    { type: 'user/message', seq: 4, data: {
      id: 'batch-user', role: 'user', source: { kind: 'user' },
      content: [{ type: 'text', text: '研判前三个事件。' }],
    } },
    { type: 'turn/start', seq: 5, data: { turn: 2 } },
  ]
  ids.forEach((incidentId, index) => {
    const callId = `query-call-${index}`
    const childId = `query-child-${index}`
    const base = 6 + index * 4
    events.push(
      { type: 'tool/call', seq: base, data: { turn: 2, step: 1, name: 'delegate_threat_analysis', callId,
        arguments: JSON.stringify({ prompt: `请研判 ${incidentId}` }) } },
      { type: 'subagent/catalog', seq: base + 1, data: { childId, version: 0, mode: 'continuable', childCreatedAt: 200 + index } },
      { type: 'tool/result', seq: base + 2, data: { turn: 2, step: 1, message: {
        role: 'tool', toolCallId: callId, source: { kind: 'tool', callId }, isError: false,
        content: [{ type: 'text', text: `started subagent ${childId}` }],
      } } },
      { type: 'user/message', seq: base + 3, data: { id: `query-settled-${index}`, role: 'user', source: {
        kind: 'subagent-settled', senderSessionId: childId,
      }, content: [{ type: 'text', text: 'completed' }] } },
    )
  })
  const notice = events.find(event => event.data?.source?.senderSessionId === 'query-child-0')
  const gate = validateCompletionEvent({ parentId: 'parent', parentEvents: events, turn: 2,
    allowProgress: true, requirePreparation: false, allowBatch: true, noticeOverride: notice })
  assert.equal(gate.kind, 'read-child')
  assert.equal(gate.incidentId, ids[0])
  assert.deepEqual(gate.batch.incidentIds, ids)
})

test('单个批量完成结果沿用单条研判摘要格式', () => {
  assert.equal(batchResultMarkdown([{ incidentId: ids[0], markdown: '单条摘要' }]), '单条摘要')
})

test('批量结果按事件独立展示并保留单项失败', () => {
  const markdown = batchResultMarkdown([
    { incidentId: ids[0], markdown: '第一事件摘要' },
    { incidentId: ids[1], error: '子会话读取失败' },
    { incidentId: ids[2], markdown: '第三事件摘要' },
  ])
  assert.match(markdown, /### 批量威胁事件研判结果/)
  assert.ok(markdown.indexOf(ids[0]) < markdown.indexOf(ids[1]))
  assert.ok(markdown.indexOf(ids[1]) < markdown.indexOf(ids[2]))
  assert.match(markdown, /第一事件摘要/)
  assert.match(markdown, /研判结果未能交付：子会话读取失败/)
  assert.match(markdown, /第三事件摘要/)
})

test('批量门禁仍拒绝非威胁委派或缺少唯一事件 ID', () => {
  const events = batchEvents()
  events[3].data.arguments = JSON.stringify({ prompt: '请研判威胁事件' })
  const notice = events.find(event => event.data?.source?.kind === 'subagent-settled')
  const gate = validateCompletionEvent({
    parentId: 'parent', parentEvents: events, turn: 1,
    allowProgress: true, requirePreparation: false, allowBatch: true,
    noticeOverride: notice,
  })
  assert.equal(gate.kind, 'stop')
  assert.equal(gate.code, 'DELEGATE_INCIDENT_MISMATCH')
})
