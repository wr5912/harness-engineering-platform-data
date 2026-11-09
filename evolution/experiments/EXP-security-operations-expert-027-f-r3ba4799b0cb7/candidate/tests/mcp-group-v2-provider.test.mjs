// 授权离线Mock：只导入受管Candidate产物；fetch固定内存响应，禁止真实网络/业务/凭据。
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../dsh/managed/mcp-manager/index.mjs'
import { createAssetGroupBackend } from '../dsh/managed/asset-onboarding-runtime.mjs'

const GROUP = 'asset-management', MEMBER = 'ai-soc-master'
const TARGET = 'io.deepseek.dsh/mcp-group-target', SOURCE = 'io.deepseek.dsh/mcp-group-tool'
const OPS = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const TASK = 'get_soc_discovery_tasks_by_task_id'
const BASE = 'https://fixture.invalid', URI = `${BASE}/soc/discovery/tasks/{taskId}`
function fixture(t, { context = false } = {}) {
  const paths = Object.fromEntries(OPS.map((operationId, i) => [`/operation/${i}`, { post: { operationId, requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } } }]))
  paths['/soc/discovery/tasks/{taskId}'] = { get: { operationId: TASK, parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } }] } }
  const spec = { openapi: '3.0.0', servers: [{ url: BASE }], paths }
  const calls = [], executions = [], originalFetch = globalThis.fetch
  globalThis.fetch = async (input, options = {}) => {
    options.signal?.throwIfAborted()
    const url = new URL(String(input))
    assert.equal(url.origin, BASE, '任何非fixture目标都不能触网')
    calls.push({ url, options })
    if (url.pathname === '/openapi.json') return new Response(JSON.stringify(spec), { headers: { 'content-type': 'application/json' } })
    if (url.pathname.startsWith('/soc/discovery/tasks/')) return new Response(JSON.stringify({ code: 200, data: { taskId: Number(url.pathname.split('/').at(-1)), status: 'fixture-only' } }), { headers: { 'content-type': 'application/json' } })
    if (url.pathname.startsWith('/operation/')) return new Response('{"fixture":true}', { headers: { 'content-type': 'application/json' } })
    assert.fail('未声明的fixture路径')
  }
  t.after(() => { globalThis.fetch = originalFetch })
  const servers = [{ id: MEMBER, enabled: true, specUrl: `${BASE}/openapi.json`, authType: '', apiKey: '', tools: { mode: 'all', names: [] } }]
  const groups = [{ id: GROUP, members: [{ serverId: MEMBER, names: [...OPS], resourceUris: [], resourceTemplates: [URI] }] }]
  let service
  const config = { servers: { get: () => servers }, groups: { get: () => groups }, sharedToken: { get: () => '0'.repeat(64) } }
  if (context) config.withToolContext = async (exec, run) => {
    assert.equal(exec.agent.session.id, 'mock-root-session'); assert.equal(exec.callId, 'mock-native-call')
    executions.push(exec); return run()
  }
  apply({ provide(_name, value) { service = value }, effect() {}, on() {}, tools: { get() {} } }, config)
  const controller = new AbortController()
  const id = 'mock-root-session'
  const events = [{ type: 'turn/start', data: { turn: 1 } }, { type: 'user/message', data: { id: 'mock-user', source: { kind: 'user' }, content: [{ type: 'text', text: '仅查询已存在的任务结果，不发现不入库' }] } }]
  const exec = { agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } }, callId: 'mock-native-call', signal: controller.signal }
  return { service, servers, groups, calls, executions, exec, controller }
}

test('组v2提供者公开目录及调用合同存在，不以同名空壳代替', t => {
  const f = fixture(t)
  assert.equal(typeof f.service.listGroupTools, 'function')
  assert.equal(typeof f.service.callGroupTool, 'function')
  assert.equal(typeof f.service.currentGroup, 'function')
  assert.deepEqual(f.service.sourceStatus(MEMBER), { configured: true })
  assert.equal(f.service.resolveTool(MEMBER, OPS[0]), undefined, '没有原生注册时不猜名')
  assert.equal(f.calls.length, 0)
})
test('六原名工具和1模板保留来源meta、v2摘要、数字taskId及真实正文', async t => {
  const f = fixture(t, { context: true }), directory = await f.service.listGroupTools(GROUP, 2)
  assert.deepEqual(new Set(directory.tools.map(tool => tool.name)), new Set([...OPS, TASK]))
  assert.equal(directory._meta[TARGET].version, 2)
  assert.match(directory._meta[TARGET].digest, /^[a-f0-9]{64}$/)
  for (const tool of directory.tools) {
    const source = tool._meta[SOURCE]
    assert.equal(source.serverId, MEMBER); assert.equal(source.sourceName, tool.name)
    assert.equal(source.kind, tool.name === TASK ? 'template' : 'tool')
  }
  const task = directory.tools.find(tool => tool.name === TASK)
  assert.equal(task._meta[SOURCE].sourceUri, URI)
  assert.equal(task.inputSchema.properties.taskId.type, 'integer')
  const result = await f.service.callGroupTool(GROUP, 2, TASK, { taskId: 7 }, directory._meta, f.exec)
  assert.deepEqual(JSON.parse(result.structuredContent.contents[0].text), { code: 200, data: { taskId: 7, status: 'fixture-only' } })
  assert.equal(f.executions[0], f.exec, '原生exec对象不重建')
  assert.equal(f.calls.at(-1).url.pathname, '/soc/discovery/tasks/7')
  assert.equal(f.calls.at(-1).options.signal.aborted, false)
})
test('真实受管资产适配器与真实受管v2提供者闭环读取同次模板正文', async t => {
  const f = fixture(t, { context: true })
  const backend = createAssetGroupBackend({ mcpSessionManager: f.service })
  const status = await backend.status(f.exec)
  assert.equal(status.tooling_ready, true, JSON.stringify(status))
  assert.deepEqual(status.interfaces.map(row => row.registered_count), [1, 1, 1, 1, 1, 1])
  assert.equal(status.task_query_template_count, 1)
  assert.deepEqual(await backend.resource(7, f.exec), { taskId: 7, status: 'fixture-only' })
  assert.ok(f.executions.every(value => value === f.exec))
  assert.ok(f.calls.every(call => call.url.origin === BASE))
})

test('旧摘要、非法模板参数、取消均拒绝且不发送业务叶子请求', async t => {
  const f = fixture(t, { context: true }), directory = await f.service.listGroupTools(GROUP, 2)
  const leafCount = () => f.calls.filter(call => call.url.pathname !== '/openapi.json').length
  await assert.rejects(f.service.callGroupTool(GROUP, 2, TASK, { taskId: '7' }, directory._meta, f.exec))
  assert.equal(leafCount(), 0)
  f.servers[0].specUrl = 'https://changed.invalid/openapi.json'
  await assert.rejects(f.service.callGroupTool(GROUP, 2, TASK, { taskId: 7 }, directory._meta, f.exec))
  assert.equal(leafCount(), 0)
  f.servers[0].specUrl = `${BASE}/openapi.json`; f.controller.abort()
  await assert.rejects(f.service.callGroupTool(GROUP, 2, TASK, { taskId: 7 }, directory._meta, f.exec))
  assert.equal(leafCount(), 0)
})
