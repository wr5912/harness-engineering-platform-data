import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../dsh/managed/security-operations-child-guard.mjs'

function fixture(role = 'threat') {
  const guards = [], events = []
  const ctx = {
    on(event, listener) { if (event === 'session/event') events.push(listener) },
    tools: { get: () => undefined, guard: guard => guards.push(guard) },
    mcpSessionManager: { resolveTool: () => undefined },
    logger: { warn() {} },
  }
  apply(ctx, { role })
  return { guard: guards[0], end: (sessionId) => events.forEach(listener => listener({ id: sessionId }, { type: 'turn/end' })) }
}

test('威胁研判子 Agent 同一 Session 只允许一次 analyze_threat_incident 调用', () => {
  const f = fixture('threat')
  const exec = sessionId => ({ name: 'analyze_threat_incident', agent: { session: { id: sessionId } } })
  assert.equal(f.guard(exec('threat-session')), undefined)
  assert.match(f.guard(exec('threat-session')), /只允许一次研判调用/)
  assert.equal(f.guard(exec('other-threat-session')), undefined)
  f.end('threat-session')
  assert.equal(f.guard(exec('threat-session')), undefined, '下一轮开始后可再次研判')
})

test('非威胁角色不受单次研判限制，未授权工具仍拒绝', () => {
  const f = fixture('fault')
  assert.match(f.guard({ name: 'analyze_threat_incident', agent: { session: { id: 'fault-session' } } }), /未授权此工具/)
  assert.equal(f.guard({ name: 'unknown', agent: { session: { id: 'fault-session' } } }), '当前 fault 子 Agent 未授权此工具')
})
