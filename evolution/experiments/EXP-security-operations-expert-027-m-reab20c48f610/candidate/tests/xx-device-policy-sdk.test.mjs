import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// 从目标DSH现有桥接包解析公开SDK；不安装依赖、不固定开发机路径。
// DSH_MCP_BRIDGE_PACKAGE 指向已安装的 @deepseek-ai/dsh-mcp-client/package.json。
const packagePath = process.env.DSH_MCP_BRIDGE_PACKAGE
const serverPath = fileURLToPath(new URL('../dsh/managed/xx-device-policy-mock.mjs', import.meta.url))

for (const mode of ['legacy', 'auto']) {
  test(`官方MCP SDK：${mode}协商、独立策略工具发现与增量读写`, { skip: !packagePath && '未指定已安装DSH MCP桥接包；不代表SDK兼容性通过', timeout: 15000 }, async () => {
    const require = createRequire(packagePath)
    const { Client } = require('@modelcontextprotocol/client')
    const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')
    const client = new Client({ name: 'xx-device-policy-sdk-validation', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode, probe: { timeoutMs: 3000, maxRetries: 0 } } })
    const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], stderr: 'pipe' })
    let audit = ''
    let payload
    transport.stderr.on('data', chunk => { audit += chunk.toString() })
    try {
      await client.connect(transport, { timeout: 5000 })
      const catalog = await client.listTools()
      assert.deepEqual(catalog.tools.map(tool => tool.name), ['read_policy_template', 'write_policy_template'])
      const schema = catalog.tools[1].inputSchema
      assert.deepEqual(schema.required, ['hostid', 'hostip', '设备控制', 'login', 'net'])
      assert.deepEqual(Object.keys(schema.properties), schema.required)
      assert.equal(schema.additionalProperties, false)
      assert.deepEqual(Object.keys(schema.properties['设备控制'].properties), ['蓝牙设备', '光驱', '串口', '无线网卡', '打印设备', 'USB存储设备'])
      assert.deepEqual(Object.keys(schema.properties.login.properties), ['alogin', 'oscreenoff', 'ltype', 'man', 'finger', 'sm', 'trust', 'osuer'])
      assert.deepEqual(Object.keys(schema.properties.net.properties), ['rulename', 'control', 'index', 'action', 'proctocol', 'sourceip', 'sourceport', 'targetip', 'targetport', 'reserved'])
      for (const map of ['设备控制', 'login', 'net']) assert.equal(schema.properties[map].additionalProperties, false)
      assert.deepEqual(schema.properties['设备控制'].properties['无线网卡'].enum, ['1', '2'])
      assert.deepEqual(schema.properties['设备控制'].properties['USB存储设备'].enum, ['1', '2', '3'])
      const read = await client.callTool({ name: 'read_policy_template', arguments: { hostip: '172.163.12.1' } })
      assert.notEqual(read.isError, true)
      const host = JSON.parse(read.content[0].text)
      assert.equal(host.mock, true)
      assert.equal(host.found, true)
      assert.equal(host.hostid, 'mock-policy-host-001')
      assert.equal(host.hostip, '172.163.12.1')
      assert.deepEqual(Object.values(host['设备控制']), Array(6).fill('2'))
      assert.deepEqual(Object.values(host.login), Array(8).fill('0'))
      assert.equal(host.net.proctocol, 'tcp')
      payload = { hostid: host.hostid, hostip: host.hostip, '设备控制': { '无线网卡': '1' }, login: {}, net: {} }
      const response = await client.callTool({ name: 'write_policy_template', arguments: payload })
      assert.notEqual(response.isError, true)
      assert.deepEqual(JSON.parse(response.content[0].text), { mock: true, success: true, message: '模拟下发成功' })
    } finally {
      await client.close()
    }
    const events = audit.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert.deepEqual(events, [
      { mock: true, tool: 'read_policy_template', arguments: { hostip: payload.hostip }, outcome: 'FOUND' },
      { mock: true, tool: 'write_policy_template', arguments: payload, outcome: 'SUCCESS' },
    ])
  })
}
