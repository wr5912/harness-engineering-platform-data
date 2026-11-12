// 本地 Mock 单元测试；仅纯函数、Mock注册及只读附件/状态分支，不调用SOC、网络或业务持久化接口。
// asset-onboarding-runtime.mjs 由主线程通过受控构建生成，本文件不负责构建或执行。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const runtime = await import(process.env.ASSET_TEST_BUILT === '1'
  ? '../dsh/managed/asset-onboarding-runtime.mjs'
  : '../dsh/managed/asset-onboarding-runtime.ts')
const { TOOL_NAME, GROUP_ID, apply, mainIdentity, normalizeRange, normalizeAssets, previewAssets, priorPreview, unpack } = runtime
import {
  TOOL_ROUTES,
  createSecurityOperationsGuard,
} from '../dsh/managed/security-operations-guard.mjs'

test('纳管原生guard拒绝双重命名或哈希名称的底层操作且不执行任何接口', () => {
  let guard, registered = 0, executions = 0
  const ctx = {
    mcpSessionManager: { resolveTool() { return undefined } },
    tools: {
      guard(value) { guard = value },
      register() { registered++ },
      get() { return { execute() { executions++; throw new Error('Mock不允许执行') } } },
    },
  }
  apply(ctx)
  assert.equal(registered, 1)
  assert.match(guard({ name: `mcp__${GROUP_ID}__mcp__${GROUP_ID}__create_soc_asset`, arguments: {} }), /不能绕过/)
  assert.match(guard({ name: `mcp__${GROUP_ID}__mock_123456789abc`, arguments: {} }), /不能绕过/)
  assert.match(guard({ name: 'read_mcp_resource', arguments: { server: GROUP_ID, uri: 'mock-resource' } }), /不能绕过/)
  assert.equal(guard({ name: TOOL_NAME, arguments: {} }), undefined)
  assert.equal(executions, 0)
})

const SESSION_ID = 'mock-asset-root-session'
const ATTACHMENT_ID = `sha256:${'a'.repeat(64)}`
const SCHEMA = 'asset-onboarding/v1'
const clone = value => JSON.parse(JSON.stringify(value))
const turnStart = turn => ({ type: 'turn/start', data: { turn } })
const turnEnd = turn => ({ type: 'turn/end', data: { turn } })
const user = (id, value, kind = 'user') => ({
  type: 'user/message',
  data: { id, source: { kind }, content: [{ type: 'text', text: value }] },
})
const assistant = value => ({
  type: 'assistant/message',
  data: { message: { content: [{ type: 'text', text: value }] } },
})
const envelope = (value, sessionId = SESSION_ID) => ({
  ...value, schema_version: SCHEMA, session_id: sessionId, group_id: GROUP_ID,
})

function resultEvents(value, { callId = 'mock-call', name = TOOL_NAME, args = {}, isError = false } = {}) {
  return [
    { type: 'tool/call', data: { callId, name, arguments: JSON.stringify(args) } },
    {
      type: 'tool/result',
      data: {
        message: {
          source: { kind: 'tool', callId },
          isError,
          content: [{
            type: 'tool-result', toolCallId: callId, isError,
            content: [{ type: 'text', text: JSON.stringify(value) }],
          }],
        },
      },
    },
  ]
}

function mockExec({ sessionId = SESSION_ID, events = [], header = {}, inbox = {}, signal } = {}) {
  const session = {
    id: sessionId,
    header: {
      version: 4, id: sessionId, createdAt: 0, isSeeded: false, delegationDepth: 0,
      ...header,
    },
    snapshotEvents: () => events,
  }
  return {
    callId: 'mock-execution', signal,
    agent: { id: sessionId, session, inbox: { nextTurn: [], nextStep: [], ...inbox } },
  }
}

test('read_excel高层构建物通过公开附件服务解析既有夹具，不触MCP或受限属性', async () => {
  const buffer = await readFile(new URL('./fixtures/asset-onboarding/asset-basic.xlsx', import.meta.url))
  const ref = { attachmentId: `sha256:${createHash('sha256').update(buffer).digest('hex')}`, name: 'asset-basic.xlsx', bytes: buffer.length }
  let tool, getterReads = 0, streamReads = 0, resolverCalls = 0
  const serviceGets = []
  const backend = { async *readFileStream(actualRef) {
    assert.deepEqual(actualRef, ref)
    streamReads++
    yield buffer.subarray(0, 32)
    yield buffer.subarray(32)
  } }
  const ctx = {
    get(name) { serviceGets.push(name); assert.equal(name, 'attachments'); return backend },
    get attachments() { getterReads++; throw new Error('cannot get property "attachments" without inject') },
    mcpSessionManager: { resolveTool() { resolverCalls++; return undefined } },
    tools: { guard() {}, register(value) { tool = value }, get() { assert.fail('Excel解析不查MCP工具或业务资源') } },
  }
  apply(ctx)
  const request = user('mock-excel-user', '仅解析这个Excel，完整预览，不探测不入库')
  request.data.content.push({ type: 'file', attachment: ref })
  const exec = mockExec({ events: [turnStart(1), request] })
  const result = await tool.execute({ action: 'read_excel', attachment_id: ref.attachmentId }, exec)
  assert.equal(result.kind, 'workbook')
  assert.equal(result.complete, true)
  assert.equal(result.row_count, 3)
  assert.equal(result.attachment.digest_verified, true)
  assert.equal(result.import_authorized, false)
  assert.equal(result.backend_connection_checked, false)
  assert.equal(getterReads, 0)
  assert.equal(streamReads, 1)
  assert.equal(resolverCalls, 0)
  assert.deepEqual(serviceGets, ['attachments'])
})

function excelFixture({ sessionId = SESSION_ID, sourceSessionId = sessionId, request = '读取本会话附件并预览设备清单' } = {}) {
  const source = { kind: 'excel', attachment_id: ATTACHMENT_ID }
  const assets = [{ ip: '192.0.2.10', hostname: 'mock-edge' }, { ip: '192.0.2.11', hostname: 'mock-db' }]
  const workbook = envelope({
    kind: 'workbook', attachment_id: ATTACHMENT_ID, complete: true, import_authorized: false,
    sheets: [{ name: '设备', rows: [
      { row: 1, cells: ['IP', '主机名'] },
      ...assets.map((asset, index) => ({ row: index + 2, cells: [asset.ip, asset.hostname] })),
    ] }],
  }, sourceSessionId)
  const events = [
    turnStart(1), user('mock-upload-user', request),
    ...resultEvents(workbook, { callId: 'mock-workbook', args: { action: 'read_excel', attachment_id: ATTACHMENT_ID } }),
  ]
  const exec = mockExec({ sessionId, events })
  return { source, assets, workbook, events, exec, identity: mainIdentity(exec) }
}

function discoveryFixture(overrides = {}) {
  const source = { kind: 'discovery', evidence_id: 'mock-discovery-evidence' }
  const discovery = envelope({
    kind: 'discovery-result', evidence_id: source.evidence_id, taskId: 41,
    state: 'completed', evidence_complete: true, completion_contract_verified: true, candidate_complete: true,
    facts: { findings: [
      { id: 201, ip: '192.0.2.10' },
      { findingId: 202, ip: '192.0.2.11' },
    ] },
    ...overrides,
  })
  const events = [
    turnStart(1), user('mock-discovery-user', '查询本会话发现结果并预览设备'),
    ...resultEvents(discovery, { callId: 'mock-discovery', args: { action: 'query', task_id: 41 } }),
  ]
  const exec = mockExec({ events })
  return { source, discovery, events, exec, identity: mainIdentity(exec) }
}

function confirmedFixture({ confirmation = '确认导入', display = markdown => markdown } = {}) {
  const fixture = excelFixture()
  const frozen = envelope(previewAssets(fixture.identity, { source: fixture.source, assets: fixture.assets }))
  fixture.events.push(
    ...resultEvents(frozen, { callId: 'mock-preview', args: { action: 'preview', source: fixture.source, assets: fixture.assets } }),
    assistant(display(frozen.markdown)),
    turnEnd(1), turnStart(2), user('mock-confirm-user', confirmation),
  )
  return { ...fixture, frozen, identity: mainIdentity(fixture.exec) }
}

function guardFixture() {
  const exec = mockExec()
  const guard = createSecurityOperationsGuard({ environment: { DSH_HARNESS_MODE: 'verification' } })
  const agent = exec.agent
  return {
    guard, agent,
    decide: (name, args = {}) => guard.decide({ agent, name, arguments: args }),
  }
}

test('normalizeRange保留合法单IP、对齐CIDR、起止范围及去重后的明确集合', () => {
  for (const [input, expected] of [
    ['192.0.2.10', { ranges: '192.0.2.10', count: 1 }],
    ['192.0.2.0/24', { ranges: '192.0.2.0/24', count: 256 }],
    ['192.0.2.10-192.0.2.12', { ranges: '192.0.2.10-192.0.2.12', count: 3 }],
    ['192.0.2.10，192.0.2.10;192.0.2.11', { ranges: '192.0.2.10,192.0.2.11', count: 2 }],
  ]) assert.deepEqual(normalizeRange(input), expected)
})

test('normalizeRange拒绝CIDR不对齐、超过4096地址及非法或倒置范围', () => {
  assert.throws(() => normalizeRange('192.0.2.1/24'), /网络地址对齐/)
  assert.throws(() => normalizeRange('192.0.0.0/19'), /4096/)
  for (const value of ['', '192.0.2.3-192.0.2.1', '192.0.2.01', '2001:db8::1']) {
    assert.throws(() => normalizeRange(value))
  }
})

test('normalizeAssets保留真实设备字段并规范字符串，不修改原数组', () => {
  const rows = [{ ip: '192.0.2.10', hostname: ' mock-edge ', assetType: 'DEVICE', modelId: 7, deployForm: 'physical', hostAssetId: 9 }]
  const before = clone(rows)
  assert.deepEqual(normalizeAssets(rows), [{ ...rows[0], hostname: 'mock-edge' }])
  assert.deepEqual(rows, before)
})

test('normalizeAssets拒绝重复IP、缺IP、不支持字段及空清单', () => {
  assert.throws(() => normalizeAssets([{ ip: '192.0.2.10' }, { ip: '192.0.2.10' }]), /重复/)
  assert.throws(() => normalizeAssets([{ hostname: 'mock-missing-ip' }]))
  assert.throws(() => normalizeAssets([{ ip: '192.0.2.10', arbitraryCommand: 'mock-only' }]), /不支持字段/)
  assert.throws(() => normalizeAssets([]), /空清单|1至/)
})

test('mainIdentity接受版本4根header及当前turn/start后的真实用户消息', () => {
  const events = [user('mock-old-user', '历史材料'), turnStart(2), user('mock-current-user', '确认导入')]
  const exec = mockExec({ events })
  const identity = mainIdentity(exec)
  assert.equal(identity.sessionId, SESSION_ID)
  assert.equal(identity.messageId, 'mock-current-user')
  assert.equal(identity.request, '确认导入')
  assert.equal(identity.agent, exec.agent)
  assert.equal(identity.events, events)
})

test('mainIdentity拒绝不完整根header、身份不一致及子Agent来源', () => {
  const events = [turnStart(1), user('mock-user', '确认导入')]
  for (const header of [
    { version: 3 }, { createdAt: undefined }, { isSeeded: undefined },
    { id: 'mock-other-session' }, { delegationDepth: 1 }, { origin: 'subagent' },
  ]) assert.throws(() => mainIdentity(mockExec({ events, header })), /主 Agent/)
  const mismatched = mockExec({ events })
  mismatched.agent.id = 'mock-other-agent'
  assert.throws(() => mainIdentity(mismatched), /主 Agent/)
})

test('mainIdentity拒绝schedule续轮借用上轮真实确认', () => {
  const events = [
    turnStart(1), user('mock-old-confirm', '确认导入'), turnEnd(1),
    turnStart(2), user('mock-schedule', '继续处理旧任务', 'schedule'),
  ]
  assert.throws(() => mainIdentity(mockExec({ events })), /本轮缺少真实用户消息/)
})

test('mainIdentity在turn/end后不沿用已结束轮次的用户消息', () => {
  const events = [turnStart(1), user('mock-old-confirm', '确认纳管'), turnEnd(1)]
  assert.throws(() => mainIdentity(mockExec({ events })), /没有正在办理/)
})

test('mainIdentity拒绝nextTurn或nextStep等待中的新用户取消或改参', () => {
  for (const queue of ['nextTurn', 'nextStep']) {
    const events = [turnStart(1), user('mock-confirm', '确认导入')]
    const inbox = { [queue]: [user('mock-new-user', '取消导入').data] }
    assert.throws(() => mainIdentity(mockExec({ events, inbox })), /新的用户消息正在等待/)
  }
})

test('mainIdentity拒绝已经中止的执行信号', () => {
  const controller = new AbortController()
  controller.abort()
  const events = [turnStart(1), user('mock-confirm', '确认导入')]
  assert.throws(() => mainIdentity(mockExec({ events, signal: controller.signal })), /已取消/)
})

test('previewAssets从本会话完整workbook生成未提交的完整清单', () => {
  const fixture = excelFixture()
  const result = previewAssets(fixture.identity, { source: fixture.source, assets: fixture.assets })
  assert.equal(result.kind, 'preview')
  assert.equal(result.route, 'manual')
  assert.equal(result.saved, false)
  assert.equal(result.taskId, null)
  assert.match(result.preview_digest, /^[a-f0-9]{64}$/)
  assert.deepEqual(result.assets, fixture.assets)
  for (const asset of fixture.assets) {
    assert.ok(result.markdown.includes(asset.ip))
    assert.ok(result.markdown.includes(asset.hostname))
  }
})

test('previewAssets不接受无来源、跨Session或未配对的伪来源', () => {
  const missing = excelFixture()
  assert.throws(() => previewAssets(missing.identity, { source: { kind: 'excel', attachment_id: `sha256:${'b'.repeat(64)}` }, assets: missing.assets }), /本会话真实/)
  const foreign = excelFixture({ sourceSessionId: 'mock-parent-session' })
  assert.throws(() => previewAssets(foreign.identity, { source: foreign.source, assets: foreign.assets }), /本会话真实/)
  const unpaired = excelFixture()
  unpaired.events.splice(2, 1)
  assert.throws(() => previewAssets(mainIdentity(unpaired.exec), { source: unpaired.source, assets: unpaired.assets }), /本会话真实/)
  const bare = excelFixture()
  bare.events.length = 2
  assert.throws(() => previewAssets(mainIdentity(bare.exec), { source: bare.source, assets: bare.assets }), /本会话真实/)
})

test('previewAssets只接受同一发现记录中的findingId与IP配对', () => {
  const fixture = discoveryFixture()
  const result = previewAssets(fixture.identity, { source: fixture.source, assets: [{ ip: '192.0.2.10', findingId: 201 }] })
  assert.equal(result.route, 'adopt')
  assert.equal(result.taskId, 41)
  assert.throws(() => previewAssets(fixture.identity, { source: fixture.source, assets: [{ ip: '192.0.2.10' }] }), /保留findingId/)
  assert.throws(() => previewAssets(fixture.identity, { source: fixture.source, assets: [{ ip: '192.0.2.10', findingId: 202 }] }), /findingId与IP/)
  assert.throws(() => previewAssets(fixture.identity, { source: fixture.source, assets: [{ ip: '192.0.2.99', findingId: 201 }] }), /来源依据/)
})

test('previewAssets拒绝失败、未知或明确不完整的发现事实', () => {
  for (const overrides of [{ state: 'pending' }, { state: 'failed' }, { state: 'unknown' }, { evidence_complete: false }]) {
    const fixture = discoveryFixture(overrides)
    assert.throws(() => previewAssets(fixture.identity, { source: fixture.source, assets: [{ ip: '192.0.2.10', findingId: 201 }] }), /失败、未知或不完整/)
  }
})

test('priorPreview要求原清单先完整展示且只有一条新的明确确认', () => {
  for (const confirmation of ['确认导入', '确认纳管']) {
    const fixture = confirmedFixture({ confirmation })
    assert.deepEqual(priorPreview(fixture.identity, fixture.frozen.preview_digest), fixture.frozen)
  }
})

test('priorPreview拒绝改写、缺失或晚于确认的清单展示', () => {
  for (const display of [() => '已展示两条设备，请确认', markdown => markdown.replace('192.0.2.11', '192.0.2.99')]) {
    const fixture = confirmedFixture({ display })
    assert.throws(() => priorPreview(fixture.identity, fixture.frozen.preview_digest), /尚未.*完整呈现/)
  }
  const late = confirmedFixture({ display: () => '' })
  late.events.push(assistant(late.frozen.markdown))
  assert.throws(() => priorPreview(mainIdentity(late.exec), late.frozen.preview_digest), /尚未.*完整呈现/)
})

test('priorPreview在本批次取消记录后拒绝旧清单确认', () => {
  const fixture = confirmedFixture()
  fixture.events.splice(fixture.events.length - 1, 0,
    ...resultEvents(envelope({ kind: 'cancelled', saved: false }), { callId: 'mock-cancel', args: { action: 'cancel' } }))
  assert.throws(() => priorPreview(mainIdentity(fixture.exec), fixture.frozen.preview_digest), /已取消/)
})

test('priorPreview拒绝fork新Session继承父Session的预览与确认', () => {
  const fixture = confirmedFixture()
  const fork = mockExec({ sessionId: 'mock-fork-session', events: fixture.events, header: { isSeeded: true } })
  assert.throws(() => priorPreview(mainIdentity(fork), fixture.frozen.preview_digest), /本会话最新/)
})

test('priorPreview拒绝预览前旧确认和改动消息，但接受同批独立确认重试', () => {
  const old = excelFixture({ request: '确认导入' })
  const frozen = envelope(previewAssets(old.identity, { source: old.source, assets: old.assets }))
  old.events.push(...resultEvents(frozen, { callId: 'mock-later-preview' }), assistant(frozen.markdown))
  assert.throws(() => priorPreview(mainIdentity(old.exec), frozen.preview_digest), /查看完整清单后/)
  const repeated = confirmedFixture()
  repeated.events.push(turnEnd(2), turnStart(3), user('mock-second-confirm', '确认导入'))
  assert.deepEqual(priorPreview(mainIdentity(repeated.exec), repeated.frozen.preview_digest), repeated.frozen)
  const vague = confirmedFixture({ confirmation: '确认导入，但把主机名改一下' })
  assert.throws(() => priorPreview(vague.identity, vague.frozen.preview_digest), /其他新消息/)
})

test('priorPreview拒绝摘要不变但冻结资产被改写的工具记录', () => {
  const fixture = confirmedFixture()
  const result = fixture.events.find(event => event.type === 'tool/result' && event.data.message.source.callId === 'mock-preview')
  const block = result.data.message.content[0].content[0]
  const altered = JSON.parse(block.text)
  altered.assets[0].hostname = 'mock-tampered-host'
  block.text = JSON.stringify(altered)
  assert.throws(() => priorPreview(mainIdentity(fixture.exec), fixture.frozen.preview_digest), /冻结字段不符/)
})

test('unpack兼容规范SOC结构化、文本及canonical工具结果，保留业务data', () => {
  const data = { taskId: 41, assets: [{ assetId: 501 }] }
  for (const result of [
    { value: { code: 200, data } },
    { structuredContent: { code: '200', data } },
    { code: 0, data },
    { content: [{ type: 'text', text: JSON.stringify({ code: '0', data }) }] },
    { content: [{ type: 'tool-result', toolCallId: 'mock-soc-result', content: [{ type: 'text', text: JSON.stringify({ code: 200, data }) }] }] },
    { value: { structuredContent: { code: 200, data } } },
  ]) assert.deepEqual(unpack(result), data)
  assert.equal(unpack({ code: 200 }), null)
})

test('unpack区分SOC业务拒绝与工具层错误，不把失败当成功', () => {
  assert.throws(() => unpack({ value: { code: 403, msg: 'mock-denied' } }), error =>
    error instanceof Error && error.businessFailure === true && /SOC拒绝请求/.test(error.message))
  assert.throws(() => unpack({ isError: true, structuredContent: { code: 200, data: { assetId: 501 } } }), /SOC工具返回错误/)
})

test('工具错误保留原错和关联且脱敏，不把未知当未发送或认证失败', () => {
  for (const notSent of [true, false]) {
    assert.throws(() => unpack({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'RISK_DENIED', message: 'X-API-KEY=secret-value Authorization: Bearer secret-token', notSent, requestId: 'mock-request' } }) }] }), error => {
      assert.equal(error.notSent, notSent)
      assert.equal(error.businessFailure, false)
      assert.equal(error.diagnostic.code, 'RISK_DENIED')
      assert.equal(error.diagnostic.request_id, 'mock-request')
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /secret-value|secret-token/)
      return true
    })
  }
})

test('252原始结果超预算时完整保留45 alive全部字段证据，不重复大数组', () => {
  const findings = Array.from({ length: 252 }, (_, i) => ({ id: String(i + 1), ip: `172.16.138.${i + 1}`, alive: i < 45 ? 1 : 0, identifyStatus: 'done', suggestAssetType: i < 27 ? 'host' : null, nameSourceLabel: 'NETBIOS', modelName: null, evidenceJson: 'PING OPEN_PORTS BANNER ' + 'e'.repeat(i < 45 ? 900 : 1200) }))
  const facts = { task: { id: '2120100732104658945', status: 'done', total: 252, doneCount: 252, coverageJson: { scanTargetCount: 254, managedSkipped: 2 } }, findings }
  assert.ok(JSON.stringify(facts).length > 131072)
  const compact = runtime.compactDiscovery(facts)
  assert.equal(compact.facts.findings, undefined)
  assert.equal(facts.findings.length, 252)
  assert.equal(compact.candidate_summary.length, 45)
  assert.deepEqual(compact.candidate_summary.map(row => row.findingId), findings.slice(0,45).map(row => row.id))
  assert.equal(compact.candidate_summary[44].suggestAssetType, '未知')
  assert.match(compact.candidate_summary[0].evidence_summary.summary, /PING/)
  const serialized = JSON.stringify(compact)
  assert.ok(serialized.indexOf('"facts"') > serialized.indexOf('"findingId":"45"'))
  assert.ok(JSON.stringify(compact.candidate_summary).length < 25000)
  assert.ok(serialized.indexOf('"facts"') < 25000)
  assert.equal(runtime.candidateEvidenceSummary(JSON.stringify([{ type: 'OPEN_PORTS', ports: [22, 443] }])).raw_preserved, true)
  assert.equal(compact.discovery_summary.raw_findings, 252)
  assert.equal(compact.discovery_summary.not_alive, 207)
  assert.equal(compact.discovery_summary.type_suggested, 27)
  assert.equal(compact.discovery_summary.type_unknown, 18)
  assert.ok(JSON.stringify(compact).length < 20000)
})
test('真实start preview与execution无损关联，错号错范围和自动纳管拒绝', () => {
  const preview = '2120100731249020929', execution = '2120100732104658945'
  const coverage = { previewTaskId: preview, includedRanges: '172.16.138.1-172.16.138.254', excludedRanges: '', autoAdopt: false, confirmedBy: 9001 }
  const record = { ranges: coverage.includedRanges, excluded_ranges: '', facts: { prepared: { taskId: preview }, started: { taskId: execution, task: { id: execution, coverageJson: JSON.stringify(coverage) } } } }
  assert.equal(runtime.executionLink(record).taskId, execution)
  assert.equal(runtime.executionLink(record).previewTaskId, preview)
  for (const changed of [{ ...coverage, previewTaskId: execution }, { ...coverage, autoAdopt: true }, { ...coverage, includedRanges: '172.16.1.1-172.16.1.254' }]) assert.equal(runtime.executionLink({ ...record, facts: { ...record.facts, started: { taskId: execution, task: { id: execution, coverageJson: changed } } } }), null)
  assert.equal(runtime.executionLink({ ...record, facts: { ...record.facts, started: { taskId: preview, task: { id: execution, coverageJson: coverage } } } }), null)
})
test('int64无损与真实终态候选完整性', () => {
  const id = '2120038186043625474'
  assert.equal(runtime.validSocId(id), true)
  assert.equal(runtime.validSocId(Number(id)), false)
  const facts = { task: { id, status: 'done', total: 2, doneCount: 2, adoptedCount: 0, pendingCount: 1, unreachableCount: 1 }, findings: [{ id: '2120038186043625475', ip: '172.16.138.2' }] }
  assert.equal(runtime.discoveryCompletion(facts, id).candidate_complete, true)
  for (const altered of [{ ...facts, task: { ...facts.task, status: 'running' } }, { ...facts, task: { ...facts.task, status: 'failed' } }, { ...facts, task: { ...facts.task, pendingCount: undefined } }]) assert.equal(runtime.discoveryCompletion(altered, id).candidate_complete, false)
  assert.equal(runtime.discoveryCompletion(facts, '2120038186043625476').candidate_complete, false)
  const mixed = { ...facts, findings: [
    { id: '1', ip: '172.16.138.2', alive: 1, identifyStatus: 'done' },
    { id: '2', ip: '172.16.138.3', alive: 1, identifyStatus: 'done', adoptedAssetId: 10, softwareCandidates: [{ id: '8' }] },
    { id: '3', ip: '172.16.138.4', alive: 0, identifyStatus: 'done' },
  ] }
  const projected = runtime.discoveryCompletion(mixed, id)
  assert.equal(projected.candidate_complete, true)
  assert.deepEqual(projected.eligible_findings.map(row => row.id), ['1'])
  assert.equal(projected.excluded_findings.length, 2)
  assert.equal(projected.collection_completeness, 'unknown')
})

test('TableDataInfo顶层rows/total保留，不把真实0条变为null', () => {
  const table = { code: 200, msg: 'success', total: 0, rows: [] }
  assert.deepEqual(unpack({ value: table }), table)
})
test('254条发现混合集合不受200条导入批次上限限制', () => {
  const id = '2119614486382673922'
  const findings = Array.from({ length: 254 }, (_, i) => ({ id: String(i + 1), ip: `172.16.138.${i + 1}`, alive: i < 3 ? 1 : 0, identifyStatus: 'done', ...(i === 1 ? { adoptedAssetId: 77 } : {}), ...(i === 2 ? { conflict: 1 } : {}) }))
  const facts = { task: { id, status: 'done', total: 254, doneCount: 254, adoptedCount: 1, pendingCount: 1, unreachableCount: 251 }, findings }
  const result = runtime.discoveryCompletion(facts, id)
  assert.equal(result.evidence_complete, true); assert.deepEqual(result.eligible_findings.map(row => row.id), ['1'])
  assert.throws(() => runtime.normalizeAssets(findings.slice(0, 201)), /每批/)
})
test('unpack拒绝非JSON、缺少业务状态及非对象回执', () => {
  for (const result of [
    { content: [{ type: 'text', text: 'mock-not-json' }] },
    { structuredContent: { data: { assetId: 501 } } },
    { value: [] },
    { value: { msg: 'mock-no-code' } },
  ]) assert.throws(() => unpack(result))
})

test('Guard资产高层入口要求先加载Skill且只允许主Agent', () => {
  const fixture = guardFixture()
  fixture.guard.beginTurn(fixture.agent, '导入附件中的设备资产')
  assert.match(fixture.decide('asset_onboarding', { action: 'attachments' }), /先加载对应Skill/)
  assert.equal(fixture.decide('skill', { name: 'asset-onboarding' }), undefined)
  assert.equal(fixture.decide('asset_onboarding', { action: 'attachments' }), undefined)
  const child = mockExec({ header: { delegationDepth: 1, origin: 'subagent' } }).agent
  assert.match(fixture.guard.decide({ agent: child, name: 'asset_onboarding', arguments: { action: 'attachments' } }), /只允许主 Agent/)
})

test('Guard资产域拒绝本轮切换到巡检或策略Skill及业务工具', () => {
  const fixture = guardFixture()
  fixture.guard.beginTurn(fixture.agent, '资产纳管')
  assert.equal(fixture.decide('skill', { name: 'asset-onboarding' }), undefined)
  for (const name of ['security-inspection', 'policy-configuration']) {
    assert.match(fixture.decide('skill', { name }), /不能跨能力/)
  }
  for (const name of ['mcp__inspection-compositions__get_composition_run', 'mcp__policy-configuration__resolve_policy_endpoints']) {
    assert.match(fixture.decide(name), /本轮资产纳管不能跨入/)
  }
})

test('Guard巡检或策略域拒绝切回已在前轮加载的资产能力', () => {
  for (const name of ['security-inspection', 'policy-configuration']) {
    const fixture = guardFixture()
    fixture.guard.beginTurn(fixture.agent, '先加载资产纳管')
    assert.equal(fixture.decide('skill', { name: 'asset-onboarding' }), undefined)
    fixture.guard.beginTurn(fixture.agent, name === 'security-inspection' ? '仅查看巡检结果' : '新增网络访问策略')
    assert.equal(fixture.decide('skill', { name }), undefined)
    assert.match(fixture.decide('skill', { name: 'asset-onboarding' }), /不能跨能力/)
    assert.match(fixture.decide('asset_onboarding', { action: 'attachments' }), /不能跨能力/)
  }
})

test('Guard拒绝模型直调资产分组所有SOC原始接口', () => {
  const fixture = guardFixture()
  fixture.guard.beginTurn(fixture.agent, '资产纳管')
  assert.equal(fixture.decide('skill', { name: 'asset-onboarding' }), undefined)
  assert.ok(TOOL_ROUTES.assetOnboardingSoc.includes('mcp__asset-management__create_soc_asset'))
  assert.ok(TOOL_ROUTES.assetOnboardingSoc.includes('mcp__asset-management__create_soc_discovery_tasks_adopt'))
  for (const name of TOOL_ROUTES.assetOnboardingSoc) {
    assert.match(fixture.decide(name, {}), /底层SOC资产接口.*模型不能绕过/)
  }
})

test('Guard不因策略目标名包含资产纳管而抢占策略路由', () => {
  const fixture = guardFixture()
  fixture.guard.beginTurn(fixture.agent, '新增策略，允许资产纳管平台访问数据库服务的TCP 443端口')
  assert.equal(fixture.decide('skill', { name: 'policy-configuration' }), undefined)
  assert.equal(fixture.decide('mcp__policy-configuration__get_policy_configuration_status'), undefined)
  assert.match(fixture.decide('skill', { name: 'asset-onboarding' }), /不能跨能力/)
})
