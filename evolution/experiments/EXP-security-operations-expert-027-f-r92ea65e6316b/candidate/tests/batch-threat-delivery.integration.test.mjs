import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import cp from 'node:child_process'

// 离线 Host 集成：使用真实插件和本地依赖，不证明实例装载或真实 SOC 业务通过。
// Node 24；在 Candidate 下执行：THREAT_ANALYSIS_OFFLINE_MCP=1
// node --test --test-concurrency=1 tests/batch-threat-delivery.integration.test.mjs。
// 外部 SDK guard 与测试同目录；不安装依赖或读取实例凭据。
// 未启用离线选项时使用原模块依赖；缺失则明确失败，不 skip、不安装、不借程序内部包。
const candidateRoot = resolve(process.env.CANDIDATE_ROOT ?? fileURLToPath(new URL('../', import.meta.url)))
const moduleUrl = pathToFileURL(resolve(candidateRoot, 'dsh/managed/threat-analysis.mjs')).href
const sdkGuardUrl = process.env.THREAT_ANALYSIS_OFFLINE_SDK_GUARD
  ? pathToFileURL(resolve(process.env.THREAT_ANALYSIS_OFFLINE_SDK_GUARD)).href
  : new URL('./offline-mcp-client-guard.cjs', import.meta.url).href
const ids = ['INC-20261107-000008', 'INC-20261028-000021', 'INC-20261028-000012']
const oldIds = ['INC-20260101-900001', 'INC-20260101-900002', 'INC-20260101-900003']
const queryName = 'mcp__ai-soc-correlate__get_correlate_incident_judge_pending'
const deliveryProvider = 'threat-analysis-delivery'
const originalRoute = { provider: 'offline-model-must-not-run', model: 'offline-model' }
const blocks = text => [{ type: 'text', text }]
const rawUser = (id, text) => ({ id, role: 'user', source: { kind: 'user' }, content: blocks(text) })

function fixture({ queryMode = 'ok', repeat = true, explicit = false, displayOrder = ids, delegatedIds = ids } = {}) {
  const events = [], children = new Map(), notices = [], snapshots = new Map()
  const parentId = 'offline-parent-batch'
  const add = (type, data, extra = {}) => {
    const event = { type, seq: events.length, data, ...extra }; events.push(event); return event
  }
  const call = (name, callId, args, turn) => add('tool/call', {
    turn, step: 1, name, callId, arguments: JSON.stringify(args),
  })
  const receipt = (source, text) => add('tool/result', {
    turn: source.data.turn, step: source.data.step, message: {
      role: 'tool', toolCallId: source.data.callId, source: { kind: 'tool', callId: source.data.callId },
      isError: false, content: blocks(text),
    },
  }, { sourceEventSeqs: [source.seq] })
  const display = (turn, order) => add('assistant/message', { turn, step: 2,
    message: { role: 'assistant', content: blocks(order.map((id, index) => `${index + 1}. ${id}`).join('\n')) } })
  function queryRound(tag, turn, rows, order, mode) {
    add('user/message', rawUser(`query-${tag}`, '查询待研判威胁事件。'))
    add('turn/start', { turn })
    const source = call(mode === 'wrong-tool' ? 'unrelated_list_tool' : queryName, `query-${tag}-call`, {}, turn)
    if (mode !== 'missing-receipt') {
      const result = receipt(source, JSON.stringify({ code: mode === 'business-error' ? 500 : 200,
        data: { rows: (mode === 'empty' ? [] : mode === 'short-page' ? rows.slice(0, 2) : rows)
          .map(incidentId => ({ incidentId })) } }))
      if (mode === 'isError') result.data.message.isError = true
      if (mode === 'unpaired') result.data.message.source.callId = 'not-the-query-call'
      if (mode === 'missing-rows') result.data.message.content = blocks(JSON.stringify({ code: 200, data: {} }))
    }
    if (mode !== 'missing-display') {
      display(turn, [...order].reverse())
      display(turn, mode === 'partial-display' ? order.slice(0, 2) : order) // 唯一最终正式展示；不能改按 rows 顺序绑定。
    }
    add('turn/end', { turn, reason: { kind: 'completed' } })
  }
  function delegation(incidentId, index, turn, prefix) {
    const childId = `${prefix}-child-${index}`, createdAt = 1000 + turn * 10 + index
    const source = call('delegate_threat_analysis', `${prefix}-delegate-${index}`, { prompt: `仅研判 ${incidentId}；不处置。` }, turn)
    add('subagent/catalog', { childId, version: 0, mode: 'continuable', childCreatedAt: createdAt })
    receipt(source, `started subagent ${childId}`)
    children.set(childId, { incidentId, createdAt })
    return { id: `${prefix}-settled-${index}`, role: 'user',
      source: { kind: 'subagent-settled', senderSessionId: childId }, content: blocks('completed') }
  }
  add('session', { id: parentId })
  if (!explicit) {
    queryRound('older', 1, oldIds, oldIds, 'ok')
    queryRound('latest', 2, [ids[2], ids[0], ids[1]], displayOrder, queryMode)
  }
  if (repeat) {
    add('user/message', rawUser('previous-batch-user', '研判前三个事件。'))
    add('turn/start', { turn: 3 })
    const oldNotices = ids.map((id, index) => delegation(id, index, 3, 'previous'))
    for (const notice of oldNotices) add('user/message', notice)
    add('assistant/message', { turn: 3, step: 2, message: { role: 'assistant',
      source: { provider: deliveryProvider }, content: blocks(`前一批完成：${ids.join('、')}。PREVIOUS_BATCH_ONLY；原始失败已交付。`) } })
    add('turn/end', { turn: 3, reason: { kind: 'completed' } })
  }
  add('user/message', rawUser('current-batch-user', explicit ? `研判 ${delegatedIds.join('、')}。` : '研判前三个事件。'))
  const turn = 4
  add('turn/start', { turn })
  delegatedIds.forEach((id, index) => notices.push(delegation(id, index, turn, 'current')))
  const appendUser = text => add('user/message', rawUser(`update-${events.length}`, text))
  function snapshot(index, { failed = false, mismatch, throwsValidation = false } = {}) {
    const childId = notices[index].source.senderSessionId, info = children.get(childId)
    const markdown = failed
      ? `### 威胁事件研判摘要\n\n**事件 ID：** ${info.incidentId}\n\nCLAIM_FAILED_${index}：SOC 认领返回 409，已有其他研判任务；未形成正式结论。未处置。`
      : `### 威胁事件研判摘要\n\n**事件 ID：** ${info.incidentId}\n\nSUCCESS_${index}：仅研判；未处置。\n\n报告写入状态：unknown；结果未知，请勿重复写入。`
    const analysis = { schema_version: '1.0', status: failed ? 'claim_failed' : 'completed', incident_id: info.incidentId,
      run_id: `offline-run-${index}`, delivery: { markdown, storage: { report: { status: 'unknown' } } },
      ...(failed ? { error_code: 409, business_message: '已有其他研判任务' }
        : { result: { unified_event_id: info.incidentId, recommended_actions: [{ action: '封禁 192.0.2.10', priority: 'high' }] } }),
    }
    const source = { type: 'tool/call', seq: 0, data: { turn: 1, step: 1, name: 'analyze_threat_incident',
      callId: 'child-analysis-call', arguments: JSON.stringify({ incident_id: info.incidentId }) } }
    const meta = { threat_analysis: analysis }
    if (throwsValidation) Object.defineProperty(meta, 'threat_analysis', { get() { throw new Error('OFFLINE_RESULT_VALIDATION_THROW') } })
    const result = { type: 'tool/result', seq: 1, sourceEventSeqs: [0], data: { turn: 1, step: 1, meta,
      message: { role: 'tool', toolCallId: source.data.callId, source: { kind: 'tool', callId: source.data.callId },
        isError: false, content: blocks('合成工具执行回执；没有真正调用业务工具。') } } }
    const value = { session: { id: childId, createdAt: info.createdAt, origin: 'subagent', isSeeded: false },
      inheritedEventCount: 0, events: [source, result] }
    if (mismatch === 'tool') source.data.arguments = JSON.stringify({ incident_id: oldIds[0] })
    if (mismatch === 'metadata') analysis.incident_id = oldIds[0]
    if (mismatch === 'result') analysis.result.unified_event_id = oldIds[0]
    if (mismatch === 'header') value.session.id = 'unrelated-child'
    snapshots.set(childId, value)
    return markdown
  }
  const markdown = ids.map((_, index) => snapshot(index))
  return { parentId, events, notices, snapshots, turn, add, appendUser, snapshot, markdown }
}

function harness(apply, data, forbidden, { onObserve, failedChild } = {}) {
  const listeners = new Map(), adapters = new Map(), observations = [], disposals = []
  const blockedService = label => new Proxy({}, { get: (_target, method) => forbidden(`${label}.${String(method)}`) })
  const ctx = {
    on(name, listener, options = {}) {
      const rows = listeners.get(name) ?? []
      options.prepend ? rows.unshift(listener) : rows.push(listener); listeners.set(name, rows)
      return () => rows.splice(rows.indexOf(listener), 1)
    },
    tools: { register(definition) {
      assert.ok(['analyze_threat_incident', 'analyze_pending_threat_incidents'].includes(definition.name))
      // 只验证注册；任何工具执行入口均 fail-fast，不会执行被注册的业务 execute。
      this[definition.name] = { ...definition, execute: forbidden(`tools.execute:${definition.name}`) }
    }, execute: forbidden('tools.execute'), call: forbidden('tools.call') },
    llm: new Proxy({ registerAdapter(providers, adapter) {
      for (const provider of providers) { assert.equal(adapters.has(provider), false); adapters.set(provider, adapter) }
    } }, { get: (target, key) => key in target ? target[key] : forbidden(`llm.${String(key)}`) }),
    mcpSessionManager: blockedService('mcpSessionManager'), webServer: blockedService('webServer'),
    userQuestions: blockedService('userQuestions'),
    sessionQuery: { async observeSession(childId, options) {
      observations.push(childId)
      assert.equal(options.projectionMode, 'none'); options.signal.throwIfAborted()
      await onObserve?.(childId, options)
      if (childId === failedChild) throw new Error('OFFLINE_CHILD_READ_FAILED')
      const value = data.snapshots.get(childId)
      assert.ok(value, `未授权读取非夹具子会话：${childId}`)
      return { header: value.session, inheritedEventCount: value.inheritedEventCount, events: value.events,
        [Symbol.dispose]() { disposals.push(childId) } }
    }, readSession: forbidden('sessionQuery.readSession') },
  }
  apply(ctx, {}, { openMcpGroupBridge: forbidden('openMcpGroupBridge') })
  const agent = { id: data.parentId, options: originalRoute,
    session: { id: data.parentId, snapshotEvents: () => structuredClone(data.events) } }
  async function dispatch(name, input, terminal) {
    const rows = listeners.get(name) ?? []
    const invoke = index => index === rows.length ? terminal() : rows[index](input, () => invoke(index + 1))
    return invoke(0)
  }
  async function request(messages, { step = 1, signal = new AbortController().signal } = {}) {
    const input = { agent, turn: data.turn, step, signal }
    let preNext = 0, requestNext = 0
    const decision = await dispatch('agent/pre-step', { ...input, messages }, async () => {
      preNext++; return { kind: 'enter', messages: structuredClone(messages), startsRequestSeries: true }
    })
    assert.equal(decision.startsRequestSeries, true)
    const route = await dispatch('agent/request', input, async () => { requestNext++; return { ...originalRoute } })
    assert.equal(preNext, 1); assert.equal(requestNext, 1)
    return { route, signal }
  }
  async function render({ route, signal }) {
    assert.equal(route.provider, deliveryProvider, '批量结果必须真正走固定 delivery adapter，不调用模型替代')
    const adapter = adapters.get(route.provider)
    assert.ok(adapter)
    const prepared = await adapter.prepareCall(route.provider, route.model, signal)
    const chunks = []
    for await (const chunk of prepared.stream({ sessionId: data.parentId, signal })) {
      if (chunk.blockType === 'tool-call' || chunk.type === 'tool-call-delta' || chunk.block?.type === 'tool-call') {
        forbidden('adapter attempted tool call')()
      }
      chunks.push(chunk)
    }
    assert.deepEqual(chunks.map(chunk => chunk.type), ['block-start', 'text-delta', 'block-end', 'finish'])
    assert.equal(chunks.at(-1).reason.kind, 'stop')
    const text = chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('')
    assert.equal(chunks.find(chunk => chunk.type === 'block-end').block.text, text)
    return text
  }
  function persist(messages, text) {
    for (const message of messages) if (!data.events.some(event => event.data?.id === message.id)) data.add('user/message', structuredClone(message))
    data.add('assistant/message', { turn: data.turn, step: 1,
      message: { role: 'assistant', source: { provider: deliveryProvider }, content: blocks(text) } })
  }
  return { request, render, persist, observations, disposals, adapters }
}

function section(text, incidentId) {
  const marker = `### 事件 ${incidentId}\n\n`, start = text.indexOf(marker)
  assert.notEqual(start, -1, `缺少事件独立分节：${incidentId}`)
  const end = text.indexOf('\n\n### 事件 ', start + marker.length)
  return text.slice(start + marker.length, end < 0 ? undefined : end)
}
const noRawSummary = text => assert.doesNotMatch(text, /SUCCESS_\d|CLAIM_FAILED_\d|PREVIOUS_BATCH_ONLY/)

// 不启用并发：本文件临时保护 Node 外部 I/O 边界，finally 必须恢复。
test('真实主插件批量交付离线 Host 集成', { timeout: 60000 }, async t => {
  const violations = []
  const forbidden = label => (..._args) => {
    violations.push(label); throw new Error(`OFFLINE_SIDE_EFFECT_FORBIDDEN: ${label}`)
  }
  let sdkHook
  try {
    if (process.env.THREAT_ANALYSIS_OFFLINE_MCP === '1') {
      sdkHook = registerHooks({ resolve(specifier, context, nextResolve) {
        // 唯一外部包替换；主模块与所有相对本地导入/helper 均交给原始 Node loader。
        if (specifier === '@modelcontextprotocol/client') return { url: sdkGuardUrl, shortCircuit: true }
        return nextResolve(specifier, context)
      } })
    }
    mock.method(globalThis, 'fetch', forbidden('fetch'))
    for (const [object, methods] of [[http, ['createServer', 'request', 'get']], [https, ['request', 'get']],
      [net, ['connect', 'createConnection', 'createServer']], [net.Socket.prototype, ['connect']],
      [cp, ['execFile', 'exec', 'spawn', 'fork', 'execFileSync', 'execSync', 'spawnSync']]]) {
      for (const method of methods) mock.method(object, method, forbidden(`node-io:${method}`))
    }
    syncBuiltinESMExports()
    let plugin
    try { plugin = await import(moduleUrl) }
    catch (error) {
      throw new Error(`真实主模块导入失败；必须先核对公开运行依赖。当前模块 ${moduleUrl}；`
        + '不得安装或借程序内部包绕过；可显式 THREAT_ANALYSIS_OFFLINE_MCP=1 仅隔离外部 SDK。', { cause: error })
    }
    assert.equal(typeof plugin.apply, 'function')
    // 模块装载结束后关闭文件读写，防止运行逻辑读取凭据或写任何业务/报告制品。
    for (const method of ['readFile', 'writeFile', 'appendFile', 'mkdir', 'open', 'rm', 'rename', 'unlink', 'copyFile', 'chmod']) {
      mock.method(fsp, method, forbidden(`fs.promises.${method}`))
    }
    for (const method of ['readFileSync', 'readFile', 'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
      'mkdirSync', 'mkdir', 'openSync', 'open', 'rmSync', 'rm', 'renameSync', 'rename', 'unlinkSync', 'unlink']) {
      mock.method(fs, method, forbidden(`fs.${method}`))
    }
    syncBuiltinESMExports()

    await t.test('apply→pre-step→request→固定 adapter；重复同句无新查询仍按原展示三事件（漏导入必败）', async () => {
      const data = fixture(), h = harness(plugin.apply, data, forbidden), before = JSON.stringify(data.events)
      const text = await h.render(await h.request(data.notices))
      ids.forEach((id, index) => assert.equal(section(text, id), data.markdown[index]))
      assert.deepEqual(h.observations, data.notices.map(notice => notice.source.senderSessionId))
      assert.deepEqual(h.disposals, h.observations)
      assert.doesNotMatch(text, /PREVIOUS_BATCH_ONLY|无法读取|尚未核验完整结果/)
      assert.equal(JSON.stringify(data.events), before, '插件不得改写真实父日志')
      assert.equal(data.events.filter(event => event.type === 'tool/call' && event.data.name === queryName).length, 2)
      await assert.rejects(h.render({ route: { provider: deliveryProvider, model: 'fixed-summary' }, signal: new AbortController().signal }),
        /missing threat-analysis delivery/, '固定摘要队列必须消费一次')
    })
    await t.test('同一接纳批内成功、claim_failed 无 result、读取失败各自交付；unknown 原样保留', async () => {
      const data = fixture(), claim = data.snapshot(1, { failed: true })
      const failedChild = data.notices[2].source.senderSessionId
      const closing = `### 威胁事件研判摘要\n\n**事件 ID：** ${ids[2]}\n\nREAD_NOTICE_ONLY；报告写入状态：unknown；未处置。`
      data.notices[2].content = blocks(`completed\nIts closing message:\n${closing}`)
      const h = harness(plugin.apply, data, forbidden, { failedChild })
      const text = await h.render(await h.request(data.notices))
      assert.equal(section(text, ids[0]), data.markdown[0]); assert.equal(section(text, ids[1]), claim)
      const readFailure = section(text, ids[2])
      assert.ok(readFailure.includes(closing))
      assert.match(readFailure, /仅为子任务结束通知.*尚未核验完整结果/)
      assert.match(text, /报告写入状态：unknown；结果未知，请勿重复写入。/)
      assert.equal(h.observations.filter(id => id === failedChild).length, 5, '保留真实读重试，不能 mock 掉主流程')
    })
    await t.test('每个 notice 独立接纳和流式交付，先前已完成消息不混入新项', async () => {
      const data = fixture(), h = harness(plugin.apply, data, forbidden)
      for (const [step, index] of [2, 0, 1].entries()) {
        const accepted = [data.notices[index]], text = await h.render(await h.request(accepted, { step: step + 1 }))
        assert.equal(text, data.markdown[index])
        h.persist(accepted, text)
      }
      assert.deepEqual(h.observations, [2, 0, 1].map(index => data.notices[index].source.senderSessionId))
    })
    for (const mode of ['isError', 'business-error', 'empty', 'short-page', 'missing-rows', 'missing-receipt', 'unpaired', 'missing-display', 'partial-display', 'wrong-tool']) {
      await t.test(`最新 query ${mode} 不回退旧快照或前一批摘要`, async () => {
        const data = fixture({ queryMode: mode, repeat: false }), h = harness(plugin.apply, data, forbidden)
        noRawSummary(await h.render(await h.request(data.notices)))
        assert.deepEqual(h.observations, [])
      })
    }
    await t.test('展示顺序和 raw rows 不同，仅接受最后正式 display 顺序', async () => {
      const data = fixture({ repeat: false, delegatedIds: [ids[2], ids[0], ids[1]] }), h = harness(plugin.apply, data, forbidden)
      noRawSummary(await h.render(await h.request(data.notices)))
      assert.deepEqual(h.observations, [])
    })
    await t.test('显式三 ID 不依赖查询或展示目录', async () => {
      const data = fixture({ explicit: true, repeat: false }), h = harness(plugin.apply, data, forbidden)
      const text = await h.render(await h.request(data.notices))
      ids.forEach((id, index) => assert.equal(section(text, id), data.markdown[index]))
      assert.equal(data.events.some(event => event.type === 'tool/call' && event.data.name === queryName), false)
    })
    for (const mismatch of ['tool', 'metadata', 'result', 'header']) {
      await t.test(`真实结果 ${mismatch} 错配不能利用结束通知交付正文`, async () => {
        const data = fixture(), rejected = data.snapshot(1, { mismatch })
        data.notices[1].content = blocks(`completed\nIts closing message:\n${rejected}`)
        const h = harness(plugin.apply, data, forbidden), text = await h.render(await h.request(data.notices))
        assert.equal(section(text, ids[0]), data.markdown[0]); assert.equal(section(text, ids[2]), data.markdown[2])
        assert.doesNotMatch(section(text, ids[1]), /SUCCESS_1|尚未核验完整结果/)
      })
    }
    await t.test('claim_failed 也不能绕过 metadata 事件身份错配', async () => {
      const data = fixture(); data.snapshot(1, { failed: true, mismatch: 'metadata' })
      const h = harness(plugin.apply, data, forbidden), text = await h.render(await h.request(data.notices))
      assert.doesNotMatch(section(text, ids[1]), /CLAIM_FAILED_1/)
      assert.equal(section(text, ids[0]), data.markdown[0])
    })
    await t.test('结果校验抛异常不能伪装读失败，且不阻断其它 notice', async () => {
      const data = fixture(); data.snapshot(1, { throwsValidation: true })
      data.notices[1].content = blocks(`completed\nIts closing message:\n${data.markdown[1]}`)
      const h = harness(plugin.apply, data, forbidden), text = await h.render(await h.request(data.notices))
      assert.equal(section(text, ids[0]), data.markdown[0]); assert.equal(section(text, ids[2]), data.markdown[2])
      assert.match(section(text, ids[1]), /校验/)
      assert.doesNotMatch(section(text, ids[1]), /无法读取|尚未核验完整结果|SUCCESS_1/)
      assert.equal(h.observations.filter(id => id === data.notices[1].source.senderSessionId).length, 1)
    })
    await t.test('同批接纳真实用户取消或更新时，不读取旧子结果、不抢原始路由', async () => {
      for (const text of ['取消，不要继续。', '改为只查询事件，不要继续研判。']) {
        const data = fixture(), h = harness(plugin.apply, data, forbidden)
        const result = await h.request([...data.notices, rawUser('new-user', text)])
        assert.deepEqual(result.route, originalRoute); assert.deepEqual(h.observations, [])
      }
    })
    await t.test('await 读取期间真实父日志更新仍交付冻结结果但不准备处置', async () => {
      const data = fixture(); let updated = false
      const h = harness(plugin.apply, data, forbidden, { onObserve() {
        if (!updated) { updated = true; data.appendUser('取消此前批量任务；改为查询状态。') }
      } })
      const text = await h.render(await h.request(data.notices))
      assert.match(text, /SUCCESS_0|SUCCESS_1|SUCCESS_2/)
      assert.doesNotMatch(text, /disposition_prepare|PREVIOUS_BATCH_ONLY/)
      assert.equal(h.observations.length, 3)
    })
    await t.test('读取过程中 signal 取消必须中断，不把取消当可回退的读取失败', async () => {
      const data = fixture(), controller = new AbortController(), reason = new Error('OFFLINE_CANCELLED')
      const h = harness(plugin.apply, data, forbidden, { onObserve() { controller.abort(reason) } })
      await assert.rejects(h.request(data.notices, { signal: controller.signal }), error => error === reason)
      assert.equal(h.observations.length, 1)
    })
    assert.deepEqual(violations, [], '即使主流程 catch 了禁止操作，测试仍必须失败')
  } finally {
    mock.restoreAll()
    syncBuiltinESMExports()
    sdkHook?.deregister()
  }
})
