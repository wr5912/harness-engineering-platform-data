import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply as applyMcpManager } from '../dsh/managed/mcp-manager/index.mjs'

import {
  LOGICAL_MAPPINGS,
  MANUAL_REQUIRED,
  PENDING_REQUIRED,
  startMcpGroupBridge,
} from '../dsh/managed/threat-analysis/mcp-group-bridge.mjs'
import {
  pythonEnvironment,
  pythonRuntimeConfig,
  runtimeGroupConnection,
  apply as applyThreat,
} from '../dsh/managed/threat-analysis.mjs'

function discovery(selected = LOGICAL_MAPPINGS) {
  const tools = []
  const resources = []
  const resourceTemplates = []
  for (const item of selected) {
    if (item.target.kind === 'tool') tools.push({ name: `${item.target.sourceId.replaceAll('_', '_0')}__${item.target.rawName}`, inputSchema: { type: 'object' } })
    else if (item.target.kind === 'resource') resources.push({
      name: item.target.name, uri: `mcp-group:/threat-analysis-runtime/${item.target.sourceId}/r/${Buffer.from(`https://soc.example/resources/${item.target.name}`).toString('base64url')}`,
    })
    else resourceTemplates.push({ name: item.target.name,
      uriTemplate: `mcp-group:/threat-analysis-runtime/${item.target.sourceId}/t/${Buffer.from(`https://soc.example/resources/${item.target.name}/${item.target.variables.map(name => `{${name}}`).join('/')}`).toString('base64url')}{?${item.target.variables.join(',')}}` })
  }
  return { tools, resources, resourceTemplates }
}

function fixtureGroupFetch(token) {
  return (input, init = {}) => {
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }
}

function fakeClient(source, options = {}) {
  const calls = []
  const discoveryCalls = []
  let closed = 0
  const _meta = { 'io.deepseek.dsh/mcp-group-target': { digest: options.digest ?? 'a'.repeat(64), version: 2 } }
  return {
    calls, discoveryCalls,
    get closed() { return closed },
    async listTools() { discoveryCalls.push('tools'); return { tools: source.tools, _meta } },
    async listResources() {
      discoveryCalls.push('resources')
      if (options.resourceDiscoveryError) throw new Error('resource discovery unavailable')
      return { resources: source.resources, _meta }
    },
    async listResourceTemplates() {
      discoveryCalls.push('resourceTemplates')
      if (options.resourceDiscoveryError) throw new Error('resource template discovery unavailable')
      return { resourceTemplates: source.resourceTemplates, _meta }
    },
    async callTool(request, requestOptions) {
      assert.deepEqual(request._meta, { 'io.deepseek.dsh/mcp-group-target': { digest: _meta['io.deepseek.dsh/mcp-group-target'].digest } })
      calls.push(['tool', request.name, request.arguments])
      if (options.onTool) return options.onTool(request, requestOptions)
      if (options.toolError) return { isError: true,
        _meta: { 'io.deepseek.dsh/openapi-response': { status: 409 } },
        content: [{ type: 'text', text: '{"message":"claimed"}' }] }
      return { content: [{ type: 'text', text: '{"code":200,"data":{"judgementId":"judgement-1"}}' }] }
    },
    async readResource(request, requestOptions) {
      assert.deepEqual(request._meta, { 'io.deepseek.dsh/mcp-group-target': { digest: _meta['io.deepseek.dsh/mcp-group-target'].digest } })
      calls.push(['resource', request.uri])
      if (options.onResource) return options.onResource(request, requestOptions)
      return { contents: [{ uri: request.uri, mimeType: 'application/json',
        text: '{"code":200,"data":{"incidentId":"INC-20261010-000001"}}' }] }
    },
    async close() { closed += 1 },
  }
}

async function open(mode, source, clientOptions) {
  const client = fakeClient(source, clientOptions)
  const factoryCalls = []
  const bridge = await startMcpGroupBridge({
    groupUrl: 'http://127.0.0.1:3094/mcp/groups/threat-analysis-runtime/v2',
    token: 'shared-token', mode,
    async clientFactory(options) { factoryCalls.push(options); return client },
  })
  return { bridge, client, factoryCalls }
}

async function invoke(bridge, body, key = bridge.key) {
  const response = await fetch(`${bridge.url}/invoke`, { method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() }
}

test('手工预检固定为 18 项 SOC，报告工具缺失不阻断', async () => {
  assert.equal(MANUAL_REQUIRED.length, 18)
  assert.equal(PENDING_REQUIRED.length, 1)
  const source = discovery(LOGICAL_MAPPINGS.filter(item => item.resource !== 'report-write'))
  const { bridge, client, factoryCalls } = await open('manual', source)
  try {
    assert.equal(factoryCalls[0].groupUrl,
      'http://127.0.0.1:3094/mcp/groups/threat-analysis-runtime/v2')
    assert.equal(factoryCalls[0].token, 'shared-token')

    const claim = await invoke(bridge, { resource: 'ai_soc_correlate',
      tool: 'ai_soc_correlate__create_incident_judgement_claim', args: { incidentId: 'INC-20261010-000001' } })
    assert.deepEqual(claim, { status: 200, body: { status: 'success', status_code: 200,
      result: { code: 200, data: { judgementId: 'judgement-1' } } } })

    const incident = await invoke(bridge, { resource: 'ai_soc_correlate',
      tool: 'ai_soc_correlate__get_correlate_incident_by_incident_id',
      args: { incidentId: 'INC/20261010 000001' } })
    assert.equal(incident.body.status, 'success')
    assert.match(client.calls.at(-1)[1], /\?incidentId=INC%2F20261010%20000001$/)

    const report = await invoke(bridge, { resource: 'report-write',
      tool: 'save_persistence_result', args: { businessId: 'run-1' } })
    assert.deepEqual(report, { status: 200, body: {
      status: 'error', status_code: 503, error_type: 'McpMappingUnavailable',
    } })

    assert.equal((await invoke(bridge, { resource: 'ai_soc_correlate',
      tool: 'ai_soc_correlate__create_incident_judgement_claim', args: {} }, 'wrong-key')).status, 403)
  } finally {
    await bridge.close()
  }
  assert.equal(client.closed, 1)
})

test('pending 运行只预检待研判入口，手工运行缺少任一 SOC 映射即失败', async () => {
  const pending = LOGICAL_MAPPINGS.filter(item => item.tool.endsWith('__get_correlate_incident_judge_pending'))
  const active = await open('pending', discovery(pending), { resourceDiscoveryError: true })
  assert.deepEqual(active.client.discoveryCalls, ['tools'])
  await active.bridge.close()
  assert.equal(active.client.closed, 1)

  const source = discovery(LOGICAL_MAPPINGS.filter(item =>
    item.tool !== 'ai_soc_event__search_event' && item.resource !== 'report-write'))
  const client = fakeClient(source)
  await assert.rejects(startMcpGroupBridge({
    groupUrl: 'http://127.0.0.1:3094/mcp/groups/threat-analysis-runtime/v2',
    token: 'shared-token', mode: 'manual', clientFactory: async () => client,
  }), /ai_soc_event__search_event/)
  assert.equal(client.closed, 1)
})

test('MCP tool error 优先使用结构化 OpenAPI meta 保留 409', async () => {
  const active = await open('pending', discovery(LOGICAL_MAPPINGS), { toolError: true })
  try {
    const value = await invoke(active.bridge, { resource: 'ai_soc_correlate',
      tool: 'ai_soc_correlate__get_correlate_incident_judge_pending', args: {} })
    assert.deepEqual(value, { status: 200, body: { status: 'error', status_code: 409,
      result: { message: 'claimed' }, error_type: 'Error' } })
  } finally {
    await active.bridge.close()
  }
})

test('受信平台分组地址和 Session 签名 fetch 绑定，Python 配置不含凭据', () => {
  const url = 'http://127.0.0.1:3094/hep/mcp/groups/threat-analysis-runtime/v2'
  const signer = async (input, init) => fetch(input, init)
  const config = { keep: 'value', connections: { runtimeGroup: {
    id: 'threat-analysis-runtime', url, token: 'secret-shared-token',
  } } }
  const manager = { groupUrl(id) { assert.equal(id, 'threat-analysis-runtime'); return url },
    groupFetch(id, sessionId) { assert.equal(id, 'threat-analysis-runtime'); assert.equal(sessionId, 'session-a'); return signer } }
  assert.deepEqual(runtimeGroupConnection({ mcpSessionManager: manager }, config, 'session-a'), {
    groupUrl: url, fetch: signer,
  })
  assert.throws(() => runtimeGroupConnection({ mcpSessionManager: manager }, config), /trusted platform/)
  assert.throws(() => runtimeGroupConnection({ mcpSessionManager: { ...manager, groupUrl: () => 'http://other.invalid/mcp/groups/threat-analysis-runtime/v2' } }, config, 'session-a'), /differs from trusted/)
  const value = pythonRuntimeConfig(config, { url: 'http://127.0.0.1:41234', key: 'run-key' }, {
    baseURL: 'http://127.0.0.1:42345', model: 'Qwen3.8-27B', apiKeyEnv: 'THREAT_MODEL_BRIDGE_KEY',
  })
  assert.equal(JSON.stringify(value).includes('secret-shared-token'), false)
  assert.deepEqual(value.connections, { runtime: {
    bridgeUrl: 'http://127.0.0.1:41234', bridgeKey: 'run-key',
  } })
  assert.equal(value.keep, 'value')
  assert.deepEqual(pythonEnvironment({ EXTRA: 'kept' }, {
    PATH: '/bin', THREAT_ANALYSIS_MCP_TOKEN: 'secret-shared-token',
  }), { PATH: '/bin', EXTRA: 'kept' })
})

test('真实 SDK 从多级基址分组连通并将取消传到 SOC 上游一次', async () => {
  const require = createRequire(process.env.DSH_MCP_CLIENT_ANCHOR || '/opt/dsh/packages/mcp/mcp-client/package.json')
  const { McpServer, createMcpHandler } = require('@modelcontextprotocol/server')
  const { toNodeHandler } = require('@modelcontextprotocol/node')
  let observedSignal, calls = 0, resolveStarted, resolveCanceled
  const started = new Promise(resolve => { resolveStarted = resolve })
  const canceled = new Promise(resolve => { resolveCanceled = resolve })
  const toolName = 'get_correlate_incident_judge_pending'
  const upstream = createMcpHandler(() => {
    const server = new McpServer({ name: 'basic-soc-fixture', version: '1' }, { capabilities: { tools: {} } })
    server.server.setRequestHandler('tools/list', async () => ({ tools: [{ name: toolName, inputSchema: { type: 'object', properties: {} } }] }))
    server.server.setRequestHandler('tools/call', async (_request, context) => {
      calls++
      observedSignal = context.mcpReq.signal
      resolveStarted()
      return new Promise((_, reject) => {
        const cancel = () => { resolveCanceled(); reject(new DOMException('fixture canceled', 'AbortError')) }
        if (observedSignal.aborted) cancel()
        else observedSignal.addEventListener('abort', cancel, { once: true })
      })
    })
    return server
  })
  const routes = [], prefix = '/team/security/assistant'
  const http = createServer((request, response) => {
    const route = routes.find(route => request.url.startsWith(route.path))
    const result = route ? route.handler(request, response) : toNodeHandler(upstream)(request, response)
    Promise.resolve(result).catch(() => response.destroy())
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const port = http.address().port
  const webServer = { port, publicPath: path => prefix + path, register(route) {
    routes.push({ ...route, path: this.publicPath(route.path), handler(request, response) {
      request.url = request.url.slice(prefix.length) || '/'
      return route.handler(request, response)
    } })
  } }
  const config = { connections: { runtimeGroup: { id: 'threat-analysis-runtime', url: `http://127.0.0.1:${port}${prefix}/mcp/groups/threat-analysis-runtime/v2`, token: '0'.repeat(64) } } }
  applyMcpManager({ webServer, effect: run => run(), provide() {}, on: () => {}, connection: { requestRejection: () => undefined } }, {
    servers: { get: () => [{ id: 'ai-soc-correlate', serverName: 'ai-soc-correlate', enabled: true, url: `http://127.0.0.1:${port}/upstream`, tools: { mode: 'all', names: [] } }] },
    groups: { get: () => [{ id: config.connections.runtimeGroup.id, members: [{ serverId: 'ai-soc-correlate', names: [toolName], resourceUris: [], resourceTemplates: [] }] }] },
    sharedToken: { get: () => config.connections.runtimeGroup.token },
  })
  const controller = new AbortController()
  let bridge
  const until = async promise => {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fixture protocol event timed out')), 5000) })]) }
    finally { clearTimeout(timer) }
  }
  try {
    bridge = await startMcpGroupBridge({ ...runtimeGroupConnection({ mcpSessionManager: { groupUrl: () => config.connections.runtimeGroup.url, groupFetch: () => fixtureGroupFetch(config.connections.runtimeGroup.token) } }, config, 'session-a'), mode: 'pending', signal: controller.signal })
    const pending = invoke(bridge, { resource: 'ai_soc_correlate', tool: `ai_soc_correlate__${toolName}`, args: {} })
    await until(Promise.race([started, pending.then(value => { throw new Error(`fixture tool returned before upstream call: ${JSON.stringify(value)}`) })]))
    assert.ok(observedSignal instanceof AbortSignal)
    controller.abort()
    const response = await pending
    await until(canceled)
    assert.equal(response.body.status, 'error')
    assert.equal(observedSignal.aborted, true)
    assert.equal(calls, 1)
  } finally {
    await bridge?.close()
    await upstream.close()
    http.closeAllConnections()
    await new Promise(resolve => http.close(resolve))
  }
})

test('真实管理分组冻结工具与资源目标；插件凭据轮换不改变身份，改同ID地址后拒绝所有后续调用', async () => {
  const require = createRequire(process.env.DSH_MCP_CLIENT_ANCHOR || '/opt/dsh/packages/mcp/mcp-client/package.json')
  const { McpServer, createMcpHandler } = require('@modelcontextprotocol/server')
  const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client')
  const { toNodeHandler } = require('@modelcontextprotocol/node')
  const toolName = 'get_correlate_incident_judge_pending', uri = 'https://basic.example/whitelist'
  let toolCalls = 0, resourceCalls = 0
  const upstream = createMcpHandler(() => {
    const server = new McpServer({ name: 'basic-fixture', version: '1' }, { capabilities: { tools: {}, resources: {} } })
    server.server.setRequestHandler('tools/list', async () => ({ tools: [{ name: toolName, inputSchema: { type: 'object' } }] }))
    server.server.setRequestHandler('tools/call', async () => { toolCalls++; return { content: [{ type: 'text', text: '{"code":200,"data":{"rows":[]}}' }] } })
    server.server.setRequestHandler('resources/list', async () => ({ resources: [{ name: 'list_detect_whitelist', uri }] }))
    server.server.setRequestHandler('resources/read', async () => { resourceCalls++; return { contents: [{ uri, text: '{"code":200,"data":[]}' }] } })
    return server
  })
  const routes = [], provided = new Map()
  const http = createServer((request, response) => {
    const route = routes.find(item => request.url.startsWith(item.path))
    Promise.resolve(route ? route.handler(request, response) : toNodeHandler(upstream)(request, response)).catch(() => response.destroy())
  })
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  const port = http.address().port, token = '0'.repeat(64)
  const selected = { id: 'ai-soc-correlate', serverName: 'ai-soc-correlate', enabled: true, url: `http://127.0.0.1:${port}/upstream`, tools: { mode: 'all', names: [] } }
  const config = { servers: { get: () => [selected] }, groups: { get: () => [{ id: 'threat-analysis-runtime', members: [{ serverId: 'ai-soc-correlate', names: [toolName], resourceUris: [uri], resourceTemplates: [] }] }] }, sharedToken: { get: () => token } }
  applyMcpManager({ provide: (name, value) => provided.set(name, value), webServer: { register: route => routes.push(route) }, effect: run => run(), on() {}, connection: { requestRejection: () => undefined } }, config)
  const client = new Client({ name: 'basic-reader', version: '1' }, { versionNegotiation: { mode: 'auto' } })
  let bridge
  try {
    const groupUrl = `http://127.0.0.1:${port}/mcp/groups/threat-analysis-runtime/v2`
    const connection = runtimeGroupConnection({ mcpSessionManager: { groupUrl: () => groupUrl, groupFetch: () => fixtureGroupFetch(token) } }, { connections: { runtimeGroup: { id: 'threat-analysis-runtime', url: groupUrl } } }, 'session-a')
    assert.equal(connection.token, undefined)
    bridge = await startMcpGroupBridge({ ...connection, mode: 'pending' })
    const response = await invoke(bridge, { resource: 'ai_soc_correlate', tool: `ai_soc_correlate__${toolName}`, args: {} })
    assert.equal(response.body.status, 'success')
    await client.connect(new StreamableHTTPClientTransport(new URL(connection.groupUrl), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
    const listed = await client.listResources()
    const _meta = listed._meta
    assert.equal(_meta['io.deepseek.dsh/mcp-group-target'].digest, bridge.targetDigest)
    selected.headers = [{ name: 'Authorization', value: 'rotated-basic-fixture-token' }]
    await client.readResource({ uri: `mcp-group:/threat-analysis-runtime/ai-soc-correlate/r/${Buffer.from(uri).toString('base64url')}`, _meta })
    assert.equal(resourceCalls, 1)
    selected.url = `http://127.0.0.1:${port}/different-target`
    assert.equal((await invoke(bridge, { resource: 'ai_soc_correlate', tool: `ai_soc_correlate__${toolName}`, args: {} })).body.error_type, 'ConnectionConflict')
    await assert.rejects(() => client.readResource({ uri: `mcp-group:/threat-analysis-runtime/ai-soc-correlate/r/${Buffer.from(uri).toString('base64url')}`, _meta }), /MCP 分组目标已变化/)
    assert.equal(toolCalls, 1)
    assert.equal(resourceCalls, 1)
    await assert.rejects(() => startMcpGroupBridge({ ...connection, mode: 'pending', expectedTargetDigest: bridge.targetDigest }), /threat_connection_conflict/)
  } finally {
    await bridge?.close(); await client.close(); await upstream.close()
    http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
  }
})

for (const changedTarget of [false, true]) test(`真实Python认领后取消：${changedTarget ? '目标漂移不补写并保留未知' : '独立信号补写同身份fail且重复cleanup不重写'}`, async () => {
  const home = await mkdtemp(join(tmpdir(), 'threat-cancel-'))
  const previousHome = process.env.DSH_HOME, previousPath = process.env.PATH
  process.env.DSH_HOME = home; process.env.PATH = `/usr/bin:${previousPath}`
  const calls = [], controller = new AbortController()
  let releaseStarted, opened = 0
  const started = new Promise(resolve => { releaseStarted = resolve })
  const openBridge = options => startMcpGroupBridge({ ...options, clientFactory: async () => {
    const first = opened++ === 0
    return fakeClient(discovery(), { digest: changedTarget && !first ? 'b'.repeat(64) : 'a'.repeat(64),
      async onTool(request) {
        calls.push(request)
        return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: request.name.endsWith('create_incident_judgement_claim') ? { judgementId: 'judge-cancel-basic' } : { replayed: false } }) }] }
      },
      async onResource(_request, { signal }) {
        releaseStarted()
        await new Promise((resolve, reject) => {
          if (signal.aborted) return reject(signal.reason)
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
      },
    })
  } })
  const definitions = new Map()
  const groupUrl = 'http://127.0.0.1:3094/mcp/groups/threat-analysis-runtime/v2'
  const config = { connections: { runtimeGroup: { id: 'threat-analysis-runtime', url: groupUrl, token: 'basic-fixture-token' } } }
  applyThreat({ on() {}, tools: { register: definition => definitions.set(definition.name, definition) }, llm: { registerAdapter() {} }, mcpSessionManager: { groupUrl: () => groupUrl, groupFetch: () => fetch } }, config, { openMcpGroupBridge: openBridge })
  try {
    const pending = definitions.get('analyze_threat_incident').execute({ incident_id: 'INC-20261015-000001' }, {
      agent: { options: { provider: 'fixture', model: 'unused-model' }, session: { id: 'session-a', snapshotEvents: () => [] } }, signal: controller.signal,
    })
    let timer
    try { await Promise.race([started, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Python未进入已认领取证阶段')), 5000) })]) }
    finally { clearTimeout(timer) }
    controller.abort()
    const result = await pending
    assert.equal(result.incident_id, 'INC-20261015-000001')
    const claims = calls.filter(item => item.name.endsWith('create_incident_judgement_claim'))
    const fails = calls.filter(item => item.name.endsWith('create_correlate_incident_judgement_fail'))
    assert.equal(claims.length, 1)
    assert.equal(fails.length, changedTarget ? 0 : 1)
    assert.equal(result.judgement_id, 'judge-cancel-basic')
    if (changedTarget) {
      assert.equal(result.error_type, 'ConnectionConflict')
      assert.equal(result.delivery.storage.summary.status, 'unknown')
      assert.match(result.delivery.markdown, /尚未核实/)
    } else {
      assert.equal(result.delivery.storage.summary.status, 'saved')
      assert.equal(fails[0].arguments.judgementId, 'judge-cancel-basic')
      assert.equal(fails[0].arguments.body.runId, result.run_id)
      const cleanupBridge = await openBridge({ groupUrl: 'http://127.0.0.1:3094/mcp/groups/threat-analysis-runtime/v2', token: 'basic-fixture-token', mode: 'manual' })
      try {
        const { stdout } = await promisify(execFile)('/usr/bin/python3', [new URL('../dsh/managed/threat-analysis/dsh_runner.py', import.meta.url).pathname, '--cleanup', result.run_id], {
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', THREAT_ANALYSIS_CONFIG: JSON.stringify(pythonRuntimeConfig(config, cleanupBridge)) },
        })
        assert.equal(JSON.parse(stdout).run_id, result.run_id)
        assert.equal(calls.filter(item => item.name.endsWith('create_correlate_incident_judgement_fail')).length, 1)
      } finally { await cleanupBridge.close() }
    }
    const persisted = JSON.parse(await readFile(join(home, 'threat-analysis', result.run_id, 'result.json'), 'utf8'))
    assert.equal(persisted.run_id, result.run_id)
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previousHome
    process.env.PATH = previousPath
    await rm(home, { recursive: true, force: true })
  }
})
