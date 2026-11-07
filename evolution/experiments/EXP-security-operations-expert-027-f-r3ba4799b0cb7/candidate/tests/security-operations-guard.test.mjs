import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createSecurityOperationsGuard, TOOL_ROUTES, visibleToolsForDepth } from '../dsh/managed/security-operations-guard.mjs'
import { setEmergencyConfirmationTurn } from '../dsh/managed/emergency-action-guard.mjs'

test('巡检 Skill 锁定本轮能力，策略和应急工具不能越界', () => {
  const guard = createSecurityOperationsGuard()
  const agent = { session: { header: { delegationDepth: 0 } } }
  const decide = (name, args = {}) => guard.decide({ agent, name, arguments: args })

  guard.beginTurn(agent, '只列出巡检项')
  assert.match(decide('mcp__policy-configuration__get_policy_configuration_status'), /必须先加载/)
  assert.equal(decide('skill', { name: 'security-inspection' }), undefined)
  assert.equal(decide('mcp__inspection-compositions__get_composition_run'), undefined)
  assert.match(decide('mcp__inspection__get_inspection_scope'), /未列入当前角色/)
  assert.match(decide('mcp__inspection-compositions__inspection_baseline'), /工具未通过运行插件校验/)
  assert.match(decide('mcp__inspection-compositions__inspection_baseline'), /工具未通过运行插件校验/)
  assert.match(decide('mcp__inspection__prepare_inspection'), /未列入当前角色/)
  assert.match(decide('mcp__troubleshooting__list_troubleshooting_playbooks'), /永久禁用/)
  assert.match(decide('mcp__troubleshooting__start_diagnosis'), /永久禁用/)
  assert.match(decide('mcp__troubleshooting__get_diagnosis_result'), /永久禁用/)
  assert.match(decide('mcp__troubleshooting__prepare_diagnosis'), /未列入当前角色/)
  assert.ok(visibleToolsForDepth(0).includes('schedule_create'))
  assert.ok(!visibleToolsForDepth(1).includes('schedule_create'))
  assert.equal(decide('schedule_create'), undefined)
  assert.match(decide('mcp__inspection__inspection_capabilities_list'), /未列入当前角色/)
  assert.match(decide('mcp__policy-configuration__get_policy_configuration_status'), /必须先加载/)
  assert.match(decide('mcp__emergency-action__list_emergency_actions'), /必须先加载/)

  guard.beginTurn(agent, '新增网络访问策略')
  assert.equal(decide('skill', { name: 'policy-configuration' }), undefined)
  assert.equal(decide('mcp__policy-configuration__get_policy_configuration_status'), undefined)
  assert.match(decide('mcp__inspection-compositions__get_composition_run'), /不能调用其他业务能力/)
  assert.match(decide('schedule_create'), /不能调用其他业务能力/)
  assert.match(decide('analyze_pending_threat_incidents'), /不能调用其他业务能力/)
  assert.match(decide('skill', { name: 'security-inspection' }), /不能跨能力/)
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

test('策略、应急和纳管轮次不能借故障只读编排跨域', () => {
  for (const domain of ['policy-configuration', 'emergency-action', 'asset-onboarding']) {
    const guard = createSecurityOperationsGuard({ environment: {} }), agent = roleAgent()
    guard.beginTurn(agent, '办理当前业务')
    assert.equal(guard.decide({ agent, name: 'skill', arguments: { name: domain } }), undefined)
    for (const name of troubleshooting) {
      assert.match(guard.decide({ agent, name, arguments: {} }), /不能跨入|不能调用其他业务能力/, `${domain}: ${name}`)
    }
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

test('应急确认轮次仍能查询当前操作结果', () => {
  const guard = createSecurityOperationsGuard()
  const agent = { session: { header: { delegationDepth: 0 } } }
  const operationId = `op_${'a'.repeat(32)}`
  guard.beginTurn(agent, '确认执行')
  setEmergencyConfirmationTurn(agent, true, operationId)
  try {
    assert.equal(guard.decide({ agent, name: 'mcp__emergency-action__get_emergency_action_result', arguments: { operationId } }), undefined)
  } finally {
    setEmergencyConfirmationTurn(agent, false)
  }
})

for (const identityMode of ['development', 'published']) {
  for (const moduleName of ['security-operations-guard', 'security-operations-child-guard', 'policy-configuration-guard', 'emergency-action-guard']) {
  test(`无需登录的${identityMode}实例不安装${moduleName}工具限制和 Guard`, async () => {
    const { apply, inject } = await import(`../dsh/managed/${moduleName}.mjs`)
    assert.ok(inject.includes('businessRuntime'), '须等待业务运行身份就绪再决定是否安装 Guard')
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
