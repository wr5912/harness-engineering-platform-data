import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createMockPolicyService, loadFixtures } from '../dsh/managed/xx-device-policy-mock.mjs'

const serverPath = fileURLToPath(new URL('../dsh/managed/xx-device-policy-mock.mjs', import.meta.url))
const decode = result => JSON.parse(result.content[0].text)
const payload = () => ({ hostid: 'mock-policy-host-001', hostip: '172.163.12.1', map1: { wireless: '1' }, map2: {}, map3: {} })

test('策略工具身份独立，五字段严格且三个map仅允许可选占位键', () => {
  const service = createMockPolicyService()
  assert.deepEqual(service.tools.map(tool => tool.name), ['read_policy_template', 'write_policy_template'])
  const readSchema = service.tools[0].inputSchema
  assert.deepEqual(readSchema.required, ['hostip'])
  assert.deepEqual(Object.keys(readSchema.properties), ['hostip'])
  assert.equal(readSchema.additionalProperties, false)
  const schema = service.tools[1].inputSchema
  assert.deepEqual(schema.required, ['hostid', 'hostip', 'map1', 'map2', 'map3'])
  assert.deepEqual(Object.keys(schema.properties), schema.required)
  assert.equal(schema.additionalProperties, false)
  for (const [map, key] of [['map1', 'wireless'], ['map2', 'option2'], ['map3', 'option3']]) {
    const value = schema.properties[map]
    assert.equal(value.type, 'object')
    assert.equal(value.additionalProperties, false)
    assert.deepEqual(Object.keys(value.properties), [key])
    assert.deepEqual(value.required ?? [], [])
    assert.equal(value.properties[key].type, 'string')
    assert.deepEqual(value.properties[key].enum, ['1', '2'])
  }
})

test('读取：返回主机与三个map，未找到可正常返回found:false', () => {
  const service = createMockPolicyService()
  const host = loadFixtures().hosts[0]
  assert.deepEqual(decode(service.callTool('read_policy_template', { hostip: host.hostip })), { mock: true, found: true, ...host })
  assert.deepEqual(host.map1, { wireless: '2' })
  assert.deepEqual(host.map2, { option2: '2' })
  assert.deepEqual(host.map3, { option3: '2' })
  assert.deepEqual(decode(service.callTool('read_policy_template', { hostip: '192.0.2.99' })), { mock: true, found: false })
  assert.equal(service.writes.length, 0)
})

test('增量写：只记录本次五字段，返回模拟成功且不修改fixture模板', () => {
  const fixtures = loadFixtures()
  const original = structuredClone(fixtures)
  const service = createMockPolicyService({ fixtures })
  const args = payload()
  const response = service.callTool('write_policy_template', args)
  assert.notEqual(response.isError, true)
  assert.deepEqual(decode(response), { mock: true, success: true, message: '模拟下发成功' })
  assert.deepEqual(service.writes, [args])
  assert.deepEqual(Object.keys(service.writes[0]), ['hostid', 'hostip', 'map1', 'map2', 'map3'])
  assert.deepEqual(service.events[0], { mock: true, tool: 'write_policy_template', arguments: args, outcome: 'SUCCESS' })
  assert.deepEqual(fixtures, original)
  assert.deepEqual(decode(service.callTool('read_policy_template', { hostip: args.hostip })).map1, { wireless: '2' })
  args.map1.wireless = '2'
  assert.deepEqual(service.writes[0].map1, { wireless: '1' })
})

test('拒绝基本非法参数、空改动及主机配对错误，不记录写入', () => {
  const service = createMockPolicyService()
  for (const args of [{}, { hostip: '999.1.1.1' }, { hostip: '172.163.12.1', extra: true }, { hostip: 7 }]) {
    const response = service.callTool('read_policy_template', args)
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
  }
  const { map3, ...missingMap } = payload()
  for (const args of [
    missingMap,
    { ...payload(), extra: true },
    { ...payload(), hostid: 7 },
    { ...payload(), hostip: 'bad-ip' },
    { ...payload(), map1: {} },
    { ...payload(), map1: { wireless: 1 } },
    { ...payload(), map1: { wireless: '3' } },
    { ...payload(), map1: { unknown: '1' } },
    { ...payload(), map2: { option3: '1' } },
    { ...payload(), map3: [] },
    null,
  ]) {
    const response = service.callTool('write_policy_template', args)
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
  }
  for (const args of [{ ...payload(), hostid: 'other-host' }, { ...payload(), hostip: '192.0.2.99' }]) {
    const response = service.callTool('write_policy_template', args)
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'HOST_MISMATCH')
  }
  assert.equal(service.writes.length, 0)
})

test('MCP：通知不分发写入，非法id在dispatch前拒绝', async () => {
  const service = createMockPolicyService()
  const request = { jsonrpc: '2.0', method: 'tools/call', params: { name: 'write_policy_template', arguments: payload() } }
  assert.equal(await service.handleRpc(request), undefined)
  for (const id of [null, true, {}, [], 1.25, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await service.handleRpc({ ...request, id })).error.code, -32600)
  }
  assert.deepEqual((await service.handleRpc({ jsonrpc: '2.0', id: 'ping', method: 'ping' })).result, {})
  assert.equal((await service.handleRpc({ jsonrpc: '2.0', id: 7, method: 'unknown' })).error.code, -32601)
  assert.equal(service.writes.length, 0)
  assert.equal(service.events.length, 0)
})

test('MCP实际stdio子进程：初始化、两工具发现、读取及增量写成功', () => {
  const args = payload()
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'xx-policy-mock-test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_policy_template', arguments: { hostip: args.hostip } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'write_policy_template', arguments: args } },
  ]
  const child = spawnSync(process.execPath, [serverPath], { input: `${messages.map(value => JSON.stringify(value)).join('\n')}\n`, encoding: 'utf8', timeout: 5000 })
  assert.equal(child.error, undefined)
  assert.equal(child.status, 0, child.stderr)
  const replies = child.stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(replies.map(reply => reply.id), [1, 2, 3, 4])
  assert.equal(replies[0].result.protocolVersion, '2024-11-05')
  assert.equal(replies[0].result.serverInfo.name, 'xx-policy-mock')
  assert.deepEqual(replies[1].result.tools.map(tool => tool.name), ['read_policy_template', 'write_policy_template'])
  assert.deepEqual(decode(replies[2].result), { mock: true, found: true, ...loadFixtures().hosts[0] })
  assert.deepEqual(decode(replies[3].result), { mock: true, success: true, message: '模拟下发成功' })
  const events = child.stderr.trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(events, [
    { mock: true, tool: 'read_policy_template', arguments: { hostip: args.hostip }, outcome: 'FOUND' },
    { mock: true, tool: 'write_policy_template', arguments: args, outcome: 'SUCCESS' },
  ])
})
