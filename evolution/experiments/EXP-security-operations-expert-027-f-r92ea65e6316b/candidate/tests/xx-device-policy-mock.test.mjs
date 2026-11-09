import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createMockPolicyService, loadFixtures, policyMapFields } from '../dsh/managed/xx-device-policy-mock.mjs'

const serverPath = fileURLToPath(new URL('../dsh/managed/xx-device-policy-mock.mjs', import.meta.url))
const decode = result => JSON.parse(result.content[0].text)
const mapNames = Object.keys(policyMapFields)
const payload = (changes = { '设备控制': { '无线网卡': '1' } }) => ({ hostid: 'mock-policy-host-001', hostip: '172.163.12.1', '设备控制': {}, login: {}, net: {}, ...changes })
const increments = () => [
  payload({ '设备控制': { '光驱': '3', 'USB存储设备': '3' } }),
  payload({ login: { oscreenoff: '-1', osuer: '1' } }),
  payload({ net: { control: '1', sourceip: '179.16.1.1/24', sourceport: '80,1-20', targetip: '179.16.1.1', targetport: '80,1-20' } }),
]

test('策略工具身份独立，五字段严格且三个Map共6+8+10个可选字符串字段', () => {
  const service = createMockPolicyService()
  assert.deepEqual(service.tools.map(tool => tool.name), ['read_policy_template', 'write_policy_template'])
  const readSchema = service.tools[0].inputSchema
  assert.deepEqual(readSchema.required, ['hostip'])
  assert.deepEqual(Object.keys(readSchema.properties), ['hostip'])
  assert.equal(readSchema.additionalProperties, false)
  const schema = service.tools[1].inputSchema
  assert.deepEqual(schema.required, ['hostid', 'hostip', '设备控制', 'login', 'net'])
  assert.deepEqual(Object.keys(schema.properties), schema.required)
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(mapNames.map(map => Object.keys(schema.properties[map].properties).length), [6, 8, 10])
  for (const [map, fields] of Object.entries(policyMapFields)) {
    const value = schema.properties[map]
    assert.equal(value.type, 'object')
    assert.equal(value.additionalProperties, false)
    assert.deepEqual(value.required ?? [], [])
    assert.deepEqual(value.properties, fields)
    for (const field of Object.values(value.properties)) assert.equal(field.type, 'string')
  }
})

test('读取：返回主机与完整三个Map和Mock默认值，未找到返回found:false', () => {
  const service = createMockPolicyService()
  const host = loadFixtures().hosts[0]
  assert.equal(host.hostid, 'mock-policy-host-001')
  assert.equal(host.hostip, '172.163.12.1')
  assert.deepEqual(decode(service.callTool('read_policy_template', { hostip: host.hostip })), { mock: true, found: true, ...host })
  for (const map of mapNames) assert.deepEqual(Object.keys(host[map]), Object.keys(service.tools[1].inputSchema.properties[map].properties))
  assert.deepEqual(Object.values(host['设备控制']), Array(6).fill('2'))
  assert.deepEqual(Object.values(host.login), Array(8).fill('0'))
  assert.deepEqual(host.net, { rulename: '阻断', control: '0', index: '1', action: 'deny', proctocol: 'tcp', sourceip: '179.16.1.1/24', sourceport: '80,1-20', targetip: '12.1.1.3', targetport: '80,1-20', reserved: '2' })
  assert.deepEqual(decode(service.callTool('read_policy_template', { hostip: '192.0.2.99' })), { mock: true, found: false })
  assert.equal(service.writes.length, 0)
})

test('从工具schema派生全部字段允许值和type校验，拒绝数字与非法枚举', () => {
  const service = createMockPolicyService()
  const schema = service.tools[1].inputSchema
  const host = loadFixtures().hosts[0]
  for (const map of mapNames) {
    for (const [key, field] of Object.entries(schema.properties[map].properties)) {
      assert.equal(field.type, 'string')
      for (const value of field.enum ?? [host[map][key]]) {
        assert.equal(typeof value, 'string')
        const response = service.callTool('write_policy_template', payload({ [map]: { [key]: value } }))
        assert.notEqual(response.isError, true, `${map}.${key}=${value}`)
        assert.deepEqual(decode(response), { mock: true, success: true, message: '模拟下发成功' })
      }
      const writes = service.writes.length
      for (const value of field.enum ? [1, '__invalid__'] : [1]) {
        const response = service.callTool('write_policy_template', payload({ [map]: { [key]: value } }))
        assert.equal(response.isError, true, `${map}.${key}=${value}`)
        assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
      }
      assert.equal(service.writes.length, writes)
    }
  }
  for (const key of ['光驱', 'USB存储设备']) assert.ok(schema.properties['设备控制'].properties[key].enum.includes('3'))
  assert.equal(schema.properties['设备控制'].properties['无线网卡'].enum.includes('3'), false)
})

test('三个Map分别增量写：支持多项和只读，端口/CIDR原样记录且不修改fixture', () => {
  const fixtures = loadFixtures()
  const original = structuredClone(fixtures)
  const service = createMockPolicyService({ fixtures })
  const args = increments()
  for (const [index, value] of args.entries()) {
    const response = service.callTool('write_policy_template', value)
    assert.notEqual(response.isError, true)
    assert.deepEqual(decode(response), { mock: true, success: true, message: '模拟下发成功' })
    assert.deepEqual(Object.keys(service.writes[index]), ['hostid', 'hostip', '设备控制', 'login', 'net'])
    for (const map of mapNames.filter(map => map !== mapNames[index])) assert.deepEqual(service.writes[index][map], {})
  }
  assert.deepEqual(service.writes, args)
  assert.deepEqual(service.events, args.map(value => ({ mock: true, tool: 'write_policy_template', arguments: value, outcome: 'SUCCESS' })))
  assert.equal(service.writes[2].net.sourceip, '179.16.1.1/24')
  assert.equal(service.writes[2].net.targetip, '179.16.1.1')
  assert.equal(service.writes[2].net.sourceport, '80,1-20')
  assert.equal(service.writes[2].net.targetport, '80,1-20')
  assert.deepEqual(fixtures, original)
  assert.deepEqual(decode(service.callTool('read_policy_template', { hostip: args[0].hostip })), { mock: true, found: true, ...original.hosts[0] })
  args[0]['设备控制']['光驱'] = '1'
  assert.equal(service.writes[0]['设备控制']['光驱'], '3')
})

test('拒绝旧map1/2/3、未知字段、空改动及主机配对错误，不记录写入', () => {
  const service = createMockPolicyService()
  for (const args of [{}, { hostip: '999.1.1.1' }, { hostip: '172.163.12.1', extra: true }, { hostip: 7 }]) {
    const response = service.callTool('read_policy_template', args)
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
  }
  const { net, ...missingMap } = payload()
  for (const args of [
    missingMap,
    { ...payload(), extra: true },
    { ...payload(), hostid: 7 },
    { ...payload(), hostid: '' },
    { ...payload(), hostip: 'bad-ip' },
    payload({}),
    payload({ '设备控制': { '无线网卡': '3' } }),
    ...mapNames.map(map => payload({ [map]: { unknown: '1' } })),
    payload({ '设备控制': [] }),
    payload({ login: null }),
    payload({ net: 7 }),
    { hostid: 'mock-policy-host-001', hostip: '172.163.12.1', map1: { wireless: '1' }, map2: {}, map3: {} },
    ...['map1', 'map2', 'map3'].map(map => ({ ...payload(), [map]: {} })),
    payload({ net: { protocol: 'tcp' } }),
    payload({ login: { ouser: '1' } }),
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
