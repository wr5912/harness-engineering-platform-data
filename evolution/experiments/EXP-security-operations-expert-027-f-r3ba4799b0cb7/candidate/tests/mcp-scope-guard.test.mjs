import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { apply, createSecurityOperationsGuard } from '../dsh/managed/security-operations-guard.mjs'
import { apply as applyChildGuard } from '../dsh/managed/security-operations-child-guard.mjs'

const troubleshootingRaw = [
  'diagnose_business_access', 'diagnose_device_offline',
  'get_composition_run', 'get_composition_artifact', 'get_composition_details',
]
const troubleshooting = troubleshootingRaw.map(raw => `mcp__troubleshooting-compositions__${raw}`)

test('新实例故障连接引用完整平台分组及公开原名，不恢复旧Java连接', async () => {
  const seed = await readFile(new URL('../dsh/managed/web-profile.seed.patch.yml', import.meta.url), 'utf8')
  const block = seed.match(/^      - id: troubleshooting-compositions\n[\s\S]*?(?=^      - id:|^      groups:)/mu)?.[0]
  assert.ok(block)
  assert.match(block, /^        serverName: troubleshooting-compositions$/mu)
  const inspection = seed.match(/^      - id: inspection-compositions\n[\s\S]*?^        url: (\S+)$/mu)?.[1]
  const endpoint = block.match(/^        url: (\S+)$/mu)?.[1]
  assert.ok(inspection)
  assert.equal(endpoint, inspection.replace(/\/inspection-compositions\/v2$/u, '/troubleshooting-compositions/v2'))
  const names = block.split('          names:\n')[1].trim().split('\n').map(line => line.trim().replace(/^- /u, ''))
  assert.deepEqual(names, troubleshootingRaw)
  assert.doesNotMatch(block, /mcp__/u)
  assert.doesNotMatch(seed, /^      - id: troubleshooting$/mu)
  assert.doesNotMatch(seed, /\/mcp\/troubleshooting(?:\s|$)/u)
})

test('业务 Guard 在实际pre-step按 Agent 作用域识别 Web MCP 工具，且按当前目录刷新', async () => {
  const resources = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']
  const tools = new Set([...resources, 'mcp__inspection-compositions__get_composition_run', ...troubleshooting, 'mcp__troubleshooting__list_troubleshooting_playbooks', 'mcp__sec-ops__get_event_by_id'])
  let preStep
  apply({
    mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
    tools: {
      guard() {},
      get(name, agent) { return agent && tools.has(name) ? {} : undefined },
    },
  })
  for (const [depth, expected] of [
    [0, [...resources, 'mcp__inspection-compositions__get_composition_run', ...troubleshooting]],
    [1, [...resources, 'mcp__sec-ops__get_event_by_id']],
  ]) {
    let allowed, restrictions = 0
    const agent = { session: { header: { delegationDepth: depth } }, ctx: { tools: { restrict({ allow }) { allowed = allow; restrictions++ } } } }
    await preStep({ agent, messages: [], step: 1 }, async () => ({ kind: 'enter' }))
    assert.deepEqual(allowed, expected)
    await preStep({ agent, messages: [], step: 2 }, async () => ({ kind: 'enter' }))
    assert.equal(restrictions, 2)
  }
})

test('故障组合沿实际注册名只加一次namespace，迟到挂载可刷新且子角色不继承', async () => {
  // 仅本地目录/权限假对象；不执行组合、不访问MCP或其他外部服务。
  const hooks = new Map(), mounted = new Set(), resolveCalls = []
  const actual = new Map(troubleshootingRaw.map(raw => [`troubleshooting-compositions/${raw}`, `mcp__mounted-fault-v2__${raw}`]))
  actual.set('sec-ops/get_event_by_id', 'mcp__mounted-soc-v2__get_event_by_id')
  let decide
  apply({
    get: () => ({ requiresAuthentication: () => true }),
    mcpSessionManager: {
      resolveTool(source, raw) {
        assert.equal(raw.startsWith('mcp__'), false, '公开原名不能预加namespace')
        resolveCalls.push([source, raw])
        return actual.get(`${source}/${raw}`)
      },
      sourceStatus: () => ({ configured: false }),
    },
    on(event, callback) { hooks.set(event, callback) },
    tools: { get: name => mounted.has(name) ? {} : undefined, guard: callback => { decide = callback } },
    logger: { warn() {} },
  })
  const target = depth => {
    const agent = { session: { header: { delegationDepth: depth }, snapshotEvents: () => [] }, allowed: [], active: 0 }
    agent.ctx = { tools: { restrict({ allow }) {
      agent.allowed = allow; agent.active++
      return () => { agent.active-- }
    } } }
    return agent
  }
  const parent = target(0), child = target(1)
  hooks.get('agent/created')({ agent: parent })
  assert.deepEqual(parent.allowed, [], '静态接线不是实际加载证明')
  for (const name of actual.values()) mounted.add(name)
  await hooks.get('agent/pre-step')({ agent: parent, messages: [], step: 1 }, async () => {})
  assert.deepEqual(parent.allowed, troubleshootingRaw.map(raw => actual.get(`troubleshooting-compositions/${raw}`)))
  assert.equal(parent.active, 1, '目录刷新替换原限制，不累积')
  for (const raw of troubleshootingRaw) {
    assert.equal(decide({ agent: parent, name: actual.get(`troubleshooting-compositions/${raw}`), arguments: {} }), undefined)
    assert.ok(decide({ agent: parent, name: `mcp__troubleshooting-compositions__${raw}`, arguments: {} }), '未实际注册的稳定名不可绕过身份映射')
  }
  hooks.get('agent/created')({ agent: child })
  assert.deepEqual(child.allowed, [actual.get('sec-ops/get_event_by_id')])
  for (const raw of troubleshootingRaw) {
    assert.match(decide({ agent: child, name: actual.get(`troubleshooting-compositions/${raw}`), arguments: {} }), /只能由主 Agent/)
  }
  assert.ok(resolveCalls.some(([source, raw]) => source === 'troubleshooting-compositions' && raw === 'diagnose_business_access'))
  assert.ok(resolveCalls.every(([, raw]) => !raw.startsWith('mcp__')))
})

test('故障子 Agent 按实际注册名授权，能力缺失和旧名均拒绝', async () => {
  let preStep, decide, allowed
  const registered = 'mcp__sec-ops-renamed__get_event_by_id'
  const agent = { ctx: { tools: { restrict({ allow }) { allowed = allow } } } }
  applyChildGuard({
    mcpSessionManager: { resolveTool: (source, raw) => source === 'sec-ops' && raw === 'get_event_by_id' ? registered : undefined },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
    tools: { get: name => name === registered ? {} : undefined, guard: callback => { decide = callback } },
  }, { role: 'fault' })
  await preStep({ agent }, async () => ({ kind: 'enter' }))
  assert.deepEqual(allowed, [registered])
  assert.equal(decide({ name: registered, agent }), undefined)
  assert.match(decide({ name: 'mcp__sec-ops__get_event_by_id', agent }), /未授权/)
  assert.match(decide({ name: 'mcp__sec-ops__search_graph_assets', agent }), /未授权/)
})

test('资源工具可调用，业务工具限制继续生效', () => {
  const guard = createSecurityOperationsGuard()
  for (const delegationDepth of [0, 1]) {
    const agent = { session: { header: { delegationDepth } } }
    for (const name of ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']) {
      assert.equal(guard.decide({ name, agent, arguments: { server: 'fixture', uri: 'fixture://data' } }), undefined)
    }
    assert.ok(guard.decide({ name: 'mcp__unknown__write', agent, arguments: {} }))
    assert.ok(guard.decide({ name: 'bash', agent, arguments: {} }))
  }
  assert.match(guard.decide({ name: 'read_mcp_resource', agent: { session: { header: { delegationDepth: 2 } } }, arguments: {} }), /主 Agent 或子 Agent/)
})

test('主 Agent 直接读取已发现事实，不委派；故障子角色和写入边界保持原有约束', async () => {
  const guard = createSecurityOperationsGuard()
  const agent = { session: { header: { delegationDepth: 0 } } }
  for (const raw of ['list_soc_asset', 'get_soc_asset_by_asset_id', 'get_soc_asset_vulnerabilities', 'get_admin_baseline_report_latest', 'get_graph_path_query']) {
    assert.equal(guard.decide({ name: `mcp__soc-readonly__${raw}`, agent, arguments: {} }), undefined)
  }
  assert.ok(guard.decide({ name: 'mcp__soc-readonly__create_soc_asset', agent, arguments: {} }))
  assert.ok(guard.decide({ name: 'mcp__sec-ops__get_soc_asset_by_asset_id', agent, arguments: {} }))
  assert.equal(guard.decide({ name: 'mcp__sec-ops__get_soc_asset_by_asset_id', agent: { session: { header: { delegationDepth: 1 } } }, arguments: {} }), undefined)
})

test('原生作用域restrict不可用时保留逐调用Guard边界', async () => {
  let preStep, decide
  const agent = { session: { header: { delegationDepth: 0 } }, ctx: { tools: { restrict() { throw new Error('scoped tool restriction unavailable') } } } }
  apply({
    mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
    tools: { get: () => undefined, guard: callback => { decide = callback } },
    logger: { warn() {} },
  })
  await preStep({ agent, messages: [], step: 1 }, async () => ({ kind: 'enter' }))
  assert.equal(decide({ name: 'list_mcp_resources', agent, arguments: {} }), undefined)
  assert.ok(decide({ name: 'mcp__unknown__write', agent, arguments: {} }))
  assert.ok(decide({ name: 'mcp__policy-configuration__confirm_policy_configuration', agent, arguments: {} }))
})

test('首次挂载推迟restrict仍冻结本轮DENY；挂载完成和后续ALLOW轮次不丢失或沿用旧约束', async () => {
  let preStep, decide, resolverReady = false
  const resolver = 'mcp__policy-configuration__resolve_policy_endpoints'
  const agent = { session: { header: { delegationDepth: 0 }, snapshotEvents: () => [] }, ctx: { tools: { restrict() {} } } }
  apply({
    mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
    tools: { get: name => name === resolver && !resolverReady ? undefined : {}, guard: callback => { decide = callback } },
    logger: { warn() {} },
  })
  const step = (number, text) => preStep({ agent, step: number, messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text }] }] }, async () => ({ kind: 'enter' }))
  let requestId = 'basic-request-1'
  const args = action => ({ body: { contract_version: 'workbench-policy-endpoint-resolution/v1', request_id: requestId, operation: 'ADD', action,
    source_query: 'basic-source', destination_query: 'basic-destination', protocol: 'TCP', destination_port: 443 } })
  const allowed = action => decide({ name: resolver, agent, arguments: args(action) })
  await step(1, '新增策略，阻断基础主机到基础服务的TCP 443访问')
  assert.equal(decide({ name: 'skill', agent, arguments: { name: 'policy-configuration' } }), undefined)
  assert.match(allowed('ALLOW'), /阻断/)
  assert.equal(allowed('DENY'), undefined)
  resolverReady = true
  await step(2, '新增策略，阻断基础主机到基础服务的TCP 443访问')
  assert.match(allowed('ALLOW'), /阻断/)
  assert.equal(allowed('DENY'), undefined)
  await step(1, '新增策略，允许基础主机到基础服务的TCP 443访问')
  requestId = 'basic-request-2'
  assert.match(allowed('DENY'), /允许/)
  assert.equal(allowed('ALLOW'), undefined)
  assert.ok(decide({ name: 'mcp__unknown__write', agent, arguments: {} }))
  assert.ok(decide({ name: 'mcp__policy-configuration__confirm_policy_configuration', agent, arguments: {} }))
})

for (const moduleName of ['security-operations-guard', 'security-operations-child-guard', 'policy-configuration-guard', 'emergency-action-guard']) {
  test(`${moduleName} 在访问配置同步为匿名后解除已有限制`, async () => {
    const { apply } = await import(`../dsh/managed/${moduleName}.mjs`)
    let authentication = true, decide, postExecute, active = 0
    const hooks = new Map()
    const agent = { session: { header: { delegationDepth: 0 } }, ctx: { tools: {
      restrict() { active++; return () => { active-- } },
    } } }
    apply({
      get: () => ({ requiresAuthentication: () => authentication }),
      mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}`, sourceStatus: () => ({ configured: false }) },
      tools: { get: () => ({}), guard: callback => { decide = callback } },
      on(event, callback) { hooks.set(event, callback); if (event === 'tools/post-execute') postExecute = callback },
    }, { role: 'fault' })
    hooks.get('agent/created')?.({ agent })
    await hooks.get('agent/pre-step')?.({ agent, step: 1, messages: [] }, async () => 'next')
    assert.ok(active > 0)
    authentication = false
    assert.equal(await hooks.get('agent/pre-step')({ agent, step: 2, messages: [] }, async () => 'next'), 'next')
    assert.equal(active, 0)
    assert.equal(decide({ agent, name: 'mcp__fixture__healthy', arguments: {} }), undefined)
    if (postExecute) assert.equal(await postExecute({ agent, name: 'mcp__fixture__healthy' }, {}, async () => 'next'), 'next')
  })
}

test('迟到的 MCP 巡检工具可见且旧限制被替换，不累积限制', async () => {
  const inspection = 'mcp__inspection-compositions__inspection_routine'
  const tools = new Set(['skill'])
  let preStep, allowed, active = 0
  const agent = { session: { header: { delegationDepth: 0 } }, ctx: { tools: {
    restrict({ allow }) { allowed = allow; active++; return () => { active-- } },
  } } }
  apply({
    get: () => ({ requiresAuthentication: () => true }),
    mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` },
    tools: { get: name => tools.has(name) && (!active || allowed.includes(name)) ? {} : undefined, guard() {} },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
  })
  await preStep({ agent, step: 1, messages: [] }, async () => {})
  assert.equal(allowed.includes(inspection), false)
  tools.add(inspection)
  await preStep({ agent, step: 2, messages: [] }, async () => {})
  assert.equal(allowed.includes(inspection), true)
  assert.equal(active, 1)
})
