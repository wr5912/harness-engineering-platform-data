// 仅本地Mock：不连接MCP/SOC、不写真实附件，不启动业务或模型。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
// ts模式仅用Node原生内存去类型校验源码；默认仍验证受管MJS，不写生成物。
const { apply } = await import(process.env.SECURITY_REPORT_TEST_SOURCE === 'ts'
  ? '../dsh/managed/security-report-runtime.ts' : '../dsh/managed/security-report-runtime.mjs')

const RUN = 'run-11111111-1111-4111-8111-111111111111'
const OTHER = 'run-22222222-2222-4222-8222-222222222222'
const FLOW = 'inspection-vulnerabilities'
const toolName = raw => `mcp__inspection-compositions__${raw}`
const smallHtml = '<!doctype html><html lang="zh-CN"><body>原始事实：未知 &amp; 异常，未修复。</body></html>'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const text = value => [{ type: 'text', text: JSON.stringify(value) }]
const envelope = value => ({ ok: true, result: value })
// Mock使用公开UserMessage结构；branded id/callId在运行期同为字符串，不新增SDK依赖。
const toolContext = (id, callId) => ({ id, role: 'user', source: { kind: 'tool', callId }, content: [{ type: 'text', text: id }] })
function runValue(body = smallHtml, fields = {}) {
  return { run_id: RUN, composition_id: FLOW, workflow: FLOW, status: 'completed',
    result: { status: 'incomplete', counts: { normal: 0, abnormal: 12, unknown: 93 } },
    artifacts: [{ id: 'report', filename: 'inspection-report.html', contentType: 'text/html; charset=utf-8', bytes: Buffer.byteLength(body) }], ...fields }
}
function pair(seq, callId, name, args, content) {
  return [
    { type: 'tool/call', seq, data: { callId, name, arguments: JSON.stringify(args), turn: 1, step: seq } },
    { type: 'tool/result', seq: seq + 1, sourceEventSeqs: [seq], data: { turn: 1, step: seq,
      message: { role: 'tool', source: { kind: 'tool', callId }, toolCallId: callId, isError: false, content } } },
  ]
}
function history(mode = 'spill') {
  const done = JSON.stringify(envelope(runValue()))
  const completed = mode === 'spill'
    ? [{ type: 'text', text: done.slice(0, 170) + '\n… truncated …' },
      { type: 'text', text: '(Omitted 60000 bytes. Full formatted result stored at: /tmp/mock-only.txt)' }]
    : mode === 'segmented'
      ? [{ type: 'text', text: done.slice(0, 120) }, { type: 'text', text: done.slice(120) }]
      : text(envelope(runValue()))
  return [
    { type: 'user/message', seq: 1, data: { id: 'user-report', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '请提供本次巡检完整报告下载。' }] } },
    ...pair(2, 'start', toolName('inspection_vulnerabilities'), { scope: { all: true } }, text(envelope(runValue(smallHtml, { status: 'accepted', artifacts: [] })))),
    ...pair(4, 'old-query', toolName('get_composition_run'), { run_id: RUN }, text(envelope(runValue(smallHtml, { status: 'running', artifacts: [] })))),
    ...pair(6, 'latest-query', toolName('get_composition_run'), { run_id: RUN }, completed),
  ]
}
function fixture(options = {}) {
  const body = options.body ?? smallHtml, events = options.events ?? history(options.history ?? 'spill')
  const run = options.run ?? runValue(body), calls = [], saved = [], contexts = []
  if (options.requestText !== undefined) events[0].data.content = [{ type: 'text', text: options.requestText }]
  const controller = new AbortController()
  const agent = { id: 'session-mock-owner', session: { id: 'session-mock-owner', header: { delegationDepth: 0 }, snapshotEvents: () => events } }
  const exec = { agent, callId: 'export-call', rootCallId: 'export-root', token: Symbol('parent'), signal: controller.signal, deferContext: value => contexts.push(value) }
  let definition
  const canonical = payload => {
    if (options.format === 'structured') return { content: [], structuredContent: payload }
    const raw = JSON.stringify(payload)
    return { content: options.format === 'segmented'
      ? [{ type: 'text', text: raw.slice(0, 151) }, { type: 'text', text: raw.slice(151) }]
      : [{ type: 'text', text: raw }] }
  }
  const ctx = {
    tools: {
      register: value => { definition = value },
      get: name => options.missing === name ? undefined : { name },
      async execute(call) {
        assert.equal(call.agent, agent); assert.equal(call.parent, exec.token)
        assert.equal(call.rootCallId, exec.rootCallId); assert.equal(call.signal, exec.signal)
        assert.ok(call.arguments.run_id === RUN || Object.hasOwn(options.runs ?? {}, call.arguments.run_id))
        calls.push(call)
        if (options.abortAt === call.name) { controller.abort(); controller.signal.throwIfAborted() }
        if (options.abortResultAt === call.name) {
          controller.abort()
          return { isError: true, error: { message: 'Mock已取消' }, content: [{ type: 'text', text: 'Mock已取消' }], additionalContexts: options.abortContexts ?? [] }
        }
        if (call.name === toolName('get_composition_run')) return options.runResult ?? { isError: false, value: canonical(envelope(options.runs?.[call.arguments.run_id] ?? run)), content: [{ type: 'text', text: 'display-only truncated' }], additionalContexts: options.statusContexts ?? [toolContext('mock-status-context', `${exec.callId}:status`)] }
        assert.equal(call.name, toolName('get_composition_artifact'))
        assert.equal(call.arguments.artifactId, 'report')
        return options.artifactResult ?? { isError: false, value: canonical(envelope({ filename: 'inspection-report.html', contentType: 'text/html; charset=utf-8', body })), additionalContexts: options.artifactContexts ?? [] }
      },
    },
    attachments: {
      async saveFile({ name, data }) { const bytes = Buffer.from(data); saved.push({ name, bytes }); return { name, bytes: bytes.length, attachmentId: `sha256:${sha(bytes)}` } },
      fileHostPath: ref => options.noPath ? undefined : `/mock-native/attachments/${ref.name}`,
    },
    mcpSessionManager: { resolveTool: (group, raw) => group !== 'inspection-compositions' ? undefined
      : Object.hasOwn(options.resolve ?? {}, raw) ? options.resolve[raw] : toolName(raw) },
    sessionQuery: { readSession: () => assert.fail('巡检导出不能读取其他Session') },
  }
  apply(ctx)
  return { invoke: (args = { kind: 'inspection', run_id: RUN }) => definition.execute(args, exec), calls, saved, contexts, controller, definition }
}

test('spill 完成展示不覆盖完整回执终态，并导出原始字节', async () => {
  const f = fixture()
  const value = await f.invoke()
  assert.deepEqual(f.calls.map(call => call.name), [toolName('get_composition_run'), toolName('get_composition_artifact')])
  assert.equal(value.source.run_id, RUN)
  assert.equal(value.bytes, Buffer.byteLength(smallHtml))
  assert.equal(value.sha256, sha(Buffer.from(smallHtml)))
  assert.deepEqual(f.saved[0].bytes, Buffer.from(smallHtml))
  assert.equal(f.contexts.length, 1)
})

for (const format of ['text', 'segmented', 'structured']) for (const display of ['ordinary', 'segmented', 'spill']) {
  test(`完整${format}回执与${display}展示：completed/incomplete仍可导出`, async () => {
    const f = fixture({ format, history: display })
    const value = await f.invoke()
    assert.equal(value.source.original_sha256, sha(Buffer.from(smallHtml)))
    assert.deepEqual(f.saved[0].bytes, Buffer.from(smallHtml))
    assert.equal(f.calls.length, 2)
  })
}
for (const status of ['accepted', 'running', 'failed', 'canceled', 'cancelled', undefined]) {
  test(`完整原始执行状态${status}不得被旧完成展示或业务completed放行`, async () => {
    const f = fixture({ history: 'ordinary', run: runValue(smallHtml, { status, result: { status: 'completed' } }) })
    await assert.rejects(f.invoke(), /尚未成功结束/)
    assert.equal(f.calls.length, 1); assert.equal(f.saved.length, 0)
  })
}

test('模型不能以另一会话run编号借用本会话来源', async () => {
  const f = fixture()
  await assert.rejects(f.invoke({ kind: 'inspection', run_id: OTHER }), /没有可核验的巡检启动回执/)
  assert.equal(f.calls.length, 0); assert.equal(f.saved.length, 0)
})
test('错误分组的同名启动不建立巡检来源', async () => {
  const events = history(); events[1].data.name = 'mcp__other-group__inspection_vulnerabilities'
  const f = fixture({ events })
  await assert.rejects(f.invoke(), /没有可核验的巡检启动回执/)
  assert.equal(f.calls.length, 0)
})
test('启动回执错误流程不建立来源', async () => {
  const events = history(); events[2].data.message.content = text(envelope(runValue(smallHtml, { composition_id: 'inspection-status' })))
  const f = fixture({ events })
  await assert.rejects(f.invoke(), /没有可核验的巡检启动回执/)
  assert.equal(f.calls.length, 0)
})
test('fork继承前缀不能变成本会话启动来源', async () => {
  const events = [...history(), { type: 'session/end-seed', seq: 8, data: { inherited: true } }]
  const f = fixture({ events })
  await assert.rejects(f.invoke(), /没有可核验的巡检启动回执/)
  assert.equal(f.calls.length, 0)
})
test('重复启动回执仍拒绝不明确的来源', async () => {
  const events = history(); events.push({ ...events[2], seq: 8 })
  const f = fixture({ events })
  await assert.rejects(f.invoke(), /没有可核验的巡检启动回执/)
  assert.equal(f.calls.length, 0)
})
for (const fields of [{ run_id: OTHER }, { composition_id: 'inspection-status' }, { workflow: 'inspection-status' }]) {
  test(`完整终态必须对应确切同run同流程：${Object.keys(fields)[0]}`, async () => {
    const f = fixture({ run: runValue(smallHtml, fields) })
    await assert.rejects(f.invoke(), /原始运行或流程不一致/)
    assert.equal(f.calls.length, 1); assert.equal(f.saved.length, 0)
  })
}
for (const runResult of [
  { isError: true, value: envelope(runValue()), additionalContexts: [] },
  { isError: false, value: { content: text({ ok: false, result: runValue() }) } },
  { isError: false, value: { content: text({ code: 500, data: runValue() }) } },
  { isError: false, value: { content: [{ type: 'text', text: '{"ok":true,"result":{"status":"completed"\n… truncated …' }] } },
  { isError: false },
]) {
  test(`完整终态读取失败或无效时不退回聊天状态：${JSON.stringify(runResult).slice(0, 75)}`, async () => {
    const f = fixture({ history: 'ordinary', runResult })
    await assert.rejects(f.invoke())
    assert.equal(f.calls.length, 1); assert.equal(f.saved.length, 0)
  })
}
for (const reports of [[], [{ id: 'details', filename: 'details.json', contentType: 'application/json', bytes: 12 }],
  [runValue().artifacts[0], runValue().artifacts[0]],
  [{ ...runValue().artifacts[0], bytes: 0 }], [{ ...runValue().artifacts[0], bytes: '12' }],
  [{ ...runValue().artifacts[0], contentType: 'application/pdf' }]]) {
  test(`唯一HTML报告元数据不足时不读文件：${JSON.stringify(reports).slice(0, 70)}`, async () => {
    const f = fixture({ run: runValue(smallHtml, { artifacts: reports }) })
    await assert.rejects(f.invoke(), /唯一、非空/)
    assert.equal(f.calls.length, 1); assert.equal(f.saved.length, 0)
  })
}
for (const artifactResult of [
  { isError: true, error: { message: 'Mock报告读取被拒绝' }, content: [{ type: 'text', text: 'Mock报告读取被拒绝' }] },
  { isError: false, value: { content: text({ ok: false, result: { body: smallHtml } }) } },
  { isError: false, value: { content: text({ code: 500, data: { body: smallHtml } }) } },
  { isError: false, value: { content: [{ type: 'text', text: '{"ok":true,"result":{"body":"truncated' }] } },
]) {
  test(`artifact失败或不完整原始回执不保存：${JSON.stringify(artifactResult).slice(0, 65)}`, async () => {
    const f = fixture({ artifactResult })
    await assert.rejects(f.invoke())
    assert.equal(f.calls.length, 2); assert.equal(f.saved.length, 0)
  })
}

test('读取报告的原始字节数必须与同次元数据一致', async () => {
  const report = { ...runValue().artifacts[0], bytes: Buffer.byteLength(smallHtml) + 1 }
  const f = fixture({ run: runValue(smallHtml, { artifacts: [report] }) })
  await assert.rejects(f.invoke(), /字节数与同次产物元数据不一致/)
  assert.equal(f.saved.length, 0)
})
test('原报告文件身份不匹配时不保存', async () => {
  const f = fixture({ artifactResult: { isError: false, value: { content: text(envelope({ filename: 'other.html', contentType: 'text/html; charset=utf-8', body: smallHtml })) } } })
  await assert.rejects(f.invoke(), /同次产物元数据不一致/)
  assert.equal(f.saved.length, 0)
})
for (const body of ['<html><body>fragment</body></html>', '<!doctype html><html><body>missing-end']) {
  test('HTML片段不得作为完整原报告保存：' + body.slice(0, 25), async () => {
    const f = fixture({ body })
    await assert.rejects(f.invoke(), /不是完整HTML/)
    assert.equal(f.saved.length, 0)
  })
}
test('大报告保持UTF8原字节、摘要及文件名，不改写结论', async () => {
  const body = '<!doctype html><html lang="zh-CN"><body>\r\n' + '<p>原始未知 &amp; 异常，未修复。</p>\n'.repeat(70000) + '</body></html>'
  const f = fixture({ body, format: 'segmented' })
  const value = await f.invoke()
  assert.ok(value.bytes > 1738894)
  assert.deepEqual(f.saved[0].bytes, Buffer.from(body))
  assert.equal(value.sha256, sha(Buffer.from(body)))
  assert.equal(value.filename, `inspection-report-${RUN}.html`)
  assert.equal(value.source.original_sha256, value.sha256)
})
test('原32MiB上限保持，超限不截断保存', async () => {
  const body = '<!doctype html><html><body>' + 'a'.repeat(32 * 1024 * 1024) + '</body></html>'
  const f = fixture({ body })
  await assert.rejects(f.invoke(), /32MiB/)
  assert.equal(f.saved.length, 0)
})
for (const raw of ['get_composition_run', 'get_composition_artifact']) {
  test(`未注册入口${raw}不得跨组猜测或绕行`, async () => {
    const f = fixture({ missing: toolName(raw) })
    await assert.rejects(f.invoke(), /当前没有/)
    assert.equal(f.saved.length, 0)
  })
  test(`取消${raw}期间的导出不写附件`, async () => {
    const f = fixture({ abortAt: toolName(raw) })
    await assert.rejects(f.invoke(), { name: 'AbortError' })
    assert.equal(f.saved.length, 0)
  })
}
test('缺少原生文件路径时不虚构成功链接', async () => {
  const f = fixture({ noPath: true })
  await assert.rejects(f.invoke(), /不能提供可核对/)
  assert.equal(f.saved.length, 1)
})
test('不新增模型任意路径参数', async () => {
  const f = fixture()
  await assert.rejects(f.invoke({ kind: 'inspection', run_id: RUN, file_path: '/other/session/report.html' }), /参数不符合合同/)
  assert.equal(f.calls.length, 0); assert.equal(f.saved.length, 0)
})
for (const actual of [undefined, 'registered-startup-v2']) {
  test(`resolver未确认启动身份${actual}时不得按旧拼写猜源`, async () => {
    const f = fixture({ resolve: { inspection_vulnerabilities: actual } })
    await assert.rejects(f.invoke(), /没有可核验的巡检启动回执/)
    assert.equal(f.calls.length, 0); assert.equal(f.saved.length, 0)
  })
}

test('成功查询及artifact的UserMessage上下文按原对象顺序转交', async () => {
  const a = toolContext('status-a', 'export-call:status'), b = toolContext('status-b', 'export-call:status')
  const c = toolContext('artifact-c', 'export-call:report')
  const f = fixture({ statusContexts: [a, b], artifactContexts: [c] })
  await f.invoke()
  assert.deepEqual(f.contexts, [a, b, c])
  assert.equal(f.contexts[0], a); assert.equal(f.contexts[1], b); assert.equal(f.contexts[2], c)
})
for (const raw of ['get_composition_run', 'get_composition_artifact']) {
  test(`规范失败${raw}的UserMessage上下文仍原样转交`, async () => {
    const c = toolContext('failure-context', raw === 'get_composition_run' ? 'export-call:status' : 'export-call:report')
    const failure = { isError: true, error: { message: 'Mock被策略拒绝' }, content: [{ type: 'text', text: 'Mock被策略拒绝' }], additionalContexts: [c] }
    const f = fixture({ statusContexts: [], ...(raw === 'get_composition_run' ? { runResult: failure } : { artifactResult: failure }) })
    await assert.rejects(f.invoke(), /读取失败/)
    assert.deepEqual(f.contexts, [c]); assert.equal(f.contexts[0], c)
    assert.equal(f.saved.length, 0)
  })
}
test('取消信号已触发但管线返回failure时仍转交上下文且不保存', async () => {
  const c = toolContext('abort-context', 'export-call:status')
  const f = fixture({ abortResultAt: toolName('get_composition_run'), abortContexts: [c] })
  await assert.rejects(f.invoke(), { name: 'AbortError' })
  assert.deepEqual(f.contexts, [c]); assert.equal(f.contexts[0], c)
  assert.equal(f.saved.length, 0)
})

test('INS-HV-08 原单IP明确请求给出本次结果和完整报告', async () => {
  const f = fixture({ requestText: '请按最新接入数据，重新检查172.16.2.170这台设备的在线状态，只巡检这个IP对应的资产，完成后给出本次结果和完整报告。' })
  assert.equal((await f.invoke()).source.run_id, RUN)
  assert.deepEqual(f.saved[0].bytes, Buffer.from(smallHtml))
})
function twoStarts() {
  return [history()[0],
    ...pair(2, 'older-start', toolName('inspection_vulnerabilities'), { scope: { all: true } }, text(envelope(runValue(smallHtml, { run_id: OTHER, status: 'accepted', artifacts: [] })))),
    ...pair(4, 'newer-start', toolName('inspection_vulnerabilities'), { scope: { all: true } }, text(envelope(runValue(smallHtml, { status: 'accepted', artifacts: [] })))),
  ]
}
for (const status of ['running', 'failed', 'canceled']) {
  test(`默认最近已完成：新${status}不能遮蔽本会话旧completed原报告`, async () => {
    const f = fixture({ events: twoStarts(), runs: { [RUN]: runValue(smallHtml, { status, artifacts: [] }), [OTHER]: runValue(smallHtml, { run_id: OTHER }) } })
    const value = await f.invoke({ kind: 'inspection' })
    assert.equal(value.source.run_id, OTHER)
    assert.equal(value.filename, `inspection-report-${OTHER}.html`)
    assert.deepEqual(f.calls.map(call => call.arguments.run_id), [RUN, OTHER, OTHER])
  })
  test(`显式新run ${status}不得借用旧completed报告`, async () => {
    const f = fixture({ events: twoStarts(), runs: { [RUN]: runValue(smallHtml, { status }), [OTHER]: runValue(smallHtml, { run_id: OTHER }) } })
    await assert.rejects(f.invoke({ kind: 'inspection', run_id: RUN }), /尚未成功结束/)
    assert.deepEqual(f.calls.map(call => call.arguments.run_id), [RUN])
    assert.equal(f.saved.length, 0)
  })
}

for (const requestText of ['请给出本次完整报告。', '请出具这次检查的完整报告。', '请把本次完整报告给我。', '请把本次完整报告发给我。', '本次完整报告请给出。', '请提供本次报告，随后解释如何下载。']) {
  test(`INS08等价明确报告请求：${requestText}`, async () => {
    const f = fixture({ requestText })
    assert.equal((await f.invoke()).source.run_id, RUN)
    assert.equal(f.saved.length, 1)
  })
}
for (const requestText of ['请问如何生成完整报告？', '完整报告怎么导出？', '请说明怎样给出完整报告。', '请介绍报告导出格式。', '请不要给出完整报告。', '取消本次报告导出。', '停止提供完整报告。', '只给结果，不需要报告。', '暂不下载本次报告。', '请查询这台设备的在线状态。', '巡检报告有哪些内容？']) {
  test(`咨询否定取消或无报告请求不写文件：${requestText}`, async () => {
    const f = fixture({ requestText })
    await assert.rejects(f.invoke(), /没有报告生成或下载意图/)
    assert.equal(f.calls.length, 0); assert.equal(f.saved.length, 0)
  })
}
test('默认两个completed选择最近来源，不把旧报告冒充新报告', async () => {
  const f = fixture({ events: twoStarts(), runs: { [RUN]: runValue(), [OTHER]: runValue(smallHtml, { run_id: OTHER }) } })
  const value = await f.invoke({ kind: 'inspection' })
  assert.equal(value.source.run_id, RUN)
  assert.deepEqual(f.calls.map(call => call.arguments.run_id), [RUN, RUN])
})
test('默认新状态未知不能跳过并冒称旧completed为最新', async () => {
  const f = fixture({ events: twoStarts(), runs: { [RUN]: runValue(smallHtml, { status: undefined }), [OTHER]: runValue(smallHtml, { run_id: OTHER }) } })
  await assert.rejects(f.invoke({ kind: 'inspection' }), /尚未成功结束/)
  assert.deepEqual(f.calls.map(call => call.arguments.run_id), [RUN]); assert.equal(f.saved.length, 0)
})
test('显式旧completed仍只读取确切指定run', async () => {
  const f = fixture({ events: twoStarts(), runs: { [RUN]: runValue(smallHtml, { status: 'running' }), [OTHER]: runValue(smallHtml, { run_id: OTHER }) } })
  assert.equal((await f.invoke({ kind: 'inspection', run_id: OTHER })).source.run_id, OTHER)
  assert.deepEqual(f.calls.map(call => call.arguments.run_id), [OTHER, OTHER])
})

test('未指定run时仍以本会话最近真实来源核验，不借用其他来源', async () => {
  const f = fixture()
  assert.equal((await f.invoke({ kind: 'inspection' })).source.run_id, RUN)
  assert.equal(f.calls[0].arguments.run_id, RUN)
})
