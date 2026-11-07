import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  selectTroubleshootingRun, selectTroubleshootingArtifact, troubleshootingReportSource,
  selectSavedSecurityReport, mainFaultReportSource,
} from '../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs'
import { apply, requireReportRequest } from '../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs'

// 仅为隔离的原生日志/SDK/Attachments技术Mock，不连接MCP、不读实例、不构建、不代表业务验收。
// Runtime导入受控编译物；研发须先按平台Managed入口从对应TS源码构建，再执行这些测试。
const ROOT = 'mock-troubleshooting-root', CHILD = 'mock-legacy-fault-child'
const RUN = 'run-11111111-1111-4111-8111-111111111111'
const LATER_RUN = 'run-22222222-2222-4222-8222-222222222222'
const GROUP = 'troubleshooting-compositions'
const EPOCH = Date.UTC(2026, 10, 7)
const HTML = '\ufeff<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><title>原报告</title></head><body>事实：未知≠正常。🔎\n证据缺口与未执行建议。</body></html>\n'
const FILENAME = 'diagnosis-原报告.html'
const MIME = 'text/html; charset=utf-8'
const ANALYSIS = '历史主助手只读分析：证据不足，仅建议，不执行处置。'
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex')
const copy = value => structuredClone(value)
const text = value => [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }]
const event = (seq, type, data) => ({ seq, time: EPOCH + seq, type, data })
const user = (seq = 0, request = '只读排查并生成HTML报告，不主动探测、不处置。') => event(seq, 'user/message', {
  id: `mock-user-${seq}`, role: 'user', source: { kind: 'user' }, content: text(request),
})
const toolName = raw => `mcp__${GROUP}__${raw}`
const workflowFor = raw => raw === 'diagnose_business_access' ? 'troubleshooting-business-access' : 'troubleshooting-device-offline'
function pair(seq, callId, name, args, value) {
  const call = event(seq, 'tool/call', { turn: 1, step: seq, callId, name, arguments: JSON.stringify(args) })
  const result = { ...event(seq + 1, 'tool/result', { turn: 1, step: seq, message: {
    role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, isError: false, content: text(value),
  } }), sourceEventSeqs: [seq] }
  return [call, result]
}
function started(raw = 'diagnose_business_access', seq = 10, runId = RUN) {
  const workflow = workflowFor(raw)
  return pair(seq, `mock-start-${seq}`, toolName(raw), { target: 'mock-only' }, {
    run_id: runId, composition_id: workflow, workflow, status: 'accepted',
  })
}
const eventsFor = raw => [user(), ...started(raw)]
function canonicalRun(raw = 'diagnose_business_access') {
  const workflow = workflowFor(raw)
  return { run_id: RUN, composition_id: workflow, workflow, status: 'completed',
    result: { status: 'incomplete', missing_evidence: ['仅技术Mock，没有真实SOC证据'] },
    artifacts: [{ id: 'report', filename: FILENAME, contentType: MIME, bytes: Buffer.byteLength(HTML),
      sha256: sha(HTML), metadata: { language: 'zh-CN', scope: 'mock-readonly' } }],
  }
}
function canonicalArtifact(raw = 'diagnose_business_access') {
  const run = canonicalRun(raw)
  return { ...copy(run.artifacts[0]), run_id: run.run_id, composition_id: run.composition_id, workflow: run.workflow, body: HTML }
}
const bindingFor = (events = eventsFor(), runId, canonical) => selectTroubleshootingRun(ROOT, events, runId, canonical)
function legacyEvents() {
  const read = pair(1, 'mock-legacy-read', 'mcp__soc-readonly__get_asset_status', {}, { status: 'unknown' })
  const delegate = pair(3, 'mock-legacy-delegate', 'delegate_fault_analysis', { prompt: '历史只读排查' }, `started subagent ${CHILD}`)
  delegate[1].seq = 5; delegate[1].time = EPOCH + 5
  return [user(), ...read, delegate[0], event(4, 'subagent/catalog', {
    version: 0, mode: 'continuable', childId: CHILD, childCreatedAt: EPOCH + 4,
  }), delegate[1], event(7, 'user/message', {
    id: 'mock-child-notice', role: 'user', source: { kind: 'subagent-settled', form: 'notice', senderSessionId: CHILD, summary: '完成' },
    content: text('历史子任务完成'),
  })]
}
function legacySnapshot() {
  return { session: { id: CHILD, createdAt: EPOCH + 4, origin: 'subagent', isSeeded: false,
    delegationDepth: 1, agentPreset: 'security-operations-fault-analysis' }, inheritedEventCount: 0,
  events: [event(0, 'turn/start', { turn: 1 }), event(1, 'assistant/message', { turn: 1, message: {
    id: 'mock-legacy-final', role: 'assistant', source: { kind: 'model', provider: 'mock', model: 'mock' },
    content: text('历史故障子任务原文：证据缺口与未执行建议。'),
  } }), event(6, 'turn/end', { turn: 1, reason: { kind: 'completed' } })] }
}
function exportPair(seq, value, args = {}) {
  const result = pair(seq, `mock-export-${seq}`, 'export_security_report', { kind: 'fault', ...args }, value)
  result[1].data.meta = copy(value)
  return result
}
function savedFixture({ legacy = false } = {}) {
  const events = legacy ? legacyEvents().slice(0, 3) : eventsFor()
  const report = legacy ? mainFaultReportSource(ROOT, events, ANALYSIS)
    : troubleshootingReportSource(bindingFor(events), canonicalRun(), canonicalArtifact())
  const filename = legacy ? 'legacy-main.html' : report.filename
  const value = { schema_version: 'security-report/v1', kind: 'fault', session_id: ROOT,
    file_path: `/mock-only/reports/${filename}`, filename, content_type: MIME,
    bytes: Buffer.byteLength(report.html), sha256: sha(report.html), attachment_id: `sha256:${sha(report.html)}`,
    source: copy(report.source), generated_at: new Date(EPOCH + 21).toISOString(),
  }
  return { events: [...events, ...exportPair(20, value, legacy ? { analysis: ANALYSIS } : { run_id: RUN })], value }
}
function runtime(options = {}) {
  let tool
  const events = options.events ?? eventsFor(options.raw)
  const calls = [], saves = [], contexts = [], childReads = []
  const token = {}, signal = new AbortController().signal
  const agent = { id: ROOT, session: { id: ROOT, header: { delegationDepth: 0 }, snapshotEvents: () => events } }
  const resolve = (group, raw) => options.missingResolve === raw ? undefined
    : options.aliases ? `mcp__mock-registered__${group.replaceAll('-', '_')}_${raw}` : `mcp__${group}__${raw}`
  apply({ mcpSessionManager: { resolveTool: resolve },
    tools: { register: value => { tool = value }, get: name => options.hidden !== name,
      execute: async request => {
        calls.push(request)
        assert.equal(request.agent, agent); assert.equal(request.parent, token)
        assert.equal(request.rootCallId, 'mock-root-call'); assert.equal(request.signal, signal)
        assert.equal(request.arguments.run_id, options.expectedRun ?? RUN)
        if (options.throwRead) throw new Error('mock getter rejected')
        if (request.name === resolve(GROUP, 'get_composition_run')) return {
          isError: options.stateError ?? false,
          // 完整canonical与故意裁剪的展示并存：只能用完整canonical判终态。
          value: options.stateValue ?? { structuredContent: { ok: true, result: options.state ?? canonicalRun(options.raw) }, content: text('spilled display') },
          additionalContexts: ['mock-status-context'],
        }
        assert.equal(request.name, resolve(GROUP, 'get_composition_artifact'))
        assert.equal(request.arguments.artifactId, 'report')
        if (options.afterArtifact) options.afterArtifact(events)
        return { isError: options.artifactError ?? false,
          value: options.artifactValue ?? { content: text({ ok: true, result: options.artifact ?? canonicalArtifact(options.raw) }) },
          additionalContexts: ['mock-artifact-context'],
        }
      },
    },
    attachments: { saveFile: async ({ name, data }) => {
      saves.push({ name, data: Buffer.from(data) })
      return { name: options.savedName ?? name, bytes: data.byteLength,
        attachmentId: options.savedId ?? `sha256:${createHash('sha256').update(data).digest('hex')}` }
    }, fileHostPath: attachment => `/mock-only/reports/${attachment.name}` },
    sessionQuery: { readSession: async id => { childReads.push(id); return legacySnapshot() } },
  })
  return { events, calls, saves, contexts, childReads, resolve,
    export: (args = { kind: 'fault' }) => tool.execute(args, {
      agent, token, signal, callId: 'mock-export-call', rootCallId: 'mock-root-call', deferContext: value => contexts.push(value),
    }),
  }
}

for (const raw of ['diagnose_business_access', 'diagnose_device_offline']) {
  test(`新故障来源：${raw}绑定本Root真实启动，保存原filename/UTF-8字节/SHA，不重绘`, async () => {
    const events = eventsFor(raw), before = copy(events), binding = bindingFor(events)
    assert.equal(binding.workflow, workflowFor(raw)); assert.equal(binding.parent_session_id, ROOT)
    assert.equal(binding.start_call_id, 'mock-start-10'); assert.equal(binding.start_result_seq, 11)
    assert.deepEqual(events, before)
    const report = troubleshootingReportSource(binding, canonicalRun(raw), canonicalArtifact(raw))
    assert.equal(report.html, HTML); assert.equal(report.filename, FILENAME)
    assert.equal(report.source.original_bytes, Buffer.byteLength(HTML)); assert.equal(report.source.original_sha256, sha(HTML))
    assert.equal(report.source.artifact_id, 'report'); assert.equal(report.source.kind, 'fault-troubleshooting')
    const harness = runtime({ events, raw }), value = await harness.export({ kind: 'fault', run_id: RUN })
    assert.equal(harness.calls.length, 2); assert.equal(harness.childReads.length, 0); assert.equal(harness.saves.length, 1)
    assert.deepEqual(harness.saves[0].data, Buffer.from(HTML, 'utf8'))
    assert.equal(harness.saves[0].name, FILENAME); assert.equal(value.filename, FILENAME)
    assert.equal(value.sha256, sha(HTML)); assert.equal(value.bytes, Buffer.byteLength(HTML))
    assert.equal(value.source.original_sha256, value.sha256)
    assert.deepEqual(harness.contexts, ['mock-status-context', 'mock-artifact-context'])
    assert.deepEqual(harness.calls.map(call => call.name), [toolName('get_composition_run'), toolName('get_composition_artifact')])
  })
}

test('新故障来源：实际resolveTool别名映射，不重复拼namespace；旧日志展示裁剪不替代canonical', async () => {
  const harness = runtime({ aliases: true })
  harness.events[1].data.name = harness.resolve(GROUP, 'diagnose_business_access')
  const value = await harness.export()
  assert.equal(value.source.start_tool_name, toolName('diagnose_business_access'))
  assert.equal(harness.calls[0].name, harness.resolve(GROUP, 'get_composition_run'))
  assert.equal(harness.calls[1].name, harness.resolve(GROUP, 'get_composition_artifact'))
})

test('新故障来源：业务incomplete允许，外层Run非completed绝不由result.status替代', () => {
  const binding = bindingFor(), good = canonicalRun()
  assert.equal(selectTroubleshootingArtifact(binding, good).id, 'report')
  for (const status of ['failed', 'running', 'in_progress', 'accepted', 'unknown', undefined]) {
    const run = { ...good, status, result: { status: 'completed' } }
    assert.throws(() => selectTroubleshootingArtifact(binding, run), /尚未成功完成/)
  }
})

const invalidStarts = [
  ['裁剪回执', events => { events[2].data.message.content = text('spilled/truncated') }],
  ['缺失回执', events => { events.pop() }],
  ['错误callId', events => { events[2].data.message.source.callId = 'mock-foreign' }],
  ['错误toolCallId', events => { events[2].data.message.toolCallId = 'mock-foreign' }],
  ['不同turn', events => { events[2].data.turn = 2 }],
  ['不同step', events => { events[2].data.step = 99 }],
  ['不同sourceEventSeqs', events => { events[2].sourceEventSeqs = [0] }],
  ['非工具来源', events => { events[2].data.message.source.kind = 'user' }],
  ['非对象arguments', events => { events[1].data.arguments = '[]' }],
  ['opaque调用身份未核准', events => { events[1].data.name = 'mcp__mock-unresolved__opaque_start' }],
  ['原生失败', events => { events[2].data.message.isError = true }],
  ['原生错误字段', events => { events[2].data.error = { message: 'mock-failed' } }],
  ['跨session调用', events => { events[1].data.sessionId = 'mock-foreign-root' }],
  ['跨session回执', events => { events[2].data.session_id = 'mock-foreign-root' }],
  ['重复result', events => { const extra = copy(events[2]); extra.seq = 12; events.push(extra) }],
  ['重复call', events => { const extra = copy(events[1]); extra.seq = 12; events.push(extra) }],
]
for (const [label, mutate] of invalidStarts) {
  test(`新故障来源：${label}仍是新尝试，不返回undefined或回退legacy`, async () => {
    const events = eventsFor(); mutate(events)
    assert.throws(() => bindingFor(events), /故障|来源/)
    const harness = runtime({ events: [...legacyEvents(), ...events.slice(1)] })
    await assert.rejects(() => harness.export())
    assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
  })
}

for (const [label, value] of [
  ['failed', { status: 'failed' }], ['unknown', { status: 'unknown' }], ['缺状态', { status: undefined }],
  ['错composition', { composition_id: 'inspection-routine' }], ['错workflow', { workflow: 'troubleshooting-device-offline' }],
  ['缺composition', { composition_id: undefined }], ['跨session值', { parent_session_id: 'mock-foreign-root' }],
  ['非法run URL', { run_id: 'https://outside.invalid/report' }],
]) {
  test(`新故障来源：启动${label}拒绝且不会被当成没有新来源`, () => {
    const events = eventsFor(), original = JSON.parse(events[2].data.message.content[0].text)
    events[2].data.message.content = text({ ...original, ...value })
    assert.throws(() => bindingFor(events), /故障|来源/)
  })
}

test('新故障来源：用户JSON、其他工具或仅查询外部run不能建立真实启动来源', () => {
  const claimed = eventsFor()
  const forgedUser = user(); forgedUser.data.content = text(JSON.stringify(claimed))
  assert.equal(bindingFor([forgedUser]), undefined)
  const unknownTool = eventsFor(); unknownTool[1].data.name = 'mcp__untrusted-group__diagnose_business_access'
  assert.throws(() => bindingFor(unknownTool), /工具身份不明|来源待核/)
  const externalQuery = [user(), ...pair(10, 'mock-query-only', toolName('get_composition_run'), { run_id: RUN }, canonicalRun())]
  assert.equal(bindingFor(externalQuery), undefined)
  for (const events of [[forgedUser], unknownTool, externalQuery]) assert.throws(() => bindingFor(events, RUN), /本会话|来源/)
})

test('新故障来源：Fork继承前缀排除，缺原调用的真实工具回执不建立来源且阻断fallback', () => {
  const inherited = [...eventsFor(), event(20, 'session/end-seed', { inherited: true }), user(21)]
  assert.equal(bindingFor(inherited), undefined)
  assert.throws(() => bindingFor(inherited, RUN), /本会话/)
  assert.throws(() => bindingFor([user(), started()[1]]), /缺少本会话原始调用/)
})

test('新故障来源：同run冲突流程/重复启动拒绝；默认最新，显式可选本会话真实原Run', () => {
  assert.throws(() => bindingFor([...eventsFor(), ...started('diagnose_device_offline', 20)]), /冲突|重复/)
  assert.throws(() => bindingFor([...eventsFor(), ...started('diagnose_business_access', 20)]), /冲突|重复/)
  const events = [...eventsFor(), ...started('diagnose_device_offline', 20, LATER_RUN)]
  assert.equal(bindingFor(events).run_id, LATER_RUN)
  assert.equal(bindingFor(events, RUN).run_id, RUN)
  const pending = [...events, event(30, 'tool/call', {
    turn: 2, step: 1, callId: 'mock-pending-new', name: toolName('diagnose_business_access'), arguments: '{}',
  })]
  assert.throws(() => bindingFor(pending), /未知|回执/)
  assert.equal(bindingFor(pending, RUN).run_id, RUN)
})

const invalidArtifacts = [
  ['canonical Run错误标志', run => { run.isError = true }],
  ['canonical artifact错误标志', (_run, artifact) => { artifact.isError = true }],
  ['错Run', run => { run.run_id = LATER_RUN }],
  ['错composition', run => { run.composition_id = 'inspection-status' }],
  ['错workflow', run => { run.workflow = 'troubleshooting-device-offline' }],
  ['缺workflow', run => { delete run.workflow }],
  ['跨session', run => { run.parent_session_id = 'mock-foreign-root' }],
  ['重复report', run => { run.artifacts.push(copy(run.artifacts[0])) }],
  ['id不同但多HTML', run => { run.artifacts.push({ ...copy(run.artifacts[0]), id: 'another-report', filename: 'another.html' }) }],
  ['MIME与扩展名混淆的第二HTML', run => { run.artifacts.push({ id: 'other', filename: 'other.html', contentType: 'text/plain', bytes: 1 }) }],
  ['相同id不同非HTML', run => { run.artifacts.push({ id: 'report', filename: 'other.json', contentType: 'application/json', bytes: 1 }) }],
  ['无报告', run => { run.artifacts = [] }],
  ['report路径', run => { run.artifacts[0].filename = '../report.html' }],
  ['report URL', run => { run.artifacts[0].filename = 'https://outside.invalid/report.html' }],
  ['report编码穿越', run => { run.artifacts[0].filename = '%2e%2e%2freport.html' }],
  ['artifactId路径', run => { run.artifacts[0].id = '../report' }],
  ['非UTF8 MIME', run => { run.artifacts[0].contentType = 'text/html; charset=iso-8859-1' }],
  ['零字节', run => { run.artifacts[0].bytes = 0 }],
  ['字节不符', run => { run.artifacts[0].bytes++ }],
  ['32MiB上限', run => { run.artifacts[0].bytes = 32 * 1024 * 1024 + 1 }],
  ['descriptor SHA不符', run => { run.artifacts[0].sha256 = 'a'.repeat(64) }],
  ['getter id不符', (_run, artifact) => { artifact.id = 'other' }],
  ['getter artifactId不符', (_run, artifact) => { artifact.artifactId = 'other' }],
  ['getter artifact_id不符', (_run, artifact) => { artifact.artifact_id = 'other' }],
  ['getter Run不符', (_run, artifact) => { artifact.run_id = LATER_RUN }],
  ['getter filename不符', (_run, artifact) => { artifact.filename = 'other.html' }],
  ['getter MIME不符', (_run, artifact) => { artifact.contentType = 'text/plain' }],
  ['getter bytes不符', (_run, artifact) => { artifact.bytes++ }],
  ['getter SHA不符', (_run, artifact) => { artifact.sha256 = 'b'.repeat(64) }],
  ['getter SHA非摘要', (_run, artifact) => { artifact.sha256 = 'mock-not-a-hash' }],
  ['metadata冲突', (_run, artifact) => { artifact.metadata.scope = 'mutated' }],
  ['descriptor metadata SHA不符', run => { run.artifacts[0].metadata.sha256 = 'd'.repeat(64) }],
  ['getter metadata SHA不符', (_run, artifact) => { artifact.metadata.sha256 = 'e'.repeat(64) }],
  ['getter metadata bytes不符', (_run, artifact) => { artifact.metadata.bytes = 1 }],
  ['不完整HTML', (_run, artifact) => { artifact.body = '<p>fragment</p>' }],
  ['HTML闭合后尾部片段', (_run, artifact) => { artifact.body += '<p>not complete</p>' }],
  ['伪doctype/片段前缀', (_run, artifact) => { artifact.body = '<!doctype html-not-closed><p>fragment</p><html></html>' }],
  ['html标签仅藏于注释', (_run, artifact) => { artifact.body = '<!doctype html><!-- <html> --><p>fragment</p></html>' }],
  ['非法UTF8代理字符', (_run, artifact) => { artifact.body = HTML.replace('事实', '\ud800') }],
]
for (const [label, mutate] of invalidArtifacts) {
  test(`原HTML核验：${label}拒绝，不保存或legacy fallback`, async () => {
    const run = canonicalRun(), artifact = canonicalArtifact(); mutate(run, artifact)
    assert.throws(() => troubleshootingReportSource(bindingFor(), run, artifact), Error)
    const harness = runtime({ events: [...legacyEvents(), ...started()], state: run, artifact })
    await assert.rejects(() => harness.export())
    assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
  })
}

test('原HTML核验：公开getter仅返回filename/contentType/body，不强求descriptor额外metadata回显', async () => {
  const run = canonicalRun(), artifact = { filename: FILENAME, contentType: MIME, body: HTML }
  const report = troubleshootingReportSource(bindingFor(), run, artifact)
  assert.equal(report.source.original_sha256, sha(HTML)); assert.equal(report.html, HTML)
  assert.equal(report.source.original_sha256_scope, 'sha256-of-original-utf8-body')
  assert.deepEqual(report.source.artifact_metadata, run.artifacts[0])
  assert.deepEqual(report.source.artifact_response_metadata, { filename: FILENAME, contentType: MIME })
  delete run.artifacts[0].sha256
  const harness = runtime({ state: run, artifact })
  assert.equal((await harness.export()).sha256, sha(HTML))
})

for (const status of ['failed', 'running', 'in_progress', 'unknown', undefined]) {
  test(`Runtime：新Run ${status}阻止默认/analysis/child旧路径`, async () => {
    for (const args of [{ kind: 'fault' }, { kind: 'fault', analysis: ANALYSIS }, { kind: 'fault', child_id: CHILD }]) {
      const harness = runtime({ events: [...legacyEvents(), ...started()], state: { ...canonicalRun(), status } })
      await assert.rejects(() => harness.export(args))
      assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
    }
  })
}
for (const options of [
  { stateError: true }, { artifactError: true }, { throwRead: true },
  { stateValue: { ok: false, result: canonicalRun() } },
  { stateValue: { structuredContent: { ...canonicalRun(), isError: true } } },
  { artifactValue: { structuredContent: { ...canonicalArtifact(), isError: true } } },
  { stateValue: { content: text('truncated canonical') } },
  { stateValue: { code: 503, data: canonicalRun() } },
  { artifactValue: { isError: true, content: [] } },
  { artifactValue: { ok: true } },
  { missingResolve: 'get_composition_run' }, { missingResolve: 'get_composition_artifact' },
  { hidden: toolName('get_composition_run') }, { hidden: toolName('get_composition_artifact') },
]) {
  test(`Runtime：只读getter不可用/错误拒绝，不根据源码声明执行或降级 ${JSON.stringify(options)}`, async () => {
    const harness = runtime({ ...options, events: [...legacyEvents(), ...started()] })
    await assert.rejects(() => harness.export())
    assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
  })
}

test('Runtime：读取过程中有更晚新尝试则拒绝过时原HTML', async () => {
  const harness = runtime({ afterArtifact: events => events.push(...started('diagnose_device_offline', 30, LATER_RUN)) })
  await assert.rejects(() => harness.export())
  assert.equal(harness.saves.length, 0)
})
for (const options of [{ savedName: 'renamed.html' }, { savedId: `sha256:${'c'.repeat(64)}` }]) {
  test('Runtime：附件后端改原filename或SHA不声明成功交付', async () => {
    const harness = runtime(options)
    await assert.rejects(() => harness.export(), /filename|SHA/)
  })
}

test('附件复用：新流程与legacy默认/显式再下载保持原file/filename/bytes/SHA且零getter/零附件创建', async () => {
  for (const legacy of [false, true]) {
    const fixture = savedFixture({ legacy })
    for (const attachmentId of [undefined, fixture.value.attachment_id]) {
      const selected = selectSavedSecurityReport(ROOT, fixture.events, 'fault', attachmentId)
      assert.equal(selected.has_new_source, false); assert.deepEqual(selected.value, fixture.value)
      const harness = runtime({ events: fixture.events })
      const value = await harness.export({ kind: 'fault', ...(attachmentId ? { attachment_id: attachmentId } : {}) })
      assert.equal(value.file_path, fixture.value.file_path); assert.equal(value.filename, fixture.value.filename)
      assert.equal(value.sha256, fixture.value.sha256); assert.equal(value.bytes, fixture.value.bytes)
      assert.equal(harness.calls.length, 0); assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
    }
  }
})

for (const legacy of [false, true]) {
  for (const variant of ['pending-call', 'accepted', 'failed', 'unknown', 'truncated', 'bad-pair']) {
    test(`附件新来源失效：${legacy ? 'legacy' : '新流程'}旧附件不能绕过更晚${variant}`, async () => {
      const fixture = savedFixture({ legacy }), start = started('diagnose_device_offline', 30, LATER_RUN)
      if (variant === 'pending-call') start.pop()
      else if (variant === 'truncated') start[1].data.message.content = text('truncated')
      else if (variant === 'bad-pair') start[1].data.message.source.callId = 'mock-unpaired'
      else {
        const value = JSON.parse(start[1].data.message.content[0].text)
        start[1].data.message.content = text({ ...value, status: variant })
      }
      const events = [...fixture.events, ...start]
      assert.equal(selectSavedSecurityReport(ROOT, events, 'fault').has_new_source, true)
      assert.equal(selectSavedSecurityReport(ROOT, events, 'fault', fixture.value.attachment_id).has_new_source, true)
      const harness = runtime({ events, state: { ...canonicalRun('diagnose_device_offline'), run_id: LATER_RUN, status: 'running' }, expectedRun: LATER_RUN })
      await assert.rejects(() => harness.export({ kind: 'fault', attachment_id: fixture.value.attachment_id }), /更新故障来源|新尝试/)
      assert.equal(harness.calls.length, 0); assert.equal(harness.saves.length, 0)
      await assert.rejects(() => harness.export())
      assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
    })
  }
}

test('附件新来源失效：后续get_run failed/unknown，及失败artifact读取不能掩盖为无新来源', () => {
  const fixture = savedFixture()
  for (const value of [{ ...canonicalRun(), status: 'failed' }, { ...canonicalRun(), status: 'unknown' }, 'truncated']) {
    const query = pair(30, 'mock-status-later', toolName('get_composition_run'), { run_id: RUN }, value)
    assert.equal(selectSavedSecurityReport(ROOT, [...fixture.events, ...query], 'fault').has_new_source, true)
  }
  const artifact = pair(30, 'mock-artifact-later', toolName('get_composition_artifact'), { run_id: RUN, artifactId: 'report' }, 'mock-failed')
  artifact[1].data.message.isError = true
  assert.equal(selectSavedSecurityReport(ROOT, [...fixture.events, ...artifact], 'fault').has_new_source, true)
})

test('附件新来源失效：canonicalName可选解析新流程别名，不扩大主助手其他MCP来源', () => {
  const fixture = savedFixture({ legacy: true }), start = started('diagnose_business_access', 30)
  const alias = 'mcp__mock-actual-alias__new_diagnosis'; start[0].data.name = alias
  const canonical = name => name === alias ? toolName('diagnose_business_access') : name
  assert.equal(selectSavedSecurityReport(ROOT, [...fixture.events, start[0]], 'fault', undefined, canonical).has_new_source, true)
  assert.throws(() => mainFaultReportSource(ROOT, [user(), ...start], ANALYSIS), /只读回执/)
})

test('附件来源：缺真实启动、跨session与元信息冲突的新故障导出记录不成为可复用文件', () => {
  const fixture = savedFixture()
  assert.equal(selectSavedSecurityReport('mock-other-root', fixture.events, 'fault'), undefined)
  assert.equal(selectSavedSecurityReport(ROOT, [user(), ...fixture.events.slice(-2)], 'fault'), undefined)
  const events = copy(fixture.events); events.at(-1).data.meta.source.run_id = LATER_RUN
  assert.equal(selectSavedSecurityReport(ROOT, events, 'fault'), undefined)
})

test('Runtime兼容：无新流程时保留主助手analysis与已完成子结果；全新空会话及inspection假冒run拒绝', async () => {
  const main = runtime({ events: legacyEvents() })
  const mainValue = await main.export({ kind: 'fault', analysis: ANALYSIS })
  assert.equal(mainValue.source.kind, 'fault-main-readonly'); assert.equal(main.calls.length, 0)
  const child = runtime({ events: legacyEvents() })
  const childValue = await child.export({ kind: 'fault' })
  assert.equal(childValue.source.kind, 'fault-readonly'); assert.equal(child.childReads.length, 1)
  const empty = runtime({ events: [user()] })
  await assert.rejects(() => empty.export())
  await assert.rejects(() => empty.export({ kind: 'fault', run_id: RUN }), /本会话|来源/)
  assert.equal(empty.calls.length, 0); assert.equal(empty.saves.length, 0); assert.equal(empty.childReads.length, 0)
  const inspection = [user(), ...pair(10, 'mock-inspection-start', 'mcp__inspection-compositions__inspection_routine', {}, {
    run_id: RUN, composition_id: 'inspection-routine', workflow: 'inspection-routine', status: 'accepted',
  })]
  await assert.rejects(() => runtime({ events: inspection }).export({ kind: 'fault', run_id: RUN }), /本会话|来源/)
})

test('Runtime参数：fault run_id只允许真实新来源，并与四类选择参数互斥', async () => {
  for (const extra of [{ child_id: CHILD }, { analysis: ANALYSIS }, { evidence_call_ids: ['mock-legacy-read'] }, { attachment_id: `sha256:${sha(HTML)}` }]) {
    const harness = runtime()
    await assert.rejects(() => harness.export({ kind: 'fault', run_id: RUN, ...extra }), /参数|合同/)
    assert.equal(harness.calls.length, 0); assert.equal(harness.saves.length, 0)
  }
})

test('新故障来源：保留既有MCP结构封装配对，不以业务result.status替代启动外层状态', () => {
  for (const wrap of [value => ({ structuredContent: value }), value => ({ ok: true, result: value }),
    value => ({ code: 200, data: value }), value => ({ content: text(value) })]) {
    const events = eventsFor(), original = JSON.parse(events[2].data.message.content[0].text)
    events[2].data.message.content = text(wrap({ ...original, result: { status: 'incomplete' } }))
    assert.equal(bindingFor(events).run_id, RUN)
  }
  const events = eventsFor(), original = JSON.parse(events[2].data.message.content[0].text)
  events[2].data.message.content = text({ ...original, status: 'unknown', result: { status: 'completed' } })
  assert.throws(() => bindingFor(events), /未知/)
})

test('附件新来源失效：缺call的后续原生故障回执同样阻止默认及显式旧附件绕过', async () => {
  const fixture = savedFixture({ legacy: true }), events = [...fixture.events, started('diagnose_device_offline', 30, LATER_RUN)[1]]
  assert.equal(selectSavedSecurityReport(ROOT, events, 'fault').has_new_source, true)
  const harness = runtime({ events })
  await assert.rejects(() => harness.export({ kind: 'fault', attachment_id: fixture.value.attachment_id }), /更新故障来源/)
  await assert.rejects(() => harness.export(), /缺少本会话原始调用/)
  assert.equal(harness.calls.length, 0); assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
})

test('附件新来源失效：新Run之前的旧附件后续重复交付不能洗掉新尝试截止点', () => {
  const fixture = savedFixture(), events = [...fixture.events, ...started('diagnose_device_offline', 30, LATER_RUN),
    ...exportPair(40, fixture.value, { attachment_id: fixture.value.attachment_id })]
  const selected = selectSavedSecurityReport(ROOT, events, 'fault', fixture.value.attachment_id)
  assert.equal(selected.receipt_seq, 21); assert.equal(selected.has_new_source, true)
})

test('附件来源：新Run之后才另存legacy分析，不得靠较晚证据截止洗掉已存在的新流程', async () => {
  const events = [user(), ...started(), ...pair(14, 'mock-late-legacy-read', 'mcp__soc-readonly__get_asset_status', {}, { status: 'unknown' })]
  const report = mainFaultReportSource(ROOT, events, ANALYSIS), fixture = savedFixture({ legacy: true })
  const value = { ...fixture.value, bytes: Buffer.byteLength(report.html), sha256: sha(report.html),
    attachment_id: `sha256:${sha(report.html)}`, source: report.source }
  events.push(...exportPair(20, value, { analysis: ANALYSIS }))
  assert.equal(selectSavedSecurityReport(ROOT, events, 'fault'), undefined)
  const harness = runtime({ events, state: { ...canonicalRun(), status: 'running' } })
  await assert.rejects(() => harness.export({ kind: 'fault', attachment_id: value.attachment_id }), /没有该真实/)
  await assert.rejects(() => harness.export(), /尚未成功完成/)
  assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
})

test('Runtime：旧legacy附件存在但本会话新Run已完成时，默认只保存新Run原HTML', async () => {
  const fixture = savedFixture({ legacy: true }), events = [...fixture.events, ...started('diagnose_device_offline', 30)]
  const harness = runtime({ events, raw: 'diagnose_device_offline' }), value = await harness.export()
  assert.equal(value.source.kind, 'fault-troubleshooting'); assert.equal(value.source.workflow, 'troubleshooting-device-offline')
  assert.equal(value.filename, FILENAME); assert.deepEqual(harness.saves[0].data, Buffer.from(HTML))
  assert.equal(harness.calls.length, 2); assert.equal(harness.childReads.length, 0)
})

test('Runtime兼容：无新编排时，晚于旧附件的SOC补证/legacy委派只阻止默认复用，不禁显式历史附件', async () => {
  for (const suffix of [pair(30, 'mock-later-legacy-soc', 'mcp__soc-readonly__get_asset_status', {}, { status: 'unknown' }),
    [event(30, 'tool/call', { turn: 2, step: 1, callId: 'mock-later-legacy-child', name: 'delegate_fault_analysis', arguments: '{"prompt":"新legacy只读分析"}' })]]) {
    const fixture = savedFixture({ legacy: true }), events = [...fixture.events, ...suffix]
    const selected = selectSavedSecurityReport(ROOT, events, 'fault', fixture.value.attachment_id)
    assert.equal(selected.has_new_source, true); assert.equal(selected.has_new_troubleshooting_source, false)
    const harness = runtime({ events }), value = await harness.export({ kind: 'fault', attachment_id: fixture.value.attachment_id })
    assert.equal(value.file_path, fixture.value.file_path); assert.equal(value.sha256, fixture.value.sha256)
    assert.equal(harness.calls.length, 0); assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
    await assert.rejects(() => harness.export())
    assert.equal(harness.saves.length, 0)
  }
})

test('Runtime：显式选择本会话较早真实故障Run仍核原终态/HTML，不是默认退回另Run或legacy', async () => {
  const events = [...eventsFor(), ...started('diagnose_device_offline', 20, LATER_RUN), event(30, 'tool/call', {
    turn: 2, step: 1, callId: 'mock-unsettled-latest', name: toolName('diagnose_business_access'), arguments: '{}',
  })]
  const explicit = runtime({ events }), value = await explicit.export({ kind: 'fault', run_id: RUN })
  assert.equal(value.source.run_id, RUN); assert.equal(value.source.workflow, 'troubleshooting-business-access')
  assert.match(value.message, /显式run_id/); assert.match(value.message, /不冒称.*最新/)
  assert.equal(explicit.calls.length, 2); assert.equal(explicit.childReads.length, 0)
  const latest = runtime({ events })
  await assert.rejects(() => latest.export(), /未知|回执/)
  assert.equal(latest.calls.length, 0); assert.equal(latest.saves.length, 0)
  const failed = runtime({ events, state: { ...canonicalRun(), status: 'failed' } })
  await assert.rejects(() => failed.export({ kind: 'fault', run_id: RUN }), /status=failed/)
  assert.equal(failed.saves.length, 0); assert.equal(failed.childReads.length, 0)
})

test('来源待核：opaque真实配对明确给目标故障Run仍不合法化，阻断legacy与旧附件默认/显式复用', async () => {
  for (const value of [{ ...canonicalRun(), status: 'accepted' }, { ...canonicalRun(), status: 'failed' },
    { ok: false, result: canonicalRun() }]) {
    const fixture = savedFixture({ legacy: true }), unknown = pair(30, 'mock-unknown-origin', 'mcp__mock-unresolved__opaque_action', {}, value)
    const events = [...fixture.events, ...unknown]
    assert.throws(() => bindingFor(events), /来源待核|工具身份不明/)
    const saved = selectSavedSecurityReport(ROOT, events, 'fault', fixture.value.attachment_id)
    assert.equal(saved.has_new_source, true); assert.equal(saved.has_new_troubleshooting_source, true)
    const harness = runtime({ events })
    await assert.rejects(() => harness.export(), /来源待核|工具身份不明/)
    await assert.rejects(() => harness.export({ kind: 'fault', analysis: ANALYSIS }), /来源待核|工具身份不明/)
    await assert.rejects(() => harness.export({ kind: 'fault', attachment_id: fixture.value.attachment_id }), /更新故障来源/)
    assert.equal(harness.calls.length, 0); assert.equal(harness.saves.length, 0); assert.equal(harness.childReads.length, 0)
  }
})

test('来源待核：已明确识别的get_run/artifact/details仅查询，不反向建立新的启动来源', () => {
  for (const raw of ['get_composition_run', 'get_composition_artifact', 'get_composition_details']) {
    const events = [user(), ...pair(10, `mock-query-${raw}`, toolName(raw), { run_id: RUN }, canonicalRun())]
    assert.equal(bindingFor(events), undefined)
    assert.throws(() => bindingFor(events, RUN), /本会话|来源/)
  }
})

const REUSE_REQUEST = '下载刚才原HTML，不要重新生成报告。'
function requestExec(request) {
  const events = [user(0, request)]
  return { agent: { id: ROOT, session: { id: ROOT, header: { delegationDepth: 0 }, snapshotEvents: () => events } } }
}

test('下载意图：明确下载已有文件且禁止生成时仅标reuseOnly，普通否定/咨询仍拒绝', () => {
  for (const request of [REUSE_REQUEST, '不要生成新报告，只下载刚才的HTML报告。', '导出上次已保存的HTML，不要重新生成报告。']) {
    assert.equal(requireReportRequest(requestExec(request)).reuseOnly, true)
  }
  assert.equal(requireReportRequest(requestExec('只读排查并生成HTML报告。')).reuseOnly, false)
  for (const request of ['不要生成HTML报告。', '请生成HTML报告，但不要生成报告。',
    '不要下载刚才原HTML。', '不要导出刚才原HTML。',
    '下载刚才原HTML，不要重新生成报告，也不要导出。',
    '如何下载刚才原HTML，不要重新生成报告？', '请说明报告下载方法，不要生成报告。']) {
    assert.throws(() => requireReportRequest(requestExec(request)), /没有报告生成或下载意图/)
  }
})

test('仅复用：故障新流程与legacy已导出文件支持默认/显式下载，零getter/取证/附件创建', async () => {
  for (const legacy of [false, true]) {
    const fixture = savedFixture({ legacy }), events = [...fixture.events, user(50, REUSE_REQUEST)]
    for (const explicit of [false, true]) {
      const harness = runtime({ events }), value = await harness.export({ kind: 'fault',
        ...(explicit ? { attachment_id: fixture.value.attachment_id } : {}) })
      assert.equal(value.file_path, fixture.value.file_path); assert.equal(value.sha256, fixture.value.sha256)
      assert.equal(harness.calls.length, 0); assert.equal(harness.childReads.length, 0); assert.equal(harness.saves.length, 0)
    }
  }
})

test('仅复用：inspection真实export附件同样支持默认/显式原文件下载，不重新get_run', async () => {
  const fixture = savedFixture(), value = { ...fixture.value, kind: 'inspection', source: {
    kind: 'inspection', run_id: RUN, artifact_id: 'report', original_filename: FILENAME, original_sha256: sha(HTML),
  } }
  const events = [user(), ...exportPair(20, value, { kind: 'inspection', run_id: RUN }), user(50, REUSE_REQUEST)]
  for (const explicit of [false, true]) {
    const harness = runtime({ events }), result = await harness.export({ kind: 'inspection',
      ...(explicit ? { attachment_id: value.attachment_id } : {}) })
    assert.equal(result.file_path, value.file_path); assert.equal(result.sha256, value.sha256)
    assert.equal(harness.calls.length, 0); assert.equal(harness.childReads.length, 0); assert.equal(harness.saves.length, 0)
  }
})

test('仅复用：没有真实已导出文件，即使有完成Run或legacy分析也不生成、不查Run、不读取child', async () => {
  for (const initial of [[user()], eventsFor(), legacyEvents()]) {
    for (const kind of ['fault', 'inspection']) {
      const harness = runtime({ events: [...initial, user(50, REUSE_REQUEST)] })
      await assert.rejects(() => harness.export({ kind }), /仅允许下载.*真实已导出/)
      assert.equal(harness.calls.length, 0); assert.equal(harness.childReads.length, 0); assert.equal(harness.saves.length, 0)
    }
  }
})

test('仅复用：新故障来源使旧文件失效时不隐式get_run，指定run/analysis/child也不得越过禁止生成', async () => {
  const fixture = savedFixture(), events = [...fixture.events, ...started('diagnose_device_offline', 30, LATER_RUN), user(50, REUSE_REQUEST)]
  for (const args of [{ kind: 'fault' }, { kind: 'fault', attachment_id: fixture.value.attachment_id },
    { kind: 'fault', run_id: RUN }, { kind: 'fault', analysis: ANALYSIS }, { kind: 'fault', child_id: CHILD }]) {
    const harness = runtime({ events })
    await assert.rejects(() => harness.export(args), /仅允许下载|更新故障来源/)
    assert.equal(harness.calls.length, 0); assert.equal(harness.childReads.length, 0); assert.equal(harness.saves.length, 0)
  }
})
