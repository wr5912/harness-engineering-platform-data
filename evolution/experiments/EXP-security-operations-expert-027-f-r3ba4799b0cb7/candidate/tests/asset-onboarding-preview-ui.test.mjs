// 仅内存文件与模拟SOC组；不访问网络、真实SOC或业务目录。
// 本轮回归：统一展示与授权门禁，不把模拟结果视为真实业务验收。
import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { createHash } from 'node:crypto'
const files = new Map()
mock.module('node:fs/promises', { namedExports: {
  mkdir: async () => {},
  readFile: async path => { if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return files.get(path) },
  writeFile: async (path, value, options) => { if (options?.flag === 'wx' && files.has(path)) throw Object.assign(new Error('exists'), { code: 'EEXIST' }); files.set(path, value) },
} })
const runtime = await import(process.env.ASSET_TEST_BUILT === '1' ? '../dsh/managed/asset-onboarding-runtime.mjs' : '../dsh/managed/asset-onboarding-runtime.ts')
const { apply, GROUP_ID, TOOL_NAME, TABLE_COLUMNS, deployFormLabel, STATUS_STYLE } = runtime
const OWNER = 'io.deepseek.dsh/mcp-group-tool', TARGET = 'io.deepseek.dsh/mcp-group-target'
const operations = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const uri = 'http://172.16.138.232:18087/soc/discovery/tasks/{taskId}'
const user = (id, text) => ({ type: 'user/message', data: { id, source: { kind: 'user' }, content: [{ type: 'text', text }] } })
const taskId = '2120100732104658945'
const findings = [
  { id: '101', findingId: '101', ip: '172.16.138.10', alive: 1, identifyStatus: 'done', suggestName: 'host-10', suggestAssetType: 'host' },
  { id: '102', findingId: '102', ip: '172.16.138.11', alive: 1, identifyStatus: 'done', suggestName: 'host-11', suggestAssetType: 'host' },
  { id: '103', findingId: '103', ip: '172.16.138.12', alive: 1, identifyStatus: 'done', suggestName: 'host-12', suggestAssetType: null },
  { id: '104', findingId: '104', ip: '172.16.138.13', alive: 1, identifyStatus: 'done', adoptedAssetId: '9003' },
  { id: '105', findingId: '105', ip: '172.16.138.14', alive: 0 },
  { id: '106', findingId: '106', ip: '172.16.138.15', alive: 0 },
]
const facts = { task: { id: taskId, status: 'done', total: 6, doneCount: 6, adoptedCount: 1, pendingCount: 0, unreachableCount: 2 }, findings }
const managedRows = {
  '172.16.138.10': [{ assetId: 9001, ip: '172.16.138.10', hostname: 'host-10', assetType: 'host' }],
  '172.16.138.11': [{ assetId: 9002, ip: '172.16.138.11', hostname: 'other-11', assetType: 'server' }],
}

function harness(id, { source = { kind: 'discovery', evidence_id: 'e'.repeat(64) }, rows = managedRows } = {}) {
  const calls = []
  let tool
  const evidence = createHash('sha256').update(JSON.stringify([id, taskId, facts])).digest('hex')
  const record = { schema_version: 'asset-onboarding/v1', kind: 'discovery-result', session_id: id, group_id: GROUP_ID, evidence_id: evidence, taskId, state: 'completed',
    completion_contract_verified: true, candidate_complete: true, evidence_complete: true, facts }
  const events = [{ type: 'turn/start' }, user('q', '查询任务'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'query' } },
    { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'query' }, content: [{ type: 'tool-result', toolCallId: 'query', content: [{ type: 'text', text: JSON.stringify(record) }] }] } } },
    { type: 'turn/end' }, { type: 'turn/start' }, user('p', '预览已发现设备')]
  const exec = { callId: 'preview', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
    async listGroupTools() {
      return { tools: [...['list_soc_asset', 'get_soc_asset_by_asset_id'].map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: name, sourceUri: 'mock-read' } } })),
        ...operations.map(name => ({ name, inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: name } } }))], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } }
    },
    async callGroupTool(_group, _version, name, args) {
      calls.push({ name, args })
      if (name === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: (rows[args.ip] ?? []).length, rows: rows[args.ip] ?? [] } }) }] } }
      if (name === 'get_soc_asset_by_asset_id') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { assetId: Number(args.assetId), ip: '172.16.138.12', hostname: 'host-12', assetType: 'host' } }) }] } }
      if (name === 'create_soc_discovery_tasks_adopt') return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { adopted: 1, failed: 0, results: args.body.map(item => ({ findingId: item.findingId, assetId: '9148', status: 'success' })) } }) }] }
      return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { assetId: 9148 } }) }] }
    },
  } })
  const assets = [
    { ip: '172.16.138.10', hostname: 'host-10', assetType: 'host', findingId: '101' },
    { ip: '172.16.138.11', hostname: 'host-11', assetType: 'host', findingId: '102' },
    { ip: '172.16.138.12', hostname: 'host-12', findingId: '103' },
    { ip: '172.16.138.13', hostname: 'host-13', assetType: 'host', findingId: '104' },
  ]
  const persist = (preview, callId) => {
    events.push({ type: 'tool/call', data: { name: TOOL_NAME, callId } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId }, content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } })
  }
  const confirmNow = (preview, id) => {
    events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: preview.markdown }] } } })
    events.push({ type: 'turn/end' }, { type: 'turn/start' }, user(id, '确认纳管'))
  }
  return { tool, calls, events, exec, assets, evidence, source, persist, confirmNow }
}

test('预览先查SOC：已纳管跳过、同IP冲突阻断、summary与七列表格完整', async () => {
  const h = harness('preview-classify')
  const preview = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets: h.assets }, h.exec)
  h.persist(preview, 'preview-1')
  assert.equal(preview.summary.candidates, 4)
  assert.equal(preview.summary.already_managed, 2)
  assert.equal(preview.summary.pending, 1)
  assert.equal(preview.summary.conflicts, 1)
  assert.equal(preview.summary.unreachable, 2)
  assert.equal(preview.summary.missing_deploy_form, 1)
  assert.equal(preview.summary.type_unknown, 1)
  assert.equal(preview.summary.baseline_unknown, 0)
  assert.deepEqual(preview.summary.type_distribution, { 未知: 1 })
  assert.equal(preview.blocked, true)
  assert.deepEqual(preview.assets.map(asset => asset.ip), ['172.16.138.12'])
  assert.deepEqual(preview.skipped.map(row => row.ip).sort(), ['172.16.138.10', '172.16.138.13'])
  assert.equal(preview.conflicts[0].ip, '172.16.138.11')
  assert.deepEqual(preview.conflicts[0].existing.map(row => [row.assetId, row.hostname, row.assetType]), [[9002, 'other-11', 'server']])
  assert.deepEqual(TABLE_COLUMNS, ['序号', 'IP', '名称', '设备类型', '操作系统', '部署形态', '状态'])
  assert.deepEqual(preview.table.columns, TABLE_COLUMNS)
  assert.equal(preview.table.rows.length, 1)
  assert.deepEqual(preview.table.rows[0].slice(0, 2), ['1', '172.16.138.12'])
  assert.equal(preview.table.rows[0][4], '未识别')
  assert.equal(preview.table.rows[0][5], '')
  assert.equal(preview.table.rows[0][6], '待补全')
  assert.equal(preview.markdown.includes('型号ID'), false)
  assert.equal(preview.markdown.includes('宿主ID'), false)
  assert.equal(preview.markdown.includes('未提供'), false)
  assert.match(preview.markdown, /【纳管预览总结】/)
  assert.match(preview.markdown, /未响应 2（未响应不代表无设备）/)
  assert.match(preview.markdown, /阻断提交/)
})

test('冲突预览拒绝提交且不发SOC写；缺字段整批拦截只列序号/IP/字段', async () => {
  const blocked = harness('preview-blocked')
  const preview = await blocked.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: blocked.evidence }, assets: blocked.assets }, blocked.exec)
  blocked.persist(preview, 'preview-blocked'); blocked.confirmNow(preview, 'c')
  await assert.rejects(blocked.tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, blocked.exec), /同IP冲突，阻断提交/)
  assert.equal(blocked.calls.some(call => call.name === 'create_soc_discovery_tasks_adopt'), false)
  const clean = harness('preview-gap')
  const cleanPreview = await clean.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: clean.evidence }, assets: [{ ip: '172.16.138.12', hostname: 'host-12', findingId: '103' }] }, clean.exec)
  clean.persist(cleanPreview, 'preview-gap'); clean.confirmNow(cleanPreview, 'c2')
  await assert.rejects(clean.tool.execute({ action: 'commit', preview_digest: cleanPreview.preview_digest }, clean.exec), /第1条 172\.16\.138\.12 缺设备类型、部署形态/)
  assert.equal(clean.calls.some(call => call.name === 'create_soc_discovery_tasks_adopt'), false)
})

test('部署形态映射中文与自定义、编辑使旧摘要失效、表格事件篡改拒绝且确认不写SOC', async () => {
  const h = harness('preview-edit')
  const first = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets: [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: '虚拟机' }] }, h.exec)
  h.persist(first, 'preview-a')
  assert.equal(first.assets[0].deployForm, 'vm')
  assert.equal(first.table.rows[0][6], '可提交')
  assert.equal(deployFormLabel(first.assets[0].deployForm), '虚拟机')
  assert.deepEqual(first.deploy_form_options.map(option => option.label), ['物理设备', '虚拟机', '容器'])
  const custom = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets: [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: '边缘一体机' }] }, h.exec)
  h.persist(custom, 'preview-b')
  assert.equal(custom.assets[0].deployForm, '边缘一体机')
  assert.notEqual(custom.preview_digest, first.preview_digest)
  h.events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: custom.markdown }] } } }, { type: 'turn/end' }, { type: 'turn/start' }, user('c3', '确认纳管'))
  await assert.rejects(h.tool.execute({ action: 'commit', preview_digest: first.preview_digest }, h.exec), /本会话最新/)
  // custom 是本会话最新预览（first 已被其取代）；以下事件绑定它，篡改用例不绕过latest guard。
  const ok = await h.tool.execute({ action: 'ui_event', preview_digest: custom.preview_digest, event: { type: 'edit', session: 'preview-edit', row_index: 1, ip: '172.16.138.12', fields: { deployForm: '物理设备' } } }, h.exec)
  assert.equal(ok.accepted, true)
  assert.equal(ok.preview_invalidated, true)
  assert.equal(ok.edits.deployForm, 'physical')
  await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: custom.preview_digest, event: { type: 'confirm', session: 'preview-edit' } }, h.exec), /旧摘要已失效/)
  assert.equal(h.calls.some(call => call.name === 'create_soc_discovery_tasks_adopt'), false)
  for (const event of [
    { type: 'edit', session: 'other-session', row_index: 1, ip: '172.16.138.12', fields: { deployForm: 'vm' } },
    { type: 'edit', session: 'preview-edit', row_index: 1, ip: '172.16.138.99', fields: { deployForm: 'vm' } },
    { type: 'edit', session: 'preview-edit', row_index: 1, ip: '172.16.138.12', fields: { status: '可提交' } },
    { type: 'edit', session: 'preview-edit', row_index: 9, ip: '172.16.138.12', fields: { deployForm: 'vm' } },
  ]) await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: custom.preview_digest, event }, h.exec))
  await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: 'a'.repeat(64), event: { type: 'confirm', session: 'preview-edit', row_index: 1, ip: '172.16.138.12' } }, h.exec), /不是本会话最新预览/)
  assert.equal(STATUS_STYLE.failed.color, 'red')
  assert.equal(STATUS_STYLE.incomplete.text, '待补全')
})

test('中文优先呈现：总结、表格、状态与固定HTML模板均中文，机器字段不变', async () => {
  const { readFileSync } = await import('node:fs')
  const h = harness('preview-zh')
  const preview = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets: [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: 'vm' }] }, h.exec)
  assert.match(preview.markdown, /来源：网络发现（discovery）/)
  assert.match(preview.markdown, /任务编号（taskId）2120100732104658945/)
  assert.equal(preview.table.rows[0][3], 'host（主机）')
  assert.equal(preview.table.rows[0][5], '虚拟机')
  assert.equal(preview.summary.source.kind, 'discovery')
  assert.equal(preview.table.columns[6], '状态')
  assert.equal(STATUS_STYLE.submittable.text, '可提交')
  assert.equal(STATUS_STYLE.review.text, '待核对')
  const html = readFileSync('dsh/workspace/.agents/skills/asset-onboarding/assets/asset-table.html', 'utf8')
  for (const text of ['确认纳管', '序号', 'IP', '名称', '设备类型', '操作系统', '部署形态', '状态', '物理设备', '虚拟机', '容器', 'datalist', '来源与统计详情']) assert.ok(html.includes(text), text)
  assert.ok(html.includes('window.dsh.emit'))
  assert.ok(html.includes("emit('asset-table:edit'"))
  assert.ok(html.includes("emit('asset-table:confirm'"))
  assert.equal(html.includes('__custom__'), false)
  assert.equal(/prompt\(|alert\(/.test(html), false)
  assert.ok(html.includes("'list', 'deploy-options'") || html.includes('list="deploy-options"'))
  assert.ok(html.includes('p-green') && html.includes('p-yellow') && html.includes('p-red') && html.includes('p-gray'))
  assert.ok(html.includes('light-dark('))
  assert.ok(html.includes('table-wrap') && html.includes('position: sticky') && html.includes('max-height: 420px'))
  assert.ok(html.includes('table-layout: fixed') && html.includes('width: 100%'))
  for (const width of ['col-idx { width: 5%; }', 'col-ip { width: 18%; }', 'col-name { width: 21%; }', 'col-type { width: 13%; }', 'col-os { width: 14%; }', 'col-deploy { width: 16%; }', 'col-status { width: 13%; }']) assert.ok(html.includes(width), width)
  assert.ok(html.includes('text-overflow: ellipsis'))
  assert.ok(html.includes('aria-label') && html.includes("'请选择'") && html.includes('min-width: 0'))
  assert.ok(html.includes('notice.hidden = false'))
  assert.ok(html.includes('暂时无法核对SOC已有资产，请稍后重试'))
  assert.ok(html.includes('附件导入') && html.includes('网络发现'))
  assert.equal(html.includes('附件导入（excel）'), false)
  assert.ok(html.includes('baseline_unknown') && html.includes('baselineBlocked'))
})


test('附件2行与网络44行展示行数与统计保持真实', async () => {
  for (const count of [2, 44]) {
    let tool
    const id = `rows-${count}`
    const ips = count === 2 ? ['172.16.228.50', '172.16.228.51'] : Array.from({ length: 44 }, (_, i) => `172.16.138.${i + 1}`)
    const attachment = 'b'.repeat(64)
    const record = { schema_version: 'asset-onboarding/v1', kind: 'workbook', session_id: id, group_id: GROUP_ID, attachment_id: attachment, evidence_complete: true, facts: { rows: ips.map(ip => ({ ip })) } }
    const events = [{ type: 'turn/start' }, user('p', '预览附件'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'q' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'q' }, content: [{ type: 'tool-result', toolCallId: 'q', content: [{ type: 'text', text: JSON.stringify(record) }] }] } } },
      { type: 'turn/end' }, { type: 'turn/start' }, user('p2', '预览附件清单')]
    const exec = { callId: 'preview', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
    apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
      async listGroupTools() { return { tools: [{ name: 'list_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'list_soc_asset', sourceUri: 'mock-read' } } }, { name: 'create_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: 'create_soc_asset' } } }], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
      async callGroupTool() { return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } } },
    } })
    const preview = await tool.execute({ action: 'preview', source: { kind: 'excel', attachment_id: attachment }, assets: ips.map(ip => ({ ip })) }, exec)
    assert.equal(preview.table.rows.length, count)
    assert.equal(preview.summary.pending, count)
    assert.equal(preview.summary.missing_deploy_form, count)
    assert.deepEqual(preview.table.columns, ['序号', 'IP', '名称', '设备类型', '操作系统', '部署形态', '状态'])
  }
})


test('设备类型兼容裸code与“code（中文）”展示，回传保持SOC code且不误归类', async () => {
  const { readFileSync } = await import('node:fs')
  const html = readFileSync('dsh/workspace/.agents/skills/asset-onboarding/assets/asset-table.html', 'utf8')
  const start = html.indexOf('const TYPE_LABEL')
  const end = html.indexOf('const DEPLOY_LABEL', start)
  assert.ok(start > 0 && end > start)
  const { typeDisplay, typeEmit } = new Function(`${html.slice(start, end)}; return { typeDisplay, typeEmit };`)()
  assert.equal(typeDisplay('host（主机）'), '主机')
  assert.equal(typeDisplay('server（服务器）'), '服务器')
  assert.equal(typeDisplay('host'), '主机')
  assert.equal(typeDisplay('未知'), '')
  assert.equal(typeDisplay('自定义设备'), '自定义设备')
  assert.equal(typeEmit('主机'), 'host')
  assert.equal(typeEmit('服务器'), 'server')
  assert.equal(typeEmit('host（主机）'), 'host')
  assert.equal(typeEmit('host'), 'host')
  assert.equal(typeEmit('自定义设备'), '自定义设备')
  assert.equal(typeEmit('unknown（未知）'), 'unknown（未知）')
  assert.equal(html.includes('TYPE_LABEL[value]'), false)
})


test('取消只失效本批次，旧摘要不可提交，新预览不受影响', async () => {
  const h = harness('cancel-batch')
  const assets = [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: 'vm' }]
  const first = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets }, h.exec)
  h.persist(first, 'p1')
  await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: first.preview_digest, event: { type: 'cancel', session: 'other' } }, h.exec), /会话/)
  await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: 'a'.repeat(64), event: { type: 'cancel', session: 'cancel-batch' } }, h.exec), /不是本会话最新预览/)
  const cancelled = await h.tool.execute({ action: 'ui_event', preview_digest: first.preview_digest, event: { type: 'cancel', session: 'cancel-batch' } }, h.exec)
  assert.equal(cancelled.cancelled, true)
  assert.equal(cancelled.write_authorized, false)
  h.confirmNow(first, 'c1')
  await assert.rejects(h.tool.execute({ action: 'commit', preview_digest: first.preview_digest }, h.exec), /已取消/)
  const second = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets }, h.exec)
  assert.notEqual(second.preview_digest, first.preview_digest)
  h.persist(second, 'p2')
  h.confirmNow(second, 'c2')
  const receipt = await h.tool.execute({ action: 'commit', preview_digest: second.preview_digest }, h.exec)
  assert.equal(receipt.kind, 'receipt')
})

test('模板提供取消按钮且不受必填阻塞', async () => {
  const { readFileSync } = await import('node:fs')
  const html = readFileSync('dsh/workspace/.agents/skills/asset-onboarding/assets/asset-table.html', 'utf8')
  assert.ok(html.includes('id="cancel"') && html.includes('button.secondary'))
  assert.ok(html.includes("emit('asset-table:cancel'"))
  assert.ok(html.includes('正在取消'))
  assert.ok(html.includes('取消请求未送达') && html.includes("throw new Error('bridge unavailable')"))
  assert.ok(html.includes('交互通道未就绪') && html.includes('等待服务端确认') && html.includes('if (result === false) failed(action)'))
  assert.ok(html.includes("window.dsh?.ready === true") && html.includes("window.addEventListener('dsh:state'"))
  assert.equal(html.includes('15000'), false, '不得用定时器冒充业务确认')
  assert.equal(html.includes("hint.textContent = '已取消'"), false)
  assert.equal(/id="cancel"[^>]*disabled/.test(html), true, '初始桥未就绪时取消也须禁用；就绪后不受必填阻塞')
  assert.ok(html.includes('cancel.disabled = unavailable;'))
  assert.ok(html.includes('confirm.disabled = unavailable || invalidated || !confirmable;'))
  assert.ok(html.includes('取消纳管') && html.includes('确认纳管'))
  assert.ok(html.includes('width: 100px') && html.includes('height: 36px'))
  assert.ok(html.includes('datalist') && html.includes("'list', 'deploy-options'"), '部署字段保留真实可输入下拉')
  assert.ok(html.includes("'请选择'") && html.includes('aria-label'))
})


test('action cancel复用安全失效；已提交拒绝取消；取消后同批编辑被拒', async () => {
  const digestOf = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  const assets = [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: 'vm' }]
  const h = harness('cancel-action')
  const first = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets }, h.exec)
  h.persist(first, 'p1')
  const cancelled = await h.tool.execute({ action: 'cancel', preview_digest: first.preview_digest }, h.exec)
  assert.equal(cancelled.kind, 'cancelled')
  assert.equal(cancelled.write_authorized, false)
  await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: first.preview_digest, event: { type: 'edit', session: 'cancel-action', row_index: 1, ip: '172.16.138.12', fields: { deployForm: 'vm' } } }, h.exec), /已取消/)
  await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: first.preview_digest, event: { type: 'confirm', session: 'cancel-action', row_index: 1, ip: '172.16.138.12' } }, h.exec), /已取消/)
  const submitted = harness('cancel-submitted')
  const second = await submitted.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: submitted.evidence }, assets }, submitted.exec)
  submitted.persist(second, 'p2')
  const dir = `/var/lib/dsh/asset-onboarding/${digestOf([GROUP_ID, 'cancel-submitted'])}`
  for (const state of ['completed', 'pending', 'unknown']) {
    files.set(`${dir}/${second.preview_digest}.json`, JSON.stringify({ preview_digest: second.preview_digest, state }))
    await assert.rejects(submitted.tool.execute({ action: 'ui_event', preview_digest: second.preview_digest, event: { type: 'cancel', session: 'cancel-submitted' } }, submitted.exec), /已提交或提交结果未知/)
    await assert.rejects(submitted.tool.execute({ action: 'cancel', preview_digest: second.preview_digest }, submitted.exec), /已提交或提交结果未知/)
  }
})

test('未知类型占位不计有效类型：type_unknown=8且整批阻断', async () => {
  const id = 'unknown-type', attachment = 'c'.repeat(64)
  let tool
  const ips = Array.from({ length: 9 }, (_, i) => `172.16.138.${i + 20}`)
  const assets = ips.map((ip, i) => ({ ip, hostname: `h-${i}`, assetType: i < 8 ? '未知' : 'server' }))
  const record = { schema_version: 'asset-onboarding/v1', kind: 'workbook', session_id: id, group_id: GROUP_ID, attachment_id: attachment, evidence_complete: true, facts: { rows: ips.map(ip => ({ ip })) } }
  const events = [{ type: 'turn/start' }, user('p', '预览附件'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'q' } },
    { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'q' }, content: [{ type: 'tool-result', toolCallId: 'q', content: [{ type: 'text', text: JSON.stringify(record) }] }] } } },
    { type: 'turn/end' }, { type: 'turn/start' }, user('p2', '预览附件')]
  const exec = { callId: 'preview', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
    async listGroupTools() { return { tools: [{ name: 'list_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'list_soc_asset', sourceUri: 'mock-read' } } }], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
    async callGroupTool() { return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } } },
  } })
  const preview = await tool.execute({ action: 'preview', source: { kind: 'excel', attachment_id: attachment }, assets }, exec)
  events.push({ type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } },
    { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } })
  assert.equal(preview.summary.type_unknown, 8)
  assert.equal(preview.summary.type_distribution['未知'], 8)
  assert.equal(preview.table.rows.filter(row => row[6] === '待补全').length, 9)
  assert.equal(preview.assets.filter(asset => !asset.assetType).length, 8)
  const html = (await import('node:fs')).readFileSync('dsh/workspace/.agents/skills/asset-onboarding/assets/asset-table.html', 'utf8')
  assert.ok(html.includes('const payloadBase = () => ({ preview_digest: data.preview_digest'))
  for (const action of ['edit', 'confirm', 'cancel']) assert.match(html, new RegExp(`emit\\('asset-table:${action}'[^;]*payloadBase\\(\\)`))
})

test('UI批次确认不绑行；服务端回执一次性授权commit，伪造与旧批次拒绝', async () => {
  const id = 'ui-receipt'
  const RECEIPTS = Symbol.for('dsh.ui-html.receipts')
  const h = harness(id)
  const assets = [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: 'vm' }]
  const preview = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets }, h.exec)
  h.persist(preview, 'p1')
  h.events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: preview.markdown }] } } })
  const token = 'receipt-1'
  globalThis[RECEIPTS] = new Map([[token, { sessionId: id, digest: preview.preview_digest, createdAt: Date.now(), eventName: 'asset-table:confirm', consumed: false }]])
  const receiptUser = (msgId, tokenValue) => ({ type: 'user/message', data: { id: msgId, source: { kind: 'user', dshUiReceipt: tokenValue }, content: [{ type: 'text', text: '[交互式HTML回传] 用户点击确认纳管' }] } })
  h.events.push({ type: 'tool/call', data: { name: 'show_ui', callId: 'ui-a' } },
    { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'ui-a' }, meta: { html: `<script type="application/json" id="asset-preview-data">${JSON.stringify({ preview_digest: preview.preview_digest, table: { columns: preview.table.columns, rows: preview.table.rows } })}</script>` }, content: [{ type: 'text', text: 'ok' }] } } })
  h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-confirm', token))
  const confirm = await h.tool.execute({ action: 'ui_event', preview_digest: preview.preview_digest, event: { type: 'confirm', session: id } }, h.exec)
  assert.equal(confirm.batch_confirm, true)
  assert.equal(confirm.requires_user_confirmation, false)
  assert.equal(confirm.ui_receipt_verified, true)
  const receipt = await h.tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, h.exec)
  assert.equal(receipt.kind, 'receipt')
  assert.equal(globalThis[RECEIPTS].get(token).consumed, true)
  // 已消费回执不能再次授权新消息
  h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-confirm-2', token))
  await assert.rejects(h.tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, h.exec), /replayed|已发送|确认/)
  // 伪造 token 与旧摘要均拒绝
  const forged = harness('ui-forged')
  const p2 = await forged.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: forged.evidence }, assets }, forged.exec)
  forged.persist(p2, 'p2')
  forged.events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: p2.markdown }] } } })
  forged.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-forged-msg', 'not-issued'))
  await assert.rejects(forged.tool.execute({ action: 'commit', preview_digest: p2.preview_digest }, forged.exec), /确认/)
  const stale = harness('ui-stale')
  const p3 = await stale.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: stale.evidence }, assets }, stale.exec)
  stale.persist(p3, 'p3')
  stale.events.push({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: p3.markdown }] } } })
  globalThis[RECEIPTS].set('stale-token', { sessionId: 'ui-stale', digest: 'f'.repeat(64), createdAt: Date.now(), eventName: 'asset-table:confirm', consumed: false })
  stale.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-stale-msg', 'stale-token'))
  await assert.rejects(stale.tool.execute({ action: 'commit', preview_digest: p3.preview_digest }, stale.exec), /确认/)
})

test('真实UI完整表单可作展示证据提交；假UI/缺确认/错批次均不写', async () => {
  const RECEIPTS = Symbol.for('dsh.ui-html.receipts')
  const assets = [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: 'vm' }]
  const receiptUser = (msgId, tokenValue) => ({ type: 'user/message', data: { id: msgId, source: { kind: 'user', dshUiReceipt: tokenValue }, content: [{ type: 'text', text: '[交互式HTML回传] 表单确认纳管' }] } })
  const setup = async (id) => {
    const h = harness(id)
    const preview = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets }, h.exec)
    h.persist(preview, 'p1')
    return { h, preview }
  }
  // 1) 纯 UI：清单只在表单，不复述 Markdown；confirm 后直接 commit
  {
    const { h, preview } = await setup('ui-only')
    const token = 'ui-only-token'
    globalThis[RECEIPTS] = new Map([[token, { sessionId: 'ui-only', digest: preview.preview_digest, eventName: 'asset-table:confirm', consumed: false }]])
    h.events.push({ type: 'tool/call', data: { name: 'show_ui', callId: 'ui-b' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'ui-b' }, meta: { html: `<script type="application/json" id="asset-preview-data">${JSON.stringify({ preview_digest: preview.preview_digest, table: { columns: preview.table.columns, rows: preview.table.rows } })}</script>` }, content: [{ type: 'text', text: 'ok' }] } } })
    h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-only-msg', token))
    const confirm = await h.tool.execute({ action: 'ui_event', preview_digest: preview.preview_digest, event: { type: 'confirm', session: 'ui-only' } }, h.exec)
    assert.equal(confirm.ui_receipt_verified, true)
    const receipt = await h.tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, h.exec)
    assert.equal(receipt.kind, 'receipt')
    assert.equal(h.calls.some(call => call.name === 'create_soc_discovery_tasks_adopt'), true)
  }
  // 2) 缺 UI confirm（有回执但未走 ui_event）→ 拒绝
  {
    const { h, preview } = await setup('ui-missing-confirm')
    const token = 'ui-missing-token'
    globalThis[RECEIPTS] = new Map([[token, { sessionId: 'ui-missing-confirm', digest: preview.preview_digest, eventName: 'asset-table:confirm', consumed: false }]])
    h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-missing-msg', token))
    await assert.rejects(h.tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, h.exec), /完整呈现|确认/)
    assert.equal(h.calls.some(call => call.name === 'create_soc_discovery_tasks_adopt'), false)
  }
  // 3) 假 UI（无回执、只有文本）→ 拒绝
  {
    const { h, preview } = await setup('ui-forged-2')
    h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-forged-msg', 'not-issued-token'))
    await assert.rejects(h.tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, h.exec), /完整呈现|确认/)
    assert.equal(h.calls.some(call => call.name === 'create_soc_discovery_tasks_adopt'), false)
  }
  // 4) 错批次摘要（回执 digest 与当前冻结摘要不一致）→ 拒绝
  {
    const { h, preview } = await setup('ui-stale-2')
    const token = 'ui-stale-token'
    globalThis[RECEIPTS] = new Map([[token, { sessionId: 'ui-stale-2', digest: 'f'.repeat(64), eventName: 'asset-table:confirm', consumed: false }]])
    h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, receiptUser('ui-stale-msg', token))
    await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: preview.preview_digest, event: { type: 'confirm', session: 'ui-stale-2' } }, h.exec), /真实UI确认回执/)
    await assert.rejects(h.tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, h.exec), /完整呈现|确认/)
  }
  // 5) 模板必须包含三处 edit 摘要绑定，且 Skill 要求每次重新读取
  const { readFileSync } = await import('node:fs')
  const html = readFileSync('dsh/workspace/.agents/skills/asset-onboarding/assets/asset-table.html', 'utf8')
  assert.equal((html.match(/emit\('asset-table:edit'/g) ?? []).length, 1, '四个可编辑字段共享同一冻结摘要路径')
  assert.ok(html.includes('const payloadBase = () => ({ preview_digest: data.preview_digest'))
  for (const action of ['edit', 'confirm', 'cancel']) assert.match(html, new RegExp(`emit\\('asset-table:${action}'[^;]*payloadBase\\(\\)`))
  const skill = readFileSync('dsh/workspace/.agents/skills/asset-onboarding/SKILL.md', 'utf8')
  assert.match(skill, /重新读取/)
})

test('HTML展示证据：全量9行纯UI通过；少行/改格/错摘要/错UI/跨会话/纯文本均不写SOC', async () => {
  const RECEIPTS = Symbol.for('dsh.ui-html.receipts')
  const attachment = 'd'.repeat(64)
  const ips = Array.from({ length: 9 }, (_, i) => `172.16.138.${i + 40}`)
  const assets = ips.map(ip => ({ ip, hostname: 'h', assetType: 'server' }))
  const record = { schema_version: 'asset-onboarding/v1', kind: 'workbook', session_id: '', group_id: GROUP_ID, attachment_id: attachment, evidence_complete: true, facts: { rows: ips.map(ip => ({ ip })) } }
  const htmlOf = (data) => `<html><body><script type="application/json" id="asset-preview-data">${JSON.stringify(data)}</script></body></html>`
  const run = async (id, variant) => {
    let tool
    const rec = { ...record, session_id: id }
    const events = [{ type: 'turn/start' }, user('p', '预览附件'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'q' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'q' }, content: [{ type: 'tool-result', toolCallId: 'q', content: [{ type: 'text', text: JSON.stringify(rec) }] }] } } },
      { type: 'turn/end' }, { type: 'turn/start' }, user('p2', '预览附件')]
    const exec = { callId: 'preview', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
    const calls = []
    apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
      async listGroupTools() { return { tools: [{ name: 'list_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'list_soc_asset', sourceUri: 'mock-read' } } }, { name: 'create_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: 'create_soc_asset' } } }], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
      async callGroupTool(_g, _v, name, args) { calls.push(name); if (name === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } }; return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { assetId: '9500' } }) }] } },
    } })
    const preview = await tool.execute({ action: 'preview', source: { kind: 'excel', attachment_id: attachment }, assets }, exec)
    events.push({ type: 'tool/call', data: { name: TOOL_NAME, callId: 'preview-call' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'preview-call' }, content: [{ type: 'tool-result', toolCallId: 'preview-call', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } })
    events.push({ type: 'tool/call', data: { name: 'show_ui', callId: 'ui-1' } })
    let shown = { preview_digest: preview.preview_digest, table: { columns: preview.table.columns, rows: preview.table.rows }, summary: preview.summary }
    if (variant === 'missing-row') shown = { ...shown, table: { columns: shown.table.columns, rows: shown.table.rows.slice(0, -1) } }
    if (variant === 'changed-cell') shown = { ...shown, table: { columns: shown.table.columns, rows: shown.table.rows.map((row, i) => i === 0 ? [...row.slice(0, 2), 'X', ...row.slice(3)] : row) } }
    if (variant === 'wrong-digest') shown = { ...shown, preview_digest: 'f'.repeat(64) }
    if (variant === 'other-ui') shown = { ...shown, table: { columns: shown.table.columns, rows: shown.table.rows.slice(1) }, preview_digest: 'e'.repeat(64) }
    if (variant !== 'no-ui') events.push({ type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'ui-1' }, meta: { v: 1, status: 'presented', html: htmlOf(shown), title: '资产纳管' }, content: [{ type: 'text', text: '[交互式 HTML 界面] 已展示' }] } } })
    const token = `tok-${id}`
    const sessionForReceipt = variant === 'cross-session' ? 'other-session' : id
    globalThis[RECEIPTS] = new Map([[token, { sessionId: sessionForReceipt, digest: preview.preview_digest, eventName: 'asset-table:confirm', consumed: false }]])
    events.push({ type: 'turn/end' }, { type: 'turn/start' }, { type: 'user/message', data: { id: `m-${id}`, source: { kind: 'user', dshUiReceipt: token }, content: [{ type: 'text', text: '[交互式HTML回传] 表单确认' }] } })
    if (variant === 'ok') {
      const confirm = await tool.execute({ action: 'ui_event', preview_digest: preview.preview_digest, event: { type: 'confirm', session: id } }, exec)
      assert.equal(confirm.ui_html_verified, true)
      const receipt = await tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, exec)
      assert.equal(receipt.kind, 'receipt')
      assert.equal(calls.filter(name => name === 'create_soc_asset').length, 9)
    } else {
      await assert.rejects(tool.execute({ action: 'ui_event', preview_digest: preview.preview_digest, event: { type: 'confirm', session: id } }, exec), /真实UI确认回执|完整展示/)
      await assert.rejects(tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, exec), /完整呈现|确认/)
      assert.equal(calls.filter(name => name === 'create_soc_asset').length, 0)
    }
  }
  await run('html-ok', 'ok')
  for (const variant of ['missing-row', 'changed-cell', 'wrong-digest', 'other-ui', 'cross-session', 'no-ui']) await run(`html-${variant}`, variant)
})

test('真实window注入：部署/类型码值等价通过，任意其它单元格变化拒绝', async () => {
  const RECEIPTS = Symbol.for('dsh.ui-html.receipts')
  const attachment = 'e'.repeat(64)
  const ips = ['172.16.138.60', '172.16.138.61']
  const assets = ips.map(ip => ({ ip, hostname: 'h', assetType: 'host', deployForm: 'physical' }))
  const record = { schema_version: 'asset-onboarding/v1', kind: 'workbook', session_id: '', group_id: GROUP_ID, attachment_id: attachment, evidence_complete: true, facts: { rows: ips.map(ip => ({ ip })) } }
  const run = async (id, mutate) => {
    let tool
    const rec = { ...record, session_id: id }
    const events = [{ type: 'turn/start' }, user('p', '预览'), { type: 'tool/call', data: { name: TOOL_NAME, callId: 'q' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'q' }, content: [{ type: 'tool-result', toolCallId: 'q', content: [{ type: 'text', text: JSON.stringify(rec) }] }] } } },
      { type: 'turn/end' }, { type: 'turn/start' }, user('p2', '预览')]
    const exec = { callId: 'preview', agent: { id, session: { id, header: { version: 4, id, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
    const calls = []
    apply({ tools: { register(value) { tool = value }, guard() {} }, mcpSessionManager: {
      async listGroupTools() { return { tools: [{ name: 'list_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'list_soc_asset', sourceUri: 'mock-read' } } }, { name: 'create_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'tool', sourceName: 'create_soc_asset' } } }], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
      async callGroupTool(_g, _v, name) { calls.push(name); if (name === 'list_soc_asset') return { structuredContent: { contents: [{ text: JSON.stringify({ code: 200, data: { total: 0, rows: [] } }) }] } }; return { content: [{ type: 'text', text: JSON.stringify({ code: 200, data: { assetId: '9600' } }) }] } },
    } })
    const preview = await tool.execute({ action: 'preview', source: { kind: 'excel', attachment_id: attachment }, assets }, exec)
    events.push({ type: 'tool/call', data: { name: TOOL_NAME, callId: 'pc' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'pc' }, content: [{ type: 'tool-result', toolCallId: 'pc', content: [{ type: 'text', text: JSON.stringify(preview) }] }] } } })
    const data = { preview_digest: preview.preview_digest, table: { columns: preview.table.columns, rows: preview.table.rows.map(row => [...row]) }, summary: preview.summary }
    if (mutate === 'deploy-code') data.table.rows = data.table.rows.map((row, i) => i === 0 ? [...row.slice(0, 5), 'physical', row[6]] : row)
    if (mutate === 'type-code') data.table.rows = data.table.rows.map((row, i) => i === 0 ? [...row.slice(0, 3), 'host', ...row.slice(4)] : row)
    if (mutate === 'name-change') data.table.rows = data.table.rows.map((row, i) => i === 0 ? [...row.slice(0, 2), 'H', ...row.slice(3)] : row)
    const html = `<html><body><script>window.__ASSET_PREVIEW__ = ${JSON.stringify(data)};</script></body></html>`
    events.push({ type: 'tool/call', data: { name: 'show_ui', callId: 'ui-w' } },
      { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'ui-w' }, toolCallId: 'ui-w', meta: { v: 1, status: 'presented', html }, content: [{ type: 'text', text: 'ok' }] } } })
    const token = `tok-${id}`
    globalThis[RECEIPTS] = new Map([[token, { sessionId: id, digest: preview.preview_digest, eventName: 'asset-table:confirm', consumed: false }]])
    events.push({ type: 'turn/end' }, { type: 'turn/start' }, { type: 'user/message', data: { id: `m-${id}`, source: { kind: 'user', dshUiReceipt: token }, content: [{ type: 'text', text: '[交互式HTML回传] 确认' }] } })
    if (mutate === 'deploy-code' || mutate === 'type-code') {
      const confirm = await tool.execute({ action: 'ui_event', preview_digest: preview.preview_digest, event: { type: 'confirm', session: id } }, exec)
      assert.equal(confirm.ui_html_verified, true)
      const receipt = await tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, exec)
      assert.equal(receipt.kind, 'receipt')
    } else {
      await assert.rejects(tool.execute({ action: 'ui_event', preview_digest: preview.preview_digest, event: { type: 'confirm', session: id } }, exec), /完整展示/)
      await assert.rejects(tool.execute({ action: 'commit', preview_digest: preview.preview_digest }, exec), /完整呈现|确认/)
      assert.equal(calls.filter(name => name === 'create_soc_asset').length, 0)
    }
  }
  await run('win-deploy', 'deploy-code')
  await run('win-type', 'type-code')
  await run('win-name', 'name-change')
})

const completeAssets = [{ ip: '172.16.138.12', hostname: 'host-12', assetType: 'host', findingId: '103', deployForm: 'vm' }]
function showFrozen(h, preview) {
  h.events.push({ type: 'tool/call', data: { name: 'show_ui', callId: 'frozen-ui' } },
    { type: 'tool/result', data: { meta: { status: 'presented', html: `<script type="application/json" id="asset-preview-data">${JSON.stringify({ session_id: h.exec.agent.id, preview_digest: preview.preview_digest, table: preview.table })}</script>` }, message: { source: { kind: 'tool', callId: 'frozen-ui' } } } })
}
test('方案A：只展示HTML全量清单后，真正聊天确认可提交且重复确认幂等', async () => {
  const h = harness('a-text-after-html')
  const p = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets: completeAssets }, h.exec)
  h.persist(p, 'p'); showFrozen(h, p)
  h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, user('c', '确认纳管'))
  const receipt = await h.tool.execute({ action: 'commit', preview_digest: p.preview_digest }, h.exec)
  assert.equal(receipt.kind, 'receipt')
  h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, user('c2', '确认纳管'))
  const replay = await h.tool.execute({ action: 'commit', preview_digest: p.preview_digest }, h.exec)
  assert.equal(replay.replayed, true)
  assert.equal(h.calls.filter(call => call.name === 'create_soc_discovery_tasks_adopt').length, 1)
})
test('方案A：edit回执不授权confirm，失效摘要落盘阻止后续旧按钮提交', async () => {
  const h = harness('a-edit-invalidation')
  const p = await h.tool.execute({ action: 'preview', source: { kind: 'discovery', evidence_id: h.evidence }, assets: completeAssets }, h.exec)
  h.persist(p, 'p'); showFrozen(h, p)
  const token = 'a-edit-token'
  globalThis[Symbol.for('dsh.ui-html.receipts')] = new Map([[token, { sessionId: h.exec.agent.id, digest: p.preview_digest, eventName: 'asset-table:edit', consumed: false }]])
  const message = user('e', '界面编辑'); message.data.source.dshUiReceipt = token
  h.events.push({ type: 'turn/end' }, { type: 'turn/start' }, message)
  await assert.rejects(h.tool.execute({ action: 'ui_event', preview_digest: p.preview_digest, event: { type: 'confirm', session: h.exec.agent.id } }, h.exec), /回执|确认/)
  const edited = await h.tool.execute({ action: 'ui_event', preview_digest: p.preview_digest, event: { type: 'edit', session: h.exec.agent.id, row_index: 1, ip: '172.16.138.12', fields: { deployForm: 'physical' } } }, h.exec)
  assert.equal(edited.preview_invalidated, true)
  h.confirmNow(p, 'c')
  await assert.rejects(h.tool.execute({ action: 'commit', preview_digest: p.preview_digest }, h.exec), /失效|更新|编辑/)
  assert.equal(h.calls.some(call => call.name === 'create_soc_discovery_tasks_adopt'), false)
})
test('方案A：摘要原生H2且首屏无taskId，无进度时不编百分比或零计数', () => {
  assert.equal(typeof runtime.scanOverviewMarkdown, 'function')
  const output = runtime.scanOverviewMarkdown({ kind: 'discovery-result', state: 'pending', taskId: '2120730877588451330', authorized_ranges: '172.16.138.1-172.16.138.254', facts: { task: { status: 'running' } } })
  assert.match(output, /^## 一、资产扫描概况/m)
  for (const label of ['扫描范围', '扫描状态', '地址概况', '发现结果', '纳管概要']) assert.ok(output.includes(label), label)
  assert.doesNotMatch(output, /taskId|2120730877588451330|running|0%|进度.*0/)
})
