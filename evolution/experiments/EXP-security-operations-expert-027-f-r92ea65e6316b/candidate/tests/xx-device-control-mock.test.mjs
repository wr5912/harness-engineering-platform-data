import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createMockDeviceService, loadCommandMap, loadFixtures } from '../dsh/managed/xx-device-control-mock.mjs'

const serverPath = fileURLToPath(new URL('../dsh/managed/xx-device-control-mock.mjs', import.meta.url))
const decode = result => JSON.parse(result.content[0].text)
const commandIdFor = name => {
  const entries = Object.entries(loadCommandMap()).filter(([, value]) => value === name)
  assert.equal(entries.length, 1, `动作${name}应有唯一ID`)
  return entries[0][0]
}

// 仅用于字符串ID回归，不给实际开发映射分配UUID或其他动作ID。
const stringIdCommandMap = Object.freeze({
  '87654321-3333-2222-1111-9876543210a1': 'UUID样式回归动作',
  '0007': '前导零回归动作',
  '7': '未补零对照动作',
  'Case-Sensitive-Id': '大小写回归动作',
  'fixture-05': '测试动作五',
  'fixture-06': '测试动作六',
  'fixture-07': '测试动作七',
  'fixture-08': '测试动作八',
  'fixture-09': '测试动作九',
  'fixture-10': '测试动作十',
  'fixture-11': '测试动作十一',
})

test('映射：11项纯字符串ID到唯一名称，工具描述从唯一配置生成', () => {
  const map = loadCommandMap()
  assert.equal(Object.keys(map).length, 11)
  assert.ok(Object.keys(map).every(id => id.length > 0))
  assert.ok(Object.values(map).every(value => typeof value === 'string' && value.length > 0))
  assert.equal(new Set(Object.values(map)).size, 11)
  const service = createMockDeviceService()
  for (const [id, name] of Object.entries(map)) {
    for (const tool of service.tools) assert.ok(tool.description.includes(`${id}=${name}`))
  }
})

test('查询：目标IP返回模拟hostId，没有设备副作用', () => {
  const service = createMockDeviceService()
  const result = service.callTool('lookup_host', { hostIp: '172.13.168.11' })
  assert.notEqual(result.isError, true)
  assert.deepEqual(decode(result), { mock: true, found: true, total: 1, hosts: [{ hostId: 'mock-host-001', hostIp: '172.13.168.11', hostName: 'XX开发模拟主机' }] })
  assert.equal(service.writes.length, 0)
  assert.equal(service.events.length, 1)
})

test('查询：无对应主机是正常空结果，不产生写入', () => {
  const service = createMockDeviceService()
  const result = service.callTool('lookup_host', { hostIp: '192.0.2.99' })
  assert.notEqual(result.isError, true)
  assert.deepEqual(decode(result), { mock: true, found: false, total: 0, hosts: [] })
  assert.equal(service.writes.length, 0)
})

test('查询：接口失败不能冒充无主机', () => {
  const service = createMockDeviceService()
  const result = service.callTool('lookup_host', { hostIp: '192.0.2.250' })
  assert.equal(result.isError, true)
  assert.equal(decode(result).code, 'QUERY_FAILED')
  assert.equal(Object.hasOwn(decode(result), 'found'), false)
  assert.equal(service.writes.length, 0)
})

test('查询：非法IP、缺参数及额外参数均拒绝', () => {
  for (const args of [{ hostIp: '999.1.1.1' }, {}, { hostIp: '172.13.168.11', extra: true }, { hostIp: null }, []]) {
    const service = createMockDeviceService()
    const result = service.callTool('lookup_host', args)
    assert.equal(result.isError, true)
    assert.equal(decode(result).code, 'INVALID_ARGUMENTS')
    assert.equal(service.writes.length, 0)
  }
})

test('查询：多个匹配完整返回，服务不替用户选设备', () => {
  const fixtures = loadFixtures()
  fixtures.hosts.push({ hostId: 'mock-host-002', hostIp: '172.13.168.11', hostName: '第二台模拟主机' })
  const service = createMockDeviceService({ fixtures })
  const result = decode(service.callTool('lookup_host', { hostIp: '172.13.168.11' }))
  assert.equal(result.total, 2)
  assert.equal(result.hosts.length, 2)
  assert.equal(service.writes.length, 0)
})

test('MCP协议：真实子进程完成初始化、发现与读工具调用', () => {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'xx-device-mock-test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lookup_host', arguments: { hostIp: '172.13.168.11' } } },
  ]
  const child = spawnSync(process.execPath, [serverPath], { input: `${messages.map(value => JSON.stringify(value)).join('\n')}\n`, encoding: 'utf8', timeout: 5000 })
  assert.equal(child.error, undefined)
  assert.equal(child.status, 0, child.stderr)
  const replies = child.stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.deepEqual(replies.map(reply => reply.id), [1, 2, 3])
  assert.equal(replies[0].result.protocolVersion, '2024-11-05')
  assert.ok(replies[1].result.tools.some(tool => tool.name === 'lookup_host'))
  assert.equal(decode(replies[2].result).hosts[0].hostId, 'mock-host-001')
  assert.equal(child.stderr.trim().split('\n').map(line => JSON.parse(line)).filter(event => event.tool === 'lookup_host').length, 1)
})

test('MCP协议：通知无回包，未知方法返回错误而不执行动作', async () => {
  const service = createMockDeviceService()
  assert.equal(await service.handleRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined)
  assert.equal((await service.handleRpc({ jsonrpc: '2.0', id: 7, method: 'not-a-method' })).error.code, -32601)
  assert.equal(service.writes.length, 0)
})

test('MCP协议：非法请求ID不能触发模拟写入', async () => {
  const service = createMockDeviceService()
  const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid: commandIdFor('重启') }
  for (const id of [null, true, {}, [], 1.25, Number.MAX_SAFE_INTEGER + 1]) {
    const response = await service.handleRpc({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'send_command', arguments: payload } })
    assert.equal(response.error.code, -32600)
    assert.equal(service.writes.length, 0)
  }
})

test('写入：只公开一读一写两个接口，仅接受三个小写字符串字段', () => {
  const service = createMockDeviceService()
  assert.deepEqual(service.tools.map(tool => tool.name), ['lookup_host', 'send_command'])
  const schema = service.tools[1].inputSchema
  assert.deepEqual([...schema.required].sort(), ['commandid', 'hostid', 'hostip'])
  assert.deepEqual(Object.keys(schema.properties).sort(), ['commandid', 'hostid', 'hostip'])
  assert.ok(Object.values(schema.properties).every(property => property.type === 'string'))
  assert.deepEqual([...schema.properties.commandid.enum].sort(), Object.keys(loadCommandMap()).sort())
  assert.equal(schema.additionalProperties, false)
})

test('写入：11项指令均使用唯一映射，三个小写字段和字符串ID原样提交且明确模拟', () => {
  const service = createMockDeviceService()
  const map = loadCommandMap()
  for (const [id, name] of Object.entries(map)) {
    const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid: id }
    const response = service.callTool('send_command', payload)
    const result = decode(response)
    assert.notEqual(response.isError, true)
    assert.equal(result.mock, true)
    assert.equal(result.status, 'SUCCESS')
    assert.equal(result.commandName, name)
    assert.equal(typeof result.executionId, 'string')
    assert.ok(result.executionId.length > 0)
    assert.match(result.message, /未操作真实设备/)
    assert.deepEqual({ hostid: result.hostid, hostip: result.hostip, commandid: result.commandid }, payload)
    for (const key of ['commandId', 'hostId', 'hostIp']) assert.equal(Object.hasOwn(result, key), false)
    assert.deepEqual(service.writes.at(-1), payload)
    assert.deepEqual(Object.keys(service.writes.at(-1)).sort(), ['commandid', 'hostid', 'hostip'])
    assert.deepEqual(service.events.at(-1).arguments, payload)
  }
  assert.equal(service.writes.length, 11)
})

test('写入：非RFC限制的UUID样式、前导零及其他字符串ID原样匹配', () => {
  const service = createMockDeviceService({ commandMap: stringIdCommandMap })
  const schema = service.tools[1].inputSchema.properties.commandid
  assert.equal(schema.type, 'string')
  assert.deepEqual([...schema.enum].sort(), Object.keys(stringIdCommandMap).sort())
  for (const [commandid, commandName] of Object.entries(stringIdCommandMap)) {
    const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid }
    const response = service.callTool('send_command', payload)
    assert.notEqual(response.isError, true)
    const result = decode(response)
    assert.equal(result.commandid, commandid)
    assert.equal(result.commandName, commandName)
    assert.deepEqual({ hostid: result.hostid, hostip: result.hostip, commandid: result.commandid }, payload)
    assert.deepEqual(service.writes.at(-1), payload)
  }
  assert.equal(service.writes.length, 11)
  for (const commandid of ['87654321-3333-2222-1111-9876543210A1', '00007', 'case-sensitive-id', ' 0007', '0007 ']) {
    assert.equal(Object.hasOwn(stringIdCommandMap, commandid), false)
    const response = service.callTool('send_command', { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid })
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
    assert.equal(service.writes.length, 11)
  }
})

test('写入：任何数字类型指令ID均拒绝，不把映射中的字符串ID转成数字', () => {
  const service = createMockDeviceService({ commandMap: stringIdCommandMap })
  // 7在本测试映射中有对应字符串键，仍不能用数字7调用。
  for (const commandid of [7, 0, -0, -7, 7.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1]) {
    const response = service.callTool('send_command', { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid })
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
    assert.equal(service.writes.length, 0)
  }
})

test('写入：未知ID、缺失参数、非字符串及额外字段均不能提交', () => {
  const map = loadCommandMap()
  let unknownId = 'unknown-command-id'
  while (Object.hasOwn(map, unknownId)) unknownId += '-'
  const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid: commandIdFor('重启') }
  for (const args of [
    { ...payload, commandid: unknownId },
    { ...payload, commandid: '' },
    { ...payload, commandid: null },
    { ...payload, commandid: true },
    { ...payload, commandid: {} },
    { ...payload, commandid: [] },
    { ...payload, actionKey: 'restart' },
    { hostip: payload.hostip, commandid: payload.commandid },
    { hostid: payload.hostid, commandid: payload.commandid },
    { hostid: payload.hostid, hostip: payload.hostip },
    { ...payload, hostid: '' },
    { ...payload, hostid: null },
    { ...payload, hostid: 7 },
    { ...payload, hostip: '999.1.1.1' },
    { ...payload, hostip: null },
    { ...payload, hostip: 7 },
    {}, [], null,
  ]) {
    const service = createMockDeviceService()
    const response = service.callTool('send_command', args)
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
    assert.equal(service.writes.length, 0)
  }
})

test('写入：旧camelCase字段及大小写混用均拒绝，不兼容旧写合同', () => {
  const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid: commandIdFor('重启') }
  const legacy = { hostId: payload.hostid, hostIp: payload.hostip, commandId: payload.commandid }
  const cases = [legacy, { ...payload, ...legacy }]
  for (const [key, legacyKey] of [['hostid', 'hostId'], ['hostip', 'hostIp'], ['commandid', 'commandId']]) {
    const renamed = { ...payload, [legacyKey]: payload[key] }
    delete renamed[key]
    cases.push(renamed, { ...payload, [legacyKey]: payload[key] })
  }
  for (const args of cases) {
    const service = createMockDeviceService()
    const response = service.callTool('send_command', args)
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'INVALID_ARGUMENTS')
    assert.equal(service.writes.length, 0)
  }
})

test('写入：合法指令下主机ID与IP不匹配返回HOST_MISMATCH，不能被未知ID掩盖', () => {
  const commandid = commandIdFor('重启')
  for (const payload of [
    { hostid: 'wrong-host', hostip: '172.13.168.11', commandid },
    { hostid: 'mock-host-001', hostip: '192.0.2.99', commandid },
  ]) {
    const service = createMockDeviceService()
    const response = service.callTool('send_command', payload)
    assert.equal(response.isError, true)
    assert.equal(decode(response).code, 'HOST_MISMATCH')
    assert.equal(service.writes.length, 0)
  }
})

test('写入：失败、未知和受理结果分别返回且不会内部自动重试', () => {
  for (const status of ['FAILED', 'UNKNOWN', 'ACCEPTED']) {
    const fixtures = loadFixtures()
    fixtures.writeOutcomes['mock-host-001'] = status
    const service = createMockDeviceService({ fixtures })
    const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid: commandIdFor('重启') }
    const response = service.callTool('send_command', payload)
    const result = decode(response)
    assert.equal(result.status, status)
    assert.equal(result.mock, true)
    assert.equal(result.commandName, '重启')
    assert.equal(typeof result.executionId, 'string')
    assert.deepEqual({ hostid: result.hostid, hostip: result.hostip, commandid: result.commandid }, payload)
    assert.equal(response.isError === true, status === 'FAILED')
    assert.deepEqual(service.writes, [payload])
    if (status === 'UNKNOWN') assert.match(result.message, /不能自动重发/)
    if (status === 'ACCEPTED') assert.match(result.message, /不代表设备执行完成/)
  }
})

test('MCP写入：相同请求ID重放只产生一次模拟提交，改参数复用ID被拒绝', async () => {
  const service = createMockDeviceService()
  const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid: commandIdFor('重启') }
  const request = { jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 'send_command', arguments: payload } }
  const first = await service.handleRpc(request)
  assert.equal(decode(first.result).commandid, payload.commandid)
  assert.deepEqual(await service.handleRpc(structuredClone(request)), first)
  assert.deepEqual(service.writes, [payload])
  const changed = structuredClone(request)
  changed.params.arguments.commandid = commandIdFor('关机')
  assert.equal((await service.handleRpc(changed)).error.code, -32600)
  assert.equal(service.writes.length, 1)
  // 新请求并不是同一网络重放，不能按三参数永久封禁合法的新操作。
  assert.equal(decode((await service.handleRpc({ ...request, id: 43 })).result).status, 'SUCCESS')
  assert.deepEqual(service.writes, [payload, payload])
})

test('MCP写入：真实子进程查询后写入，传输重放不重复记录', () => {
  const payload = { hostid: 'mock-host-001', hostip: '172.13.168.11', commandid: commandIdFor('重启') }
  const request = { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'send_command', arguments: payload } }
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'xx-device-write-test', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lookup_host', arguments: { hostIp: '172.13.168.11' } } },
    request, structuredClone(request),
  ]
  const child = spawnSync(process.execPath, [serverPath], { input: `${messages.map(value => JSON.stringify(value)).join('\n')}\n`, encoding: 'utf8', timeout: 5000 })
  assert.equal(child.error, undefined)
  assert.equal(child.status, 0, child.stderr)
  const replies = child.stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.equal(replies[1].result.tools.length, 2)
  assert.equal(decode(replies[2].result).hosts[0].hostId, payload.hostid)
  const result = decode(replies[3].result)
  assert.deepEqual({ hostid: result.hostid, hostip: result.hostip, commandid: result.commandid }, payload)
  assert.equal(result.commandName, '重启')
  assert.deepEqual(replies[3], replies[4])
  const events = child.stderr.trim().split('\n').map(line => JSON.parse(line))
  assert.equal(events.filter(event => event.tool === 'lookup_host').length, 1)
  const writes = events.filter(event => event.tool === 'send_command')
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].arguments, payload)
})
