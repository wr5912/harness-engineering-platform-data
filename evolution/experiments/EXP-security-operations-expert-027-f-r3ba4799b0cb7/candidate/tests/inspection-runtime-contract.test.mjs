import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, inspectionExecution } from '../dsh/managed/inspection-preparation-runtime.mjs'
function session(text = '请执行一次常规巡检，范围是全部资产') {
  const events = []
  const message = (value, kind = 'user') => events.push({ type: 'user/message', data: { id: 'message-' + events.length, source: { kind }, content: [{ type: 'text', text: value }] } })
  message(text)
  return { agent: { id: 'session-1', session: { header: { delegationDepth: 0 }, snapshotEvents: () => events } }, message }
}
test('同一真实消息和工具的执行身份跨调用稳定；换参数不能偷偷换身份', () => {
  const { agent, message } = session()
  const first = inspectionExecution('inspection_routine', { agent, callId: 'model-call-1' })
  assert.equal(first.agent, agent)
  assert.equal(inspectionExecution('inspection_routine', { agent, callId: 'model-call-2' }).callId, first.callId)
  assert.notEqual(inspectionExecution('inspection_vulnerabilities', { agent }).callId, first.callId)
  message('请再执行一次常规巡检，全部资产')
  assert.notEqual(inspectionExecution('inspection_routine', { agent }).callId, first.callId)
})
test('真实主会话绑定不依赖关键词，缺少真实来源或子会话不能伪造身份', () => {
  const { agent, message } = session('请执行一次常规巡检')
  message('范围为全部资产')
  assert.ok(inspectionExecution('inspection_routine', { agent }).callId)
  agent.session.header.delegationDepth = 1
  assert.throws(() => inspectionExecution('inspection_routine', { agent }), /真实主会话/)
  assert.throws(() => inspectionExecution('inspection_routine', {}), /真实主会话/)
  const missing = session()
  missing.agent.session.snapshotEvents = () => []
  assert.throws(() => inspectionExecution('inspection_routine', missing), /真实主会话/)
})
test('原生定时每次到期有独立身份，同一次投递重试保持不变', () => {
  const { agent, message } = session()
  message('执行全部资产的常规巡检', 'schedule')
  const first = inspectionExecution('inspection_routine', { agent }).callId
  assert.equal(inspectionExecution('inspection_routine', { agent }).callId, first)
  message('执行全部资产的常规巡检', 'schedule')
  assert.notEqual(inspectionExecution('inspection_routine', { agent }).callId, first)
})
test('业务别名和预览后的确认交给原生助手理解，不额外用正则拦截', () => {
  for (const value of ['按当前配置的全部适用规则，执行一次业务互联专项检查。', '请执行一次可达性检查', '确认执行']) {
    const { agent } = session(value)
    assert.ok(inspectionExecution('inspection_reachability', { agent }).callId)
  }
})

test('原生定时批次按真实消息绑定，不重新解析或改写原生信封', () => {
  const { agent, message } = session('创建定时任务')
  const prompt = '执行一次设备常规巡检，范围为全部资产；若上一次巡检仍在运行则跳过本次、不重复启动。'
  message('[SCHEDULE REMINDER BATCH]\nreminders_json: ' + JSON.stringify([{ schedule_id: 'schedule-1', reminder_prompt: prompt }]), 'schedule')
  assert.ok(inspectionExecution('inspection_routine', { agent }).callId)
})
test('装载保留真实 Schema 和回执，丢回执重试传递原身份；查询不改请求', async () => {
  const handlers = {}, visible = [], calls = [], { agent } = session()
  agent.ctx = { tools: { register(tool) { visible.push(tool); return () => {} } } }
  const parameters = { type: 'object', required: ['scope'], properties: { scope: { type: 'object' } } }
  const original = { name: 'mcp__inspection-compositions__inspection_routine', parameters, description: '已发布常规巡检', execute: async (args, exec) => {
    calls.push({ args, exec }); if (calls.length === 1) throw new Error('receipt lost'); return { run_id: 'run-original' }
  } }
  apply({ mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` }, tools: { get: name => name === original.name ? original : undefined },
    on: (name, handler) => { handlers[name] = handler }, effect() {} })
  handlers['agent/created']({ agent })
  assert.equal(visible.length, 1)
  assert.equal(visible[0].parameters, parameters)
  assert.equal(visible[0].description, original.description)
  assert.ok(visible[0][Symbol.for('security-operations.inspection.runtime')])
  const input = { scope: { all: true } }
  await assert.rejects(visible[0].execute(input, { agent, callId: 'call-1' }), /receipt lost/)
  assert.deepEqual(await visible[0].execute(input, { agent, callId: 'call-2' }), { run_id: 'run-original' })
  assert.equal(calls[0].exec.callId, calls[1].exec.callId)
  assert.equal(calls[0].args, input)
})
