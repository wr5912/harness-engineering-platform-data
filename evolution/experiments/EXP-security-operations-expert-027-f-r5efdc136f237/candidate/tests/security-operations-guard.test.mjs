import assert from 'node:assert/strict'
import test from 'node:test'
import { createSecurityOperationsGuard, visibleToolsForDepth } from '../dsh/managed/security-operations-guard.mjs'
test('发现目标可衔接策略与应急；旧包装器不可再调用', () => {
  const guard = createSecurityOperationsGuard()
  const agent = { session: { header: { delegationDepth: 0 } } }
  const decide = (name, args = {}) => guard.decide({ agent, name, arguments: args })
  guard.beginTurn(agent, '先找防火墙，再出策略草稿，不提交')
  for (const name of ['security-investigation', 'policy-configuration', 'emergency-action']) {
    assert.equal(decide('skill', { name }), undefined)
  }
  for (const name of ['get_correlate_incident', 'search_graph_assets', 'preview_admin_dispatch_task', 'create_admin_dispatch_task', 'execute_resp_agent_actions', 'get_admin_dispatch_task_by_id', 'get_admin_dispatch_task_input_fields', 'get_resp_actions_executions', 'get_resp_action_defs']) {
    assert.equal(decide(`mcp__policy-response__${name}`), undefined)
    assert.match(guard.decide({ name: `mcp__policy-response__${name}`, arguments: {},
      agent: { session: { header: { delegationDepth: 1 } } } }), /主 Agent/)
  }
  assert.equal(decide('read_mcp_resource', { server: 'policy-response', uri: 'http://example.test/task/real-id' }), undefined)
  for (const name of ['mcp__policy-configuration__prepare_policy_configuration',
    'mcp__emergency-action__prepare_emergency_action', 'disposition_prepare', 'create_department_policy_task']) {
    assert.match(decide(name), /未列入/)
    assert.ok(!visibleToolsForDepth(0).includes(name))
  }
})

test('巡检与诊断仍核对可信运行插件，其他业务和文件范围不回退', () => {
  const agent = { session: { header: { delegationDepth: 0 } } }
  const guard = createSecurityOperationsGuard()
  const decide = (name, args = {}) => guard.decide({ agent, name, arguments: args })
  for (const name of ['mcp__inspection__list_executable_inspections', 'schedule_list', 'delegate_fault_analysis']) {
    assert.equal(decide(name), undefined)
  }
  for (const name of ['mcp__inspection__start_inspection', 'mcp__inspection__get_inspection_result',
    'mcp__troubleshooting__start_diagnosis', 'mcp__troubleshooting__get_diagnosis_result']) {
    assert.match(decide(name), /运行插件校验/)
    assert.equal(createSecurityOperationsGuard({ trustedRuntime: () => true }).decide({ agent, name, arguments: {} }), undefined)
  }
  assert.match(decide('read', { file_path: '/opt/dsh-managed/secret' }), /不得访问/)
  assert.match(decide('write', { file_path: '/work/harness/workspace/AGENTS.md' }), /只读/)
  assert.ok(!visibleToolsForDepth(1).includes('schedule_create'))
  assert.match(decide('bash'), /永久禁用/)
})

for (const identityMode of ['development', 'published']) {
  for (const moduleName of ['security-operations-guard', 'security-operations-child-guard']) {
  test(`无需登录的${identityMode}实例不安装${moduleName}工具限制和 Guard`, async () => {
    const { apply } = await import(`../dsh/managed/${moduleName}.mjs`)
    let checked = 0
    apply({ get: name => {
      assert.equal(name, 'businessRuntime')
      return { requiresAuthentication: () => { checked++; return false }, binding: { identityMode } }
    }, on: () => assert.fail('无需登录时不注册 Guard 事件'),
    tools: { guard: () => assert.fail('无需登录时不安装工具校验') } })
    assert.equal(checked, 1)
  })
  }
}

for (const moduleName of ['security-operations-guard', 'security-operations-child-guard']) {
  test(`无需登录配置晚于 ${moduleName} 装载时仍保持原生工具访问`, async () => {
    const { apply } = await import(`../dsh/managed/${moduleName}.mjs`)
    const handlers = new Map()
    let runtime
    let decide
    apply({
      get: () => runtime,
      mcpSessionManager: {},
      on: (event, handler) => handlers.set(event, handler),
      tools: { guard: handler => { decide = handler }, get: () => assert.fail('无需登录时不筛选工具') },
    }, { role: 'response' })
    runtime = { requiresAuthentication: () => false }
    const agent = { ctx: { tools: { restrict: () => assert.fail('无需登录时不冻结工具目录') } } }
    handlers.get('agent/created')?.({ agent })
    const next = () => 'continued'
    assert.equal(await handlers.get('agent/pre-step')({ agent, step: 1 }, next), 'continued')
    assert.equal(decide({ agent, name: 'mcp__policy-response__get_correlate_incident' }), undefined)
    if (handlers.has('tools/post-execute')) {
      assert.equal(await handlers.get('tools/post-execute')({ agent }, {}, next), 'continued')
    }
  })
}
