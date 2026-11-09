import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, createSecurityOperationsGuard } from '../dsh/managed/security-operations-guard.mjs'
import { apply as applyChildGuard } from '../dsh/managed/security-operations-child-guard.mjs'

test('主会话使用原生deny保留新绑定，子角色仍按原allow收紧且只限制一次', async () => {
  const resources = ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource']
  const tools = new Set([...resources, 'bash', 'ask_user_question', 'mcp__xx-bound__new_tool', 'mcp__sec-ops__get_event_by_id'])
  let preStep
  apply({
    mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
    tools: { guard() {}, get(name, agent) { return agent && tools.has(name) ? {} : undefined } },
  })
  for (const depth of [0, 1]) {
    let restriction, restrictions = 0
    const agent = { session: { header: { delegationDepth: depth } }, ctx: { tools: { restrict(value) { restriction = value; restrictions++ } } } }
    await preStep({ agent, messages: [], step: 1 }, async () => ({ kind: 'enter' }))
    if (depth === 0) {
      assert.deepEqual(restriction, { deny: ['bash', 'mcp__sec-ops__get_event_by_id'] })
    } else {
      assert.deepEqual(restriction, { allow: [...resources, 'mcp__sec-ops__get_event_by_id'] })
    }
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

test('新增MCP按当次真实注册目录可用，不需要改固定工具名；子角色和旧禁止入口仍拒绝', async () => {
  let preStep, decide
  const registered = new Set()
  const tool = 'mcp__xx-bound__new_tool'
  const agent = { session: { header: { delegationDepth: 0 } }, ctx: { tools: { restrict(value) { assert.ok(value.deny); assert.equal(value.allow, undefined) } } } }
  apply({
    mcpSessionManager: { resolveTool: (source, raw) => `mcp__${source}__${raw}` },
    on(event, callback) { if (event === 'agent/pre-step') preStep = callback },
    tools: { get: name => registered.has(name) ? {} : undefined, guard: callback => { decide = callback } },
    logger: { warn() {} },
  })
  await preStep({ agent, step: 1, messages: [] }, async () => ({ kind: 'enter' }))
  assert.match(decide({ name: tool, agent, arguments: {} }), /未列入/)
  registered.add(tool)
  assert.equal(decide({ name: tool, agent, arguments: {} }), undefined)
  assert.equal(decide({ name: 'ask_user_question', agent, arguments: {} }), undefined)
  assert.match(decide({ name: tool, agent: { session: { header: { delegationDepth: 1 } } }, arguments: {} }), /子角色/)
  registered.add('mcp__policy-configuration__confirm_policy_configuration')
  assert.match(decide({ name: 'mcp__policy-configuration__confirm_policy_configuration', agent, arguments: {} }), /永久禁用/)
  assert.ok(decide({ name: 'mcp__unknown__write', agent, arguments: {} }))
})
