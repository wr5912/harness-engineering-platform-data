// 全部文件写入替换为内存Map，SOC组调用替换为本地模拟；无网络/真实业务目录访问。
import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { createHash } from 'node:crypto'
const files = new Map()
mock.module('node:fs/promises', { namedExports: {
  mkdir: async () => {},
  readFile: async path => { if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(path) },
  writeFile: async (path, value, options) => { if (options?.flag === 'wx' && files.has(path)) throw Object.assign(new Error('exists'), { code: 'EEXIST' }); files.set(path, value) },
} })
const { apply, GROUP_ID, TOOL_NAME, derivedReceipt, readAssetIdParam } = await import(process.env.ASSET_TEST_BUILT === '1' ? '../dsh/managed/asset-onboarding-runtime.mjs' : '../dsh/managed/asset-onboarding-runtime.ts')
const OWNER = 'io.deepseek.dsh/mcp-group-tool', TARGET = 'io.deepseek.dsh/mcp-group-target'
const operations = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const uri = 'http://172.16.138.223:18087/soc/discovery/tasks/{taskId}'
const user = (id, text) => ({ type: 'user/message', data: { id, source: { kind: 'user' }, content: [{ type: 'text', text }] } })
for (const outcome of ['registered', 'unknown', 'read401', 'mismatch']) test(`模拟提交${outcome}后重复确认只读原回执，不重复登记`, async () => {
  let tool, writes = 0
  const id = `mock-commit-${outcome}`, assets = [{ ip: '192.0.2.30', hostname: 'mock-03', assetType: 'host' }], source = { kind: 'excel', attachment_id: 'mock-attachment' }
  const digest = createHash('sha256').update(JSON.stringify([GROUP_ID, id, 'preview', assets, source, 'manual', null])).digest('hex')
  const preview = { schema_version: 'asset-onboarding/v1', kind: 'preview', session_id: id, group_id: GROUP_ID, preview_digest: digest, preview_user_message_id: 'preview', assets, source, route: 'manual', taskId: null, markdown: `批次 ${digest}\n|192.0.2.30|mock-03|host|` }
  const events = [{ type: 'turn/start' }, user('preview', '预览'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } }, { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } }, { type: 'assistant/message', data: { content: [{ type: 'text', text: preview.markdown.replace('\n', '\n\n') }] } }, { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-1', '确认导入')]
  const exec = { callId: 'commit-1', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
    async listGroupTools() { return { tools: [...['list_soc_asset', 'get_soc_asset_by_asset_id'].map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: name, sourceUri: 'mock-read' } } })), { name: 'get_soc_discovery_tasks_scope', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'get_soc_discovery_tasks_scope', sourceUri: `${uri}/scope` } } }, ...operations.map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: name } } })), { name: 'get_soc_discovery_tasks_by_task_id', inputSchema: { type: 'object', properties: { taskId: { type: 'integer' } }, required: ['taskId'] }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'get_soc_discovery_tasks_by_task_id', sourceUri: uri } } }], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
    async callGroupTool(_group, _version, name) { if (name === 'list_soc_asset' || name === 'get_soc_asset_by_asset_id') { if (outcome === 'read401') return { isError: true, content: [{ type: 'text', text: '{\"code\":401,\"msg\":\"mock auth denied\"}' }] }; return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: name === 'list_soc_asset' ? { total: 0, rows: [] } : { assetId: outcome === 'mismatch' ? 502 : 501, ...assets[0] } }) }] } } }; assert.equal(name, 'create_soc_asset'); writes++; if (outcome === 'unknown') throw new Error('模拟发送后回执丢失'); return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { assetId: 501 } }) }] } },
  } })
  const first = await tool.execute({ action: 'commit', preview_digest: digest }, exec)
  assert.equal(first.results[0].status, outcome === 'unknown' ? 'unknown' : 'registered')
   if (outcome !== 'unknown') { assert.equal(first.readback_verified, outcome === 'registered'); assert.equal(first.state, outcome === 'registered' ? 'completed' : 'registered_readback_unverified') }
  events.push({ type: 'turn/end' }, { type: 'turn/start' }, user('confirm-2', '确认导入'))
  const second = await tool.execute({ action: 'commit', preview_digest: digest }, { ...exec, callId: 'commit-2' })
  assert.equal(second.replayed, true); assert.equal(second.results[0].status, outcome === 'unknown' ? 'unknown' : 'registered'); assert.equal(writes, 1)
})

for (const failure of ['create', 'start', 'none']) test(`发现${failure}回执场景只创建启动一次，并沿原任务查询`, async () => {
  let tool; const calls = []
  const id = `mock-discovery-${failure}`, range = '172.16.138.1-172.16.138.254'
  const events = [{ type: 'turn/start' }, user('discover-1', range)]
  const exec = { callId: 'discover-call', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
    async listGroupTools() { return { tools: [{ name: 'get_soc_discovery_tasks_scope', inputSchema: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'get_soc_discovery_tasks_scope', sourceUri: `${uri}/scope` } } }, ...operations.map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: name } } })), { name: 'get_soc_discovery_tasks_by_task_id', inputSchema: { type: 'object', properties: { taskId: { type: 'integer' } }, required: ['taskId'] }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'get_soc_discovery_tasks_by_task_id', sourceUri: uri } } }], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
    async callGroupTool(_group, _version, name, args) {
      calls.push({ name, args })
      if (name === 'create_soc_discovery_tasks') { assert.equal(args.autoAdopt, false); assert.equal(args.includedRanges, range); if (failure === 'create') throw new Error('模拟创建回执未知'); return { code: 200, data: { taskId: 42, previewHash: 'mock-preview', requestId: 'mock-request' } } }
      if (name === 'get_soc_discovery_tasks_scope') return { structuredContent: { contents: [{ uri: `mcp-group:/asset-management/ai-soc-master/t/${Buffer.from(`${uri}/scope`).toString('base64url')}`, text: JSON.stringify({ code: 200, data: { taskId: '42', stage: 'preview', includedRanges: range, excludedRanges: '', autoAdopt: false, canStart: true, requiresConfirmation: true, previewHash: 'mock-preview' } }) }] } }
      if (name === 'start_soc_discovery_tasks') { assert.deepEqual(args, { taskId: 42, body: { previewHash: 'mock-preview' } }); if (failure === 'start') throw new Error('模拟启动回执未知'); return { code: 200, data: { status: 'RUNNING' } } }
      assert.equal(name, 'get_soc_discovery_tasks_by_task_id'); assert.equal(args.taskId, 42)
      return { structuredContent: { contents: [{ uri: `mcp-group:/asset-management/ai-soc-master/t/${Buffer.from(uri).toString('base64url')}`, text: JSON.stringify({ code: 200, data: { status: 'RUNNING', findings: [{ id: 1, ip: '172.16.138.2' }] } }) }] } }
    },
  } })
  const first = await tool.execute({ action: 'discover', ranges: range }, exec)
  assert.equal(first.evidence_complete, false)
  events.push({ type: 'turn/end' }, { type: 'turn/start' }, user('discover-2', range))
  const replay = await tool.execute({ action: 'discover', ranges: range }, { ...exec, callId: 'discover-call-2' })
  assert.equal(replay.replayed, true); assert.equal(calls.filter(row => row.name === 'create_soc_discovery_tasks').length, 1)
  assert.equal(calls.filter(row => row.name === 'start_soc_discovery_tasks').length, failure === 'create' ? 0 : 1)
  if (failure !== 'create') {
    events.push({ type: 'tool/call', data: { name: TOOL_NAME, callId: 'discovery-result' } }, { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'discovery-result' }, content: [{ type: 'tool-result', toolCallId: 'discovery-result', content: [{ type: 'text', text: JSON.stringify(first) }] }] } } })
    const query = await tool.execute({ action: 'query', task_id: 42 }, { ...exec, callId: 'query-call' })
    assert.equal(query.taskId, 42); assert.equal(query.task_status, 'RUNNING'); assert.equal(query.evidence_complete, false)
    events.push({ type: 'tool/call', data: { name: TOOL_NAME, callId: 'query-result' } }, { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'query-result' }, content: [{ type: 'tool-result', toolCallId: 'query-result', content: [{ type: 'text', text: JSON.stringify(query) }] }] } } })
    await assert.rejects(tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: query.evidence_id }, assets: [{ ip: '172.16.138.2', findingId: 1 }] }, { ...exec, callId: 'preview-call' }), /失败、未知或不完整/)
  }
})

for (const mode of ['preview', 'running', 'wrong_scope', 'missing', 'timeout', 'query_prepared', 'query_403', 'query_foreign', 'query_wrong_id', 'query_execution']) test(`恢复原prepared ${mode}只续原任务且不create`, async () => {
 let tool; const calls = [], taskId = '2119614486382673922', range = '172.16.138.1-172.16.138.254', id = `resume-${mode}`
 const prepared = { taskId, includedRanges: range, excludedRanges: '', autoAdopt: false, stage: 'preview', previewHash: 'a'.repeat(64) }
 const old = { schema_version: 'asset-onboarding/v1', session_id: id, group_id: GROUP_ID, kind: 'discovery', evidence_id: 'old', taskId: null, state: 'unknown', ranges: range, excluded_ranges: '', facts: mode === 'missing' ? {} : { prepared } }
 if (mode === 'query_execution') old.facts.started = { taskId: '2120100732104658945', task: { id: '2120100732104658945', coverageJson: { previewTaskId: taskId, includedRanges: range, excludedRanges: '', autoAdopt: false } } }
 const events = [{ type: 'tool/call', data: { name: TOOL_NAME, callId: 'old' } }, { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'old' }, content: [{ type: 'tool-result', toolCallId: 'old', content: [{ type: 'text', text: JSON.stringify(old) }] }] } } }, { type: 'turn/start' }, user('continue', `继续原任务发现纳管 ${range}`)]
 const exec = { callId: 'resume', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
 const names = ['get_soc_discovery_tasks_by_task_id', 'get_soc_discovery_tasks_scope']
 apply({ tools: { register(v) { tool = v }, guard() {} }, mcpSessionManager: {
 async listGroupTools() { return { tools: [...operations.map(name => ({ name, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: name } } })), ...names.map(name => ({ name, inputSchema: { type: 'object', properties: { taskId: { oneOf: [{ type: 'string', pattern: '^[1-9][0-9]{0,18}$' }, { type: 'integer', maximum: Number.MAX_SAFE_INTEGER }] } }, required: ['taskId'] }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: name, sourceUri: name === names[0] ? uri : `${uri}/scope` } } }))], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
 async callGroupTool(_g, _v, name, args) { calls.push(name); assert.equal(args.taskId, mode === 'query_execution' && name === names[0] ? '2120100732104658945' : taskId); if (name === 'start_soc_discovery_tasks') { if (mode === 'timeout') throw new Error('timeout'); return { code: 200, data: {} } }
 if (mode === 'query_403') return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: 403, msg: '没有业务访问权限' }) }] }
 const sourceUri = name === names[0] ? uri : `${uri}/scope`
 const data = name === names[0] ? { task: mode === 'query_execution' ? { ...old.facts.started.task, status: 'done', total: 252, doneCount: 252 } : { id: taskId, status: mode === 'running' ? 'running' : 'preview' } } : { ...prepared, canStart: true, requiresConfirmation: true, autoAdopt: mode === 'wrong_scope' }
  if (mode === 'query_execution' && name === names[0]) data.findings = Array.from({ length: 252 }, (_, i) => ({ id: String(i+1), ip: `172.16.138.${i+1}`, alive: i < 45 ? 1 : 0, suggestName: `SOC-discovered-host-${i+1}`, suggestAssetType: i < 27 ? 'host' : null, nameSourceLabel: 'NETBIOS', evidenceJson: 'PING OPEN_PORTS BANNER ' + 'e'.repeat(1000) }))
 return { structuredContent: { contents: [{ uri: `mcp-group:/asset-management/ai-soc-master/t/${Buffer.from(sourceUri).toString('base64url')}`, text: JSON.stringify({ code: 200, data }) }] } }
 } } })
 if (mode.startsWith('query_')) {
    if (mode === 'query_foreign') { const payload = events[1].data.message.content[0].content[0]; const value = JSON.parse(payload.text); value.session_id = 'other'; payload.text = JSON.stringify(value) }
    const args = { action: 'query', task_id: mode === 'query_wrong_id' ? '2119614486382674000' : mode === 'query_execution' ? '2120100732104658945' : taskId }
    if (mode === 'query_execution') { const result = await tool.execute(args, exec); assert.equal(result.taskId, '2120100732104658945'); assert.equal(result.previewTaskId, taskId); assert.equal(result.candidate_summary.length,45); assert.ok(JSON.stringify(result).length < 20000, `query JSON ${JSON.stringify(result).length}`); assert.equal(result.facts.findings,undefined); assert.equal(calls.length, 2) }
     else if (mode !== 'query_prepared') await assert.rejects(tool.execute(args, exec))
    else { const result = await tool.execute(args, exec); assert.equal(result.recovered_prepared_query_only, true); assert.equal(result.write_authorized, false); assert.equal(result.evidence_complete, false); assert.equal(calls.length, 2) }
  }
  else if (['missing', 'wrong_scope'].includes(mode)) await assert.rejects(tool.execute({ action: 'resume', ranges: range }, exec))
 else { const first = await tool.execute({ action: 'resume', ranges: range }, exec); assert.equal(first.taskId, taskId); await tool.execute({ action: 'resume', ranges: range }, exec) }
 assert.equal(calls.filter(n => n === 'create_soc_discovery_tasks').length, 0)
 assert.equal(calls.filter(n => n === 'start_soc_discovery_tasks').length, ['preview', 'timeout'].includes(mode) ? 1 : 0)
})

for (const tampered of [false, true]) test(`直接text原始cache预览绑定 ${tampered ? '错误摘要拒绝' : '成功'}`, async () => {
  let tool; const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const id = `cache-direct-${tampered}`, taskId = '2120100732104658945'
  const facts = { task: { id: taskId, status: 'done', total: 1, doneCount: 1, adoptedCount: 0, pendingCount: 1, unreachableCount: 0 }, findings: [{ id: '2120100732104658946', ip: '172.16.138.2', alive: 1, identifyStatus: 'done', suggestAssetType: 'host', evidenceJson: 'PING' }] }
  const evidence = digest([id, taskId, facts])
  const record = { schema_version: 'asset-onboarding/v1', kind: 'discovery-result', session_id: id, group_id: GROUP_ID, evidence_id: evidence, taskId, state: 'completed', completion_contract_verified: true, candidate_complete: true, evidence_complete: true, facts: { task: facts.task }, raw_evidence: { digest: tampered ? '0'.repeat(64) : digest(facts) } }
  files.set(`/var/lib/dsh/asset-onboarding/${digest([GROUP_ID,id])}/evidence-${evidence}.json`, JSON.stringify({ session_id: id, taskId, evidence_id: evidence, facts }))
  const events = [{ type: 'tool/call', data: { name: TOOL_NAME, callId: 'query' } }, { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'query' }, content: [{ type: 'text', text: JSON.stringify(record) }] } } }, { type: 'turn/start' }, user('preview','预览已发现设备')]
  const exec = { callId: 'preview', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  apply({ tools: { register(v) { tool = v }, guard() {} }, mcpSessionManager: {} })
  const args = { action: 'preview', source: { kind: 'discovery', evidence_id: evidence }, assets: [{ ip: '172.16.138.2', findingId: facts.findings[0].id, assetType: 'host' }] }
  if (tampered) await assert.rejects(tool.execute(args,exec), /缓存绑定不符/)
  else { const result = await tool.execute(args,exec); assert.equal(result.taskId, taskId); assert.equal(result.route,'adopt'); assert.equal(result.assets.length,1) }
})

for (const rejection of ['请补充部署方式', null]) test(`发现纳管透传已确认字段并把明确拒绝记failed ${rejection ? '拒绝' : '缺ID仍unknown'}`, async () => {
  let tool; let body
  const id = `mock-adopt-${rejection ? 'rejected' : 'unknown'}`, taskId = '2120100732104658945'
  const findingId = '2120101179456540673'
  const assets = [{ ip: '172.16.138.228', hostname: 'CMP-AIFX', assetType: 'host', deployForm: 'vm', findingId }]
  const source = { kind: 'discovery', evidence_id: 'a'.repeat(64) }
  const digest = createHash('sha256').update(JSON.stringify([GROUP_ID, id, 'preview', assets, source, 'adopt', taskId])).digest('hex')
  const markdown = `待纳管设备 1 条 · 批次 ${digest.slice(0,12)}\n|序号|IP|主机名|资产类型|型号ID|部署形态|宿主ID|\n|---|---|---|---|---|---|---|\n|1|172.16.138.228|CMP-AIFX|host|未提供|vm|未提供|`
  const preview = { schema_version: 'asset-onboarding/v1', kind: 'preview', session_id: id, group_id: GROUP_ID, preview_digest: digest, preview_user_message_id: 'preview', assets, source, route: 'adopt', taskId, markdown }
  const events = [{ type: 'turn/start' }, user('preview', '预览已发现设备'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } },
    { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: markdown }] } } }, { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-1', '确认纳管')]
  const exec = { callId: 'commit-1', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
    async listGroupTools() { return { tools: [...['list_soc_asset', 'get_soc_asset_by_asset_id'].map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: name, sourceUri: 'mock-read' } } })), ...operations.map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: name } } }))], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
    async callGroupTool(_group, _version, name, args) {
      if (name === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } }
      if (name === 'get_soc_asset_by_asset_id') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { assetId: 601, ip: '172.16.138.228', hostname: 'CMP-AIFX', assetType: 'host' } }) }] } }
      assert.equal(name, 'create_soc_discovery_tasks_adopt'); assert.equal(args.taskId, taskId); body = args.body
      return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { results: [{ findingId, assetId: null, status: 'pending', error: rejection, registration: null }], failed: 1, adopted: 0 } }) }] }
    },
  } })
  const first = await tool.execute({ action: 'commit', preview_digest: digest }, exec)
  assert.equal(body.length, 1)
  assert.equal(body[0].findingId, findingId)
  assert.equal(body[0].deployForm, 'vm')
  assert.equal(body[0].hostname, 'CMP-AIFX')
  assert.equal(body[0].modelId, -1)
  if (rejection) {
    assert.equal(first.results[0].status, 'failed')
    assert.match(first.results[0].reason, /请补充部署方式/)
    assert.equal(first.state, 'rejected'); assert.equal(first.saved, false); assert.equal(first.rejections.count, 1)
  } else {
    assert.equal(first.results[0].status, 'unknown')
    assert.match(first.results[0].reason, /缺少唯一可核实资产ID/)
  }
  events.push({ type: 'turn/end' }, { type: 'turn/start' }, user('confirm-2', '确认纳管'))
  const second = await tool.execute({ action: 'commit', preview_digest: digest }, { ...exec, callId: 'commit-2' })
  assert.equal(second.replayed, true)
})

test('真实形状旧journal/target仅按原raw明确拒绝释放同IP锁，缺raw/重复finding/有效assetId/journal错绑定仍拦截', async () => {
  const hv = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const taskId = '2120100732104658945', ip = '172.16.138.228', findingId = '2120101179456540673'
  const raws = {
    released: { results: [{ findingId, assetId: null, status: 'pending', error: '请补充部署方式' }], failed: 1, adopted: 0 },
    'no-raw': undefined,
    'dup-finding': { results: [{ findingId, assetId: null, error: '请补充部署方式' }, { findingId, assetId: null, error: '请补充部署方式' }] },
    'has-asset': { results: [{ findingId, assetId: 999, status: 'success' }] },
    'journal-ip-mismatch': { results: [{ findingId, assetId: null, error: '请补充部署方式' }], journalIp: '172.16.138.99' },
  }
  for (const [name, raw] of Object.entries(raws)) {
    let tool, adoptCalls = 0
    const id = `legacy-${name}`, directory = `/var/lib/dsh/asset-onboarding/${hv([GROUP_ID, id])}`
    const oldDigest = hv(['old', id]), digest = hv([GROUP_ID, id, 'preview', [{ ip, hostname: 'CMP-AIFX', assetType: 'host', deployForm: 'vm', findingId }], { kind: 'discovery', evidence_id: 'a'.repeat(64) }, 'adopt', taskId])
    // 真实旧journal无kind字段；真实旧target的findingId在result内。
    files.set(`${directory}/${oldDigest}.json`, JSON.stringify({ preview_digest: oldDigest, taskId, state: 'partial_or_unknown', results: [{ ip: raw?.journalIp ?? ip, findingId, status: 'unknown', reason: '已收到批量回执，但该发现记录缺少唯一可核实资产ID；不重发' }], saved: false, baseline: [], raw_adopt_result: raw, adopt_summary: { adopted: 0, failed: 27 }, registration_complete: false, readback_verified: false, unsubmitted: [] }))
    files.set(`${directory}/target-${hv(ip)}.json`, JSON.stringify({ ip, state: 'unknown', preview_digest: oldDigest, result: { ip, findingId, status: 'unknown', reason: '已收到批量回执，但该发现记录缺少唯一可核实资产ID；不重发' } }))
    const assets = [{ ip, hostname: 'CMP-AIFX', assetType: 'host', deployForm: 'vm', findingId }]
    const source = { kind: 'discovery', evidence_id: 'a'.repeat(64) }
    const markdown = `待纳管设备 1 条 · 批次 ${digest.slice(0,12)}\n|序号|IP|主机名|资产类型|型号ID|部署形态|宿主ID|\n|---|---|---|---|---|---|---|\n|1|${ip}|CMP-AIFX|host|未提供|vm|未提供|`
    const preview = { schema_version: 'asset-onboarding/v1', kind: 'preview', session_id: id, group_id: GROUP_ID, preview_digest: digest, preview_user_message_id: 'preview', assets, source, route: 'adopt', taskId, markdown }
    const events = [{ type: 'turn/start' }, user('preview', '预览已发现设备'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: markdown }] } } }, { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-1', '确认纳管')]
    const exec = { callId: 'commit-1', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
    apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
      async listGroupTools() { return { tools: [...['list_soc_asset', 'get_soc_asset_by_asset_id'].map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: n, sourceUri: 'mock-read' } } })), ...operations.map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: n } } }))], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
      async callGroupTool(_group, _version, toolName) {
        if (toolName === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } }
        if (toolName === 'get_soc_asset_by_asset_id') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { assetId: 601, ip, hostname: 'CMP-AIFX', assetType: 'host' } }) }] } }
        assert.equal(toolName, 'create_soc_discovery_tasks_adopt'); adoptCalls++
        return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { results: [{ findingId, assetId: 601, status: 'success' }], adopted: 1, failed: 0 } }) }] }
      },
    } })
    const result = await tool.execute({ action: 'commit', preview_digest: digest }, exec)
    assert.equal(adoptCalls, name === 'released' ? 1 : 0, name)
    assert.equal(result.results[0].status, name === 'released' ? 'registered' : 'blocked_unknown', name)
  }
  const legacy = { preview_digest: 'c'.repeat(64), results: [{ ip, findingId, status: 'unknown', reason: '缺少可核实资产ID' }], raw_adopt_result: { results: [{ findingId, assetId: null, error: '请补充部署方式' }] } }
  const derived = derivedReceipt(legacy)
  assert.equal(derived.results[0].status, 'failed')
  assert.match(derived.results[0].reason, /请补充部署方式/)
  assert.equal(derived.raw_adopt_result, legacy.raw_adopt_result)
  assert.equal(derivedReceipt({ results: legacy.results }).results[0].status, 'unknown')
})

test('发现路线缺deployForm在SOC写入前拦截且不建journal，旧回执仍优先派生返回，文件路线不新增要求', async () => {
  const hv = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const taskId = '2120100732104658945', ip = '172.16.138.228', findingId = '2120101179456540673'
  const build = ({ id, assets, route = 'adopt', source = { kind: 'discovery', evidence_id: 'b'.repeat(64) } }) => {
    const digest = createHash('sha256').update(JSON.stringify([GROUP_ID, id, 'preview', assets, source, route, route === 'adopt' ? taskId : null])).digest('hex')
    const table = ['|序号|IP|主机名|资产类型|型号ID|部署形态|宿主ID|','|---|---|---|---|---|---|---|',...assets.map((a,i) => `|${i+1}|${a.ip}|${a.hostname}|${a.assetType}|${a.modelId ?? '未提供'}|${a.deployForm ?? '未提供'}|未提供|`)].join('\n')
    const markdown = `待导入设备 ${assets.length} 条 · 批次 ${digest.slice(0,12)}\n${table}`
    const preview = { schema_version: 'asset-onboarding/v1', kind: 'preview', session_id: id, group_id: GROUP_ID, preview_digest: digest, preview_user_message_id: 'preview', assets, source, route, taskId: route === 'adopt' ? taskId : null, markdown }
    const events = [{ type: 'turn/start' }, user('preview', '预览'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: markdown }] } } }, { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-1', '确认纳管')]
    const calls = []
    const exec = { callId: 'commit-1', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
    apply({ tools: { register(value) { globalThis.__tool = value }, guard() {} }, mcpSessionManager: {
      async listGroupTools() { return { tools: [...['list_soc_asset', 'get_soc_asset_by_asset_id'].map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: n, sourceUri: 'mock-read' } } })), ...operations.map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: n } } }))], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
      async callGroupTool(_g, _v, name) {
        calls.push(name)
        if (name === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } }
        if (name === 'get_soc_asset_by_asset_id') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { assetId: 701, ip, hostname: 'CMP-AIFX', assetType: 'host' } }) }] } }
        return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { assetId: 701 } }) }] }
      },
    } })
    return { id, digest, exec, calls, tool: globalThis.__tool }
  }
  const missing = build({ id: 'gap-missing', assets: [{ ip, hostname: 'CMP-AIFX', assetType: 'host', findingId }] })
  await assert.rejects(missing.tool.execute({ action: 'commit', preview_digest: missing.digest }, missing.exec), /提交前缺字段，未发送SOC写请求/)
  assert.equal(missing.calls.includes('create_soc_discovery_tasks_adopt'), false)
  const dir = `/var/lib/dsh/asset-onboarding/${hv([GROUP_ID, 'gap-missing'])}`
  assert.equal(files.has(`${dir}/${missing.digest}.json`), false)
  // 已有旧回执：即使该预览缺deployForm，也必须优先返回派生失败回执。
  const legacy = build({ id: 'gap-legacy', assets: [{ ip, hostname: 'CMP-AIFX', assetType: 'host', findingId }] })
  const d = `/var/lib/dsh/asset-onboarding/${hv([GROUP_ID, 'gap-legacy'])}`
  files.set(`${d}/${legacy.digest}.json`, JSON.stringify({ preview_digest: legacy.digest, taskId, state: 'partial_or_unknown', results: [{ ip, findingId, status: 'unknown', reason: '缺少可核实资产ID' }], saved: false, baseline: [], raw_adopt_result: { results: [{ findingId, assetId: null, error: '请补充部署方式' }], failed: 1, adopted: 0 } }))
  const replay = await legacy.tool.execute({ action: 'commit', preview_digest: legacy.digest }, legacy.exec)
  assert.equal(replay.results[0].status, 'failed')
  assert.match(replay.results[0].reason, /请补充部署方式/)
  assert.equal(legacy.calls.includes('create_soc_discovery_tasks_adopt'), false)
  // 文件路线不因缺deployForm被拦。
  const manual = build({ id: 'gap-manual', route: 'manual', source: { kind: 'excel', attachment_id: 'mock-attachment' }, assets: [{ ip, hostname: 'CMP-AIFX', assetType: 'host' }] })
  const manualResult = await manual.tool.execute({ action: 'commit', preview_digest: manual.digest }, manual.exec)
  assert.equal(manual.calls.includes('create_soc_asset'), true)
  assert.equal(manualResult.results[0].status, 'registered')
})

test('全部明确失败汇总为rejected并给出数量与原因，混合失败未知不冒充确定失败', async () => {
  const hv = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const taskId = '2120100732104658945'
  const run = async (id, assets, rows) => {
    const source = { kind: 'discovery', evidence_id: 'c'.repeat(64) }
    const digest = createHash('sha256').update(JSON.stringify([GROUP_ID, id, 'preview', assets, source, 'adopt', taskId])).digest('hex')
    const table = ['|序号|IP|主机名|资产类型|型号ID|部署形态|宿主ID|','|---|---|---|---|---|---|---|',...assets.map((a,i) => `|${i+1}|${a.ip}|${a.hostname}|${a.assetType}|未提供|vm|未提供|`)].join('\n')
    const markdown = `待纳管设备 ${assets.length} 条 · 批次 ${digest.slice(0,12)}\n${table}`
    const preview = { schema_version: 'asset-onboarding/v1', kind: 'preview', session_id: id, group_id: GROUP_ID, preview_digest: digest, preview_user_message_id: 'preview', assets, source, route: 'adopt', taskId, markdown }
    const events = [{ type: 'turn/start' }, user('preview', '预览'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: markdown }] } } }, { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-1', '确认纳管')]
    const exec = { callId: 'commit-1', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
    apply({ tools: { register(value) { globalThis.__tool2 = value }, guard() {} }, mcpSessionManager: {
      async listGroupTools() { return { tools: [...['list_soc_asset', 'get_soc_asset_by_asset_id'].map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: n, sourceUri: 'mock-read' } } })), ...operations.map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: n } } }))], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
      async callGroupTool(_g, _v, name, args) {
        if (name === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } }
        if (name === 'get_soc_asset_by_asset_id') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { assetId: 801, ip: '172.16.138.228', hostname: 'CMP-AIFX', assetType: 'host' } }) }] } }
        assert.equal(name, 'create_soc_discovery_tasks_adopt')
        return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { results: args.body.map(item => rows(item.findingId)), failed: 2, adopted: 0 } }) }] }
      },
    } })
    return globalThis.__tool2.execute({ action: 'commit', preview_digest: digest }, exec)
  }
  const assets = [
    { ip: '172.16.138.228', hostname: 'CMP-AIFX', assetType: 'host', deployForm: 'vm', findingId: '2120101179456540673' },
    { ip: '172.16.138.229', hostname: 'Linux-主机-138-229', assetType: 'host', deployForm: 'vm', findingId: '2120101175107047426' },
  ]
  const allRejected = await run('reject-all', assets, findingId => ({ findingId, assetId: null, status: 'pending', error: '请补充部署方式' }))
  assert.equal(allRejected.state, 'rejected')
  assert.equal(allRejected.rejections.count, 2)
  assert.deepEqual(allRejected.rejections.reasons, ['请补充部署方式'])
  assert.equal(allRejected.saved, false)
  assert.match(allRejected.message, /明确拒绝本批2条/)
  const mixed = await run('reject-mixed', assets, findingId => findingId === assets[0].findingId
    ? { findingId, assetId: null, status: 'pending', error: '请补充部署方式' }
    : { findingId, assetId: null, status: 'pending' })
  assert.equal(mixed.state, 'partial_or_unknown')
  assert.equal(mixed.rejections.count, 1)
  assert.equal(mixed.results.find(row => row.ip === assets[1].ip).status, 'unknown')
})

test('字符串assetId按当前integer契约精确读取回执，超安全整数保留原ID不发失真参数', async () => {
  const hv = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  assert.equal(readAssetIdParam('9147'), 9147)
  assert.equal(readAssetIdParam(9147), 9147)
  assert.equal(readAssetIdParam('007'), null)
  assert.equal(readAssetIdParam('0'), null)
  assert.equal(readAssetIdParam('2120101179456540673'), null)
  assert.equal(readAssetIdParam('9007199254740993'), null)
  assert.equal(readAssetIdParam('2120101179456540'), 2120101179456540)
  assert.equal(readAssetIdParam(-1), null)
  for (const assetId of ['9147', '2120101179456540673']) test(`提交返回${assetId}后读取`, async () => {
    let tool; const reads = []
    const id = `readback-${assetId}`, taskId = '2120100732104658945', ip = '172.16.138.228', findingId = '2120101179456540673'
    const assets = [{ ip, hostname: 'CMP-AIFX', assetType: 'host', deployForm: 'vm', findingId }]
    const source = { kind: 'discovery', evidence_id: 'd'.repeat(64) }
    const digest = createHash('sha256').update(JSON.stringify([GROUP_ID, id, 'preview', assets, source, 'adopt', taskId])).digest('hex')
    const markdown = `待纳管设备 1 条 · 批次 ${digest.slice(0,12)}\n|序号|IP|主机名|资产类型|型号ID|部署形态|宿主ID|\n|---|---|---|---|---|---|---|\n|1|${ip}|CMP-AIFX|host|未提供|vm|未提供|`
    const preview = { schema_version: 'asset-onboarding/v1', kind: 'preview', session_id: id, group_id: GROUP_ID, preview_digest: digest, preview_user_message_id: 'preview', assets, source, route: 'adopt', taskId, markdown }
    const events = [{ type: 'turn/start' }, user('preview', '预览'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } },
      { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: markdown }] } } }, { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-1', '确认纳管')]
    const exec = { callId: 'commit-1', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
    apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
      async listGroupTools() { return { tools: [...['list_soc_asset', 'get_soc_asset_by_asset_id'].map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: n, sourceUri: 'mock-read' } } })), ...operations.map(n => ({ name: n, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: n } } }))], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
      async callGroupTool(_g, _v, name, args) {
        if (name === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } }
        if (name === 'get_soc_asset_by_asset_id') { reads.push(args.assetId); return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { assetId: Number(args.assetId), ip, hostname: 'CMP-AIFX', assetType: 'host' } }) }] } } }
        assert.equal(name, 'create_soc_discovery_tasks_adopt')
        return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { adopted: 1, failed: 0, results: [{ findingId, assetId, status: 'success' }] } }) }] }
      },
    } })
    const result = await tool.execute({ action: 'commit', preview_digest: digest }, exec)
    assert.equal(result.results[0].assetId, assetId)
    if (assetId === '9147') {
      assert.deepEqual(reads, [9147])
      assert.equal(result.results[0].status, 'registered')
      assert.equal(result.results[0].readback.verified, true)
      assert.equal(result.state, 'completed')
      assert.equal(result.results[0].registration_effect, 'newly_observed')
    } else {
      assert.equal(reads.length, 0)
      assert.equal(result.results[0].status, 'registered')
      assert.equal(result.results[0].readback.state, 'unreadable')
      assert.equal(result.results[0].readback.assetId_preserved, assetId)
      assert.equal(result.state, 'registered_readback_unverified')
    }
  })
})
