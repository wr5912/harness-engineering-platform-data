import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, deliveryMarkdown } from './threat-analysis.mjs'
import { LOGICAL_MAPPINGS, startMcpGroupBridge } from './threat-analysis/mcp-group-bridge.mjs'

const ingest = LOGICAL_MAPPINGS.find(item => item.target.sourceId === 'ai-soc-ingest')
const unavailable = 'ai-soc-ingest: http://soc.invalid/ingest/{assetId}（已选资源当前不可用）'
const partial = { missing: ingest.tool, unavailable: [unavailable] }
const digest = 'a'.repeat(64)
function fixture(snapshots) {
  let attempt = 0, snapshot, closed = 0
  const meta = () => ({
    'io.deepseek.dsh/mcp-group-target': { version: 2, digest: snapshot.digest ?? digest },
    'io.deepseek.dsh/mcp-group-discovery': { unavailable: snapshot.unavailable ?? [] },
  })
  const catalog = kind => LOGICAL_MAPPINGS.filter(item => item.target.kind === kind && item.tool !== snapshot.missing)
    .map(({ target }, index) => ({ name: target.name ?? `${target.sourceId}_${target.rawName}`,
      ...(kind === 'tool' ? { _meta: { 'io.deepseek.dsh/mcp-group-tool': {
        serverId: target.sourceId, kind: 'tool', sourceName: target.rawName,
      } } } : kind === 'resource' ? { uri: `mcp-group:/threat-analysis-runtime/${target.sourceId}/r/${index}` }
        : { uriTemplate: `mcp-group:/threat-analysis-runtime/${target.sourceId}/t/${index}{?${target.variables.join(',')}}` }),
    }))
  const client = {
    async listTools() {
      snapshot = snapshots[Math.min(attempt++, snapshots.length - 1)]
      return { tools: catalog('tool'), _meta: meta() }
    },
    async listResources() { return { resources: catalog('resource'), _meta: meta() } },
    async listResourceTemplates() { snapshot.onTemplates?.(); return { resourceTemplates: catalog('template'), _meta: meta() } },
    async callTool() { assert.fail('预检不能认领或回写事件') },
    async readResource() { assert.fail('预检不能读取业务数据') },
    async close() { closed++ },
  }
  return { client, get attempts() { return attempt }, get closed() { return closed },
    start: options => startMcpGroupBridge({ groupUrl: 'http://runtime.invalid/mcp/groups/threat-analysis-runtime/v2',
      mode: 'manual', clientFactory: async () => client, ...options }) }
}

test('单个 SOC 接口暂不可用时等待后重查，恢复后才开放研判桥', async t => {
  const f = fixture([partial, {}])
  const bridge = await f.start()
  t.after(() => bridge.close())
  assert.equal(f.attempts, 2)
  assert.equal(bridge.targetDigest, digest)
})

test('整个来源连续两次不可用仍可恢复，最多重查两次', async t => {
  const down = { ...partial, unavailable: ['ai-soc-ingest'] }
  const f = fixture([down, down, {}])
  const bridge = await f.start()
  t.after(() => bridge.close())
  assert.equal(f.attempts, 3)
})

test('持续缺失接口时保留来源诊断、终止预检并关闭连接', async () => {
  const f = fixture([partial])
  await assert.rejects(f.start(), error => {
    assert.equal(error.code, 'MCP_MAPPING_UNAVAILABLE')
    assert.deepEqual(error.missingMappings, [ingest.tool])
    assert.deepEqual(error.unavailableSources, [unavailable])
    return true
  })
  assert.equal(f.attempts, 3)
  assert.equal(f.closed, 1)
})

test('没有缺失来源的不可用标记时立即拒绝，不掩盖配置缺失', async () => {
  const f = fixture([{ missing: ingest.tool, unavailable: ['ai-soc-event'] }])
  await assert.rejects(f.start(), { code: 'MCP_MAPPING_UNAVAILABLE' })
  assert.equal(f.attempts, 1)
  assert.equal(f.closed, 1)
})

test('重查时目标发生变化立即拒绝，不切换到新目标', async () => {
  const f = fixture([partial, { digest: 'b'.repeat(64) }])
  await assert.rejects(f.start({ expectedTargetDigest: digest }), /threat_connection_conflict/)
  assert.equal(f.attempts, 2)
  assert.equal(f.closed, 1)
})

test('等待重查期间取消会中止任务并关闭连接', async () => {
  const controller = new AbortController()
  const f = fixture([{ ...partial, onTemplates: () => setTimeout(() => controller.abort(), 20) }])
  await assert.rejects(f.start({ signal: controller.signal }), { name: 'AbortError' })
  assert.equal(f.attempts, 1)
  assert.equal(f.closed, 1)
})

test('待研判队列预检只查询工具目录，恢复后不要求取证接口', async t => {
  const pending = LOGICAL_MAPPINGS[0]
  const f = fixture([{ missing: pending.tool, unavailable: [pending.target.sourceId] }, {}])
  f.client.listResources = f.client.listResourceTemplates = async () => assert.fail('待研判队列不查询资源目录')
  const bridge = await f.start({ mode: 'pending' })
  t.after(() => bridge.close())
  assert.equal(f.attempts, 2)
})

test('预检失败保存具体原因，批次交付明确研判未开始', async t => {
  const home = await mkdtemp(join(tmpdir(), 'threat-preflight-test-'))
  const previous = process.env.DSH_HOME
  t.after(async () => {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  })
  process.env.DSH_HOME = home
  const tools = new Map(), hooks = new Map(), url = 'http://runtime.invalid/mcp/groups/threat-analysis-runtime/v2'
  const pending = fixture([{}])
  pending.client.callTool = async request => {
    assert.equal(request.name, 'ai-soc-correlate_get_correlate_incident_judge_pending')
    return { structuredContent: { code: 200, data: { rows: [{ incidentId: 'INC-20261020-000194' }] } } }
  }
  const connection = { groupUrl: () => url, groupFetch: () => () => assert.fail('不应连接真实 SOC') }
  apply({ on: (name, hook) => hooks.set(name, hook), tools: { register: tool => tools.set(tool.name, tool) }, llm: { registerAdapter() {} },
    get: () => connection, mcpSessionManager: connection },
  { connections: { runtimeGroup: { id: 'threat-analysis-runtime', url } } }, {
    openMcpGroupBridge: async options => {
      if (options.mode === 'pending') return pending.start({ mode: 'pending', signal: options.signal })
      throw Object.assign(new Error('partial discovery'), {
        code: 'MCP_MAPPING_UNAVAILABLE', missingMappings: [ingest.tool], unavailableSources: [unavailable],
      })
    },
  })
  const signal = new AbortController().signal
  const events = [{ type: 'turn/start', data: { turn: 1 } }]
  const agent = { id: 'session-test', session: { id: 'session-test', snapshotEvents: () => events },
    options: { provider: 'native', model: 'test' } }
  const message = { id: 'reminder-test', role: 'user', source: { kind: 'schedule' }, content: [{ type: 'text',
    text: `reminder_prompt_json: ${JSON.stringify(JSON.stringify({ type: 'threat-analysis.pending', version: 1, batchSize: 1 }))}\nschedule_id_json: "schedule-test"\noccurrence_at: ${new Date().toISOString()}` }] }
  await hooks.get('agent/pre-step')({ agent, turn: 1, step: 1, messages: [message], signal },
    async () => ({ kind: 'enter', messages: [message] }))
  const batch = await tools.get('analyze_pending_threat_incidents').execute({ batch_size: 1 }, { agent, signal })
  assert.equal(batch.attempted, 1)
  assert.equal(batch.failed, 1)
  assert.equal(batch.completed, 0)
  assert.equal(pending.closed, 1)
  const item = batch.results[0]
  const value = JSON.parse(await readFile(join(home, 'threat-analysis', item.run_id, 'result.json'), 'utf8'))
  assert.equal(value.status, 'preflight_failed')
  assert.equal(value.llm_invoked, false)
  assert.match(value.business_message, /SOC 工具或资源暂不可用/)
  assert.deepEqual(value.unavailable_sources, [unavailable])
  assert.equal(item.reason, value.business_message)
  const markdown = deliveryMarkdown([{ type: 'tool/result', data: { turn: 1, meta: { threat_analysis_batch: batch } } }], 1)
  assert.match(markdown, /INC-20261020-000194：研判未开始/)
  assert.ok(markdown.includes(ingest.tool))
  assert.match(markdown, /本次没有认领事件/)
})
