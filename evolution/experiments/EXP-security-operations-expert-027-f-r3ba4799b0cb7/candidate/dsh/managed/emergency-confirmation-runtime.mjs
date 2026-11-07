import { createHash, createPrivateKey, randomUUID, sign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setEmergencyConfirmationTurn } from './emergency-action-guard.mjs'
import { canonicalToolName, canonicalToolEvents } from './mcp-tool-identity.mjs'
import {
  continueWithModel, controlledContextMessage, emergencyDraftMarkdown,
  emergencyDraftConflict, formatEmergencyStatus, queueControlledOutput, queuePostDeliveryInteraction,
} from './operation-result-delivery.mjs'
import {
  askNativeOperationQuestion, nativeOperationDecision, nativeOperationQuestion,
} from './native-operation-question.mjs'

export const name = 'emergency-confirmation-runtime'
export const inject = ['sessionQuery', 'userQuestions', 'mcpSessionManager']

const RESULT = 'mcp__emergency-action__get_emergency_action_result'
const GET = 'mcp__emergency-action__get_emergency_action'
const PREPARE = 'mcp__emergency-action__prepare_emergency_action'
const REVISE = 'mcp__emergency-action__revise_emergency_action'
const CANCEL = 'mcp__emergency-action__cancel_emergency_action'
// 研判并处置走本地 disposition-runtime；其草案同样要能进入原生确认面板。
const DISPOSITION_PREPARE = 'disposition_prepare'
const DISPOSITION_GET = 'disposition_get'
const STATE_DIR = '/var/lib/dsh/emergency-confirmation-state'
// 部署时可由平台注入环境变量，或由数据根 secrets 文件提供；两者都不在仓库内。
const CONFIRMATION_CONFIG_FILE = '/opt/harness-business-assets/.local/emergency-confirmation.json'
let cachedConfirmationConfig
export function confirmationConfig() {
  if (cachedConfirmationConfig) return cachedConfirmationConfig
  let file = {}
  try { file = JSON.parse(readFileSync(CONFIRMATION_CONFIG_FILE, 'utf8')) } catch { file = {} }
  cachedConfirmationConfig = {
    platformUrl: process.env.AI_PLATFORM_URL || file.platformUrl || '',
    issuer: process.env.PLATFORM_CONFIRMATION_ISSUER || file.issuer || '',
    actor: process.env.EMERGENCY_CONFIRMATION_ACTOR_ID || file.actor || '',
    tenant: process.env.AI_WORKBENCH_EMERGENCY_TENANT_ID || file.tenant || '',
    workspace: process.env.AI_WORKBENCH_EMERGENCY_WORKSPACE_ID || file.workspace || '',
    privateKeyB64: process.env.EMERGENCY_CONFIRMATION_PRIVATE_KEY_B64 || file.privateKeyB64 || '',
  }
  return cachedConfirmationConfig
}
const locks = new Map()
const NATIVE_QUESTION_ID = 'emergency-draft-decision'
const CONFIRM_LABEL = '确认执行'
const CANCEL_LABEL = '取消执行'

const textOf = message => message?.content?.filter(item => item.type === 'text').map(item => item.text).join('') ?? ''
const isConfirmation = message => message?.source?.kind === 'user' && textOf(message).trim() === '确认执行'

function toolValue(event) {
  const message = event?.data?.message
  if (message?.source?.kind !== 'tool' || message.isError) return null
  const block = message.content?.find(item => item.type === 'tool-result' && item.toolCallId === message.source.callId)
  if (block?.isError) return null
  const content = block ? block.content : message.content
  try {
    const raw = JSON.parse(content?.find(item => item.type === 'text')?.text)
    return raw?.code === '200' && raw.data ? raw.data : raw
  } catch { return null }
}

function resultProjection(result) {
  if (!result || result.isError) return null
  if (result.value?.code === '200' && result.value.data && typeof result.value.data === 'object') {
    return result.value.data
  }
  const blocks = result.content?.flatMap(block => block.type === 'tool-result' ? block.content ?? [] : [block]) ?? []
  const raw = blocks.find(block => block.type === 'text')?.text
  try {
    const value = JSON.parse(raw)
    return value?.code === '200' && value.data && typeof value.data === 'object' ? value.data : null
  } catch { return null }
}

function emergencyQuestionSpec() {
  return {
    domain: 'emergency',
    id: NATIVE_QUESTION_ID,
    header: '应急指令确认',
    question: '是否执行上方应急指令草案？',
    confirmLabel: CONFIRM_LABEL,
    confirmDescription: '确认当前冻结草案，并进入 Platform/SOC 审批或执行流程。',
    cancelLabel: CANCEL_LABEL,
    cancelDescription: '不确认当前草案，本次不提交、不审批、不执行。',
  }
}

/** disposition 系工具把平台操作视图放在 data（prepare）或 operation（get）里。 */
function draftView(value) {
  if (value?.data?.operation_id) return value.data
  if (value?.operation?.data?.operation_id) return value.operation.data
  if (value?.operation?.operation_id) return value.operation
  return value
}

/** Extract only a real, bound and unexpired Platform emergency draft. */
export function draftFromExecution(exec, result, now = Date.now()) {
  const names = [PREPARE, REVISE, GET, RESULT, DISPOSITION_PREPARE, DISPOSITION_GET]
  if (!names.includes(exec?.name) || result?.isError) return null
  const value = draftView(resultProjection(result))
  let args = exec.arguments
  if (typeof args === 'string') {
    try { args = JSON.parse(args) } catch { args = undefined }
  }
  const prepareLike = exec.name === PREPARE || exec.name === DISPOSITION_PREPARE
  const boundOperation = prepareLike ? Boolean(value?.operation_id) : args?.operationId === value?.operation_id
  if (!value || !boundOperation || emergencyDraftConflict(value) || value.phase !== 'READY' ||
      value.execution_status !== 'NOT_SUBMITTED' ||
      !/^op_[a-f0-9]{32}$/.test(value.operation_id ?? '') ||
      !Number.isInteger(value.version) || value.version < 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(value.snapshot_digest ?? '') ||
      !value.snapshot || typeof value.snapshot !== 'object' || Array.isArray(value.snapshot) ||
      !Number.isFinite(Date.parse(value.expires_at)) || Date.parse(value.expires_at) <= now) return null
  return {
    operationId: value.operation_id,
    version: value.version,
    snapshotDigest: value.snapshot_digest,
    expiresAt: value.expires_at,
    resultMarkdown: emergencyDraftMarkdown(value, true),
  }
}

export function nativeEmergencyQuestion(_draft) {
  return nativeOperationQuestion(emergencyQuestionSpec())
}

export function nativeEmergencyDecision(answer) {
  return nativeOperationDecision(answer, emergencyQuestionSpec())
}

export function latestDraft(events, confirmingMessageId) {
  const calls = new Map()
  const views = []
  for (const event of events) {
    if (event.type === 'tool/call') calls.set(event.data?.callId, event.data)
    if (event.type !== 'tool/result') continue
    const call = calls.get(event.data?.message?.source?.callId)
    if (!call || ![PREPARE, REVISE, CANCEL, GET, RESULT, DISPOSITION_PREPARE, DISPOSITION_GET].includes(call.name)) continue
    let args
    try { args = JSON.parse(call.arguments) } catch { continue }
    const view = draftView(toolValue(event))
    const bound = call.name === PREPARE ? Boolean(args?.body?.request_id) && Boolean(view?.operation_id)
      : call.name === DISPOSITION_PREPARE ? Boolean(view?.operation_id)
      : args?.operationId === view?.operation_id
    if (view && bound) {
      views.push({ ...view, seq: event.seq })
    }
  }
  const current = views.at(-1)
  const laterUsers = current && events.filter(event => event.type === 'user/message' &&
    event.data?.source?.kind === 'user' && event.seq > current.seq)
  const currentVisible = laterUsers?.some(event => event.data.id === confirmingMessageId)
  const confirmationsOnly = laterUsers?.every(event => isConfirmation(event.data)) &&
    (!currentVisible || laterUsers.at(-1).data.id === confirmingMessageId)
  if (!current || emergencyDraftConflict(current) || !confirmationsOnly ||
      events.some(event => event.type === 'tool/call' && event.seq > current.seq &&
        [PREPARE, REVISE, CANCEL].includes(event.data?.name)) ||
      current.phase !== 'READY' ||
      current.execution_status !== 'NOT_SUBMITTED' ||
      !/^op_[a-f0-9]{32}$/.test(current.operation_id ?? '') ||
      !Number.isInteger(current.version) || current.version < 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(current.snapshot_digest ?? '') ||
      !current.snapshot || !Number.isFinite(Date.parse(current.expires_at)) ||
      Date.parse(current.expires_at) <= Date.now()) return null
  if (views.some(item => item.operation_id === current.operation_id && item.version > current.version)) return null
  return { operationId: current.operation_id, version: current.version,
    snapshotDigest: current.snapshot_digest, expiresAt: current.expires_at }
}

function keyFor(sessionId, draft) {
  return createHash('sha256').update(`${sessionId}\n${draft.operationId}\n${draft.version}\n${draft.snapshotDigest}`).digest('hex')
}

export function confirmationPayload(sessionId, draft, now = Date.now()) {
  const id = keyFor(sessionId, draft)
  const cfg = confirmationConfig()
  return {
    issuer: cfg.issuer,
    audience: 'operation-confirmation-v1', event_type: 'UserPromptSubmit', decision: 'CONFIRM',
    tenant_id: cfg.tenant,
    workspace_id: cfg.workspace,
    user_id: cfg.actor,
    session_id: sessionId, event_id: `dsh-${id}`,
    operation_id: draft.operationId, version: draft.version,
    snapshot_digest: draft.snapshotDigest, purpose: 'emergency.execute',
    issued_at: Math.floor(now / 1000), expires_at: Math.floor(now / 1000) + 120,
  }
}

function proofFor(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const pem = Buffer.from(confirmationConfig().privateKeyB64, 'base64')
  const privateKey = createPrivateKey(pem)
  return `${encoded}.${sign('sha256', Buffer.from(encoded, 'ascii'), privateKey).toString('base64url')}`
}

export function confirmationRequest(sessionId, draft, now = Date.now()) {
  const id = keyFor(sessionId, draft)
  return {
    request_id: `dsh-emergency-${id.slice(0, 32)}`,
    expected_version: draft.version,
    snapshot_digest: draft.snapshotDigest,
    proof: proofFor(confirmationPayload(sessionId, draft, now)),
  }
}

async function saveState(path, state) {
  await mkdir(STATE_DIR, { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
  await chmod(temporary, 0o600)
  await rename(temporary, path)
}

function validateResponse(value, draft) {
  if (value?.operation_id !== draft.operationId || value.version !== draft.version ||
      value.snapshot_digest !== draft.snapshotDigest ||
      !['QUEUED', 'SUBMISSION_UNKNOWN', 'ACCEPTED', 'WAIT', 'TERMINAL'].includes(value.phase)) {
    throw new Error('Platform 确认回执与当前草案不一致')
  }
  return value
}

// 只保留已核对的稳定业务码与HTTP状态；原始msg/data、签名、请求正文和HTML不进入诊断。
function confirmationResponseError(status, code) {
  const reasons = {
    SOC_PREPARATION_CHANGED: 'SOC重新核对时发现候选或参数与冻结草案不一致。',
    VERSION_CONFLICT: '后台报告操作版本或快照冲突。',
    CONFIRMATION_EXPIRED: '后台报告确认请求或草案已过期。',
    IDEMPOTENCY_CONFLICT: '后台报告确认请求标识冲突。',
    PLATFORM_DEPENDENCY_UNAVAILABLE: '后台内部依赖当前不可用。',
    PLATFORM_DEPENDENCY_REJECTED: '后台内部依赖拒绝请求。',
  }
  const safeCode = typeof code === 'string' && (Object.hasOwn(reasons, code) || /^[1-5][0-9]{2}$/.test(code)) ? code : null
  const reason = reasons[safeCode] ?? '确认接口未返回符合合同的成功回执。'
  const error = new Error(`Platform 确认接口返回 HTTP ${status}${safeCode ? `（${safeCode}）` : ''}`)
  error.confirmationHttpStatus = status
  error.confirmationBusinessCode = safeCode
  error.confirmationReason = reason
  return error
}

async function failedConfirmationResponse(response) {
  let code
  let reader
  try {
    reader = response.body?.getReader()
    if (reader && /\bapplication\/json\b/i.test(response.headers.get('content-type') ?? '')) {
      const chunks = []
      let bytes = 0
      while (true) {
        const part = await reader.read()
        if (part.done) {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          code = value?.code
          break
        }
        bytes += part.value.byteLength
        if (bytes > 8192) break
        chunks.push(Buffer.from(part.value))
      }
    }
  } catch { /* 无法安全解析的非2xx正文只保留HTTP状态；最多保留8KiB用于解析。 */ }
  finally {
    try { await reader?.cancel() } catch { /* 不因清理流覆盖原响应状态。 */ }
    try { reader?.releaseLock() } catch { /* 释放失败不回显原始异常。 */ }
  }
  return confirmationResponseError(response.status, code)
}

async function confirm(sessionId, draft) {
  const path = join(STATE_DIR, `${keyFor(sessionId, draft)}.json`)
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { /* First confirmation. */ }
  const requestId = `dsh-emergency-${keyFor(sessionId, draft).slice(0, 32)}`
  let requestDispatched = false
  let preflightReason = '确认配置读取失败，请核对本实例部署配置。'
  let state
  try {
    const cfg = confirmationConfig()
    const required = [
      ['platformUrl', '平台地址'], ['issuer', '签发方'], ['privateKeyB64', '签名私钥'],
      ['actor', '操作主体'], ['tenant', '租户'], ['workspace', '工作区'],
    ]
    const missing = required.filter(([field]) => !cfg[field]).map(([, label]) => label)
    if (missing.length) {
      preflightReason = `确认运行时配置不完整（缺少：${missing.join('、')}）。`
      throw new Error(preflightReason)
    }
    preflightReason = '确认签名构造失败，请核对本实例部署签名私钥及其格式。'
    const request = confirmationRequest(sessionId, draft)
    preflightReason = '确认接口地址或请求构造失败，请核对本实例部署配置。'
    const url = `${cfg.platformUrl.replace(/\/$/, '')}/api/v1/emergency-actions/${draft.operationId}/confirmations`
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000),
    }
    // 从调用 fetch 起保守视为可能已发送；异常不能解释为后端未受理。
    requestDispatched = true
    const response = await fetch(url, options)
    if (!response.ok) throw await failedConfirmationResponse(response)
    let envelope
    try { envelope = await response.json() }
    catch { throw confirmationResponseError(response.status, null) }
    if (envelope?.code !== '200') throw confirmationResponseError(response.status, envelope?.code)
    const view = validateResponse(envelope.data, draft)
    state = { operationId: draft.operationId, requestId, requestDispatched: true, phase: view.phase,
      approvalStatus: view.approval_status, executionStatus: view.execution_status,
      message: formatEmergencyStatus(null, view) }
  } catch (error) {
    if (!requestDispatched) {
      // 本地预检未发送，不落持久确认缓存；补齐配置后允许同一草案重新核对。
      cachedConfirmationConfig = undefined
      return { operationId: draft.operationId, requestId, requestDispatched: false,
        message: `确认请求未发送\n原因：${preflightReason}\n操作号：${draft.operationId}\n下一步：补齐本实例确认配置后重新核对；本次未发送确认请求，操作最终状态请按操作号查询。` }
    }
    // A timed-out response can arrive after Platform accepted the request.
    const responseDiagnostic = Number.isInteger(error.confirmationHttpStatus)
      ? { confirmationHttpStatus: error.confirmationHttpStatus,
        confirmationBusinessCode: error.confirmationBusinessCode } : {}
    const diagnosticText = error.confirmationReason
      ? `${error.confirmationReason}HTTP ${error.confirmationHttpStatus}${error.confirmationBusinessCode ? `；业务码：${error.confirmationBusinessCode}` : ''}。` : ''
    state = { operationId: draft.operationId, requestId, requestDispatched: true, technicalError: error.message,
      ...responseDiagnostic,
      message: `执行结果：待核实\n原因：${diagnosticText}确认请求已发起，但未取得 Platform/SOC 权威执行结果。\n操作号：${draft.operationId}\n下一步：请稍后只查询该操作，避免重复提交。` }
  }
  try {
    await saveState(path, state)
  } catch {
    // 已得权威回执仍须交付；本地保存失败不能丢掉结果或宣称请求未发送。
    return { ...state,
      persistenceWarning: '本地确认状态保存失败；不代表后端提交失败。请按原操作号查询，避免重复确认。' }
  }
  return state
}

export const formatConfirmationStatus = formatEmergencyStatus

export async function latestConfirmationStatus(draft, state, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const deadline = Date.now() + (options.waitMs ?? 30000)
  let latest = null
  const url = confirmationConfig().platformUrl
  if (!url) return null
  do {
    try {
      const response = await fetchImpl(`${url.replace(/\/$/, '')}/api/v1/emergency-actions/${draft.operationId}/result`, {
        signal: AbortSignal.timeout(3000),
      })
      if (!response.ok) break
      const envelope = await response.json()
      if (envelope?.code !== '200') break
      latest = validateResponse(envelope.data, draft)
      if (latest.phase === 'TERMINAL' || (!state.phase && latest.phase === 'READY')) break
    } catch { /* Keep the last valid observation if a read times out. */ }
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    await sleep(Math.min(800, remaining))
  } while (Date.now() < deadline)
  return latest
}

function context(message, operationId = null) {
  return controlledContextMessage(name, message)
}

function refinementContext(text) {
  return {
    id: randomUUID(), role: 'user', source: { kind: name, form: 'answer' },
    content: [{
      type: 'text',
      text: `用户在原生应急指令决策面板中补充了以下内容：\n\n${text}\n\n这段内容不是“确认执行”授权。请按普通用户补充内容处理；不得确认或提交当前草案。`,
    }],
  }
}

function cancellationMarkdown(draft, skipped = false) {
  return [
    skipped ? '已跳过应急指令草案确认。' : '已取消执行当前应急指令草案。',
    '当前草案未确认、未提交、未审批、未执行。',
    `操作号：${draft.operationId}`,
  ].join('\n')
}

async function confirmDraftForAgent(agent, draft) {
  const key = `${agent.id}\n${keyFor(agent.id, draft)}`
  if (!locks.has(key)) locks.set(key, confirm(agent.id, draft).finally(() => locks.delete(key)))
  const state = await locks.get(key)
  const view = state.requestDispatched === false ? null : await latestConfirmationStatus(draft, state)
  const message = formatEmergencyStatus(state, view)
  return { state, view, message: state.persistenceWarning ? `${message}\n\n${state.persistenceWarning}` : message }
}

export async function handleNativeEmergencyDecision(exec, draft, answer,
  confirmDraft = confirmDraftForAgent) {
  const decision = nativeEmergencyDecision(answer)
  if (decision.kind === 'confirm') {
    const result = await confirmDraft(exec.agent, draft)
    return {
      kind: 'controlled', markdown: result.message,
      context: context(result.message, draft.operationId), decision,
    }
  }
  if (decision.kind === 'custom') {
    continueWithModel(exec.agent.id)
    return { kind: 'model', context: refinementContext(decision.text), decision }
  }
  const markdown = cancellationMarkdown(draft, decision.kind === 'skip')
  return { kind: 'controlled', markdown, context: context(markdown, draft.operationId), decision }
}

export function apply(ctx) {
  const canonical = name => canonicalToolName(ctx.mcpSessionManager, name, {
    'emergency-action': [
      'prepare_emergency_action', 'revise_emergency_action', 'get_emergency_action',
      'list_emergency_actions', 'get_emergency_action_result', 'cancel_emergency_action',
    ],
  })
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const downstream = await next()
    if (downstream.kind !== 'accept' || (exec.agent?.session?.header?.delegationDepth ?? 0) !== 0) {
      return downstream
    }
    const draft = draftFromExecution({ ...exec, name: canonical(exec.name) }, result)
    if (!draft) return downstream
    // 立刻走受控交付，让确认面板在草案生成后立即出现，而不是等下一次自然交付。
    queueControlledOutput(exec.agent.id, draft.resultMarkdown)
    queuePostDeliveryInteraction(exec.agent.id, async signal => {
      const asked = await askNativeOperationQuestion(
        ctx, { agent: exec.agent, signal }, emergencyQuestionSpec())
      if (!asked.available) return
      const outcome = await handleNativeEmergencyDecision(
        { agent: exec.agent, signal }, draft, asked.answer)
      if (outcome.kind === 'model') {
        exec.agent.steer(outcome.context)
        return undefined
      }
      return outcome.markdown
    }, { domain: 'emergency', operationId: draft.operationId,
      version: draft.version, snapshotDigest: draft.snapshotDigest })
    return downstream
  })

  ctx.on('agent/pre-step', async ({ agent, messages, step }, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    if ((agent.session?.header?.delegationDepth ?? 0) !== 0) return decision
    if (step !== 1) return decision
    const users = messages.filter(message => message.source?.kind === 'user')
    if (!users.length) return decision
    setEmergencyConfirmationTurn(agent, false)
    if (users.length !== 1 || !isConfirmation(users[0])) return decision
    const snapshot = await ctx.sessionQuery.readSession(agent.id)
    const draft = latestDraft(canonicalToolEvents(snapshot.events, canonical), users[0].id)
    if (!draft) return decision
    setEmergencyConfirmationTurn(agent, true, draft.operationId)
    const result = await confirmDraftForAgent(agent, draft)
    queueControlledOutput(agent.id, result.message)
    return { ...decision, messages: [...decision.messages,
      context(result.message, draft.operationId)] }
  })
}
