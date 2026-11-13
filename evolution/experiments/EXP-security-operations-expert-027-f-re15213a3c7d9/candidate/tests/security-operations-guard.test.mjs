import assert from 'node:assert/strict'
import test from 'node:test'
import { createSecurityOperationsGuard, visibleToolsForDepth } from '../dsh/managed/security-operations-guard.mjs'

test('主会话的 Skill 切换不阻断已注册 MCP、定时任务及用户后续问题', () => {
  const registered = new Set(['mcp__inspection__list_executable_inspections', 'mcp__new-service__query'])
  const guard = createSecurityOperationsGuard({ registeredMcp: exec => registered.has(exec.name) })
  const agent = { session: { header: { delegationDepth: 0 } } }
  const decide = (name, args = {}) => guard.decide({ agent, name, arguments: args })
  guard.beginTurn(agent, '巡检后统计事件')
  assert.equal(decide('skill', { name: 'security-inspection' }), undefined)
  assert.equal(decide('mcp__inspection__list_executable_inspections'), undefined)
  assert.equal(decide('skill', { name: 'policy-configuration' }), undefined)
  assert.equal(decide('mcp__new-service__query'), undefined)
  assert.equal(decide('schedule_create'), undefined)
  assert.equal(decide('schedule_delete'), undefined)
  assert.equal(decide('analyze_pending_threat_incidents'), undefined)
  assert.ok(decide('mcp__unknown__write'))
})

test('注册目录不能越过永久禁用与专用子角色边界', () => {
  const guard = createSecurityOperationsGuard({ registeredMcp: () => true })
  const root = { session: { header: { delegationDepth: 0 } } }
  const child = { session: { header: { delegationDepth: 1 } } }
  assert.match(guard.decide({ agent: root, name: 'mcp__policy-configuration__confirm_policy_configuration' }), /永久禁用/)
  assert.match(guard.decide({ agent: root, name: 'analyze_threat_incident' }), /专用子 Agent/)
  assert.equal(guard.decide({ agent: child, name: 'analyze_threat_incident' }), undefined)
  assert.match(guard.decide({ agent: child, name: 'schedule_delete' }), /主 Agent/)
  assert.match(guard.decide({ agent: child, name: 'mcp__new-service__write' }), /当前子角色/)
  assert.ok(visibleToolsForDepth(0).includes('schedule_create'))
  assert.ok(!visibleToolsForDepth(1).includes('schedule_create'))
})
