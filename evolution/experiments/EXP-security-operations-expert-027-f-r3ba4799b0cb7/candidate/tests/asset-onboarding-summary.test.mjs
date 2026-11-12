// 响应集成回归：内存持久化与模拟SOC组，不访问业务网络、不启动真实扫描或登记。
import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
const files = new Map()
mock.module('node:fs/promises', { namedExports: {
  mkdir: async () => {},
  readFile: async path => { if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(path) },
  writeFile: async (path, value, options) => { if (options?.flag === 'wx' && files.has(path)) throw Object.assign(new Error('exists'), { code: 'EEXIST' }); files.set(path, value) },
} })
const { apply, TOOL_NAME, GROUP_ID } = await import(process.env.ASSET_TEST_BUILT === '1' ? '../dsh/managed/asset-onboarding-runtime.mjs' : '../dsh/managed/asset-onboarding-runtime.ts')
const OWNER = 'io.deepseek.dsh/mcp-group-tool', TARGET = 'io.deepseek.dsh/mcp-group-target'
const previewId = '731000000000000001', taskId = '731000000000000002'
const ranges = '10.27.0.1-10.27.0.18'
const coverage = { previewTaskId: previewId, includedRanges: ranges, autoAdopt: false, managedSkipped: 5, scanTargetCount: 13 }
const findings = [{ findingId: '731000000000000003', taskId, ip: '10.27.0.7', alive: 1, identifyStatus: 'done', suggestAssetType: 'host', suggestName: '真实测试主机' }]
function fixture(id, { sparse = false, rejected = false, taskStatus = 'done', missingCounts = false } = {}) {
  let tool, serial = 0
  const calls = [], events = []
  const turn = text => events.push({ type: 'turn/end' }, { type: 'turn/start' }, { type: 'user/message', data: { id: `u${++serial}`, source: { kind: 'user' }, content: [{ type: 'text', text }] } })
  const persist = value => { const callId = `t${++serial}`; events.push({ type: 'tool/call', data: { name: TOOL_NAME, callId } }, { type: 'tool/result', data: { message: { source: { kind: 'tool', callId }, content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(value) }] }] } } }) }
  const exec = { callId: 'summary', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  const query = 'get_soc_discovery_tasks_by_task_id', scope = 'get_soc_discovery_tasks_scope'
  const uri = name => `http://mock.invalid/soc/discovery/tasks/{taskId}${name === scope ? '/scope' : ''}`
  const scopeFacts = { taskId: previewId, stage: 'preview', autoAdopt: false, canStart: true, requiresConfirmation: true, previewHash: 'f'.repeat(64), includedRanges: ranges, ...(sparse ? {} : { managedSkipped: 5, scanTargetCount: 13 }) }
  const facts = { task: { id: taskId, status: taskStatus, ...(missingCounts ? {} : { total: 13, doneCount: 13, adoptedCount: 0, pendingCount: 1, unreachableCount: 12 }), coverageJson: JSON.stringify(sparse ? { previewTaskId: previewId, includedRanges: ranges, autoAdopt: false } : coverage) }, findings }
  apply({ tools: { register(v) { tool = v }, guard() {} }, mcpSessionManager: {
    async listGroupTools() { return { tools: ['create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', query, scope, 'list_soc_asset', 'get_soc_asset_by_asset_id'].map(name => ({ name, inputSchema: { type: 'object', required: ['taskId'], properties: { taskId: { type: 'string' } } }, _meta: { [OWNER]: { serverId: 'ai-soc-master', sourceName: name, kind: [query, scope, 'list_soc_asset', 'get_soc_asset_by_asset_id'].includes(name) ? 'template' : 'tool', sourceUri: uri(name) } } })), _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
    async callGroupTool(_g, _v, name, args) {
      calls.push({ name, args })
      let data
      if (name === 'create_soc_discovery_tasks') data = scopeFacts
      if (name === 'start_soc_discovery_tasks') data = { taskId, task: { id: taskId, status: 'running', coverageJson: JSON.stringify(sparse ? { previewTaskId: previewId, includedRanges: ranges, autoAdopt: false } : coverage) } }
      if (name === query) data = facts
      if (name === scope) data = scopeFacts
      if (name === 'list_soc_asset') data = { total: 0, rows: [] }
      if (name === 'get_soc_asset_by_asset_id') data = { assetId: '991', ip: findings[0].ip, hostname: findings[0].suggestName, assetType: 'host' }
      if (name === 'create_soc_discovery_tasks_adopt') data = { adopted: rejected ? 0 : 1, failed: rejected ? 1 : 0, results: [{ findingId: findings[0].findingId, ...(rejected ? { error: '明确拒绝测试' } : { assetId: '991' }) }] }
      if ([query, scope, 'list_soc_asset', 'get_soc_asset_by_asset_id'].includes(name)) return { structuredContent: { contents: [{ uri: `mcp-group:/${GROUP_ID}/ai-soc-master/t/${Buffer.from(uri(name)).toString('base64url')}`, text: JSON.stringify({ code: 200, data }) }] } }
      return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data }) }] }
    },
  } })
  const run = async args => { const value = await tool.execute(args, exec); persist(value); return value }
  const discover = async () => { turn(`对${ranges}执行资产发现和纳管`); return run({ action: 'discover', ranges }) }
  const preview = async () => { const discovery = await discover(); turn('继续查询'); const queried = await run({ action: 'query', task_id: taskId }); const result = await run({ action: 'preview', source: { kind: 'discovery', evidence_id: queried.evidence_id }, assets: [{ ip: findings[0].ip, findingId: findings[0].findingId, hostname: findings[0].suggestName, assetType: 'host', deployForm: 'vm' }] }); return { discovery, queried, result } }
  return { run, turn, discover, preview, calls, events }
}
function overview(value, heading = '待纳管清单') {
  assert.equal(typeof value.display_markdown, 'string', '真实工具响应必须接入display_markdown，不能只测试helper')
  assert.match(value.display_markdown, /^## 一、资产扫描概况\n/)
  assert.match(value.display_markdown, new RegExp(`## 二、${heading}`))
  assert.doesNotMatch(value.display_markdown, /73100000000000000|taskId|running|<details|<summary|\|序号/)
}
function known(value) {
  overview(value)
  assert.match(value.display_markdown, /范围内 18 个地址/)
  assert.match(value.display_markdown, /已跳过 5 个已纳管地址/)
  assert.match(value.display_markdown, /本次实际扫描 13 个地址/)
}
test('发现→同任务查询→缓存恢复preview贯穿真实范围及扫描口径，不混用候选already_managed', async () => {
  const h = fixture('summary-chain'), { discovery, queried, result } = await h.preview()
  known(discovery); known(queried); known(result)
  assert.match(queried.display_markdown, /12 个地址未响应/)
  assert.equal(result.summary.already_managed, 0)
  assert.equal(result.summary.ranges, ranges)
  assert.match(result.display_markdown, /候选中已纳管 0/)
  assert.match(result.display_markdown, /已完成/)
  assert.doesNotMatch(result.display_markdown, /数量未知|范围信息/)
  assert.equal(h.calls.filter(c => c.name === 'start_soc_discovery_tasks').length, 1)
})
test('文字取消和UI取消回显同次冻结概况及结果标题，不登记也不重启', async () => {
  for (const ui of [false, true]) {
    const h = fixture(`summary-cancel-${ui}`), { result } = await h.preview()
    h.turn('取消纳管')
    const value = await h.run(ui ? { action: 'ui_event', preview_digest: result.preview_digest, event: { type: 'cancel', session: `summary-cancel-${ui}` } } : { action: 'cancel', preview_digest: result.preview_digest })
    overview(value, '纳管结果'); assert.match(value.display_markdown, /已跳过 5 个已纳管地址/); assert.match(value.display_markdown, /已取消/)
    assert.equal(h.calls.some(c => c.name === 'create_soc_discovery_tasks_adopt'), false)
  }
})
test('commit成功及明确失败与receipt重读均保留扫描概况，结果不冒称全部新增', async () => {
  for (const rejected of [false, true]) {
    const h = fixture(`summary-receipt-${rejected}`, { rejected }), { result } = await h.preview()
    h.events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: result.markdown }] } } }); h.turn('确认纳管')
    const receipt = await h.run({ action: 'commit', preview_digest: result.preview_digest })
    const replay = await h.run({ action: 'receipt', preview_digest: result.preview_digest })
    for (const value of [receipt, replay]) { overview(value, '纳管结果'); assert.match(value.display_markdown, /已跳过 5 个已纳管地址/); assert.match(value.display_markdown, /12 个地址未响应/); assert.ok(value.display_markdown.split('## 二、纳管结果')[1].trim().split('\n').length <= 3) }
    assert.match(receipt.display_markdown, rejected ? /失败 1/ : /登记成功 1/)
    assert.equal(h.calls.filter(c => c.name === 'create_soc_discovery_tasks_adopt').length, 1)
  }
})
test('没有冻结跳过字段的旧来源不得用候选already_managed=0替补', async () => {
  const h = fixture('summary-sparse', { sparse: true })
  // 清除start中唯一的coverage统计，仍保留真实身份与范围绑定。
  const { result } = await h.preview()
  overview(result)
  assert.equal(result.summary.already_managed, 0)
  assert.match(result.display_markdown, /跳过数量未知/)
  assert.doesNotMatch(result.display_markdown, /已跳过 0 个已纳管地址|0%|100%/)
})
test('旧preview无scan_overview且ranges为空时，cancel从同证据绑定任务恢复已知概况', async () => {
  const h = fixture('summary-legacy'), { result } = await h.preview()
  const last = h.events.at(-1).data.message.content[0].content[0]
  const legacy = JSON.parse(last.text)
  delete legacy.scan_overview; delete legacy.display_markdown; legacy.summary.ranges = null
  last.text = JSON.stringify(legacy)
  h.turn('取消纳管')
  const cancelled = await h.run({ action: 'cancel', preview_digest: result.preview_digest })
  overview(cancelled, '纳管结果')
  assert.match(cancelled.display_markdown, /范围内 18 个地址/)
  assert.match(cancelled.display_markdown, /已跳过 5 个已纳管地址/)
})
test('扫描失败同任务查询使用结果标题；运行缺计数不补完成百分比或0', async () => {
  for (const taskStatus of ['failed', 'running']) {
    const h = fixture(`summary-task-${taskStatus}`, { taskStatus, missingCounts: true })
    await h.discover(); h.turn('继续查询')
    const value = await h.run({ action: 'query', task_id: taskId })
    overview(value, taskStatus === 'failed' ? '纳管结果' : '待纳管清单')
    assert.match(value.display_markdown, /已跳过 5 个已纳管地址/)
    assert.match(value.display_markdown, /未响应数量未知/)
    assert.doesNotMatch(value.display_markdown, /已完成 0|0 个地址未响应|\d+%/)
    assert.equal(value.registration_ready, false)
    assert.equal(h.calls.some(c => c.name === 'create_soc_discovery_tasks_adopt'), false)
  }
})
