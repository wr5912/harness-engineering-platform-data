import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSecurityOperationsGuard, TOOL_ROUTES, visibleToolsForDepth } from '../dsh/managed/security-operations-guard.mjs'
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

const troubleshooting = [
  'diagnose_business_access', 'diagnose_device_offline',
  'get_composition_run', 'get_composition_artifact', 'get_composition_details',
].map(raw => `mcp__troubleshooting-compositions__${raw}`)
const roleAgent = (depth = 0) => ({ session: { header: { delegationDepth: depth }, snapshotEvents: () => [] } })

test('故障只读组合只为主Agent开放两类Run和同组原结果查询，legacy取证与巡检授信保留', () => {
  const guard = createSecurityOperationsGuard({ environment: {} }), parent = roleAgent(), child = roleAgent(1)
  const decide = (agent, name, args = {}) => guard.decide({ agent, name, arguments: args })
  guard.beginTurn(parent, '排查访问异常')
  assert.equal(decide(parent, 'skill', { name: 'fault-analysis' }), undefined)
  assert.deepEqual(TOOL_ROUTES.troubleshooting, troubleshooting)
  for (const name of troubleshooting) {
    assert.equal(decide(parent, name), undefined, name)
    assert.ok(visibleToolsForDepth(0).includes(name))
    for (const depth of [1, 2]) {
      assert.match(decide(roleAgent(depth), name), /只能由主 Agent/)
      assert.equal(visibleToolsForDepth(depth).includes(name), false)
    }
  }
  for (const name of TOOL_ROUTES.readonly) assert.equal(decide(parent, name), undefined, name)
  for (const name of TOOL_ROUTES.faultAnalysis) {
    assert.equal(decide(child, name), undefined, name)
    assert.ok(decide(parent, name), name)
  }
  assert.equal(decide(parent, 'delegate_fault_analysis'), undefined)
  assert.ok(decide(child, 'delegate_fault_analysis'))
  assert.equal(decide(parent, 'mcp__inspection-compositions__get_composition_run'), undefined)
  assert.match(decide(parent, 'mcp__inspection-compositions__inspection_baseline'), /工具未通过运行插件校验/)
  const trusted = createSecurityOperationsGuard({ environment: {}, trustedRuntime: (_exec, domain) => domain === 'inspection' })
  assert.equal(trusted.decide({ agent: roleAgent(), name: 'mcp__inspection-compositions__inspection_baseline', arguments: {} }), undefined)
  assert.equal(decide(parent, 'export_security_report', { kind: 'fault' }), undefined)
  assert.ok(decide(child, 'export_security_report', { kind: 'fault' }))
})

test('故障只读接线不恢复旧Java，不扩大探测、配置写入或陌生分组权限', () => {
  const guard = createSecurityOperationsGuard({ environment: {}, trustedRuntime: () => true })
  const retired = ['list_troubleshooting_playbooks', 'start_diagnosis', 'get_diagnosis_result']
    .map(raw => `mcp__troubleshooting__${raw}`)
  for (const name of retired) {
    assert.ok(TOOL_ROUTES.denied.includes(name))
    for (const depth of [0, 1]) {
      assert.match(guard.decide({ agent: roleAgent(depth), name, arguments: {} }), /永久禁用/)
      assert.equal(visibleToolsForDepth(depth).includes(name), false)
    }
  }
  const denied = [
    'mcp__troubleshooting-compositions__start_diagnosis',
    'mcp__troubleshooting-compositions__create_soc_asset_probe',
    'mcp__troubleshooting-compositions__write_configuration',
    'mcp__troubleshooting__diagnose_business_access',
    'mcp__inspection-compositions__diagnose_device_offline',
    'mcp__troubleshooting-compositions__mcp__troubleshooting-compositions__diagnose_business_access',
    'mcp__soc-readonly__create_soc_asset', 'bash', 'run_code', 'web_fetch',
  ]
  for (const name of denied) for (const depth of [0, 1]) {
    assert.ok(guard.decide({ agent: roleAgent(depth), name, arguments: {} }), name)
    assert.equal(visibleToolsForDepth(depth).includes(name), false)
  }
  for (const name of TOOL_ROUTES.assetOnboardingSoc) {
    assert.ok(guard.decide({ agent: roleAgent(), name, arguments: {} }), name)
  }
})

test('matrix与Guard五项故障接线一致，子角色与旧Java拒绝集合不串用', async () => {
  const matrix = await readFile(new URL('../dsh/managed/role-tool-matrix.yaml', import.meta.url), 'utf8')
  const parentBlock = matrix.split('    troubleshooting:\n')[1]?.split('  delegates:')[0]
  assert.ok(parentBlock)
  assert.deepEqual(parentBlock.trim().split('\n').map(line => line.trim().replace(/^- /u, '')), troubleshooting)
  const faultBlock = matrix.split('  fault-analysis:\n')[1]?.split('  response-planning:')[0]
  assert.ok(faultBlock)
  for (const name of troubleshooting) assert.equal(faultBlock.includes(name), false, name)
  const deniedBlock = matrix.split('denied_mcp_tools:\n')[1]?.split('runtime_capabilities:')[0]
  assert.ok(deniedBlock)
  for (const raw of ['list_troubleshooting_playbooks', 'start_diagnosis', 'get_diagnosis_result']) {
    assert.ok(deniedBlock.includes(`mcp__troubleshooting__${raw}`))
  }
})

for (const identityMode of ['development', 'published']) {
  for (const moduleName of ['security-operations-guard', 'security-operations-child-guard']) {
  test(`无需登录的${identityMode}实例不安装${moduleName}工具限制和 Guard`, async () => {
    const { apply, inject } = await import(`../dsh/managed/${moduleName}.mjs`)
    assert.ok(inject.includes('businessRuntime'))
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
