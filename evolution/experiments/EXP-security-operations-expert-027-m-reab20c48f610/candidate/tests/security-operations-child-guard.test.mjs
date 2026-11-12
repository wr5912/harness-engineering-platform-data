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

test('威胁研判子 Agent 同一 Session 复用原生轮次，不增加单次调用锁', () => {
  const f = fixture('threat')
  const exec = sessionId => ({ name: 'analyze_threat_incident', agent: { session: { id: sessionId } } })
  assert.equal(f.guard(exec('threat-session')), undefined)
  assert.equal(f.guard(exec('threat-session')), undefined, '重复研判由原生任务与会话管理')
  assert.equal(f.guard(exec('other-threat-session')), undefined)
  f.end('threat-session')
  assert.equal(f.guard(exec('threat-session')), undefined, '下一轮开始后可再次研判')
})

test('非威胁角色不受单次研判限制，未授权工具仍拒绝', () => {
  const f = fixture('fault')
  assert.match(f.guard({ name: 'analyze_threat_incident', agent: { session: { id: 'fault-session' } } }), /未授权此工具/)
  assert.equal(f.guard({ name: 'unknown', agent: { session: { id: 'fault-session' } } }), '当前 fault 子 Agent 未授权此工具')
})

test('fault子角色不得创建新只读组合Run、查询同组产物或恢复旧Java/探测写入权限', () => {
  const f = fixture('fault'), agent = { session: { id: 'fault-session', header: { delegationDepth: 1 } } }
  const denied = [
    ...['diagnose_business_access', 'diagnose_device_offline', 'get_composition_run', 'get_composition_artifact', 'get_composition_details']
      .map(raw => `mcp__troubleshooting-compositions__${raw}`),
    ...['list_troubleshooting_playbooks', 'start_diagnosis', 'get_diagnosis_result']
      .map(raw => `mcp__troubleshooting__${raw}`),
    'mcp__sec-ops__create_soc_asset_probe', 'mcp__troubleshooting-compositions__write_configuration',
    'export_security_report', 'write', 'bash',
  ]
  for (const name of denied) assert.match(f.guard({ name, agent, arguments: {} }), /未授权此工具/, name)
})
