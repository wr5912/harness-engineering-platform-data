import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { loadCommandMap } from '../dsh/managed/xx-device-control-mock.mjs'

// 使用目标DSH已安装的公开MCP SDK，不安装依赖、不嵌入开发机路径。
// 指定 DSH_MCP_BRIDGE_PACKAGE 为该安装的 @deepseek-ai/dsh-mcp-client/package.json。
const packagePath = process.env.DSH_MCP_BRIDGE_PACKAGE
const serverPath = fileURLToPath(new URL('../dsh/managed/xx-device-control-mock.mjs', import.meta.url))

for (const mode of ['legacy', 'auto']) {
  test(`官方MCP SDK：${mode}协商、两工具发现、真实读写调用`, { skip: !packagePath && '未指定已核实的DSH MCP安装；不能据此声称SDK兼容性通过', timeout: 15000 }, async () => {
    const require = createRequire(packagePath)
    const { Client } = require('@modelcontextprotocol/client')
    const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')
    const client = new Client({ name: 'xx-device-control-sdk-validation', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode, probe: { timeoutMs: 3000, maxRetries: 0 } } })
    const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], stderr: 'pipe' })
    let audit = ''
    transport.stderr.on('data', chunk => { audit += chunk.toString() })
    try {
      await client.connect(transport, { timeout: 5000 })
      const catalog = await client.listTools()
      assert.deepEqual(catalog.tools.map(tool => tool.name), ['lookup_host', 'send_command'])
      const schema = catalog.tools.find(tool => tool.name === 'send_command').inputSchema
      assert.deepEqual([...schema.required].sort(), ['commandid', 'hostid', 'hostip'])
      assert.deepEqual(Object.keys(schema.properties).sort(), ['commandid', 'hostid', 'hostip'])
      assert.ok(Object.values(schema.properties).every(property => property.type === 'string'))
      assert.equal(schema.additionalProperties, false)
      const map = loadCommandMap()
      assert.deepEqual([...schema.properties.commandid.enum].sort(), Object.keys(map).sort())
      const actions = Object.entries(map).filter(([, name]) => name === '重启')
      assert.equal(actions.length, 1)
      const commandid = actions[0][0]
      assert.ok(schema.properties.commandid.enum.includes(commandid))
      const lookup = await client.callTool({ name: 'lookup_host', arguments: { hostIp: '172.13.168.11' } })
      assert.notEqual(lookup.isError, true)
      const host = JSON.parse(lookup.content[0].text).hosts[0]
      const payload = { hostid: host.hostId, hostip: host.hostIp, commandid }
      const response = await client.callTool({ name: 'send_command', arguments: payload })
      assert.notEqual(response.isError, true)
      const result = JSON.parse(response.content[0].text)
      assert.equal(result.mock, true)
      assert.equal(result.status, 'SUCCESS')
      assert.equal(result.commandName, '重启')
      assert.equal(typeof result.executionId, 'string')
      assert.ok(result.executionId.length > 0)
      assert.deepEqual({ hostid: result.hostid, hostip: result.hostip, commandid: result.commandid }, payload)
      for (const key of ['commandId', 'hostId', 'hostIp']) assert.equal(Object.hasOwn(result, key), false)
      const absent = await client.callTool({ name: 'lookup_host', arguments: { hostIp: '192.0.2.99' } })
      assert.equal(JSON.parse(absent.content[0].text).found, false)
      const events = audit.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
      assert.equal(events.filter(event => event.tool === 'send_command').length, 1)
      assert.equal(events.filter(event => event.tool === 'lookup_host').length, 2)
    } finally {
      await client.close()
    }
  })
}
