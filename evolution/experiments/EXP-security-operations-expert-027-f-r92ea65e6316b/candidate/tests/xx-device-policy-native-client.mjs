// Development-only Mock policy test client. It never invokes an MCP read or write itself.
// The model session produces the ordinary draft and native ask; this client answers
// its live user-questions/request through the public waterfall, not ordinary chat.
// Simulated native answers are test input, never evidence of human approval.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const required = name => {
  assert.ok(process.env[name], `${name} is required`)
  return process.env[name]
}
const require = createRequire(required('DSH_NATIVE_CLIENT_PACKAGE'))
const load = async specifier => import(pathToFileURL(require.resolve(specifier)).href)
const base = new URL(required('DSH_NATIVE_BASE_URL'))
assert.ok(['http:', 'https:'].includes(base.protocol))
assert.equal(base.username + base.password + base.search + base.hash, '', 'Use the registered clean anonymous gateway, not inline credentials')
assert.ok(base.pathname.endsWith('/'))
const messages = JSON.parse(required('DSH_NATIVE_MESSAGES'))
assert.ok(Array.isArray(messages) && messages.length && messages.every(text => typeof text === 'string' && text.trim()))
const reply = JSON.parse(required('DSH_NATIVE_REPLY'))
assert.ok(Array.isArray(reply.selected) && reply.selected.length === 1)
assert.ok(['确认执行', '取消执行'].includes(reply.selected[0]))
assert.equal(reply.custom, undefined, 'This basic test accepts only the native confirm or cancel selection, without custom text')
const confirms = reply.selected[0] === '确认执行'
const expectedIp = required('DSH_NATIVE_EXPECTED_IP')
assert.equal(expectedIp, '172.163.12.1', 'Use the dedicated Mock policy target')
const expectedWireless = process.env.DSH_NATIVE_EXPECTED_WIRELESS ?? '1'
assert.equal(expectedWireless, '1', 'This basic policy test enables wireless with the string value 1')
const timeoutMs = Number(process.env.DSH_NATIVE_TIMEOUT_MS ?? '120000')
assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 300000)
const outputDir = resolve(required('DSH_NATIVE_OUTPUT_DIR'))
mkdirSync(outputDir, { recursive: true })
const evidencePath = join(outputDir, `native-policy-session-${randomUUID()}.jsonl`)
writeFileSync(evidencePath, '', { flag: 'wx' })
const log = record => appendFileSync(evidencePath, JSON.stringify(record) + '\n')
const unwrap = result => {
  if (!result.ok) throw new Error(`Remote failed: ${result.error?.code ?? 'unknown'} ${result.error?.message ?? ''}`)
  return result.value
}
const jsonMessage = message => JSON.parse(message.content.filter(block => block.type === 'text').map(block => block.text).join('\n'))
const { Context } = await load('@deepseek-ai/cordis')
const registry = await load('@deepseek-ai/dsh-typert-registry/client')
const { installConnection } = await load('@deepseek-ai/dsh-client-connection/client')
const gateway = await load('@deepseek-ai/dsh-api-gateway/client')
const WebSocket = createRequire(require.resolve('@deepseek-ai/dsh-api-gateway/client'))('ws')
const ctx = new Context()
const sessionSymbol = Symbol('xx-policy-test-owned-session')
const ownedContexts = new Map()
const events = []
const questionEvidence = []
const waiters = new Set()
const streams = new Set()
let ownSessionId
let ownContext
let fatalError
let questionCount = 0
let following
let readyUnsubscribe
let connectionTimer
const signal = AbortSignal.timeout(timeoutMs)
const notify = () => { for (const check of [...waiters]) check() }
const waitFor = (predicate, description) => new Promise((resolvePromise, rejectPromise) => {
  const finish = (error, value) => {
    waiters.delete(check)
    signal.removeEventListener('abort', aborted)
    if (error) rejectPromise(error)
    else resolvePromise(value)
  }
  const check = () => {
    if (fatalError) return finish(fatalError)
    try { const value = predicate(); if (value) finish(undefined, value) }
    catch (error) { finish(error) }
  }
  const aborted = () => finish(new Error(`Native test deadline: ${description}`))
  waiters.add(check)
  signal.addEventListener('abort', aborted, { once: true })
  if (signal.aborted) aborted()
  else check()
})
const readTool = 'mcp__xx-policy-mock__read_policy_template'
const writeTool = 'mcp__xx-policy-mock__write_policy_template'
const callsFor = name => events.filter(event => event.type === 'tool/call' && event.data.name === name)
const observed = () => ({
  mock: true,
  nativeQuestionCount: questionCount,
  mockReadCount: callsFor(readTool).length,
  mockWriteCount: callsFor(writeTool).length,
  actualReadArguments: callsFor(readTool).map(call => call.data.arguments),
  actualWriteArguments: callsFor(writeTool).map(call => call.data.arguments),
})
const findPolicy = () => {
  const calls = callsFor(readTool)
  assert.ok(calls.length <= 1, 'Do not blindly repeat the Mock policy read')
  const call = calls[0]
  if (!call) return
  assert.deepEqual(JSON.parse(call.data.arguments), { hostip: expectedIp })
  const result = events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === call.data.callId)
  if (!result) return
  assert.equal(result.data.message.isError, false)
  const data = jsonMessage(result.data.message)
  assert.deepEqual(data, {
    mock: true,
    found: true,
    hostid: 'mock-policy-host-001',
    hostip: expectedIp,
    map1: { wireless: '2' },
    map2: { option2: '2' },
    map3: { option3: '2' },
  }, 'Require the actual dedicated Mock policy read receipt')
  return data
}
try {
  await ctx.plugin(registry)
  installConnection(ctx, {
    interactions: 'answer',
    transport: {
      streamBaseUrl: base.href,
      fetch: (input, init) => {
        const url = new URL(String(input).replace(/^\/+/, ''), base)
        assert.ok(url.origin === base.origin && url.pathname.startsWith(base.pathname), 'Unexpected HTTP destination')
        return fetch(url, { ...init, redirect: 'error' })
      },
      createWebSocket: input => {
        const url = new URL(input)
        assert.ok(url.host === base.host && url.pathname.startsWith(base.pathname), 'Unexpected WebSocket destination')
        return new WebSocket(url.href)
      },
    },
  })
  await ctx.plugin(gateway)
  for (const name of ['dsh-api-workspace-controller', 'dsh-agent-preset-registry', 'dsh-api-session-controller', 'dsh-user-questions']) {
    await ctx.remote.$mount((await load(`@deepseek-ai/${name}/remote`)).TYPERT_REMOTE)
  }
  ctx.typert.contexts.registerClient('agent', {
    identity: context => context[sessionSymbol],
    resolve: id => ownedContexts.get(id),
  })
  ctx.remote.$on('user-questions/request', async (request, next) => {
    if (!ownSessionId || request.agent?.[sessionSymbol] !== ownSessionId) return next()
    try {
      assert.ok(!request.wait?.timed, 'This test exercises the existing blocking native configuration')
      assert.equal(++questionCount, 1, 'Unexpected additional question; do not automatically approve it')
      assert.equal(request.questions.length, 1)
      const question = request.questions[0]
      const labels = question.options?.map(option => option.label) ?? []
      assert.ok(labels.includes('确认执行') && labels.includes('取消执行'))
      assert.ok(reply.selected.every(label => labels.includes(label)))
      await waitFor(findPolicy, 'observe this session Mock policy read before test reply')
      assert.equal(callsFor(writeTool).length, 0, 'No policy write before the native answer')
      const answer = { answers: [{ id: question.id, selected: [...reply.selected] }] }
      questionEvidence.push({ questions: request.questions, answer })
      log({ kind: 'test-client-simulated-native-answer', sessionId: ownSessionId, humanApproval: false, ...questionEvidence.at(-1) })
      return answer
    } catch (error) {
      fatalError = error
      notify()
      throw error
    }
  })
  await new Promise((resolvePromise, rejectPromise) => {
    const check = () => { if (ctx.connection.generation.getSnapshot()) resolvePromise() }
    readyUnsubscribe = ctx.connection.generation.subscribe(check)
    connectionTimer = setTimeout(() => rejectPromise(new Error('Native connection not ready')), 20000)
    check()
  })
  clearTimeout(connectionTimer)
  readyUnsubscribe()
  const workspaceStream = ctx.remote.workspace.follow(signal)
  streams.add(workspaceStream)
  const baseline = await workspaceStream[Symbol.asyncIterator]().next()
  assert.ok(!baseline.done && baseline.value.type === 'baseline')
  const workspace = baseline.value.value.items.find(item => item.path === '/work/harness/workspace')
  assert.ok(workspace, 'Use the already registered target workspace')
  workspaceStream.dispose()
  streams.delete(workspaceStream)
  const presets = unwrap(await ctx.remote.agentPresets.list()).presets
  assert.ok(presets.some(preset => preset.id === 'security-operations-expert' && !preset.broken))
  const created = unwrap(await ctx.remote.session.create({ workspaceId: workspace.workspaceId, agentPreset: 'security-operations-expert' }))
  ownSessionId = created.sessionId
  ownContext = ctx.extend({ [sessionSymbol]: ownSessionId })
  ownedContexts.set(ownSessionId, ownContext)
  log({ kind: 'test-client-session', sessionId: ownSessionId, workspaceId: workspace.workspaceId, preset: created.agentPreset, gateway: base.href, mock: true, simulation: true, humanApproval: false })
  const stream = ctx.remote.session.follow({ address: { kind: 'session', sessionId: ownSessionId } }, signal)
  streams.add(stream)
  let snapshotSeen = false
  following = (async () => {
    try {
      for await (const frame of stream) {
        if (frame.type === 'snapshot') {
          assert.equal(frame.header.id, ownSessionId)
          assert.equal(frame.header.agentPreset, 'security-operations-expert')
          assert.equal(frame.hasMore, false, 'A fresh session must have a complete opening window')
          assert.ok(!frame.records.some(record => record.event.type === 'tool/call'), 'Do not reuse another conversation')
          snapshotSeen = true
          notify()
          continue
        }
        if (frame.type !== 'event') continue
        const event = frame.event
        events.push(event)
        if (['tool/call', 'tool/result', 'turn/start', 'turn/end', 'request/context'].includes(event.type)) log({ kind: 'session-event', sessionId: ownSessionId, event })
        if (event.type === 'assistant/message') {
          log({ kind: 'visible-assistant-message', sessionId: ownSessionId, seq: event.seq, turn: event.data.turn, step: event.data.step, source: event.data.message.source, content: event.data.message.content.filter(block => block.type === 'text') })
        }
        if (event.type === 'tool/result') assert.equal(event.data.message.isError, false, 'Stop this session on a failed tool result; do not retry')
        notify()
      }
    } catch (error) {
      if (!signal.aborted) { fatalError = error; notify() }
    }
  })()
  await waitFor(() => snapshotSeen, 'own session follow opening snapshot')
  for (const text of messages) {
    const cut = events.at(-1)?.seq ?? 0
    const requestId = randomUUID()
    unwrap(await ctx.remote.session.prompt({ requestId, sessionId: ownSessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: 'Asia/Shanghai' }, signal))
    log({ kind: 'test-client-input-accepted', sessionId: ownSessionId, requestId, text })
    const end = await waitFor(() => events.find(event => event.seq > cut && event.type === 'turn/end'), 'own prompt completion')
    log({ kind: 'test-client-turn-finished', sessionId: ownSessionId, turn: end.data.turn, reason: end.data.reason })
    assert.equal(end.data.reason.kind, 'completed')
  }
  assert.equal(questionEvidence.length, 1, 'A real native question must have been answered')
  assert.equal(callsFor(readTool).length, 1)
  const policy = findPolicy()
  assert.ok(policy)
  const askCalls = callsFor('ask_user_question')
  assert.equal(askCalls.length, 1)
  assert.ok(callsFor(readTool)[0].seq < askCalls[0].seq, 'Read the policy before the native ask')
  const drafts = events.filter(event => event.type === 'assistant/message' && event.seq < askCalls[0].seq && event.data.message.content.some(block => block.type === 'text' && block.text.trim()))
  assert.ok(drafts.length > 0, 'Require an ordinary assistant draft from the actual session before the native ask')
  const askResult = events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === askCalls[0].data.callId)
  assert.ok(askResult, 'Require the actual native tool result, not only the client reply')
  assert.equal(askResult.data.message.isError, false)
  assert.deepEqual(jsonMessage(askResult.data.message), questionEvidence[0].answer)
  const writes = callsFor(writeTool)
  assert.equal(writes.length, confirms ? 1 : 0)
  if (confirms) {
    assert.ok(askResult.seq < writes[0].seq, 'No write before the native answer result')
    assert.deepEqual(JSON.parse(writes[0].data.arguments), {
      hostid: policy.hostid,
      hostip: policy.hostip,
      map1: { wireless: expectedWireless },
      map2: {},
      map3: {},
    }, 'Require exactly five fields and use host identity from the actual read receipt')
    const result = events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === writes[0].data.callId)
    assert.ok(result)
    assert.equal(result.data.message.isError, false)
    assert.deepEqual(jsonMessage(result.data.message), { mock: true, success: true, message: '模拟下发成功' })
  }
  const unexpected = events.filter(event => event.type === 'tool/call' && !['skill', readTool, 'ask_user_question', writeTool].includes(event.data.name))
  assert.deepEqual(unexpected.map(event => event.data.name), [], 'Do not execute unrelated services')
  const summary = { status: 'passed', sessionId: ownSessionId, simulatedUserInput: true, humanApproval: false, ...observed(), ordinaryAssistantDraftCount: drafts.length, completedPrompts: messages.length, evidencePath }
  log({ kind: 'test-client-summary', ...summary })
  console.log(JSON.stringify(summary))
} catch (error) {
  if (ownSessionId) {
    try { await ctx.remote.session.cancel({ sessionId: ownSessionId }) }
    catch (cancelError) { log({ kind: 'test-client-cancel-failure', sessionId: ownSessionId, message: String(cancelError.message) }) }
  }
  const summary = { status: 'failed', sessionId: ownSessionId ?? null, simulatedUserInput: true, humanApproval: false, ...observed(), message: String(error.message), evidencePath }
  log({ kind: 'test-client-failure', ...summary })
  console.error(JSON.stringify(summary))
  process.exitCode = 1
} finally {
  clearTimeout(connectionTimer)
  readyUnsubscribe?.()
  for (const stream of streams) stream.dispose()
  await following
  await ctx.fiber.dispose()
}
