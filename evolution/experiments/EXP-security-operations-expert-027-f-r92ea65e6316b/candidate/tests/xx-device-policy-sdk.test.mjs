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
      assert.deepEqual(schema.required, ['hostid', 'hostip', 'map1', 'map2', 'map3'])
      assert.deepEqual(Object.keys(schema.properties), schema.required)
      assert.equal(schema.additionalProperties, false)
      for (const [map, key] of [['map1', 'wireless'], ['map2', 'option2'], ['map3', 'option3']]) {
        assert.deepEqual(Object.keys(schema.properties[map].properties), [key])
        assert.deepEqual(schema.properties[map].properties[key].enum, ['1', '2'])
        assert.equal(schema.properties[map].additionalProperties, false)
      }
      const read = await client.callTool({ name: 'read_policy_template', arguments: { hostip: '172.163.12.1' } })
      assert.notEqual(read.isError, true)
      const host = JSON.parse(read.content[0].text)
      assert.equal(host.mock, true)
      assert.equal(host.found, true)
      assert.equal(host.hostid, 'mock-policy-host-001')
      assert.equal(host.hostip, '172.163.12.1')
      assert.deepEqual(host.map1, { wireless: '2' })
      assert.deepEqual(host.map2, { option2: '2' })
      assert.deepEqual(host.map3, { option3: '2' })
      payload = { hostid: host.hostid, hostip: host.hostip, map1: { wireless: '1' }, map2: {}, map3: {} }
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
