import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCompletionEvent } from '../dsh/managed/continuation-helper.mjs'

// 合成日志回归：不读取真实会话，不执行任何业务或外部工具。
const ids = Array.from({ length: 6 }, (_, index) => `INC-20260102-00010${index}`)
const [a, b, c, d, e, f] = ids
const block = text => [{ type: 'text', text }]
function fixture({ rows = [a, b, c], display = rows, selected = display.slice(0, 3), repeat = true,
  refresh, noise = false, explicit = false, single = false, update, inbox = false, lateOld = false } = {}) {
  const events = []
  const add = (type, data, extra = {}) => { const value = { type, seq: events.length, data, ...extra }; events.push(value); return value }
  const user = (id, text) => add('user/message', { id, role: 'user', source: { kind: 'user' }, content: block(text) })
  const call = (name, callId, args, turn) => add('tool/call', { name, callId, arguments: JSON.stringify(args), turn, step: 1 })
  const receipt = (source, text) => add('tool/result', { turn: source.data.turn, step: 1, message: {
    role: 'tool', toolCallId: source.data.callId, source: { kind: 'tool', callId: source.data.callId }, isError: false, content: block(text),
  } }, { sourceEventSeqs: [source.seq] })
  const list = (tag, values, shown, mode = 'ok', total = 1000) => {
    const source = call('mcp__ai-soc-correlate__get_correlate_incident_judge_pending', `${tag}-query`, { pageNum: tag === 'new' ? 2 : 1 }, 1)
    if (mode !== 'missing') {
      const response = receipt(source, JSON.stringify({ code: 200, data: { rows: values.map(incidentId => ({ incidentId })), total } }))
      if (mode === 'error') response.data.message.isError = true
      if (mode === 'unspecified-error') delete response.data.message.isError
      if (mode === 'business-error') response.data.message.content = block(JSON.stringify({ code: 500, data: { rows: values.map(incidentId => ({ incidentId })) } }))
      if (mode === 'string-code') response.data.message.content = block(JSON.stringify({ code: '200', data: { rows: values.map(incidentId => ({ incidentId })) } }))
      if (mode === 'invalid-json') response.data.message.content = block(`查询失败 ${a}`)
      if (mode === 'wrong-pair') response.data.message.source.callId = 'unrelated-call'
      if (mode === 'duplicate') add('tool/result', structuredClone(response.data), { sourceEventSeqs: [source.seq] })
      if (mode.startsWith('truncated-')) {
        const complete = mode === 'truncated-short' ? values.slice(0, 2) : values.slice(0, 3)
        const head = `{"msg":"操作成功","code":${mode === 'truncated-error' ? 403 : 200},"data":{"rows":[`
        const prefix = complete.map(incidentId => JSON.stringify({ incidentId, nested: { text: '包含转义引号"和括号[]{}的证据字段' } })).join(',')
        const tail = JSON.stringify({ incidentId: values.at(-1) }) + ']}}'
        const marker = '\n\n[...]\n\n'
        const footer = mode === 'truncated-unmarked' ? '' : '\n\n(Omitted 123 bytes. Full formatted result stored at: /do-not-read/spill.txt. Use read with offset/limit, or grep this path to search within it.)'
        response.data.message.content = block(head + prefix + ',{"incidentId":"' + values[complete.length] + '","unfinished":' + marker + tail + footer)
      }
    }
    add('assistant/message', { turn: 1, step: 2, message: { role: 'assistant', content: block(shown.map((id, index) => `${index + 1}. ${id}`).join('\n')) } })
    return source
  }
  add('session', { id: 'snapshot-parent' })
  add('turn/start', { turn: 1 })
  user('query-user', '有哪些需要研判的事件？')
  const older = list('old', rows, display, lateOld ? 'missing' : 'ok')
  add('user/message', { id: 'time-context', role: 'user', source: { kind: 'time-context' }, content: block('时间提示，不是用户更新。') })
  if (repeat) {
    user('previous-request', '研判前三个事件。')
    add('assistant/message', { turn: 2, step: 1, message: { role: 'assistant', content: block(`上一批结果：${f}；不能把该结果作为新候选。`) } })
    add('user/message', { id: 'old-completion', role: 'user', source: { kind: 'subagent-settled', senderSessionId: 'old-child' }, content: block(`旧任务结束 ${f}`) })
  }
  if (refresh) {
    user('refresh-user', '刷新候选清单。')
    list('new', refresh.rows ?? [], refresh.display ?? refresh.rows ?? [], refresh.mode)
  }
  if (lateOld) receipt(older, JSON.stringify({ code: 200, data: { rows: rows.map(incidentId => ({ incidentId })) } }))
  if (noise) {
    const source = call('unrelated_tool', 'noise-call', {}, 2)
    receipt(source, JSON.stringify({ code: 200, data: { rows: [f, e, d].map(incidentId => ({ incidentId })) } }))
    add('assistant/message', { turn: 2, step: 2, message: { role: 'assistant', content: block(`其它结果 ${f}、${e}、${d}`) } })
  }
  user('current-request', explicit ? `研判 ${selected.join('、')}。` : single ? '研判第一条威胁事件。' : '研判前三个事件。')
  add('turn/start', { turn: 4 })
  const notices = []
  selected.forEach((incidentId, index) => {
    const childId = `snapshot-child-${index}`, source = call('delegate_threat_analysis', `delegate-${index}`, { prompt: `请研判 ${incidentId}` }, 4)
    add('subagent/catalog', { childId, version: 0, mode: 'continuable', childCreatedAt: 100 + index })
    receipt(source, `started subagent ${childId}`)
    notices.push({ id: `settled-${index}`, role: 'user', source: { kind: 'subagent-settled', senderSessionId: childId }, content: block('completed') })
  })
  const notice = add('user/message', notices[0])
  if (update) user('new-request', update)
  if (inbox) add('agent/inbox/spliced', { target: 'next-step', inserted: [{ id: 'inbox-user', role: 'user', source: { kind: 'user' }, content: block('取消旧任务') }] })
  const gate = validateCompletionEvent({ parentId: 'snapshot-parent', parentEvents: events, turn: 4,
    allowProgress: true, requirePreparation: false, allowBatch: !single, noticeOverride: notice })
  return { gate, events }
}
const accepts = options => { const { gate } = fixture(options); assert.equal(gate.kind, 'read-child', gate.message); return gate }
const rejects = options => { const { gate } = fixture(options); assert.equal(gate.kind, 'stop'); assert.equal(gate.read, undefined); return gate }

test('同一快照后重复前三个请求，无须在两次用户请求之间重查', () => {
  const gate = accepts({})
  assert.deepEqual(gate.batch.incidentIds, [a, b, c])
  assert.equal(gate.preparationStop.code, 'BATCH_DELIVERY_ONLY')
  assert.match(gate.batch.candidateViewId, /^candidate-view-v1-/)
})
test('查询后跨多轮先概述再展开列表，委派冻结最后正式候选视图', () => {
  const events = []
  const add = (type, data, extra = {}) => { const event = { type, seq: events.length, data, ...extra }; events.push(event); return event }
  const text = value => [{ type: 'text', text: value }]
  const user = (id, value) => add('user/message', { id, role: 'user', source: { kind: 'user' }, content: text(value) })
  const query = add('tool/call', { turn: 1, step: 1, callId: 'query-call',
    name: 'mcp__ai-soc-correlate__get_correlate_incident_judge_pending', arguments: '{}' })
  add('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'query-call',
    source: { kind: 'tool', callId: 'query-call' }, isError: false,
    content: text(JSON.stringify({ code: 200, data: { rows: [a, b, c].map(incidentId => ({ incidentId })) } })) } },
    { sourceEventSeqs: [query.seq] })
  add('assistant/message', { turn: 1, step: 2, message: { role: 'assistant', content: text(`当前共有待研判事件，首条是 ${a}。`) } })
  user('show-user', '显示前20条待研判事件。')
  add('assistant/message', { turn: 2, step: 2, message: { role: 'assistant', content: text(`| # | 事件 ID | 状态 |\n|---|---|---|\n| 1 | ${a} | 待研判 |\n| 2 | ${b} | 待研判 |\n| 3 | ${c} | 待研判 |`) } })
  const current = user('batch-user', '研判前3条威胁事件。')
  add('turn/start', { turn: 3 })
  const selected = [a, b, c]
  selected.forEach((incidentId, index) => {
    const callId = `delegate-${index}`, childId = `child-${index}`
    const call = add('tool/call', { turn: 3, step: 1, callId, name: 'delegate_threat_analysis',
      arguments: JSON.stringify({ prompt: `请研判 ${incidentId}` }) })
    add('subagent/catalog', { childId, version: 0, mode: 'continuable', childCreatedAt: index + 1 })
    add('tool/result', { turn: 3, step: 1, message: { role: 'tool', toolCallId: callId,
      source: { kind: 'tool', callId }, isError: false, content: text(`started subagent ${childId}`) } },
      { sourceEventSeqs: [call.seq] })
  })
  const notice = add('user/message', { id: 'settled-0', role: 'user',
    source: { kind: 'subagent-settled', senderSessionId: 'child-0' }, content: text('completed') })
  const gate = validateCompletionEvent({ parentId: 'parent', parentEvents: events, turn: 3,
    allowProgress: true, requirePreparation: false, allowBatch: true, noticeOverride: notice })
  assert.equal(gate.kind, 'read-child', gate.message)
  assert.deepEqual(gate.batch.incidentIds, selected)
  assert.equal(gate.batch.candidateView.displaySeq, 4)
  assert.equal(gate.batch.frozenAtSeq, 7)
  assert.match(gate.batch.candidateViewId, /^candidate-view-v1-/)
  assert.equal(current.data.id, 'batch-user')
})
test('跨分页展示合并同一查询视图，不只绑定最后一页', () => {
  const events = []
  const add = (type, data, extra = {}) => { const event = { type, seq: events.length, data, ...extra }; events.push(event); return event }
  const text = value => [{ type: 'text', text: value }]
  const user = (id, value) => add('user/message', { id, role: 'user', source: { kind: 'user' }, content: text(value) })
  const page = (pageNum, values, callId) => {
    const call = add('tool/call', { turn: 1, step: 1, callId, name: 'mcp__ai-soc-correlate__get_correlate_incident_judge_pending',
      arguments: JSON.stringify({ pageNum, pageSize: 3 }) })
    add('tool/result', { turn: 1, step: 1, message: { role: 'tool', toolCallId: callId,
      source: { kind: 'tool', callId }, isError: false,
      content: text(JSON.stringify({ code: 200, data: { rows: values.map(incidentId => ({ incidentId })) } })) } },
      { sourceEventSeqs: [call.seq] })
  }
  add('turn/start', { turn: 1 })
  user('query-user', '有哪些需要研判的事件？')
  page(1, [a, b, c], 'page-1')
  user('show-user', '显示前6条。')
  page(2, [d, e, f], 'page-2')
  add('assistant/message', { turn: 2, step: 3, message: { role: 'assistant', content: text(
    `| # | 事件 ID | 状态 |\n|---|---|---|\n${[a, b, c, d, e, f].map((id, index) => `| ${index + 1} | ${id} | 待研判 |`).join('\n')}`) } })
  user('batch-user', '研判前三个事件。')
  add('turn/start', { turn: 3 })
  const childIds = ['page-child-0', 'page-child-1', 'page-child-2']
  ;[a, b, c].forEach((incidentId, index) => {
    const callId = `page-delegate-${index}`, call = add('tool/call', { turn: 3, step: 1, callId,
      name: 'delegate_threat_analysis', arguments: JSON.stringify({ prompt: `请研判 ${incidentId}` }) })
    add('subagent/catalog', { childId: childIds[index], version: 0, mode: 'continuable', childCreatedAt: index + 1 })
    add('tool/result', { turn: 3, step: 1, message: { role: 'tool', toolCallId: callId,
      source: { kind: 'tool', callId }, isError: false, content: text(`started subagent ${childIds[index]}`) } },
      { sourceEventSeqs: [call.seq] })
  })
  const notice = add('user/message', { id: 'page-settled', role: 'user',
    source: { kind: 'subagent-settled', senderSessionId: childIds[0] }, content: text('completed') })
  const gate = validateCompletionEvent({ parentId: 'page-parent', parentEvents: events, turn: 3,
    allowProgress: true, requirePreparation: false, allowBatch: true, noticeOverride: notice })
  assert.equal(gate.kind, 'read-child', gate.message)
  assert.deepEqual(gate.batch.incidentIds, [a, b, c])
  assert.deepEqual(gate.batch.candidateView.pageNumbers, [1, 2])
})
test('按正式展示顺序而非原始 rows 顺序绑定，单条共用同一快照', () => {
  assert.deepEqual(accepts({ rows: [a, b, c, d], display: [c, a, b], selected: [c, a, b] }).batch.incidentIds, [c, a, b])
  rejects({ rows: [a, b, c], display: [c, a, b], selected: [a, b, c] })
  assert.equal(accepts({ rows: [a, b, c], display: [c, a, b], selected: [c], single: true }).incidentId, c)
  rejects({ rows: [a, b, c], display: [c, a, b], selected: [a], single: true })
})
test('显式多个ID沿用户当前顺序绑定，不受展示顺序约束', () => {
  assert.deepEqual(accepts({ selected: [b, c, a], explicit: true }).batch.incidentIds, [b, c, a])
})
test('新页替换旧页，不拼页且不要求抓取 total；旧页迟到回执不覆盖新页', () => {
  const refresh = { rows: [d, e, f], display: [f, e, d] }
  accepts({ refresh, selected: [f, e, d] })
  accepts({ refresh, selected: [f, e, d], lateOld: true })
  rejects({ refresh, selected: [a, b, c] })
})
for (const mode of ['error', 'unspecified-error', 'business-error', 'string-code', 'invalid-json', 'missing', 'wrong-pair', 'duplicate']) {
  test(`最新查询 ${mode} 时不可回退到旧成功快照`, () => rejects({ refresh: { rows: [a, b, c], mode } }))
}
test('最新查询空页和不足三条都不得借旧页补齐', () => {
  rejects({ refresh: { rows: [], display: [] } })
  rejects({ refresh: { rows: [a, b], display: [a, b] } })
})
test('非查询结果、旧研判摘要和完成通知不能污染候选快照', () => accepts({ noise: true }))
test('任何坏行、重复行或外来展示ID使快照不可用，不能静默裁剪', () => {
  for (const invalid of [null, undefined, 17, `${d}x`, `${d}\n`, ` ${d}`]) rejects({ rows: [a, b, c, invalid], display: [a, b, c] })
  rejects({ rows: [a, b, c, a], display: [a, b, c] })
  rejects({ rows: [a, b, c], display: [a, b, f] })
})
test('原生截断回执只证明连续完整前缀，够用时交付并保留边界', () => {
  const gate = accepts({ refresh: { rows: [a, b, c, d], display: [a, b, c, d], mode: 'truncated-enough' } })
  assert.equal(gate.batch.candidatePageTruncated, true)
  assert.deepEqual(gate.batch.candidateIds, [a, b, c])
})
test('原生截断不足三条时不能用不完整行或尾段凑第三条', () => {
  rejects({ refresh: { rows: [a, b, c, d], display: [a, b, c], mode: 'truncated-short' } })
  rejects({ refresh: { rows: [a, b, c, d], display: [a, b, d], mode: 'truncated-enough' }, selected: [a, b, d] })
})
test('没有原生截断标记或成功响应头时不得从非法JSON捞取候选', () => {
  for (const mode of ['truncated-unmarked', 'truncated-error']) rejects({ refresh: { rows: [a, b, c, d], display: [a, b, c], mode } })
})
test('用户在委派后更新只阻止处置准备，不阻止已冻结研判结果交付', () => {
  const updated = accepts({ update: '查询其它状态。' })
  assert.equal(updated.userUpdated, true)
  assert.equal(updated.preparationStop.code, 'BATCH_DELIVERY_ONLY')
  const canceled = accepts({ inbox: true })
  assert.equal(canceled.userUpdated, true)
  assert.equal(canceled.preparationStop.code, 'BATCH_DELIVERY_ONLY')
})
