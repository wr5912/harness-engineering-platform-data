// Development-only native composition client. Only the model calls the composition.
// Uses the official public Cordis/client-connection/API Gateway contributions.
// A simulated answer to the owned Session's live native question is not human approval.
// Never retry a case after a business call, including after a client assertion failure.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const required = name => {
  const value = process.env[name]
  assert.ok(typeof value === 'string' && value.trim(), `${name} is required`)
  return value
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const jsonObject = name => {
  const value = JSON.parse(required(name))
  assert.ok(isObject(value), `${name} must be a JSON object`)
  return value
}
const require = createRequire(required('DSH_NATIVE_CLIENT_PACKAGE'))
const load = async specifier => import(pathToFileURL(require.resolve(specifier)).href)
const base = new URL(required('DSH_NATIVE_BASE_URL'))
assert.ok(['http:', 'https:'].includes(base.protocol))
assert.equal(base.username + base.password + base.search + base.hash, '', 'Use the registered clean anonymous gateway, not inline credentials')
assert.ok(base.pathname.endsWith('/'), 'The registered gateway base must end with /')
const messages = JSON.parse(required('DSH_NATIVE_MESSAGES'))
assert.ok(Array.isArray(messages) && messages.length && messages.every(text => typeof text === 'string' && text.trim()), 'DSH_NATIVE_MESSAGES must be a nonempty JSON array of nonempty strings')
const reply = jsonObject('DSH_NATIVE_REPLY')
assert.deepEqual(reply, { selected: ['确认执行'] }, 'This two-call case requires exactly the simulated native confirmation selection')
const compositionTool = required('DSH_NATIVE_COMPOSITION_TOOL')
assert.equal(compositionTool, compositionTool.trim())
assert.ok(!['skill', 'ask_user_question'].includes(compositionTool), 'Supply the actual full discovered composition tool name')
const expectedPreviewInput = jsonObject('DSH_NATIVE_EXPECTED_PREVIEW_INPUT')
assert.equal(expectedPreviewInput.stop, 'preview')
const bodyKey = required('DSH_NATIVE_RESULT_BODY_KEY')
assert.ok(['request', 'body'].includes(bodyKey), 'DSH_NATIVE_RESULT_BODY_KEY must be request or body')
const expectedBody = jsonObject('DSH_NATIVE_EXPECTED_BODY')
const policyMaps = ['设备控制', 'login', 'net']
// The public composition accepts sparse delta; compare intent after the same empty-Map normalization.
// Preserve every raw call in evidence and reject unknown fields through the actual public Schema.
const normalizedInput = value => bodyKey !== 'body' || !isObject(value.delta) ? value : {
  ...value, delta: { ...Object.fromEntries(policyMaps.map(name => [name, {}])), ...value.delta },
}
const assertStringMap = (value, description) => {
  assert.ok(isObject(value), `${description} must be an object`)
  assert.ok(Object.values(value).every(item => typeof item === 'string'), `${description} values must all be strings`)
}
const assertBody = (value, description) => {
  assert.ok(isObject(value), `${description} must be an object`)
  if (bodyKey === 'body') {
    assert.deepEqual(Object.keys(value).sort(), ['hostid', 'hostip', ...policyMaps].sort(), `${description} must have exactly the five upstream policy fields`)
    assert.ok(typeof value.hostid === 'string' && value.hostid.trim(), `${description}.hostid must be a real preview identity`)
    assert.equal(value.hostip, expectedPreviewInput.hostip)
    for (const name of policyMaps) assertStringMap(value[name], `${description}.${name}`)
  } else {
    assert.deepEqual(Object.keys(value).sort(), ['hostid', 'hostip', 'commandid'].sort(), `${description} must have exactly the three upstream command fields`)
    assert.ok(Object.values(value).every(item => typeof item === 'string' && item.trim()), `${description} command fields must be nonempty strings`)
    assert.equal(value.hostip, expectedPreviewInput.hostIp)
    assert.equal(value.commandid, expectedPreviewInput.commandid)
  }
}
if (bodyKey === 'body') {
  assert.deepEqual(Object.keys(expectedPreviewInput).sort(), ['hostip', 'delta', 'stop'].sort())
  assert.ok(typeof expectedPreviewInput.hostip === 'string' && expectedPreviewInput.hostip.trim())
  assert.ok(isObject(expectedPreviewInput.delta))
  assert.deepEqual(Object.keys(expectedPreviewInput.delta).sort(), [...policyMaps].sort())
  for (const name of policyMaps) assertStringMap(expectedPreviewInput.delta[name], `Expected delta.${name}`)
} else {
  assert.deepEqual(Object.keys(expectedPreviewInput).sort(), ['hostIp', 'commandid', 'stop'].sort())
  for (const name of ['hostIp', 'commandid']) assert.ok(typeof expectedPreviewInput[name] === 'string' && expectedPreviewInput[name].trim())
}
assertBody(expectedBody, 'DSH_NATIVE_EXPECTED_BODY')
// Body equality below preserves every fixture key/value, including osuer/proctocol.
const timeoutMs = Number(process.env.DSH_NATIVE_TIMEOUT_MS ?? '180000')
assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 300000)
const outputDir = resolve(required('DSH_NATIVE_OUTPUT_DIR'))
mkdirSync(outputDir, { recursive: true })
const evidenceId = randomUUID()
const evidencePath = join(outputDir, `native-composition-session-${evidenceId}.jsonl`)
const summaryPath = join(outputDir, `native-composition-session-${evidenceId}.summary.json`)
writeFileSync(evidencePath, '', { flag: 'wx' })
const log = record => appendFileSync(evidencePath, JSON.stringify({ humanApproval: false, ...record }) + '\n')
const unwrapRemote = result => {
  if (!result.ok) throw new Error(`Remote failed: ${result.error?.code ?? 'unknown'} ${result.error?.message ?? ''}`)
  return result.value
}
const jsonMessage = message => {
  assert.ok(Array.isArray(message.content), 'Require the actual native tool message content')
  const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  assert.ok(text.trim(), 'Require JSON text in the actual tool receipt')
  return JSON.parse(text)
}
const compositionReceipt = message => {
  assert.equal(message.isError, false, 'A failed composition result must not be retried')
  const raw = jsonMessage(message)
  assert.ok(isObject(raw), 'Unrecognized composition result; retain the raw receipt for offline review')
  if (Object.hasOwn(raw, 'mock')) return { value: raw, wrapper: 'direct' }
  // Only an explicit, single result layer is supported. No recursive searching,
  // content-envelope guessing, fallback execution, or invented success receipts.
  const wrapperKeys = ['ok', 'version', 'result', 'receipts', 'graph_execution', 'run_id']
  assert.ok(Object.hasOwn(raw, 'result') && isObject(raw.result) && Object.keys(raw).every(key => wrapperKeys.includes(key)), 'Unrecognized composition wrapper; retain logs and stop without another business call')
  if (Object.hasOwn(raw, 'ok')) assert.equal(raw.ok, true)
  assert.ok(Object.hasOwn(raw.result, 'mock'), 'The explicit result layer must contain the composition receipt')
  return { value: raw.result, wrapper: 'result', outer: raw }
}
const { Context } = await load('@deepseek-ai/cordis')
const registry = await load('@deepseek-ai/dsh-typert-registry/client')
const { installConnection } = await load('@deepseek-ai/dsh-client-connection/client')
const gateway = await load('@deepseek-ai/dsh-api-gateway/client')
const WebSocket = createRequire(require.resolve('@deepseek-ai/dsh-api-gateway/client'))('ws')
const ctx = new Context()
const sessionSymbol = Symbol('xx-composition-test-owned-session')
const ownedContexts = new Map()
const events = []
const questionEvidence = []
const waiters = new Set()
const streams = new Set()
const controller = new AbortController()
const signal = controller.signal
const deadlineTimer = setTimeout(() => controller.abort(new Error('Native composition test deadline')), timeoutMs)
let ownSessionId
let ownContext
let fatalError
let failure
let verification
let following
let readyUnsubscribe
let connectionTimer
let questionCount = 0
let completedPrompts = 0
const notify = () => { for (const check of [...waiters]) check() }
const fail = error => { fatalError ??= error; notify() }
const waitFor = (predicate, description) => new Promise((resolvePromise, rejectPromise) => {
  let settled = false
  const finish = (error, value) => {
    if (settled) return
    settled = true
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
  const aborted = () => finish(new Error(`Native test deadline or stop: ${description}`))
  waiters.add(check)
  signal.addEventListener('abort', aborted, { once: true })
  if (signal.aborted) aborted()
  else check()
})
const callsFor = name => events.filter(event => event.type === 'tool/call' && event.data.name === name)
const resultFor = call => events.find(event => event.type === 'tool/result' && event.data.message.toolCallId === call.data.callId)
const argumentsFor = call => {
  assert.equal(typeof call.data.arguments, 'string', 'Require the actual JSON tool arguments')
  const input = JSON.parse(call.data.arguments)
  assert.ok(isObject(input), 'Tool arguments must be an object')
  return input
}
const findPreview = () => {
  const calls = callsFor(compositionTool)
  assert.ok(calls.length <= 2, 'Exactly one preview and one apply are allowed; never retry the business case')
  const call = calls[0]
  if (!call) return
  const input = normalizedInput(argumentsFor(call))
  assert.deepEqual(input, normalizedInput(expectedPreviewInput), 'The first model composition call must match the expected target and changes')
  const result = resultFor(call)
  if (!result) return
  assert.ok(call.seq < result.seq, 'Require the actual preview result after its call')
  const decoded = compositionReceipt(result.data.message)
  const value = decoded.value
  assert.equal(value.mock, true)
  assert.equal(value.stop, 'preview')
  if (bodyKey === 'request') assert.equal(value.submitted, false, 'A preview must not submit a command')
  else assert.equal(value.mockWritePerformed, false, 'A preview must not perform even the Mock policy write')
  if (Object.hasOwn(value, 'submitted')) assert.equal(value.submitted, false)
  if (Object.hasOwn(value, 'mockWritePerformed')) assert.equal(value.mockWritePerformed, false)
  if (Object.hasOwn(value, 'realWritePerformed')) assert.equal(value.realWritePerformed, false)
  assertBody(value[bodyKey], 'Actual preview upstream body')
  assert.deepEqual(value[bodyKey], expectedBody, 'The actual preview body must match the current source fixture')
  const identity = { hostid: value[bodyKey].hostid, hostip: value[bodyKey].hostip }
  if (bodyKey === 'request') identity.commandid = value.request.commandid
  else {
    assert.deepEqual(value.target, identity, 'Bind the policy body to the actual preview target identity')
    assert.ok(isObject(value.template), 'Require the actual preview policy template')
    for (const name of policyMaps) {
      assertStringMap(value.template[name], `Actual preview template.${name}`)
      for (const field of Object.keys(input.delta[name])) {
        assert.ok(Object.hasOwn(value.template[name], field), `Delta field ${name}.${field} must exist in this preview template`)
        assert.equal(value.body[name][field], input.delta[name][field])
      }
      for (const [field, item] of Object.entries(value.body[name])) {
        assert.ok(Object.hasOwn(value.template[name], field), `Do not rename or invent policy field ${name}.${field}`)
        assert.equal(item, Object.hasOwn(input.delta[name], field) ? input.delta[name][field] : value.template[name][field], `Preserve the actual template spelling/value for ${name}.${field}`)
      }
    }
  }
  // This actual receipt, not EXPECTED_BODY alone, binds the later apply receipt.
  return { call, input, result, value, decoded, binding: { previewCallId: call.data.callId, previewResultSeq: result.seq, identity, input, [bodyKey]: value[bodyKey] } }
}
const findApprovalGate = () => {
  const preview = findPreview()
  const asks = callsFor('ask_user_question')
  assert.ok(asks.length <= 1, 'Do not answer additional native questions automatically')
  if (!asks.length) return
  assert.ok(preview, 'The native question must follow a successful actual preview result')
  const ask = asks[0]
  assert.ok(preview.result.seq < ask.seq, 'The actual preview result must precede the native ask')
  const drafts = events.filter(event => event.type === 'assistant/message' && event.seq > preview.result.seq && event.seq < ask.seq && event.data.message.content.some(block => block.type === 'text' && block.text.trim()))
  assert.ok(drafts.length, 'Require an ordinary assistant draft after the preview result and before the native ask')
  return { preview, ask, drafts }
}
const findStructuredConfirmation = () => {
  const gate = findApprovalGate()
  if (!gate) return
  const result = resultFor(gate.ask)
  if (!result) return
  assert.ok(gate.ask.seq < result.seq, 'Require the native answer tool result after the question')
  assert.equal(result.data.message.isError, false)
  assert.equal(questionEvidence.length, 1)
  assert.ok(questionEvidence[0].answer, 'Require the actual owned-session callback answer')
  assert.deepEqual(jsonMessage(result.data.message), questionEvidence[0].answer, 'Require the actual structured native answer, not an ordinary chat confirmation')
  return { ...gate, result }
}
const checkObservedCalls = () => {
  // The delegating thread also permits read solely for this workspace's Skill
  // references; this is not permission to inspect evaluation assets or services.
  const skillRoot = '/work/harness/workspace/.agents/skills/'
  for (const call of callsFor('read')) {
    const input = argumentsFor(call)
    assert.ok(typeof input.file_path === 'string' && input.file_path.startsWith(skillRoot), 'Model read is allowed only inside the current workspace Skill tree')
    assert.ok(!input.file_path.includes('\u0000') && !input.file_path.includes('\\') && resolve(input.file_path).startsWith(skillRoot), 'Do not escape the Skill tree to evaluation or other assets')
  }
  const unexpected = events.filter(event => event.type === 'tool/call' && !['skill', 'read', compositionTool, 'ask_user_question'].includes(event.data.name))
  assert.deepEqual(unexpected.map(event => event.data.name), [], 'Only Skill loading/local Skill reference reads, the target composition, and ask_user_question are allowed')
  const calls = callsFor(compositionTool)
  assert.ok(calls.length <= 2, 'No duplicate preview/apply and no business retry')
  if (calls.length) assert.deepEqual(normalizedInput(argumentsFor(calls[0])), normalizedInput(expectedPreviewInput))
  if (callsFor('ask_user_question').length) findApprovalGate()
  if (calls.length === 2) {
    const confirmation = findStructuredConfirmation()
    assert.ok(confirmation, 'No apply before the actual structured native confirmation result')
    assert.ok(confirmation.result.seq < calls[1].seq, 'The apply must occur after the native answer result')
    assert.deepEqual(normalizedInput(argumentsFor(calls[1])), { ...confirmation.preview.input, stop: 'apply' }, 'Apply must preserve the actual preview target, ID, and changes; only stop changes')
  }
}
const assistantEvidence = () => events.filter(event => event.type === 'assistant/message').map(event => ({
  seq: event.seq,
  turn: event.data.turn,
  step: event.data.step,
  source: event.data.message.source ?? null,
  model: event.data.message.model ?? null,
  metadata: event.data.message.metadata ?? null,
  message: event.data.message,
}))
const observed = () => {
  const actualCalls = events.filter(event => event.type === 'tool/call').map(call => {
    let input
    let parseError
    try { input = JSON.parse(call.data.arguments) } catch (error) { parseError = String(error.message) }
    const result = resultFor(call)
    return { seq: call.seq, callId: call.data.callId, name: call.data.name, arguments: call.data.arguments, input, parseError, result: result ?? null }
  })
  const compositionCalls = actualCalls.filter(call => call.name === compositionTool)
  // Inspect only the direct receipt or its explicit result layer, never recursively.
  const runIds = []
  for (const call of compositionCalls) {
    if (!call.result) continue
    try {
      const raw = jsonMessage(call.result.data.message)
      if (isObject(raw) && typeof raw.run_id === 'string') runIds.push({ callId: call.callId, location: 'direct', run_id: raw.run_id })
      if (isObject(raw) && isObject(raw.result) && typeof raw.result.run_id === 'string') runIds.push({ callId: call.callId, location: 'result', run_id: raw.result.run_id })
    } catch { /* Raw result remains in actualCalls and JSONL, including unknown wrappers. */ }
  }
  return {
    mock: true,
    compositionTool,
    resultBodyKey: bodyKey,
    expectedPreviewInput,
    expectedBody,
    actualCompositionCallCount: compositionCalls.length,
    actualPreviewArguments: compositionCalls[0]?.input ?? null,
    actualApplyArguments: compositionCalls[1]?.input ?? null,
    actualCalls,
    compositionRunIds: runIds,
    nativeQuestionCount: questionCount,
    nativeQuestionsAndAnswers: questionEvidence,
    visibleAssistantMessages: assistantEvidence(),
    requestContexts: events.filter(event => event.type === 'request/context'),
    turnEnds: events.filter(event => event.type === 'turn/end'),
  }
}
try {
  log({ kind: 'test-client-configuration', gateway: base.href, compositionTool, expectedPreviewInput, expectedBody, resultBodyKey: bodyKey, timeoutMs, simulatedUserInput: true, retryBusinessCase: false })
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
        assert.equal(url.username + url.password + url.hash, '', 'Do not use inline WebSocket credentials')
        assert.equal(url.protocol, base.protocol === 'https:' ? 'wss:' : 'ws:')
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
    const record = { sessionId: ownSessionId, questions: request.questions, wait: request.wait ?? null, humanApproval: false }
    questionEvidence.push(record)
    log({ kind: 'test-client-native-question', ...record })
    try {
      assert.ok(!request.wait?.timed, 'This case requires the blocking native question configuration')
      assert.equal(++questionCount, 1, 'Unexpected additional question; never auto-approve it')
      assert.equal(request.questions.length, 1)
      const question = request.questions[0]
      const labels = question.options?.map(option => option.label) ?? []
      assert.ok(labels.includes('确认执行') && labels.includes('取消执行'))
      assert.ok(typeof question.id === 'string' && question.id)
      const gate = await waitFor(findApprovalGate, 'observe preview, ordinary assistant draft, and native ask in the owned Session')
      assert.equal(callsFor(compositionTool).length, 1, 'No apply may precede this native confirmation')
      const answer = { answers: [{ id: question.id, selected: [...reply.selected] }] }
      record.answer = answer
      record.previewBinding = gate.preview.binding
      log({ kind: 'test-client-simulated-native-answer', ...record })
      return answer
    } catch (error) {
      fail(error)
      throw error
    }
  })
  await new Promise((resolvePromise, rejectPromise) => {
    const check = () => { if (ctx.connection.generation.getSnapshot()) resolvePromise() }
    readyUnsubscribe = ctx.connection.generation.subscribe(check)
    connectionTimer = setTimeout(() => rejectPromise(new Error('Native connection not ready')), Math.min(timeoutMs, 20000))
    check()
  })
  clearTimeout(connectionTimer)
  readyUnsubscribe()
  const workspaceStream = ctx.remote.workspace.follow(signal)
  streams.add(workspaceStream)
  const baseline = await workspaceStream[Symbol.asyncIterator]().next()
  assert.ok(!baseline.done && baseline.value.type === 'baseline')
  const matches = baseline.value.value.items.filter(item => item.path === '/work/harness/workspace')
  assert.equal(matches.length, 1, 'Use only the already registered target workspace')
  const workspace = matches[0]
  workspaceStream.dispose()
  streams.delete(workspaceStream)
  const presets = unwrapRemote(await ctx.remote.agentPresets.list()).presets
  assert.ok(presets.some(preset => preset.id === 'security-operations-expert' && !preset.broken))
  const created = unwrapRemote(await ctx.remote.session.create({ workspaceId: workspace.workspaceId, agentPreset: 'security-operations-expert' }))
  ownSessionId = created.sessionId
  ownContext = ctx.extend({ [sessionSymbol]: ownSessionId })
  ownedContexts.set(ownSessionId, ownContext)
  log({ kind: 'test-client-session', sessionId: ownSessionId, workspaceId: workspace.workspaceId, workspacePath: workspace.path, preset: created.agentPreset, gateway: base.href, simulation: true })
  const stream = ctx.remote.session.follow({ address: { kind: 'session', sessionId: ownSessionId } }, signal)
  streams.add(stream)
  let snapshotSeen = false
  following = (async () => {
    try {
      for await (const frame of stream) {
        if (frame.type === 'snapshot') {
          log({ kind: 'test-client-opening-snapshot', sessionId: ownSessionId, frame })
          assert.equal(frame.header.id, ownSessionId)
          assert.equal(frame.header.agentPreset, 'security-operations-expert')
          assert.equal(frame.hasMore, false, 'A fresh Session must have a complete opening window')
          assert.ok(!frame.records.some(record => record.event.type === 'tool/call'), 'Do not reuse another conversation')
          snapshotSeen = true
          notify()
          continue
        }
        if (frame.type !== 'event') continue
        const event = frame.event
        events.push(event)
        // Preserve the actual call/result before any client-side assertion can fail.
        log({ kind: 'session-event', sessionId: ownSessionId, event })
        if (event.type === 'assistant/message') log({ kind: 'visible-assistant-message', sessionId: ownSessionId, ...assistantEvidence().at(-1) })
        try {
          if (event.type === 'tool/call') checkObservedCalls()
          if (event.type === 'tool/result') assert.equal(event.data.message.isError, false, 'Stop on a failed tool result; never retry the case')
        } catch (error) { fail(error) }
        // Continue collecting while cancellation/teardown completes after an error.
        notify()
      }
    } catch (error) {
      if (!signal.aborted) fail(error)
    }
  })()
  await waitFor(() => snapshotSeen, 'owned Session opening snapshot')
  for (const text of messages) {
    const cut = events.at(-1)?.seq ?? 0
    const requestId = randomUUID()
    log({ kind: 'test-client-input-request', sessionId: ownSessionId, requestId, text })
    unwrapRemote(await ctx.remote.session.prompt({ requestId, sessionId: ownSessionId, mode: 'queue', content: [{ type: 'text', text }], clientTimeZone: 'Asia/Shanghai' }, signal))
    log({ kind: 'test-client-input-accepted', sessionId: ownSessionId, requestId })
    const end = await waitFor(() => events.find(event => event.seq > cut && event.type === 'turn/end'), 'owned prompt completion')
    log({ kind: 'test-client-turn-finished', sessionId: ownSessionId, turn: end.data.turn, reason: end.data.reason })
    assert.equal(end.data.reason.kind, 'completed')
    completedPrompts++
  }
  checkObservedCalls()
  assert.equal(questionEvidence.length, 1, 'Require exactly one owned-session live native question')
  assert.equal(questionCount, 1)
  assert.equal(callsFor('ask_user_question').length, 1)
  const confirmation = findStructuredConfirmation()
  assert.ok(confirmation, 'Require the actual structured native confirmation result')
  const calls = callsFor(compositionTool)
  assert.equal(calls.length, 2, 'Require exactly one preview and one apply of the target composition')
  const applyResult = resultFor(calls[1])
  assert.ok(applyResult && calls[1].seq < applyResult.seq, 'Require the actual apply receipt after the apply call')
  const apply = compositionReceipt(applyResult.data.message)
  assert.equal(apply.value.mock, true)
  if (Object.hasOwn(apply.value, 'stop')) assert.equal(apply.value.stop, 'apply')
  assert.ok(typeof apply.value.message === 'string' && apply.value.message.includes('模拟下发成功'))
  if (bodyKey === 'request') {
    assert.equal(apply.value.submitted, true)
    assert.equal(apply.value.deviceEffectVerified, false)
  } else {
    assert.equal(apply.value.mockWritePerformed, true)
    assert.equal(apply.value.realWritePerformed, false)
  }
  assertBody(apply.value[bodyKey], 'Actual apply upstream body')
  assert.deepEqual(apply.value[bodyKey], confirmation.preview.value[bodyKey], 'Bind apply to this Session preview body/identity, preserving every Map string and fixture spelling')
  assert.deepEqual(apply.value[bodyKey], expectedBody)
  const finalEnd = events.filter(event => event.type === 'turn/end').at(-1)
  assert.equal(finalEnd?.data.reason.kind, 'completed')
  assert.ok(applyResult.seq < finalEnd.seq, 'The final completed turn must follow the actual apply receipt')
  verification = { previewBinding: confirmation.preview.binding, ordinaryAssistantDraftCount: confirmation.drafts.length, previewWrapper: confirmation.preview.decoded.wrapper, applyWrapper: apply.wrapper, finalReason: finalEnd.data.reason }
} catch (error) {
  failure = error
  log({ kind: 'test-client-failure-detected', sessionId: ownSessionId ?? null, message: String(error.message), stack: error.stack ?? null, retryBusinessCase: false })
  if (ownSessionId) {
    try { await ctx.remote.session.cancel({ sessionId: ownSessionId }) }
    catch (cancelError) { log({ kind: 'test-client-cancel-failure', sessionId: ownSessionId, message: String(cancelError.message) }) }
  }
} finally {
  clearTimeout(deadlineTimer)
  clearTimeout(connectionTimer)
  readyUnsubscribe?.()
  controller.abort(new Error('Native composition client teardown'))
  for (const stream of streams) stream.dispose()
  try { await following; await ctx.fiber.dispose() }
  catch (error) { failure ??= error; log({ kind: 'test-client-cleanup-failure', message: String(error.message) }) }
  failure ??= fatalError
  const summary = {
    status: failure ? 'failed' : 'passed',
    sessionId: ownSessionId ?? null,
    agentPreset: 'security-operations-expert',
    workspacePath: '/work/harness/workspace',
    simulatedUserInput: true,
    humanApproval: false,
    retryBusinessCase: false,
    doNotRerunAfterBusinessCall: true,
    completedPrompts,
    expectedPrompts: messages.length,
    ...observed(),
    verification: verification ?? null,
    message: failure ? String(failure.message) : null,
    evidencePath,
    summaryPath,
  }
  log({ kind: failure ? 'test-client-failure' : 'test-client-summary', ...summary })
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
  if (failure) { console.error(JSON.stringify(summary)); process.exitCode = 1 }
  else console.log(JSON.stringify(summary))
}
