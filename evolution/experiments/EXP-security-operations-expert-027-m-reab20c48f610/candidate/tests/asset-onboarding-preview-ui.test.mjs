// 仅内存文件与模拟SOC组；不访问网络、真实SOC或业务目录。
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
  await assert.rejects(clean.tool.execute({ action: 'commit', preview_digest: cleanPreview.preview_digest }, clean.exec), /第1条 172\.16\.138\.12 缺部署形态、设备类型/)
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
  const confirm = await h.tool.execute({ action: 'ui_event', preview_digest: custom.preview_digest, event: { type: 'confirm', session: 'preview-edit', row_index: 1, ip: '172.16.138.12' } }, h.exec)
  assert.equal(confirm.requires_user_confirmation, true)
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
  assert.ok(html.includes('table-layout: fixed') && html.includes('min-width: 628px'))
  for (const width of ['col-idx { width: 28px; }', 'col-ip { width: 124px; }', 'col-name { width: 122px; }', 'col-type { width: 72px; }', 'col-os { width: 86px; }', 'col-deploy { width: 116px; }', 'col-status { width: 80px; }']) assert.ok(html.includes(width), width)
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
      async listGroupTools() { return { tools: [{ name: 'list_soc_asset', inputSchema: { type: 'object' }, _meta: { [OWNER]: { serverId: 'ai-soc-master', kind: 'template', sourceName: 'list_soc_asset', sourceUri: 'mock-read' } } }], _meta: { [TARGET]: { version: 2, digest: 'a'.repeat(64) } } } },
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
  assert.equal(html.includes("hint.textContent = '已取消'"), false)
  assert.equal(/id="cancel"[^>]*disabled/.test(html), false)
  assert.ok(html.includes('取消纳管') && html.includes('确认纳管'))
  assert.ok(html.includes('min-width: 96px') && html.includes('height: 36px'))
  assert.ok(html.includes('.deploy-field') && html.includes('border-top: 5px solid currentColor'))
  assert.ok(html.includes("padding-right: 24px"))
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
