import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, createSecurityOperationsGuard } from '../dsh/managed/security-operations-guard.mjs'
import { apply as applyChildGuard } from '../dsh/managed/security-operations-child-guard.mjs'

test('业务 Guard 在实际pre-step按 Agent 作用域识别 Web MCP 工具，且只冻结一次', async () => {
  const resources = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']
  const tools = new Set([...resources, 'mcp__inspection__list_executable_inspections', 'mcp__sec-ops__get_event_by_id'])
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
    [0, [...resources, 'mcp__inspection__list_executable_inspections']],
    [1, [...resources, 'mcp__sec-ops__get_event_by_id']],
  ]) {
    let allowed, restrictions = 0
    const agent = { session: { header: { delegationDepth: depth } }, ctx: { tools: { restrict({ allow }) { allowed = allow; restrictions++ } } } }
    await preStep({ agent, messages: [], step: 1 }, async () => ({ kind: 'enter' }))
    assert.deepEqual(allowed, expected)
    await preStep({ agent, messages: [], step: 2 }, async () => ({ kind: 'enter' }))
    assert.equal(restrictions, 1)
  }
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
