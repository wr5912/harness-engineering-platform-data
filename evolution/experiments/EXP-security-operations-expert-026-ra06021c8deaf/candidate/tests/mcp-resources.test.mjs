// 在锁定 Runtime 容器中执行，使用真实 SDK 生命周期和本地受控上游。
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { apply, groupTargetDigest, listAll, publicToolName, snapshot } from '../dsh/managed/mcp-manager/index.mjs'
import { callOpenApiTool, loadOpenApi, readOpenApiResource, OPENAPI_RESPONSE_META_KEY } from '../dsh/managed/mcp-manager/openapi.mjs'

const require = createRequire(process.env.DSH_MCP_CLIENT_ANCHOR || '/opt/dsh/packages/mcp/mcp-client/package.json')
const { Client, StreamableHTTPClientTransport, isCallToolResult } = require('@modelcontextprotocol/client')
const { McpServer, createMcpHandler } = require('@modelcontextprotocol/server')
const { toNodeHandler } = require('@modelcontextprotocol/node')
const token = randomBytes(32).toString('hex')
const configOf = (servers, groups) => ({
  servers: { get: () => servers }, groups: { get: () => groups }, sharedToken: { get: () => token },
})
const member = (extra = {}) => ({ serverId: 'fixture', names: [], resourceUris: [], resourceTemplates: [], ...extra })
const server = { id: 'fixture', enabled: true, url: 'http://127.0.0.1:1/mcp', tools: { mode: 'all', names: [] } }

test('Runtime 能力声明覆盖实际本地工具、委派和三条受信模型路由', async () => {
  const yaml = require('js-yaml')
  const matrix = yaml.load(readFileSync(new URL('../dsh/managed/role-tool-matrix.yaml', import.meta.url), 'utf8'))
  const schema = yaml.DEFAULT_SCHEMA.extend(new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: value => value }))
  const patch = yaml.load(readFileSync(new URL('../dsh/managed/security-operations-expert.patch.yml', import.meta.url), 'utf8'), { schema })
  const definitions = new Map(), adapters = new Map(), hooks = new Map(), events = []
  const ctx = { tools: { register: tool => definitions.set(tool.name, tool) },
    llm: { registerAdapter: (names, adapter) => names.forEach(name => adapters.set(name, adapter)) },
    on: (event, hook) => hooks.set(event, hook) }
  const threat = await import('../dsh/managed/threat-analysis.mjs')
  threat.apply(ctx)
  const delegates = patch.flatMap(item => item.insert ?? []).filter(item => item.name === '@deepseek-ai/dsh-tool-subagent').map(item => item.config.toolName)
  const expectedTools = new Set([...matrix.parent_direct_tools.workspace, ...delegates, ...definitions.keys()])
  assert.deepEqual(new Set(matrix.runtime_capabilities.local_tools), expectedTools)

  const agent = { id: 'local-route-contract', session: { snapshotEvents: () => events } }
  const native = { provider: 'fixture', model: 'fixture' }, signal = new AbortController().signal
  const checkRoute = async turn => {
    const route = await hooks.get('agent/request')({ agent, turn, step: 1, signal }, async () => native)
    assert.ok(matrix.runtime_capabilities.local_model_routes.some(item => item.provider === route.provider && item.model === route.model),
      `实际路由未声明：${route.provider}/${route.model}`)
    assert.ok(adapters.has(route.provider), '声明的路由必须有实际适配器')
    return route
  }
  const message = { id: 'trusted-contract', source: { kind: 'schedule' }, content: [{ type: 'text', text:
    `[SCHEDULE REMINDER]\nschedule_id_json: "schedule-contract"\noccurrence_at: ${new Date().toISOString()}\nreminder_prompt_json: ${JSON.stringify(JSON.stringify({ type: 'threat-analysis.pending', version: 1, batchSize: 1 }))}` }] }
  await hooks.get('agent/pre-step')({ agent, turn: 1, step: 1, messages: [message], signal }, async () => ({ kind: 'enter', messages: [message] }))
  const automation = await checkRoute(1)
  for await (const chunk of adapters.get(automation.provider).stream({ sessionId: agent.id })) {
    if (chunk.type === 'tool-call-delta') assert.ok(matrix.runtime_capabilities.local_tools.includes(chunk.name), '受信模型调用的工具也必须声明')
  }
  events.push({ type: 'tool/result', data: { turn: 2, meta: { threat_analysis_batch: { status: 'completed', found: 0, results: [] } } } })
  await checkRoute(2)
  const delivery = await import('../dsh/managed/operation-result-delivery.mjs')
  delivery.apply(ctx)
  delivery.queueControlledOutput(agent.id, '本地固定结果')
  await checkRoute(3)
  assert.deepEqual(new Set(matrix.runtime_capabilities.local_model_routes.map(item => item.provider)), new Set(adapters.keys()))
})

test('实际新实例seed可通过manager snapshot，未配置资源的成员不会阻断插件激活', () => {
  const { load } = require('js-yaml')
  const seed = load(readFileSync(new URL('../dsh/managed/web-profile.seed.patch.yml', import.meta.url), 'utf8'))
  const config = seed.flatMap(item => item.insert ?? []).find(item => item.id === 'mcp-session-manager').config
  const value = snapshot({ servers: { get: () => config.servers }, groups: { get: () => config.groups }, sharedToken: { get: () => config.sharedToken } })
  assert.equal(value.groups.some(group => group.id === 'threat-analysis-runtime'), false)
  const platformLink = value.servers.find(server => server.id === 'threat-analysis-runtime')
  assert.equal(platformLink?.enabled, false)
  assert.equal(platformLink?.serverName, 'threat-analysis-runtime')
  const expectedGroupUrl = 'http://10.0.160.32:18120/hep/mcp/groups/threat-analysis-runtime/v2'
  assert.equal(platformLink?.url, expectedGroupUrl)
  assert.match(readFileSync(new URL('../dsh/managed/security-operations-expert.patch.yml', import.meta.url), 'utf8'),
    /url: http:\/\/10\.0\.160\.32:18120\/hep\/mcp\/groups\/threat-analysis-runtime\/v2/)

})

test('OpenAPI 工具结果在成功和失败时都保留结构化 HTTP 状态', async () => {
  const http = createServer((req, res) => {
    if (req.url === '/created') {
      res.writeHead(201, { 'content-type': 'application/json' })
      return res.end('{"result":"created"}')
    }
    res.writeHead(409, { 'content-type': 'application/json' })
    res.end('{"message":"claimed by another worker"}')
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const base = new URL(`http://127.0.0.1:${http.address().port}`)
  const operation = path => ({ method: 'post', path, parameters: [], raw: {} })
  const source = {
    base,
    server: { id: 'openapi-fixture', apiKey: '', authType: '' },
    readable: [],
    operations: new Map([
      ['created', operation('/created')],
      ['conflict', operation('/conflict')],
    ]),
  }
  try {
    const created = await callOpenApiTool(source, 'created', {})
    assert.equal(isCallToolResult(created), true)
    assert.equal(created.isError, false)
    assert.deepEqual(created._meta, { [OPENAPI_RESPONSE_META_KEY]: { status: 201 } })
    assert.equal(created.content[0].text, '{"result":"created"}')

    const conflict = await callOpenApiTool(source, 'conflict', {})
    assert.equal(isCallToolResult(conflict), true)
    assert.equal(conflict.isError, true)
    assert.deepEqual(conflict._meta, { [OPENAPI_RESPONSE_META_KEY]: { status: 409 } })
    assert.equal(conflict.content[0].text, '{"message":"claimed by another worker"}')
  } finally {
    await new Promise(resolve => http.close(resolve))
  }
})

test('OpenAPI 路径与查询参数同时生成可读 v2 资源模板和同名工具', async () => {
  let base
  const http = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/openapi.json') return res.end(JSON.stringify({ openapi: '3.0.0',
      servers: [{ url: base }], paths: { '/item/{id}': { get: { operationId: 'get_item',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } }] } } } }))
    res.end(JSON.stringify({ path: req.url }))
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${http.address().port}/`
  try {
    const source = await loadOpenApi({ id: 'query-fixture', specUrl: `${base}openapi.json`, authType: 'credential', apiKey: '' })
    assert.deepEqual(source.resourceTemplates.map(item => item.uriTemplate), [`${base}item/{id}{?q}`])
    assert.deepEqual(source.tools.map(item => item.name), ['get_item'])
    assert.match((await readOpenApiResource(source, `${base}item/42?q=abc`)).contents[0].text, /item\/42\?q=abc/)
    assert.equal((await callOpenApiTool(source, 'get_item', { id: '42', q: 'abc' })).isError, false)
    await assert.rejects(readOpenApiResource(source, `${base}item/42?other=abc`), /不属于/)
  } finally { await new Promise(resolve => http.close(resolve)) }
})

test('完整分页及重复游标拒绝', async () => {
  const calls = []
  const client = { async listResources(params) {
    calls.push(params?.cursor)
    return params?.cursor ? { resources: [{ uri: 'fixture://second' }] }
      : { resources: [{ uri: 'fixture://first' }], nextCursor: 'page-2' }
  } }
  assert.equal((await listAll(client, 'listResources', 'resources')).resources.length, 2)
  assert.deepEqual(calls, [undefined, 'page-2'])
  await assert.rejects(listAll({ listResources: async () => ({ resources: [], nextCursor: 'repeat' }) },
    'listResources', 'resources'), /分页游标重复/)
})

test('旧分组可读取，资源成员与重复选择严格校验', () => {
  assert.equal(snapshot(configOf([server], [{ id: 'old', members: [{ serverId: 'fixture', names: ['lookup'] }] }])).groups.length, 1)
  const group = { id: 'data', members: [member({ resourceUris: ['fixture://selected'], resourceTemplates: ['fixture://record/{id}'] })] }
  assert.equal(snapshot(configOf([server], [group])).groups.length, 1)
  assert.throws(() => snapshot(configOf([server], [{ id: 'bad', members: [member()] }])), /选择无效/)
  assert.throws(() => snapshot(configOf([server], [{ id: 'bad', members: [member({ resourceUris: ['same', 'same'] })] }])), /选择无效/)
  const duplicate = { id: 'legacy', members: [member({ names: ['lookup'] }), member({ names: ['other'] })] }
  assert.equal(snapshot(configOf([server], [duplicate])).groups.length, 1)
  assert.throws(() => groupTargetDigest({ kind: 'group', group: duplicate, servers: [server] }, 2), /服务 ID 重复/)
})

test('Candidate manager 提供真实注册名解析入口；无活跃注册时不猜测名称', () => {
  let service
  apply({ effect() {}, provide(_name, value) { service = value }, on() {}, tools: { get() { return undefined } } },
    configOf([{ ...server, id: 'sec-ops', serverName: 'renamed-soc' }], []))
  assert.equal(typeof service.resolveTool, 'function')
  assert.equal(service.resolveTool('sec-ops', 'get_event_by_id'), undefined)
  assert.equal(publicToolName('renamed-soc', 'get_event_by_id'), 'mcp__renamed-soc__get_event_by_id')
})

test('真实 MCP 分组发现、成员失败隔离、分页、工具调用、资源及模板读取', async () => {
  const receipts = []
  const upstream = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'fixture', version: '1' }, { capabilities: { tools: {}, resources: {} } })
    mcp.server.setRequestHandler('tools/list', async request => request.params?.cursor
      ? { tools: [{ name: 'hidden', inputSchema: { type: 'object' } }] }
      : { tools: [{ name: 'lookup', inputSchema: { type: 'object' } }], nextCursor: 'tools-2' })
    mcp.server.setRequestHandler('tools/call', async request => {
      receipts.push(request.params.name)
      return { content: [{ type: 'text', text: 'lookup receipt' }] }
    })
    mcp.server.setRequestHandler('resources/list', async request => request.params?.cursor
      ? { resources: [{ uri: 'fixture://selected', name: 'Selected' }] }
      : { resources: [{ uri: 'fixture://private', name: 'Private' }], nextCursor: 'resources-2' })
    mcp.server.setRequestHandler('resources/templates/list', async () => ({
      resourceTemplates: [{ uriTemplate: 'fixture://record/{id}', name: 'Record' }],
    }))
    mcp.server.setRequestHandler('resources/read', async request => {
      receipts.push(request.params.uri)
      return { contents: [{ uri: request.params.uri, mimeType: 'text/plain', text: 'fixture data 42' }] }
    })
    return mcp
  })
  const routes = []
  const http = createServer((req, res) => {
    const route = routes.find(route => req.url.split('?')[0].startsWith(route.path))
    if (route) void route.handler(req, res)
    else void toNodeHandler(upstream)(req, res)
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${http.address().port}`
  const groups = [
    { id: 'mixed', members: [member({ names: ['lookup'], resourceUris: ['fixture://selected'], resourceTemplates: ['fixture://record/{id}'] })] },
    { id: 'data', members: [member({ resourceUris: ['fixture://selected'] })] },
    { id: 'resilient', members: [member({ names: ['lookup'] }), member({ serverId: 'unavailable', names: ['missing'] })] },
  ]
  apply({ effect: fn => fn(), provide() {}, webServer: { register: route => routes.push(route) },
    connection: { requestRejection: () => undefined }, on: () => {} },
    configOf([{ ...server, url: url + '/upstream' },
      { ...server, id: 'unavailable', url: 'http://127.0.0.1:1/mcp' }], groups))
  const connect = async (id, version = 'v2') => {
    const client = new Client({ name: 'test', version: '1' })
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(url + '/mcp/groups/' + id + (version ? '/' + version : '')),
        { requestInit: { headers: { authorization: 'Bearer ' + token } } }))
      return client
    } catch (error) { await client.close(); throw error }
  }
  const clients = []
  const { Context } = require('@deepseek-ai/cordis')
  const ctx = new Context()
  try {
    assert.equal((await fetch(url + '/mcp/groups/mixed')).status, 401)
    const discovered = await fetch(url + '/api/mcp-manager', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serverId: 'fixture', action: 'test' }) }).then(r => r.json())
    assert.equal(discovered.tools.length, 2)
    assert.equal(discovered.resources.resources.length, 2)
    assert.equal(discovered.resourceTemplates.resourceTemplates.length, 1)
    const client = await connect('mixed'); clients.push(client)
    const staticUri = 'mcp-group:/mixed/fixture/r/' + Buffer.from('fixture://selected').toString('base64url')
    const templateUri = 'mcp-group:/mixed/fixture/t/' + Buffer.from('fixture://record/{id}').toString('base64url') + '{?id}'
    assert.deepEqual((await client.listTools()).tools.map(t => t.name), ['fixture__lookup'])
    assert.deepEqual((await client.listResources()).resources.map(r => r.uri), [staticUri])
    assert.equal((await client.listResourceTemplates()).resourceTemplates[0].uriTemplate, templateUri)
    assert.equal((await client.callTool({ name: 'fixture__lookup', arguments: {} })).content[0].text, 'lookup receipt')
    assert.equal((await client.readResource({ uri: staticUri })).contents[0].text, 'fixture data 42')
    assert.equal((await client.readResource({ uri: templateUri.replace('{?id}', '?id=42') })).contents[0].text, 'fixture data 42')
    await assert.rejects(client.readResource({ uri: 'fixture://private' }), /不属于/)
    await assert.rejects(client.callTool({ name: 'fixture__hidden', arguments: {} }), /不属于/)
    const data = await connect('data'); clients.push(data)
    assert.deepEqual((await data.listTools()).tools, [])
    const dataUri = 'mcp-group:/data/fixture/r/' + Buffer.from('fixture://selected').toString('base64url')
    assert.equal((await data.readResource({ uri: dataUri })).contents.length, 1)
    await assert.rejects(data.readResource({ uri: staticUri }), /不属于/)

    const legacy = await connect('mixed', ''); clients.push(legacy)
    assert.deepEqual((await legacy.listTools()).tools.map(tool => tool.name), ['mcp__fixture__lookup'])
    assert.deepEqual((await legacy.listResources()).resources, [])

    const broken = await connect('resilient'); clients.push(broken)
    await assert.rejects(broken.listTools(), /fetch failed|Version negotiation probe failed/)
    const resilient = await connect('resilient', ''); clients.push(resilient)
    assert.deepEqual((await resilient.listTools()).tools.map(tool => tool.name), ['mcp__fixture__lookup'])
    await assert.rejects(resilient.callTool({ name: 'mcp__unavailable__missing', arguments: {} }))
    assert.deepEqual(receipts, ['lookup', 'fixture://selected', 'fixture://record/42', 'fixture://selected'])

    // 通过锁定 DSH 的模型工具执行器读取同一个真实分组，而非只验证协议客户端。
    await ctx.plugin(require('@deepseek-ai/dsh-system-prompt').default)
    await ctx.plugin(require('@deepseek-ai/dsh-tools').default, { mode: 'native' })
    await ctx.plugin(require('@deepseek-ai/dsh-mcp-resources').default)
    await ctx.plugin(require('@deepseek-ai/dsh-mcp-client'), {
      transport: 'streamable-http', serverName: 'mixed', url: url + '/mcp/groups/mixed/v2',
      headers: { authorization: 'Bearer ' + token }, toolCallTimeoutMs: 5000, failOnStartupError: true,
      reconnect: { enabled: false },
    })
    const agent = { session: { header: { delegationDepth: 0 } } }
    const { createSecurityOperationsGuard } = await import('../dsh/managed/security-operations-guard.mjs')
    const guard = createSecurityOperationsGuard()
    ctx.tools.guard(exec => guard.decide(exec))
    const call = (name, args) => ctx.tools.execute({ name, arguments: args, agent,
      callId: 'resource-fixture', signal: new AbortController().signal })
    const listed = await call('list_mcp_resources', { server: 'mixed' })
    assert.equal(listed.isError, false, JSON.stringify(listed))
    assert.equal(listed.value.resources[0].uri, staticUri)
    const templates = await call('list_mcp_resource_templates', { server: 'mixed' })
    assert.equal(templates.isError, false, JSON.stringify(templates))
    assert.equal(templates.value.resourceTemplates[0].uriTemplate, templateUri)
    const read = await call('read_mcp_resource', { server: 'mixed', uri: templateUri.replace('{?id}', '?id=42') })
    assert.equal(read.isError, false, JSON.stringify(read))
    assert.equal(read.value.contents[0].text, 'fixture data 42')
    assert.equal((await call('read_mcp_resource', { server: 'mixed', uri: 'fixture://private' })).isError, true)
    assert.equal((await call('read_mcp_resource', { server: 'missing', uri: 'fixture://selected' })).isError, true)
    assert.equal(receipts.at(-1), 'fixture://record/42')
  } finally {
    await ctx.fiber.dispose()
    await Promise.all(clients.map(client => client.close()))
    await upstream.close()
    await new Promise(resolve => http.close(resolve))
  }
})
