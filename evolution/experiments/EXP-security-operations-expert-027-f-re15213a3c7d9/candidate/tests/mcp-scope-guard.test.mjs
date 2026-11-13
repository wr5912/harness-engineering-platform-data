import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, createSecurityOperationsGuard } from '../dsh/managed/security-operations-guard.mjs'
import { apply as applyChildGuard } from '../dsh/managed/security-operations-child-guard.mjs'

test('业务 Guard 按实际注册工具隔离角色，每步释放并刷新作用域限制', async () => {
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
    [0, { deny: ['mcp__sec-ops__get_event_by_id'] }],
    [1, { allow: [...resources, 'mcp__sec-ops__get_event_by_id'] }],
  ]) {
    let restriction, restrictions = 0, released = 0
    const agent = { session: { header: { delegationDepth: depth } }, ctx: { tools: { restrict(value) { restriction = value; restrictions++; return () => released++ } } } }
    await preStep({ agent, messages: [], step: 1 }, async () => ({ kind: 'enter' }))
    assert.deepEqual(restriction, expected)
    await preStep({ agent, messages: [], step: 2 }, async () => ({ kind: 'enter' }))
    assert.equal(restrictions, 2)
    assert.equal(released, 1)
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

test('后挂载的普通 MCP 仅在真实注册后向主会话开放，不扩大子角色权限', async () => {
  let preStep, decide, resolverReady = false
  const resolver = 'mcp__new-source__query'
  const agent = { session: { header: { delegationDepth: 0 }, snapshotEvents: () => [] }, ctx: { tools: { restrict() {} } } }
  apply({
    mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
    tools: { get: name => name === resolver && resolverReady ? {} : undefined, guard: callback => { decide = callback } },
    logger: { warn() {} },
  })
  const step = (number, text) => preStep({ agent, step: number, messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text }] }] }, async () => ({ kind: 'enter' }))
  const allowed = () => decide({ name: resolver, agent, arguments: {} })
  await step(1, '查询事件')
  assert.match(allowed(), /真实注册目录/)
  resolverReady = true
  await step(2, '查询事件')
  assert.equal(allowed(), undefined)
  assert.match(decide({ name: resolver, agent: { session: { header: { delegationDepth: 1 } } } }), /当前子角色/)
  resolverReady = false
  await step(1, '下一轮查询')
  assert.match(allowed(), /真实注册目录/)
  assert.ok(decide({ name: 'mcp__unknown__write', agent, arguments: {} }))
  assert.ok(decide({ name: 'mcp__policy-configuration__confirm_policy_configuration', agent, arguments: {} }))
})
