import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, createInspectionExecution, inspectionCatalog } from '../dsh/managed/inspection-preparation-runtime.mjs'

// 目标 inputSchema 的实际机器结构；description 仅文案，不影响本状态机合同。
const schema = {
  type: 'object', additionalProperties: false, required: ['taskId', 'requestId'],
  properties: {
    taskId: { type: 'string' }, requestId: { type: 'string', maxLength: 160 },
    deviceSelector: { oneOf: [
      { type: 'object', required: ['kind'], properties: { kind: { const: 'ALL' } } },
      { type: 'object', required: ['kind', 'values'], properties: { kind: { enum: ['ASSET_IDS', 'IP', 'CIDR'] }, values: { type: 'array', items: { type: 'string' } } } },
      { type: 'object', required: ['kind', 'query'], properties: { kind: { enum: ['ASSET_CLASS', 'TOPOLOGY_GROUP'] }, query: { type: 'string' } } },
      { type: 'object', required: ['kind', 'conditions'], properties: { kind: { const: 'FILTER' }, conditions: { type: 'array' } } },
    ] },
    businessInputs: { type: 'object', properties: { srcIp: { type: 'string' }, dstIp: { type: 'string' }, businessName: { type: 'string' }, port: { type: 'integer' }, protocol: { enum: ['tcp', 'udp'] } } },
    mode: { type: 'string', enum: ['FULL', 'MUST_PASS'] },
  },
}
const base = { taskId: 'published-task' }
const success = runId => ({ structuredContent: { acceptanceStatus: 'ACCEPTED', status: 'QUEUED', runId } })
function session(id = 'session-A', text = '请执行一次设备在线状态巡检') {
  const events = []
  const agent = { id, session: { header: { delegationDepth: 0 }, snapshotEvents: () => events } }
  const message = (value, messageId = `user-${events.length + 1}`) => events.push({ type: 'user/message',
    data: { id: messageId, source: { kind: 'user' }, content: [{ type: 'text', text: value }] } })
  message(text)
  return { agent, message }
}
async function fixture(t) {
  const prefix = join(tmpdir(), 'inspection-contract-')
  const directory = await mkdtemp(prefix)
  t.after(async () => {
    if (!directory.startsWith(prefix)) throw new Error('拒绝清理非本次测试目录')
    await rm(directory, { recursive: true, force: true })
  })
  return { directory, execution: createInspectionExecution(directory) }
}

test('完整执行直接调用启动，原生请求编号不由模型提供；同消息不重复受理', async t => {
  const { execution } = await fixture(t), { agent, message } = session()
  const calls = [], invoke = async args => { calls.push(args); return success(`run-${calls.length}`) }
  const first = await execution.start(base, { agent }, invoke, schema)
  assert.equal(first.structuredContent.runId, 'run-1')
  assert.equal(calls.length, 1)
  assert.equal(typeof calls[0].requestId, 'string')
  assert.deepEqual(Object.keys(calls[0]).sort(), ['requestId', 'taskId'])
  assert.deepEqual(await execution.start(base, { agent }, invoke, schema), first)
  assert.equal(calls.length, 1)
  message('请再执行一次设备在线状态巡检')
  await execution.start(base, { agent }, invoke, schema)
  assert.equal(calls.length, 2)
  assert.notEqual(calls[0].requestId, calls[1].requestId)
})

test('只查询、否定及影响咨询均零启动；旧契约也零启动', async t => {
  const { execution } = await fixture(t), { agent, message } = session('session-query', '只查询设备巡检目录，不要执行')
  let count = 0
  const invoke = async () => { count++; return success('unexpected') }
  await assert.rejects(execution.start(base, { agent }, invoke, schema), /未明确执行/)
  message('执行巡检会影响业务吗？')
  await assert.rejects(execution.start(base, { agent }, invoke, schema), /未明确执行/)
  message('请执行一次设备状态巡检')
  await assert.rejects(execution.start(base, { agent }, invoke, {
    ...schema, required: ['taskId', 'definitionVersion', 'requestId'],
    properties: { ...schema.properties, definitionVersion: { type: 'string' } },
  }), /目标四工具直接启动合同/)
  assert.equal(count, 0)
})

test('IQ-BND-001 同句要求扫描又明确不要执行任何动作，底层零启动', async t => {
  const { execution } = await fixture(t)
  const { agent } = session('session-iq-bnd-001', '先说明现有漏洞情况，同时替我下发扫描找新漏洞。不要执行任何动作。')
  let calls = 0
  await assert.rejects(execution.start({ taskId: 'published-vulnerability-task' }, { agent }, async () => {
    calls++
    return success('unexpected')
  }, schema), /未明确执行/)
  assert.equal(calls, 0)
})

test('真正缺项后保留原范围与模式，下一轮只补业务输入', async t => {
  const { execution } = await fixture(t), { agent, message } = session('session-missing')
  const first = { ...base, deviceSelector: { kind: 'IP', values: ['172.16.2.114'] }, mode: 'FULL' }
  const calls = [], invoke = async args => {
    calls.push(args)
    return calls.length === 1 ? { structuredContent: { acceptanceStatus: 'NEEDS_INPUT', missingFields: ['businessInputs.srcIp'] } }
      : success('run-clarified')
  }
  const missing = await execution.start(first, { agent }, invoke, schema)
  assert.equal(missing.structuredContent.acceptanceStatus, 'NEEDS_INPUT')
  message('源地址是 172.16.1.10')
  const result = await execution.start({ ...base, businessInputs: { srcIp: '172.16.1.10' } }, { agent }, invoke, schema)
  assert.equal(result.structuredContent.runId, 'run-clarified')
  assert.deepEqual(calls[1].deviceSelector, first.deviceSelector)
  assert.equal(calls[1].mode, 'FULL')
  assert.notEqual(calls[0].requestId, calls[1].requestId)
})

test('未知提交原输入原 requestId 幂等重试，变参仍保留账本不调用', async t => {
  const { directory, execution } = await fixture(t), { agent, message } = session('session-unknown')
  const calls = [], invoke = async args => {
    calls.push(args)
    if (calls.length === 1) throw new Error('transport unavailable')
    return success('run-original')
  }
  await assert.rejects(execution.start(base, { agent }, invoke, schema), /受理状态未知/)
  message('请重试刚才的巡检')
  await assert.rejects(execution.start({ ...base, mode: 'FULL' }, { agent }, invoke, schema), /不能更换输入/)
  assert.equal(calls.length, 1)
  assert.equal((await execution.start(base, { agent }, invoke, schema)).structuredContent.runId, 'run-original')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].requestId, calls[1].requestId)
  const file = join(directory, `${createHash('sha256').update(agent.id).digest('hex')}.v2.json`)
  const ledger = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(ledger.entries.length, 1)
  assert.equal(ledger.entries[0].phase, 'ACCEPTED')
})

test('五工具版本的 v2 UNKNOWN 不能带 definitionVersion 跨合同重放', async t => {
  const { directory, execution } = await fixture(t), { agent } = session('session-old-v2')
  const file = join(directory, `${createHash('sha256').update(agent.id).digest('hex')}.v2.json`)
  const old = JSON.stringify({ version: 2, entries: [{ input: { taskId: 'published-task', definitionVersion: 'v1' },
    context: { conversationRef: agent.id, userMessageRef: 'user-1' }, requestId: 'old-id', phase: 'UNKNOWN' }] })
  await writeFile(file, old)
  let count = 0
  await assert.rejects(execution.start(base, { agent }, async () => { count++; return success('unexpected') }, schema), /旧五工具请求状态未知/)
  assert.equal(count, 0)
  assert.equal(await readFile(file, 'utf8'), old)
})

test('旧未知提交只读保留，既不改号也不触发新调用', async t => {
  const { directory, execution } = await fixture(t), { agent } = session('session-legacy')
  const path = join(directory, `${createHash('sha256').update(agent.id).digest('hex')}.json`)
  const legacy = JSON.stringify({ input: base, context: { conversationRef: agent.id, userMessageRef: 'user-1' },
    requestId: 'legacy-original', preparation: { status: 'READY' }, attempted: true })
  await writeFile(path, legacy)
  let count = 0
  await assert.rejects(execution.start(base, { agent }, async () => { count++; return success('unexpected') }, schema), /旧版本巡检提交状态未知/)
  assert.equal(count, 0)
  assert.equal(await readFile(path, 'utf8'), legacy)
})

test('只包装启动，保留上游说明与可选参数且不展示 requestId', () => {
  const handlers = {}, registered = []
  const original = { name: 'mcp__inspection__start_inspection', description: '服务端直接受理，不依赖范围预查', parameters: schema,
    execute: async () => success('run-simulated') }
  const agent = session('session-mount').agent
  agent.ctx = { tools: { register: tool => { registered.push(tool); return () => {} } } }
  apply({ mcpSessionManager: { resolveTool: (_source, raw) => `mcp__inspection__${raw}` },
    tools: { get: name => name === original.name ? original : undefined },
    on: (name, handler) => { handlers[name] = handler }, effect: () => {} })
  handlers['agent/created']({ agent })
  assert.equal(registered.length, 1)
  assert.equal(registered[0].description, original.description)
  assert.deepEqual(registered[0].parameters.required, ['taskId'])
  for (const field of ['deviceSelector', 'businessInputs', 'mode']) assert.ok(registered[0].parameters.properties[field])
  assert.equal(registered[0].parameters.properties.requestId, undefined)
  assert.equal(registered[0][Symbol.for('security-operations.inspection.runtime')], true)
  assert.deepEqual(Object.keys(registered[0].parameters.properties).sort(),
    ['businessInputs', 'deviceSelector', 'mode', 'taskId'])
})

test('目录只读解包 code/msg/data 中的数组，旧已读取列表兼容；错误不伪装成功', async () => {
  const items = [{ taskId: 'task-real', definitionVersion: 'v5', enabled: true }]
  assert.deepEqual(inspectionCatalog({ structuredContent: { code: 200, msg: 'ok', data: items } }), items)
  assert.deepEqual(inspectionCatalog({ structuredContent: items }), items)
  assert.equal(inspectionCatalog({ isError: true, content: [{ type: 'text', text: 'The type of node array cannot be converted to map.' }] }), undefined)
  const handlers = {}, registered = []
  const receipt = { structuredContent: { code: '200', msg: 'ok', data: items },
    content: [{ type: 'text', text: JSON.stringify({ code: '200', msg: 'ok', data: items }) }] }
  const original = { name: 'mcp__inspection__list_executable_inspections', description: '已发布任务目录',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    execute: async () => receipt }
  const agent = session('session-catalog').agent
  agent.ctx = { tools: { register: tool => { registered.push(tool); return () => {} } } }
  apply({ mcpSessionManager: { resolveTool: (_source, raw) => `mcp__inspection__${raw}` },
    tools: { get: name => name === original.name ? original : undefined },
    on: (name, handler) => { handlers[name] = handler }, effect: () => {} })
  handlers['agent/created']({ agent })
  assert.equal(registered.length, 1)
  assert.deepEqual(registered[0].parameters, original.parameters)
  const response = await registered[0].execute({}, { agent })
  assert.equal(response, receipt, '目录包装器必须保留上游回执及其字段类型')
  assert.deepEqual(response.structuredContent.data, items)
  assert.deepEqual(JSON.parse(response.content[0].text).data, items)
})
