import assert from 'node:assert/strict'
import test from 'node:test'
import { createSecurityOperationsGuard } from '../dsh/managed/policy-configuration-guard.mjs'

const agent = () => ({ id: `policy-resolver-${Math.random()}`, session: { header: { delegationDepth: 0 } } })
const body = {
  contract_version: 'workbench-policy-endpoint-resolution/v1',
  request_id: 'resolver-request-1',
  operation: 'ADD', action: 'ALLOW',
  source_query: '基础主机', destination_query: '基础服务',
  protocol: 'TCP', destination_port: 443,
}

test('策略工具按操作名解析，不依赖 mcp__policy-configuration__ 前缀', () => {
  const guard = createSecurityOperationsGuard()
  const identity = agent()
  assert.equal(guard.decide({ name: 'mcp__policy-configuration__resolve_policy_endpoints', agent: identity, arguments: { body } }), undefined)
  assert.equal(guard.decide({ name: 'resolve_policy_endpoints', agent: identity, arguments: { body: { ...body, request_id: 'resolver-request-2' } } }), undefined)
})

test('确认/决策工具即使换前缀仍永久拒绝', () => {
  const guard = createSecurityOperationsGuard()
  for (const name of ['mcp__policy-configuration__confirm_policy_configuration', 'mcp__policy-configuration__decide_policy_configuration']) {
    assert.match(guard.decide({ name, agent: agent(), arguments: {} }), /永久禁用/)
  }
})
