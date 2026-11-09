// ASSET02：只测试TS源码与Mock公开组服务，无原始MCP注册、网络、发现或业务FS写入。
import test from 'node:test'
import assert from 'node:assert/strict'
import * as runtime from '../dsh/managed/asset-onboarding-runtime.ts'

const GROUP = 'asset-management', MEMBER = 'ai-soc-master'
const TARGET = 'io.deepseek.dsh/mcp-group-target', OWNER = 'io.deepseek.dsh/mcp-group-tool'
const QUERY = 'get_soc_discovery_tasks_by_task_id'
const URI = 'http://172.16.138.223:18087/soc/discovery/tasks/{taskId}'
const PROXY = `mcp-group:/${GROUP}/${MEMBER}/t/${Buffer.from(URI).toString('base64url')}`
const OPS = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const clone = value => structuredClone(value)
function catalog() {
  return { tools: [
    ...OPS.map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: MEMBER, kind: 'tool', sourceName: name } } })),
    { name: QUERY, inputSchema: { type: 'object', properties: { taskId: { type: 'integer' } }, required: ['taskId'], additionalProperties: false },
      annotations: { readOnlyHint: true }, _meta: { [OWNER]: { serverId: MEMBER, kind: 'template', sourceName: QUERY, sourceUri: URI } } },
  ], _meta: { [TARGET]: { digest: 'a'.repeat(64), version: 2 } } }
}
function exec({ depth = 0, text = '查询当前资产接线，不探测不入库', callId = 'mock-group-call', aborted = false } = {}) {
  const id = 'mock-asset-group-session'
  const header = { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: depth }
  const events = [{ type: 'turn/start', data: { turn: 1 } }, { type: 'user/message', data: { id: 'mock-current-user', source: { kind: 'user' }, content: [{ type: 'text', text }] } }]
  return { callId, signal: aborted ? { aborted: true } : undefined, agent: { id, session: { id, header, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
}
function fixture(directory = catalog()) {
  let tool, lists = 0, sdkGets = 0, legacyResolves = 0, guards = [], calls = []
  const manager = {
    async listGroupTools(group, version) { assert.equal(group, GROUP); assert.equal(version, 2); lists++; return clone(directory) },
    async callGroupTool(group, version, name, args, meta, execution) {
      calls.push({ group, version, name, args: clone(args), meta: clone(meta), execution })
      return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { id: 7 } }) }] }
    },
    resolveTool() { legacyResolves++; return undefined },
    currentGroup() { assert.fail('不得读取管理Token') },
  }
  const ctx = { mcpSessionManager: manager, tools: {
    register(value) { tool = value }, guard(value) { guards.push(value) },
    get() { sdkGets++; return undefined },
  } }
  runtime.apply(ctx)
  return { ctx, manager, tool, guards, calls, lists: () => lists, sdkGets: () => sdkGets, legacyResolves: () => legacyResolves }
}

test('R3复现：没有原始工具注册时，现成组v2的六动作和模板仍应就绪', async () => {
  const f = fixture(), e = exec()
  const result = await f.tool.execute({ action: 'status' }, e)
  assert.equal(result.backend.tooling_ready, true)
  assert.deepEqual(result.backend.interfaces.map(row => row.registered_count), [1, 1, 1, 1, 1, 1])
  assert.deepEqual(result.backend.interfaces.map(row => row.registered_names[0]), OPS)
  assert.equal(result.backend.task_query_template_count, 1)
  assert.equal(result.backend.transport, 'group-v2-public-service')
  assert.equal(result.business_verification, 'not_performed')
  assert.equal(result.registration_performed, false)
  assert.equal(f.lists(), 1)
  assert.equal(f.sdkGets(), 0)
  assert.equal(f.legacyResolves(), 0)
  assert.equal(f.calls.length, 0)
})

test('缺少旧提供者的组方法时精确失败，不回退直连/全局get/HTTP', async () => {
  const f = fixture()
  delete f.manager.listGroupTools
  delete f.manager.callGroupTool
  const result = await f.tool.execute({ action: 'status' }, exec())
  assert.equal(result.backend.tooling_ready, false)
  assert.equal(result.backend.binding_error, 'ASSET_GROUP_API_UNAVAILABLE')
  assert.equal(result.backend.group_api_supported, false)
  assert.equal(f.sdkGets(), 0)
  assert.equal(f.calls.length, 0)
})

test('六动作只按已核原名/成员调用，传原生exec与冻结摘要，不注册底层工具', async () => {
  const f = fixture(), backend = runtime.createAssetGroupBackend(f.ctx), e = exec()
  for (const operation of OPS) {
    const args = { body: { ip: '192.0.2.10' } }
    assert.deepEqual(await backend.call(operation, args, e), { id: 7 })
    const sent = f.calls.at(-1)
    assert.equal(sent.group, GROUP)
    assert.equal(sent.version, 2)
    assert.equal(sent.name, operation)
    assert.deepEqual(sent.args, args)
    assert.deepEqual(sent.meta, { [TARGET]: { digest: 'a'.repeat(64), version: 2 } })
    assert.equal(sent.execution, e)
  }
  assert.equal(f.lists(), 1)
  assert.equal(f.sdkGets(), 0)
  for (const operation of ['list_soc_asset', 'other-group__create_soc_asset', 'unknown']) {
    await assert.rejects(backend.call(operation, {}, e))
  }
  assert.equal(f.calls.length, 6)
  assert.match(f.guards[0]({ name: `mcp__${GROUP}__create_soc_asset`, arguments: {} }), /高层入口/)
})

for (const kind of ['duplicate', 'wrong-member', 'wrong-kind', 'wrong-source']) {
  test(`来源和唯一匹配拒绝${kind}，无后端调用`, async () => {
    const directory = catalog(), first = directory.tools[0]
    if (kind === 'duplicate') directory.tools.push(clone(first))
    else if (kind === 'wrong-member') first._meta[OWNER].serverId = 'other-source'
    else if (kind === 'wrong-kind') first._meta[OWNER].kind = 'template'
    else first._meta[OWNER].sourceName = 'create_soc_asset'
    const f = fixture(directory), backend = runtime.createAssetGroupBackend(f.ctx), e = exec()
    assert.equal((await f.tool.execute({ action: 'status' }, e)).backend.tooling_ready, false)
    await assert.rejects(backend.call(OPS[0], {}, e))
    assert.equal(f.calls.length, 0)
  })
}

for (const mutate of [directory => delete directory._meta[TARGET], directory => { directory._meta[TARGET].version = 1 }, directory => { directory._meta[TARGET].digest = 'not-a-digest' }, directory => { directory.nextCursor = 'partial' }, directory => { directory._meta['io.deepseek.dsh/mcp-group-discovery'] = { unavailable: ['ai-soc-master'] } }]) {
  test('缺失/旧版/非法摘要或不完整目录失败关闭', async () => {
    const directory = catalog(); mutate(directory)
    const f = fixture(directory), e = exec()
    const result = await f.tool.execute({ action: 'status' }, e)
    assert.equal(result.backend.tooling_ready, false)
    await assert.rejects(runtime.createAssetGroupBackend(f.ctx).call(OPS[0], {}, e))
    assert.equal(f.calls.length, 0)
  })
}

test('目录缺模板或模板重名不会被解释为完整就绪', async () => {
  for (const duplicate of [false, true]) {
    const directory = catalog()
    if (duplicate) directory.tools.push(clone(directory.tools.at(-1)))
    else directory.tools.pop()
    const f = fixture(directory), e = exec()
    assert.equal((await f.tool.execute({ action: 'status' }, e)).backend.tooling_ready, false)
    await assert.rejects(runtime.createAssetGroupBackend(f.ctx).resource(7, e))
    assert.equal(f.calls.length, 0)
  }
})

test('任务模板沿目录schema传数字/字符串，解析真正资源正文而非展示占位', async () => {
  for (const stringId of [false, true]) {
    const directory = catalog()
    if (stringId) directory.tools.at(-1).inputSchema.properties.taskId = { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }
    const f = fixture(directory), e = exec()
    f.manager.callGroupTool = async (group, version, name, args, meta, execution) => {
      assert.equal(group, GROUP); assert.equal(version, 2); assert.equal(name, QUERY)
      assert.deepEqual(args, { taskId: stringId ? '7' : 7 })
      assert.deepEqual(meta, { [TARGET]: { digest: 'a'.repeat(64), version: 2 } })
      assert.equal(execution, e)
      return { content: [{ type: 'text', text: '展示占位不是业务数据' }], structuredContent: { contents: [{ uri: stringId ? `${PROXY}?taskId=7` : PROXY, text: JSON.stringify({ code: 200, data: { taskId: 7, findings: [] } }) }] } }
    }
    assert.deepEqual(await runtime.createAssetGroupBackend(f.ctx).resource(7, e), { taskId: 7, findings: [] })
  }
})

test('任务模板错误来源/URI/额外必填参数或资源回执错URI均拒绝', async () => {
  for (const mutate of [row => { row._meta[OWNER].serverId = 'other' }, row => { row._meta[OWNER].sourceUri = 'http://invalid.example/soc/other/{taskId}' }, row => { row.inputSchema.required.push('tenant') }]) {
    const directory = catalog(); mutate(directory.tools.at(-1))
    const f = fixture(directory), e = exec()
    await assert.rejects(runtime.createAssetGroupBackend(f.ctx).resource(7, e))
    assert.equal(f.calls.length, 0)
  }
  const f = fixture()
  f.manager.callGroupTool = async () => ({ structuredContent: { contents: [{ uri: `${URI}/wrong`, text: '{"code":200,"data":{}}' }] } })
  await assert.rejects(runtime.createAssetGroupBackend(f.ctx).resource(7, exec()))
})

test('组资源代理URI不得串组、串成员、串模板或串任务，也不接上游HTTP URI', async () => {
  for (const uri of [PROXY.replace('/asset-management/', '/other-group/'), PROXY.replace('/ai-soc-master/', '/other-member/'), PROXY.replace('/t/', '/r/'),
    `${PROXY}?taskId=8`, `${PROXY}?taskId=7&taskId=7`, `${PROXY}#fake`, URI, URI.replace('{taskId}', '7'),
    `mcp-group:/${GROUP}/${MEMBER}/t/${Buffer.from(URI.replace('/soc/discovery/', '/soc/other/')).toString('base64url')}`]) {
    const f = fixture()
    f.manager.callGroupTool = async () => ({ structuredContent: { contents: [{ uri, text: '{"code":200,"data":{}}' }] } })
    await assert.rejects(runtime.createAssetGroupBackend(f.ctx).resource(7, exec()), /资源URI/)
  }
})

test('原始任务回执字段与缺项原样保留，不由组适配器推断完成', async () => {
  const f = fixture(), facts = { taskId: 7, status: 'RUNNING', totalTargets: 254, scanned: 0, alive: null, candidates: [], errors: ['识别证据未提供'], extra: { providerField: '原值' } }
  f.manager.callGroupTool = async () => ({ structuredContent: { contents: [{ uri: PROXY, text: JSON.stringify({ code: 200, data: facts }) }] } })
  assert.deepEqual(await runtime.createAssetGroupBackend(f.ctx).resource(7, exec()), facts)
})

test('主/子作用域、无原生callId和取消隔离发生在目录/后端之前', async () => {
  for (const options of [{ depth: 1 }, { callId: '' }, { aborted: true }]) {
    const f = fixture(), e = exec(options)
    await assert.rejects(runtime.createAssetGroupBackend(f.ctx).call(OPS[0], {}, e))
    assert.equal(f.lists(), 0)
    assert.equal(f.calls.length, 0)
  }
})

test('等待目录期间有取消则不派发；摘要漂移不重新发现或重发', async () => {
  const f = fixture(), e = exec()
  f.manager.listGroupTools = async () => { e.agent.inbox.nextTurn.push({ source: { kind: 'user' }, content: '取消' }); return catalog() }
  await assert.rejects(runtime.createAssetGroupBackend(f.ctx).call(OPS[0], {}, e))
  assert.equal(f.calls.length, 0)
  const g = fixture(), second = exec()
  let attempts = 0
  g.manager.callGroupTool = async () => { attempts++; throw new Error('目标已变化') }
  await assert.rejects(runtime.createAssetGroupBackend(g.ctx).call(OPS[0], {}, second), /目标已变化/)
  assert.equal(attempts, 1)
  assert.equal(g.lists(), 1)
})
