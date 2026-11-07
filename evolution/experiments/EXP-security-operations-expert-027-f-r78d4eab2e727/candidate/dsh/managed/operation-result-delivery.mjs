import { randomUUID } from 'node:crypto'
import { currentPolicyStatus, isPolicyStatusQuery } from './policy-selection-runtime.mjs'
import { canonicalToolName, canonicalToolEvents } from './mcp-tool-identity.mjs'
import { POLICY_SOURCE_ID, policyResourceIdentity, policyResourceKind, singlePolicyResourceResult } from './policy-resource-identity.mjs'
import { isDepartmentDraftBound, isDepartmentDraftResultBound, resultEnvelope } from './policy-department-guard.mjs'
import {
  isDepartmentTaskId, isDepartmentTaskResultBound, isDepartmentTaskTool,
  isDepartmentTaskResource, TASK_OPERATIONS,
} from './policy-department-task-guard.mjs'

export const name = 'operation-result-delivery'
export const inject = ['llm', 'mcpSessionManager']

const DELIVERY_PROVIDER = 'security-operation-delivery'
export const CONTROLLED_OUTPUT_MARKER = '[security-operation-controlled-output/v1]'
const POLICY_PREFIX = 'mcp__policy-configuration__'
const EMERGENCY_PREFIX = 'mcp__emergency-action__'
const DEPARTMENT_PREFIX = `mcp__${POLICY_SOURCE_ID}__`
const DEPARTMENT_PREPARE = `${DEPARTMENT_PREFIX}prepare_policy_department_draft`
const DEPARTMENT_GET = `${DEPARTMENT_PREFIX}get_policy_department_draft`
const DEPARTMENT_UNVERIFIED = '部门草稿回执未核实，请勿重复创建'
const DEPARTMENT_UNKNOWN = '部门草稿结果未知，请勿重复创建；已知操作号仅可查询原操作'
const POLICY_PREFLIGHT_TOOLS = new Set([
  `${POLICY_PREFIX}resolve_policy_endpoints`,
  `${POLICY_PREFIX}choose_ambiguous_policy_endpoints`,
])
const POLICY_PREPARE = `${POLICY_PREFIX}prepare_policy_configuration`
const POLICY_STATUS = `${POLICY_PREFIX}get_policy_configuration_status`
const POLICY_RESULT = `${POLICY_PREFIX}get_policy_configuration_result`
const POLICY_SEQUENCE_RETRY = '策略准备前置校验：必须先调用 resolve_policy_endpoints'
const DELIVERY_SOURCES = Object.freeze({
  // 同源 single/dept 显式合并；不能以重复对象键覆盖 single 身份集合。
  [POLICY_SOURCE_ID]: [
    'resolve_policy_endpoints', 'choose_ambiguous_policy_endpoints',
    'prepare_policy_configuration', 'get_policy_configuration_status',
    'select_policy_configuration_candidate', 'get_policy_configuration_result',
    'list_policy_departments', 'preview_policy_department_targets',
    'resolve_policy_department_destination', 'preview_policy_department_plan',
    'get_policy_department_plan', 'prepare_policy_department_draft', 'get_policy_department_draft',
    ...TASK_OPERATIONS,
  ],
  'emergency-action': [
    'prepare_emergency_action', 'revise_emergency_action', 'get_emergency_action',
    'list_emergency_actions', 'get_emergency_action_result', 'cancel_emergency_action',
  ],
})
const CONFIRMATION_SOURCES = new Set([
  'policy-confirmation-runtime',
  'policy-selection-runtime',
  'emergency-confirmation-runtime',
])
const queuedOutputs = new Map()
const modelContinuations = new Set()
const postDeliveryInteractions = new Map()
const INTERACTION_METADATA = Symbol('operation-delivery-interaction')
const originalRoutes = new Map()

/** 首轮固定交付前尚无原生请求头；只读复用同一模块捕获的实际路由。 */
export function getOriginalRoute(sessionId) {
  const route = originalRoutes.get(sessionId)
  return route ? { provider: route.provider, model: route.model } : undefined
}

/** 本步路由前只读观察已有输送队列；不建旁路操作账本，不改变确认。 */
export function peekOperationDelivery(agentId) {
  const markdown = queuedOutputs.get(agentId)
  const metadata = postDeliveryInteractions.get(agentId)?.[INTERACTION_METADATA]
  return Object.freeze({
    markdown: typeof markdown === 'string' ? markdown : undefined,
    interactionQueued: postDeliveryInteractions.has(agentId),
    interactionToken: metadata?.token,
    interactionBinding: metadata?.binding,
    modelContinuation: modelContinuations.has(agentId),
  })
}

/** 只撤销同一次入队且同操作/版本/摘要的应急交互；不运行回调、不取消后端草案。 */
export function discardEmergencyInteraction(agentId, snapshot, expected) {
  const metadata = postDeliveryInteractions.get(agentId)?.[INTERACTION_METADATA]
  const binding = metadata?.binding
  if (!metadata || metadata.token !== snapshot?.interactionToken || binding?.domain !== 'emergency'
    || binding.operationId !== expected?.operationId || binding.version !== expected?.version
    || binding.snapshotDigest !== expected?.snapshotDigest) return false
  postDeliveryInteractions.delete(agentId)
  if (typeof snapshot.markdown === 'string' && queuedOutputs.get(agentId) === snapshot.markdown) {
    queuedOutputs.delete(agentId)
  }
  return true
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function compactText(value, maximum = 180) {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim()
  if (!text) return null
  return text.length <= maximum ? text : `${text.slice(0, maximum - 1)}…`
}

function line(label, value) {
  const text = compactText(value, 256)
  return text ? `${label}：${text}` : null
}

function operationLine(operationId) {
  return /^op_[a-f0-9]{32}$/.test(operationId ?? '') ? `操作号：${operationId}` : null
}

function joinLines(...values) {
  return values.flat().filter(Boolean).join('\n')
}

function toolText(message) {
  if (!Array.isArray(message?.content)) return null
  const block = message.content.find(item => item?.type === 'tool-result')
  const content = Array.isArray(block?.content) ? block.content : message.content
  const text = content.find(item => item?.type === 'text')?.text
  return typeof text === 'string' ? text : null
}

function toolResult(events, event) {
  const message = event?.data?.message
  const callId = message?.source?.callId ?? message?.toolCallId
  const call = events.findLast(item => item.type === 'tool/call' && item.data?.callId === callId)
  if (!call || typeof call.data?.name !== 'string') return null
  let args = {}
  try { args = JSON.parse(call.data.arguments ?? '{}') } catch { /* Invalid args are represented as no trusted operation id. */ }
  const rawText = toolText(message)
  let value = null
  try { value = JSON.parse(rawText) } catch { /* Transport and tool errors are often plain text. */ }
  if (call.data.name === 'read_mcp_resource') {
    const single = singlePolicyResourceResult(args, value)
    if (single && resultEnvelope(event, callId, args.uri)
        && events.filter(item => item.type === 'tool/call' && item.data?.callId === callId).length === 1) {
      return { ...single, isError: false, rawText: JSON.stringify(single.value) }
    }
  }
  return {
    name: call.data.name,
    args: record(args) ?? {},
    isError: message?.isError === true || message?.content?.some(item => item?.isError === true),
    rawText,
    value: record(value),
  }
}

function envelope(result) {
  if (!result?.value) return { data: null, code: null, message: null }
  if (Object.hasOwn(result.value, 'code')) {
    return {
      data: record(result.value.data),
      code: String(result.value.code),
      message: compactText(result.value.msg ?? result.value.message),
    }
  }
  return { data: result.value, code: '200', message: null }
}

function operationId(result, data) {
  return data?.operation_id ?? result.args?.operationId ?? null
}

function codeFailure(domain, code, operationIdValue) {
  const reasons = {
    '404': '未找到对应操作或当前账号无权读取。',
    '409': '操作状态已变化，当前请求无法继续。',
    '422': '请求参数或当前操作状态不符合要求。',
    '503': `${domain}服务暂时不可用。`,
  }
  return joinLines(
    '处理结果：未完成',
    `原因：${reasons[code] ?? `${domain}服务返回未识别错误。`}`,
    operationLine(operationIdValue),
  )
}

function toolFailure(domain, operationIdValue, rawText) {
  const timedOut = /\b(?:request\s+)?timed?\s*out\b|\btimeout\b/i.test(rawText ?? '')
  return joinLines(
    '处理结果：未完成',
    timedOut
      ? `原因：${domain}服务调用超时，未在等待时间内取得平台回执。`
      : `原因：未取得${domain}服务的有效回执。`,
    operationLine(operationIdValue),
    operationIdValue
      ? '下一步：请稍后只查询该操作，避免重复提交。'
      : '下一步：请稍后重试；当前没有可用于查账的操作号。',
  )
}

function authorityUnknown(operationIdValue) {
  return joinLines(
    '处理结果：无法确认',
    '原因：未获得完整的平台或安全运营系统权威事实。',
    operationLine(operationIdValue),
    operationIdValue ? '下一步：请稍后只查询该操作。' : '下一步：请核对服务状态后重试。',
  )
}

const departmentOperationId = value => typeof value === 'string'
  && /^pdop-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const positiveInteger = value => Number.isSafeInteger(value) && value > 0
const departmentReference = value => typeof value === 'string' && value.trim().length > 0
  && value.length <= 128 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
const exactKeys = (value, keys) => !!record(value) && Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key))

function conservativeDepartmentEvidence(data) {
  return !!record(data) && data.execution_allowed === false && data.task_precheck_status === 'NOT_RUN'
    && data.coverage_assessment === 'NOT_ASSESSED' && data.scope_evidence === 'UNVERIFIED'
    && data.direction_evidence === 'UNVERIFIED' && data.current_policy_evidence === 'UNVERIFIED'
    && (!Object.hasOwn(data, 'execution') || data.execution === false)
    && (!Object.hasOwn(data, 'confirmation_required') || data.confirmation_required === false)
}

function departmentDraftReady(data) {
  const binding = record(data.binding)
  const commands = value => Array.isArray(value) && value.length > 0
    && value.every(item => !!record(item) && Object.keys(item).length > 0)
  return positiveInteger(data.task_id) && conservativeDepartmentEvidence(binding)
    && binding.task_id === data.task_id && binding.task_status === 'DRAFT' && binding.device_count === 1
    && positiveInteger(binding.change_count) && binding.change_count === data.included_asset_ids.length
    && Array.isArray(binding.rendered_changes) && binding.rendered_changes.length === binding.change_count
    && binding.rendered_changes.every(row => !!record(row)
      && commands(row.renderedCommands) && commands(row.renderedRollbackCommands))
    && typeof data.observed_at === 'string' && Number.isFinite(Date.parse(data.observed_at))
}

/** 只消费既有工具事件，不新增 HTTP、持久化或确认调用。 */
function departmentDelivery(result, events, event) {
  const message = event?.data?.message
  let content = message?.content
  const callId = message?.source?.callId
  if (result.isError || result.value?.isError === true || event?.isError === true || event?.data?.isError === true || !result.value) return DEPARTMENT_UNKNOWN
  if (message?.source?.kind !== 'tool' || typeof callId !== 'string' || !callId
      || !Array.isArray(content) || content.length !== 1) return DEPARTMENT_UNVERIFIED
  if (content[0]?.type === 'tool-result') {
    const wrapped = content[0]
    if (wrapped.isError === true) return DEPARTMENT_UNKNOWN
    if (wrapped.toolCallId !== callId || !Array.isArray(wrapped.content)) return DEPARTMENT_UNVERIFIED
    content = wrapped.content
  }
  if (content.length !== 1 || content[0]?.type !== 'text') return DEPARTMENT_UNVERIFIED
  if (content[0].isError === true) return DEPARTMENT_UNKNOWN
  const index = events.lastIndexOf(event)
  const calls = events.slice(0, index).filter(item => item.type === 'tool/call' && item.data?.callId === callId)
  if (calls.length !== 1 || !Object.hasOwn(result.value, 'code')
      || !['200', 200].includes(result.value.code)) return DEPARTMENT_UNVERIFIED
  const data = record(result.value.data)
  if (!data || data.schema_version !== 'policy-department-draft/v1' || !departmentOperationId(data.operation_id)
      || !conservativeDepartmentEvidence(data) || data.coverage !== 'NOT_ASSESSED'
      || data.task_status_fresh !== false || !Array.isArray(data.included_asset_ids)
      || data.included_asset_ids.length === 0 || !data.included_asset_ids.every(positiveInteger)
      || new Set(data.included_asset_ids).size !== data.included_asset_ids.length
      || !Array.isArray(data.excluded) || !(data.task_id === null || positiveInteger(data.task_id))
      || typeof data.result_markdown !== 'string' || !data.result_markdown.trim()) return DEPARTMENT_UNVERIFIED
  if (result.name === DEPARTMENT_GET) {
    if (!exactKeys(result.args, ['operationId']) || result.args.operationId !== data.operation_id) return DEPARTMENT_UNVERIFIED
  } else {
    const body = result.args.body
    if (!exactKeys(result.args, ['body']) || !exactKeys(body, ['request_id', 'plan_id', 'expected_plan_digest'])
        || !departmentReference(body.request_id) || !departmentReference(body.plan_id)
        || typeof body.expected_plan_digest !== 'string' || !/^sha256:[0-9a-fA-F]{64}$/.test(body.expected_plan_digest)) return DEPARTMENT_UNVERIFIED
  }
  // 授权/计划/子集证明只复用 Guard 的同会话纯投影，不由 markdown 或 data 自报建立。
  try {
    if (!isDepartmentDraftBound(events, data.operation_id)) return DEPARTMENT_UNVERIFIED
    // 历史操作号绑定不证明本次 GET 的子集/任务；必须核对当前原始结果事件（含资源封包）。
    if (!isDepartmentDraftResultBound(events, event)) return DEPARTMENT_UNVERIFIED
    // 本次 prepare 回执必须新建立绑定；旧绑定不能遮蔽后来不合法的重复 prepare。
    if (result.name === DEPARTMENT_PREPARE && isDepartmentDraftBound(events.slice(0, index), data.operation_id)) return DEPARTMENT_UNVERIFIED
  } catch { return DEPARTMENT_UNVERIFIED }
  if (['UNKNOWN', 'PREPARING', 'ACCEPTED'].includes(data.phase)) return DEPARTMENT_UNKNOWN
  if (data.phase !== 'DRAFT_READY' || !departmentDraftReady(data)) return DEPARTMENT_UNVERIFIED
  // 后台完整正文含真实配置/回滚预览；绑定的是已保存证据，绝不进入 single 确认链。
  return data.result_markdown
}

function departmentDraftResource(result) {
  const draftPath = uri => policyResourceKind(uri) === 'drafts'
  return result.name === 'read_mcp_resource' && (draftPath(result.args.uri)
    || (Array.isArray(result.value?.contents) && result.value.contents.some(item => draftPath(item?.uri))))
}

/** 本地直连 manager 返回 {contents:[{uri,mimeType,text}]}；不接受分组代理或解码路径。 */
function departmentResourceDelivery(result, events, event) {
  const resource = policyResourceIdentity(result.args)
  if (resource?.kind !== 'drafts') return DEPARTMENT_UNKNOWN
  const id = resource.id
  const contents = result.value?.contents
  if (result.isError || result.value?.isError === true || !Array.isArray(contents) || contents.length !== 1 || !record(contents[0])
      || contents[0].isError === true || contents[0].uri !== result.args.uri || typeof contents[0].text !== 'string') return DEPARTMENT_UNKNOWN
  let value
  try { value = JSON.parse(contents[0].text) } catch { return DEPARTMENT_UNKNOWN }
  if (!record(value) || value.data?.operation_id !== id) return DEPARTMENT_UNKNOWN
  const markdown = departmentDelivery({ ...result, name: DEPARTMENT_GET, args: { operationId: id }, value }, events, event)
  return markdown === DEPARTMENT_UNVERIFIED ? DEPARTMENT_UNKNOWN : markdown
}

const DEPARTMENT_TASK_UNKNOWN = '本地部门策略任务结果待核实；尚无可交付的可信保存回执。'
const NATIVE_DEPARTMENT_TASK = 'create_department_policy_task'
const isTaskResult = result => !!result && (result.name === NATIVE_DEPARTMENT_TASK
  || isDepartmentTaskTool(result.name) || isDepartmentTaskResource(result))

/** Task 是本地持久化意图，不复用 SOC DRAFT、single 摘要或任何确认链。 */
function departmentTaskDelivery(result, events, event) {
  try {
    // 必须先证明数组内当次事件；旧成功、markdown 或自报字段不能建立信任。
    if (!isDepartmentTaskResultBound(events, event)) return DEPARTMENT_TASK_UNKNOWN
    let value = result.value
    if (isDepartmentTaskResource(result)) {
      const contents = value?.contents
      if (!Array.isArray(contents) || contents.length !== 1
          || contents[0]?.uri !== result.args.uri || typeof contents[0]?.text !== 'string') return DEPARTMENT_TASK_UNKNOWN
      value = JSON.parse(contents[0].text)
    }
    const data = record(value?.data)
    if (result.isError || !['200', 200].includes(value?.code)
        || data?.schema_version !== 'policy-department-task/v1' || !isDepartmentTaskId(data.task_id)
        || data.storage_phase !== 'ACCEPTED' || data.persisted !== true
        || data.execution_allowed !== false || data.soc_task_id !== null
        || data.task_precheck_status !== 'NOT_RUN'
        || !['READY_FOR_SOC', 'PARTIALLY_READY', 'EXTERNAL_BLOCKED'].includes(data.task_status)
        || (Object.hasOwn(data, 'execution') && data.execution !== false)
        || (Object.hasOwn(data, 'confirmation_required') && data.confirmation_required !== false)
        || typeof data.result_markdown !== 'string' || !/[\u3400-\u9fff]/u.test(data.result_markdown)) return DEPARTMENT_TASK_UNKNOWN
    // 校验后的服务端正文原样进入原模型上下文，不切 provider，不补 SOC 命令或确认提示。
    return data.result_markdown
  } catch { return DEPARTMENT_TASK_UNKNOWN }
}

/** 只改模型可见的 MCP Task 回执；原生高层工具由 Runtime 验证，不套三引用合同。
 * 不改原始事件、不造 assistant 消息。只覆盖本次 admitted messages，不保证改写全部历史 ModelContext。
 * 在这份投影内历史成功不证明当前结果，坏正文仅替换为待核提示；不是完整请求的强制过滤证明。
 */
export function projectDepartmentTaskMessages(messages, events) {
  const calls = new Map()
  const tasks = new Map()
  for (const event of events) {
    if (event?.type === 'tool/call') {
      let args
      try { args = JSON.parse(event.data?.arguments ?? '{}') } catch { args = {} }
      const call = { name: event.data?.name, args }
      calls.set(event.data?.callId, call)
      if (call.name !== NATIVE_DEPARTMENT_TASK && isTaskResult(call)) tasks.set(event.data?.callId, undefined)
    }
    if (event?.type !== 'tool/result') continue
    const id = event.data?.message?.source?.callId
    const call = calls.get(id)
    if (call && call.name !== NATIVE_DEPARTMENT_TASK && isTaskResult(call)) tasks.set(id, event)
  }
  if (!tasks.size) return messages
  const last = events.findLast(event => ['tool/result', 'assistant/message', 'user/message'].includes(event.type))
  return messages.map(message => {
    if (message?.source?.kind !== 'tool') return message
    const sourceId = message.source.callId
    const rewrite = (blocks, callId) => blocks.map(block => {
      const id = block.type === 'tool-result' ? block.toolCallId : callId
      if (block.type === 'tool-result') return { ...block, content: rewrite(block.content ?? [], id) }
      if (block.type !== 'text') return block
      if (!tasks.has(id) && !tasks.has(sourceId)) return block
      const event = tasks.get(id) ?? tasks.get(sourceId)
      // 匹配消息必须仍是原始回执正文；不能将其他插件改写后的文字标成可信。
      const current = !!event && event === last
      const rawMatches = !!event && block.text === toolText(event.data?.message)
      const result = event ? toolResult(events, event) : null
      const markdown = current && rawMatches && result ? departmentTaskDelivery(result, events, event) : DEPARTMENT_TASK_UNKNOWN
      const trusted = current && rawMatches && markdown !== DEPARTMENT_TASK_UNKNOWN
      return { ...block, text: JSON.stringify({
        schema_version: 'policy-department-task-delivery/v1', trusted_current_result: trusted,
        result_markdown: markdown,
        instruction: trusted
          ? '仅依据这份当次可信本地策略任务正文用中文说明真实任务ID、原意图与逐项状态。不是SOC草稿，未审批、未执行；不补命令，不进入旧确认链。'
          : '仅说明任务结果待核实；不得引用历史成功正文宣称当前已保存，不得重建、换号或切换Draft绕锁。',
      }) }
    })
    return { ...message, content: rewrite(message.content ?? [], sourceId) }
  })
}

function sameEndpointProof(left, right) {
  const fields = [
    'source_query', 'destination_query', 'candidate_set_digest',
    'selected_source_candidate_id', 'selected_destination_candidate_id',
  ]
  return fields.every(field => typeof left?.[field] === 'string'
    && left[field] === right?.[field])
}

function samePreparedIntent(left, right) {
  return left?.operation === right?.operation
    && (left?.action ?? 'ALLOW') === (right?.action ?? 'ALLOW')
    && left?.source?.selector_type === right?.source?.selector_type
    && left?.source?.value === right?.source?.value
    && left?.destination?.selector_type === right?.destination?.selector_type
    && left?.destination?.value === right?.destination?.value
    && left?.protocol === right?.protocol
    && left?.destination_port === right?.destination_port
    && (left?.device_query ?? null) === (right?.device_query ?? null)
}

function currentDeviceUnderstanding(markdown, events, operationIdValue, verifiedStatus) {
  if (verifiedStatus === null) return markdown.replace(/^- \*\*指定执行设备\*\*：.*$/m, '- **指定执行设备**：当前生效设备约束需按最新状态核验')
  // 替代后的设备约束来自受信原生选择及同操作的当前冻结状态，而非最初 prepare_body。
  const statusEvent = events.findLast(event => event.type === 'tool/result'
    && toolResult(events, event)?.name === POLICY_STATUS
    && envelope(toolResult(events, event)).data?.operation_id === operationIdValue)
  const status = statusEvent ? toolResult(events, statusEvent) : null
  const cached = envelope(status)
  const data = verifiedStatus ?? cached.data
  if (verifiedStatus === undefined && (cached.code !== '200' || status?.args?.operationId !== operationIdValue)) return markdown
  const frozen = data?.candidate
  let hasReplacement = false
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event.type !== 'user/message' || event.data?.source?.kind !== 'policy-selection-runtime') continue
    const text = event.data.content?.find(block => block.type === 'text')?.text ?? ''
    if (!text.startsWith('[policy-device-selection/v1]\n')) continue
    let selected
    try { selected = JSON.parse(text.split('\n')[1]) } catch { continue }
    if (selected.operation_id !== operationIdValue) continue
    hasReplacement = true
    if (!Number.isInteger(selected.business_revision) || !Number.isInteger(frozen?.business_revision) ||
        selected.business_revision > frozen?.business_revision ||
        selected.intent_digest !== frozen?.intent_digest || typeof selected.label !== 'string' || !selected.label.trim()) continue
    const device = selected.label.replace(/[，,]\s*资产\s*\d+/g, '').trim()
    const line = `- **指定执行设备**：${device}（已明确选择替代设备）`
    return /^- \*\*指定执行设备\*\*：.*$/m.test(markdown)
      ? markdown.replace(/^- \*\*指定执行设备\*\*：.*$/m, line)
      : `${markdown}\n${line}`
  }
  return hasReplacement ? markdown.replace(/^- \*\*指定执行设备\*\*：.*$/m, '- **指定执行设备**：当前生效设备约束需按最新状态核验') : markdown
}

/** Return only the resolver markdown that is transitively bound to this operation. */
export function policyUnderstandingMarkdown(events, operationIdValue, verifiedStatus) {
  if (typeof operationIdValue !== 'string' || !operationIdValue) return undefined
  let prepare
  let prepareIndex = -1
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.type !== 'tool/result') continue
    const result = toolResult(events, events[index])
    if (result?.name !== POLICY_PREPARE) continue
    const { data, code } = envelope(result)
    if (code === '200' && data?.operation_id === operationIdValue) {
      prepare = result
      prepareIndex = index
      break
    }
  }
  const prepareBody = record(prepare?.args?.body)
  const prepareProof = record(prepareBody?.endpoint_resolution)
  const prepareIntent = record(prepareBody?.intent)
  if (!prepareBody || !prepareProof || !prepareIntent
      || typeof prepareBody.request_id !== 'string') return undefined

  for (let index = prepareIndex - 1; index >= 0; index--) {
    const event = events[index]
    // 原生选择通过可信 HTTP 接续；本会话受信来源保存原始权威解析投影。
    if (event?.type === 'user/message' && event.data?.source?.kind === 'policy-selection-runtime') {
      const text = event.data.content?.find(block => block.type === 'text')?.text ?? ''
      if (text.startsWith('[policy-endpoint-resolution/v1]\n')) {
        let data
        try { data = JSON.parse(text.split('\n')[1]) } catch { continue }
        if (data?.resolution_status === 'RESOLVED' && data.request_id === prepareBody.request_id &&
            data.prepare_body?.request_id === prepareBody.request_id &&
            data.candidate_set_digest === prepareProof.candidate_set_digest &&
            sameEndpointProof(data.prepare_body?.endpoint_resolution, prepareProof) &&
            samePreparedIntent(data.prepare_body?.intent, prepareIntent) &&
            typeof data.result_markdown === 'string' && data.result_markdown.trim().startsWith('### 需求理解')) {
          return currentDeviceUnderstanding(data.result_markdown.trim(), events, operationIdValue, verifiedStatus)
        }
      }
    }
    if (event?.type !== 'tool/result') continue
    const result = toolResult(events, events[index])
    if (!POLICY_PREFLIGHT_TOOLS.has(result?.name)) continue
    const { data, code } = envelope(result)
    const resolvedBody = record(data?.prepare_body)
    const resolvedProof = record(resolvedBody?.endpoint_resolution)
    const resolvedIntent = record(resolvedBody?.intent)
    const markdown = data?.result_markdown
    if (code === '200' && data?.resolution_status === 'RESOLVED'
        && data.request_id === prepareBody.request_id
        && resolvedBody?.request_id === prepareBody.request_id
        && data.candidate_set_digest === prepareProof.candidate_set_digest
        && sameEndpointProof(resolvedProof, prepareProof)
        && samePreparedIntent(resolvedIntent, prepareIntent)
        && typeof markdown === 'string' && markdown.trim().startsWith('### 需求理解')) {
      return currentDeviceUnderstanding(markdown.trim(), events, operationIdValue, verifiedStatus)
    }
  }
  return undefined
}

function containsPrivatePolicyDetail(markdown) {
  return /配置预览|renderedCommands|bodyJson|\/api\/firewall\/|```\s*json/i.test(markdown)
}

function containsMachinePolicyStatus(markdown) {
  return /ADD permit|EXECUTION_IN_PROGRESS|\bDRAFT\b|\bSUCCESS\b|\bFAILED\b|\bCANCELLED\b/i.test(markdown)
}

function safePolicyDraft(data, operationIdValue) {
  return joinLines(
    '策略草稿已生成',
    Number.isInteger(data?.task_id) ? `任务编号：${data.task_id}` : null,
    '当前状态：草稿，尚未提交、审批或执行',
    operationLine(operationIdValue),
    '内部配置内容已从用户视图隐藏。',
  )
}

function safePolicyResult(data, operationIdValue) {
  const labels = {
    SUCCESS: '成功',
    SUCCEEDED: '成功',
    FAILED: '失败',
    CANCELLED: '已取消',
    CANCELED: '已取消',
    EXECUTION_IN_PROGRESS: '执行中',
    RUNNING: '执行中',
  }
  const machineStatus = [
    data?.result_code,
    data?.task_status,
    data?.operation_status,
    data?.stage_status,
  ].filter(value => typeof value === 'string').map(value => value.toUpperCase())
    .find(value => Object.hasOwn(labels, value))
  const status = labels[machineStatus] ?? '待核实'
  return joinLines(
    `执行结果：${status}`,
    Number.isInteger(data?.task_id) ? `任务编号：${data.task_id}` : null,
    operationLine(operationIdValue),
  )
}

function publicPolicyMarkdown(markdown, data, operationIdValue, draft = false) {
  if (containsPrivatePolicyDetail(markdown) || containsMachinePolicyStatus(markdown)) {
    return draft
      ? safePolicyDraft(data, operationIdValue)
      : safePolicyResult(data, operationIdValue)
  }
  return markdown.trim()
}

function policyDelivery(result, events, verifiedStatus) {
  const { data, code } = envelope(result)
  const op = operationId(result, data)
  // Endpoint resolution is read-only and may legitimately require a corrected
  // first call or a user choice. Keep such feedback in the model loop instead
  // of converting it into a terminal fixed-operation message.
  if (POLICY_PREFLIGHT_TOOLS.has(result.name)
      && (result.isError || !result.value || code !== '200')) return undefined
  if (result.name === POLICY_PREPARE && result.isError
      && result.rawText?.includes(POLICY_SEQUENCE_RETRY)) return undefined
  if (result.isError || !result.value) return toolFailure('策略', op, result.rawText)
  if (code !== '200' || !data) return codeFailure('策略', code, op)

  // result 是统一的用户结果合同：正文与当前操作必须同时有效，不按业务结果码枚举截断新结论。
  if (result.name === POLICY_RESULT) {
    if (!/^op_[a-f0-9]{32}$/.test(op ?? '') || result.args?.operationId !== data.operation_id ||
        typeof data.result_code !== 'string' || !data.result_code || typeof data.result_markdown !== 'string' ||
        !/[\u3400-\u9fff]/.test(data.result_markdown)) return authorityUnknown(result.args?.operationId)
    const draft = data.result_code === 'DRAFT_READY' && data.task_status === 'DRAFT'
    const markdown = publicPolicyMarkdown(data.result_markdown, data, op, draft)
    const understanding = (draft || data.result_code.startsWith('POLICY_')) ? policyUnderstandingMarkdown(events, op, verifiedStatus) : undefined
    return understanding && !markdown.startsWith('### 需求理解')
      ? `${understanding}\n\n---\n\n${markdown}` : markdown
  }
  // 状态回执不是用户结果正文；普通待确认态须保留真实 RESULT 工具触发原生确认的链路。
  if (result.name === POLICY_STATUS) return result.args?.operationId === data.operation_id
    ? undefined : authorityUnknown(result.args?.operationId)

  const coverageCodes = ['POLICY_ALREADY_COVERED', 'POLICY_PARTIALLY_COVERED', 'POLICY_BLOCKED', 'POLICY_COVERAGE_UNKNOWN']
  if (result.name === POLICY_PREPARE
      && (coverageCodes.includes(data.result_code ?? data.outcome_code) || data.stage_code === 'terminal')) return undefined

  const authoritativeMarkdown = data.result_markdown ?? data.error?.result_markdown
  if (typeof authoritativeMarkdown === 'string' && authoritativeMarkdown.trim()) {
    const isTerminal = ['failed', 'cancelled'].includes(data.operation_status)
      || ['failed', 'cancelled'].includes(data.stage_status)
      || data.stage_code === 'terminal'
    if (isTerminal) return publicPolicyMarkdown(authoritativeMarkdown, data, op)
  }

  if (['failed', 'cancelled'].includes(data.operation_status)
      || ['failed', 'cancelled'].includes(data.stage_status)
      || data.stage_code === 'terminal') {
    return joinLines(
      `处理结果：${data.operation_status === 'cancelled' ? '已取消' : '未完成'}`,
      line('原因', data.error?.summary ?? data.error?.message ?? data.outcome_message),
      operationLine(op),
      data.error?.manual_review_required === true ? '下一步：需要人工复核。' : null,
    )
  }

  if (data.operation_status === 'WAITING_EXTERNAL' || data.stage_code === 'waiting_external') {
    return joinLines('当前进度：等待外部系统', operationLine(op), '下一步：请稍后只查询该操作，避免重复提交。')
  }

  const intermediate = ['created', 'running'].includes(data.operation_status)
    || data.selection?.status === 'PENDING'
    || data.stage_code === 'awaiting_candidate_selection'
    || data.result_code === 'DRAFT_READY'
  if (intermediate) return undefined

  return undefined
}

export function formatEmergencyStatus(state, view) {
  if (!view || (!state?.phase && view.phase === 'READY')) {
    return state?.message ?? joinLines('执行结果：待核实', '原因：未取得平台或安全运营系统权威执行结果。')
  }
  const socStatus = view.soc_observation?.evidence?.status
  let result
  if (socStatus === 'SUCCESS') result = '执行结果：成功'
  else if (socStatus === 'FAILED' || socStatus === 'BLOCKED') result = '执行结果：失败'
  else if (socStatus === 'REJECTED') result = '执行结果：审批已拒绝，未执行'
  else if (socStatus === 'RUNNING') result = '当前进度：执行中'
  else if (socStatus === 'AWAITING_APPROVAL') result = '当前进度：待审批'
  else if (view.execution_status === 'SUCCEEDED') result = '执行结果：成功'
  else if (view.execution_status === 'FAILED') result = '执行结果：失败'
  else if (view.approval_status === 'REJECTED') result = '执行结果：审批已拒绝，未执行'
  else if (view.execution_status === 'RUNNING') result = '当前进度：执行中'
  else if (view.approval_status === 'PENDING') result = '当前进度：待审批'
  else if (view.phase === 'SUBMISSION_UNKNOWN') result = '当前进度：提交结果待核实'
  else result = '当前进度：处理中'
  const ids = [operationLine(view.operation_id)]
  if (compactText(view.soc_execution_id, 128)) {
    ids.push(`安全运营系统执行号：${compactText(view.soc_execution_id, 128)}`)
  }
  return joinLines(result, ids)
}

function snapshotValue(snapshot, keys) {
  for (const key of keys) {
    const value = compactText(snapshot?.[key], 160)
    if (value) return value
  }
  return null
}

function emergencySnapshot(data) {
  const envelope = record(data?.snapshot) ?? {}
  return record(envelope.content) ?? envelope
}

/** Fail closed when Platform freezes the opposite of the user's block/unblock intent. */
export function emergencyDraftConflict(data) {
  const snapshot = emergencySnapshot(data)
  const intent = snapshotValue(snapshot, ['intent'])?.toLowerCase() ?? ''
  const actionKey = snapshotValue(snapshot, ['action_key', 'action'])?.toLowerCase() ?? ''
  if (!intent || !actionKey) return null
  const wantsUnblock = /解除.{0,80}封禁|取消.{0,80}封禁|解封|unblock|remove.{0,40}block/i.test(intent)
  const wantsBlock = !wantsUnblock && /封禁|阻断|拉黑|\bblock\b/i.test(intent)
  const isUnblock = actionKey.includes('unblock')
  const isBlock = actionKey.includes('block') && !isUnblock
  if (wantsUnblock && !isUnblock) return `用户意图是解除封禁，但冻结动作是 ${actionKey}`
  if (wantsBlock && !isBlock) return `用户意图是封禁，但冻结动作是 ${actionKey}`
  const wantsFirewall = /防火墙|网络设备|跨厂商|opnsense|(?<![\w-])(?:un)?block-ip(?![\w-])/i.test(intent)
  const wantsHost = /主机(?:侧|设备|上)|\bedr\b|\bwazuh\b/i.test(intent)
  if (wantsFirewall && /^(?:host-)(?:un)?block-ip(?:-port)?$/.test(actionKey)) {
    return `用户指定防火墙动作，但冻结动作是 ${actionKey}`
  }
  if (wantsHost && /^(?:un)?block-ip$/.test(actionKey)) {
    return `用户指定主机动作，但冻结动作是 ${actionKey}`
  }
  const params = record(snapshot.params) ?? {}
  if (snapshotValue(params, ['port']) && /^host-(?:un)?block-ip$/.test(actionKey)) {
    return `用户指定了端口，但冻结动作 ${actionKey} 不包含端口`
  }
  const ruleName = snapshotValue(params, ['rule_name'])
  if (actionKey === 'block-ip' && !ruleName) return '防火墙封禁草案缺少规则名称'
  if (actionKey === 'unblock-ip' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ruleName ?? '')) {
    return '防火墙解封草案缺少原规则 UUID'
  }
  return null
}

export function emergencyDraftMarkdown(data, nativeQuestion = false) {
  const op = data?.operation_id
  const snapshot = emergencySnapshot(data)
  const actionKey = snapshotValue(snapshot, ['action_key', 'action'])
  const actionNames = {
    'block-ip': '在防火墙上封禁源 IP',
    'unblock-ip': '在防火墙上解除源 IP 封禁',
    'host-block-ip': '封禁源 IP',
    'host-block-ip-port': '封禁源 IP 的指定端口',
    'host-unblock-ip': '解除源 IP 封禁',
    'host-unblock-ip-port': '解除源 IP 的指定端口封禁',
  }
  const action = snapshotValue(snapshot, ['action_name']) ?? actionNames[actionKey] ?? actionKey
  const targetLabel = snapshotValue(snapshot, ['target_name', 'target_label', 'asset_name'])
  const targetHint = snapshotValue(snapshot, ['target_hint', 'target'])
  const target = targetLabel && targetHint && targetLabel !== targetHint
    ? `${targetLabel}（${targetHint}）`
    : targetLabel ?? targetHint
  const params = record(snapshot.params) ?? {}
  const parameters = [
    snapshotValue(params, ['src_ip']) ? `源 IP \`${snapshotValue(params, ['src_ip'])}\`` : null,
    snapshotValue(params, ['port']) ? `端口 \`${snapshotValue(params, ['port'])}\`` : null,
    snapshotValue(params, ['rule_name']) ? `规则标识 \`${snapshotValue(params, ['rule_name'])}\`` : null,
    snapshotValue(params, ['user']) ? `用户 \`${snapshotValue(params, ['user'])}\`` : null,
  ].filter(Boolean).join('；')
  const execution = [
    line('- **用户意图**', snapshot.intent),
    line('- **动作**', action),
    line('- **目标**', target),
    line('- **参数**', parameters),
  ].filter(Boolean).join('\n')
  const impact = [
    line('- **影响**', snapshot.impact),
    line('- **恢复方式**', snapshot.recovery),
  ].filter(Boolean).join('\n')
  const tracking = operationLine(op)?.replace(/^操作号：/, '- **操作号**：`').concat('`')
  return [
    '### 应急指令草案',
    '**状态**：已生成，尚未执行',
    execution ? `#### 执行内容\n${execution}` : null,
    impact ? `#### 影响与恢复\n${impact}` : null,
    tracking ? `#### 操作信息\n${tracking}` : null,
    nativeQuestion
      ? '> 请在下方选择“确认执行”或“取消执行”，也可以输入更多内容。'
      : '> 请在下方选择操作；若选项不可用，仍可在当前会话单独回复“确认执行”。',
  ].filter(Boolean).join('\n\n')
}


const DISPOSITION_PREPARE = 'disposition_prepare'
const THREAT_DELEGATE_TOOL = 'delegate_threat_analysis'
const INCIDENT_ID_PATTERN = /INC-\d{8}-\d{6}/
const SUMMARY_KEY_LIMIT = 8000

function incidentIdIn(value) {
  return INCIDENT_ID_PATTERN.exec(String(value ?? ''))?.[0] ?? null
}

/** 工具结果正文：合并全部文本块（研判摘要可能由多个文本块拼成）。 */
function joinedToolText(message) {
  if (!Array.isArray(message?.content)) return null
  const block = message.content.find(item => item?.type === 'tool-result')
  const content = Array.isArray(block?.content) ? block.content : message.content
  const text = content.filter(item => item?.type === 'text').map(item => item?.text ?? '').join('')
  return text.trim() ? text : null
}

function noEnglishEnums(text) {
  return typeof text === 'string' && text.trim() ? text.trim() : null
}

/** 处置准备返回的处置项（兼容 data.items 与平铺在顶层的 items）。 */
function emergencyItems(result) {
  const { data } = envelope(result)
  const source = Array.isArray(data?.items) ? data.items
    : (Array.isArray(result?.value?.items) ? result.value.items : [])
  return source.map(record).filter(Boolean)
}

function emergencyItemTarget(item) {
  const raw = item?.target
  if (typeof raw === 'string') return raw.trim() || null
  const target = record(raw) ?? {}
  const hint = record(target.hint) ?? target
  const device = record(target.device) ?? {}
  const agent = record(target.agent) ?? {}
  const labels = [
    compactText(device.device_name ?? device.name ?? device.label, 96),
    compactText(agent.agent_name ?? agent.name ?? agent.agent_id, 96),
    compactText(hint.host_name, 96),
    compactText(hint.ip, 64),
    compactText(hint.asset_id, 64),
    typeof hint.raw === 'string' ? compactText(hint.raw, 96) : null,
    typeof item?.recommended_target === 'string' ? compactText(item.recommended_target, 96) : null,
  ].filter(Boolean)
  return [...new Set(labels)].join(' / ') || null
}

function emergencyItemDisplay(item) {
  const display = item?.display
  if (typeof display === 'string') return display.trim() || null
  const object = record(display)
  if (!object) return null
  if (typeof object.text === 'string' && object.text.trim()) return object.text.trim()
  return joinLines(
    object.conclusion ? `结论：${object.conclusion}` : null,
    object.reason ? `原因：${object.reason}` : null,
    Array.isArray(object.next_steps) && object.next_steps.length
      ? ['后续建议：', ...object.next_steps.map(step => `- ${step}`)] : null,
  ) || null
}

function emergencyRecommendationLines(items) {
  const lines = []
  for (const item of items) {
    const action = noEnglishEnums(String(item?.action ?? '').trim())
    const target = noEnglishEnums(emergencyItemTarget(item))
    const display = noEnglishEnums(emergencyItemDisplay(item))
    if (item?.executable === true) {
      const parts = [action, target ? `目标：${target}` : null].filter(Boolean).join('；')
      if (parts) lines.push(`- 可执行：${parts}`)
      continue
    }
    const label = item?.manual === true ? '暂不能自动处置（需人工核验）' : '暂不能自动处置'
    const parts = [action, display].filter(Boolean).join('；')
    if (parts) lines.push(`- ${label}：${parts}`)
  }
  return lines
}

function emergencySummaryExcerpt(text) {
  if (typeof text !== 'string') return null
  const body = text.trim()
  if (!body) return null
  if (body.length <= SUMMARY_KEY_LIMIT) return body
  const download = body.indexOf('保存与下载')
  if (download > 0) {
    const head = body.slice(0, Math.max(0, SUMMARY_KEY_LIMIT - 600)).trim()
    const tail = body.slice(download).trim()
    return `${head}\n\n…\n\n${tail}`.trim()
  }
  return `${body.slice(0, SUMMARY_KEY_LIMIT)}…`
}

function prepareIncidentId(result) {
  const { data } = envelope(result)
  const snapshot = emergencySnapshot(data)
  const candidates = [
    result?.args?.incident_id,
    record(result?.args?.body)?.incident_id,
    result?.value?.incident_id,
    data?.incident_id,
    snapshotValue(snapshot, ['incident_id', 'incidentId']),
    record(result?.args?.body)?.intent,
    result?.args?.intent,
    snapshotValue(snapshot, ['intent']),
  ]
  for (const candidate of candidates) {
    const id = incidentIdIn(candidate)
    if (id) return id
  }
  return null
}

export function emergencyUnderstandingMarkdown(events, operationIdValue) {
  if (typeof operationIdValue !== 'string' || !operationIdValue) return undefined
  const list = Array.isArray(events) ? events : []
  let prepare
  let prepareIndex = -1
  for (let index = list.length - 1; index >= 0; index--) {
    const event = list[index]
    if (event?.type !== 'tool/result') continue
    const result = toolResult(list, event)
    if (result?.name !== DISPOSITION_PREPARE) continue
    const { data } = envelope(result)
    const bound = data?.operation_id ?? result.value?.operation_id ?? null
    if (bound === operationIdValue) {
      prepare = result
      prepareIndex = index
      break
    }
  }
  if (!prepare) return undefined

  const recommendations = emergencyRecommendationLines(emergencyItems(prepare))
  let summary = null
  const incident = prepareIncidentId(prepare)
  if (incident) {
    for (let index = prepareIndex - 1; index >= 0; index--) {
      const event = list[index]
      if (event?.type !== 'tool/result') continue
      const result = toolResult(list, event)
      if (result?.name !== THREAT_DELEGATE_TOOL) continue
      const text = joinedToolText(event.data?.message)
      const normalized = typeof text === 'string' ? text.replace(/\\-/g, '-') : text
      if (normalized && normalized.includes(incident)) summary = emergencySummaryExcerpt(normalized)
      break
    }
  }
  const sections = []
  if (summary) sections.push(`### 研判摘要\n\n${summary}`)
  if (recommendations.length) sections.push(`### 处置建议\n\n${recommendations.join('\n')}`)
  return sections.length ? sections.join('\n\n') : undefined
}

function emergencyDelivery(result) {
  const { data, code } = envelope(result)
  const op = operationId(result, data)
  if (result.isError || !result.value) return toolFailure('应急', op, result.rawText)
  if (code !== '200' || !data) return codeFailure('应急', code, op)

  const next = String(data.required_next_action ?? '').toUpperCase()
  if (next === 'CLARIFY' || next === 'SELECT_TARGET') {
    return joinLines(
      '处理结果：需要补充信息',
      line('需要补充', data.clarification_question ?? data.message ?? data.reason),
      operationLine(op),
    )
  }
  if (next === 'UNAVAILABLE' || data.phase === 'UNAVAILABLE') {
    return joinLines(
      '处理结果：未完成',
      line('原因', data.message ?? data.reason ?? data.error?.summary)
        ?? '原因：当前环境不具备该应急动作所需能力。',
      operationLine(op),
    )
  }

  if (data.phase === 'READY' && data.execution_status === 'NOT_SUBMITTED') {
    const conflict = emergencyDraftConflict(data)
    if (conflict) return joinLines(
      '处理结果：未完成',
      `原因：${conflict}，已拒绝进入确认。`,
      operationLine(op),
      '下一步：请重新生成与用户意图一致的应急指令草案。',
    )
    return emergencyDraftMarkdown(data)
  }
  if (['QUEUED', 'SUBMISSION_UNKNOWN', 'ACCEPTED', 'WAIT', 'TERMINAL'].includes(data.phase)) {
    return formatEmergencyStatus(null, data)
  }
  if (['CANCELLED', 'CANCELED'].includes(data.phase)
      || ['cancelled', 'canceled'].includes(data.operation_status)) {
    return joinLines('处理结果：已取消', operationLine(op))
  }
  if (['FAILED', 'REJECTED', 'BLOCKED'].includes(data.phase)
      || ['failed', 'rejected'].includes(data.operation_status)) {
    return joinLines(
      '处理结果：未完成',
      line('原因', data.message ?? data.reason ?? data.error?.summary),
      operationLine(op),
    )
  }
  if (['CREATED', 'RUNNING', 'RESOLVING'].includes(data.phase)) return undefined
  if (result.name === `${EMERGENCY_PREFIX}get_emergency_action`
      || result.name === `${EMERGENCY_PREFIX}get_emergency_action_result`) return authorityUnknown(op)
  return undefined
}

function controlledContext(event) {
  const message = event?.data
  if (event?.type !== 'user/message' || !CONFIRMATION_SOURCES.has(message?.source?.kind)) return undefined
  const text = message.content?.filter(item => item.type === 'text').map(item => item.text).join('') ?? ''
  if (!text.startsWith(CONTROLLED_OUTPUT_MARKER)) return undefined
  const markdown = text.slice(CONTROLLED_OUTPUT_MARKER.length).replace(/^\s+/, '')
  return markdown || undefined
}

export function controlledOutput(markdown) {
  return `${CONTROLLED_OUTPUT_MARKER}\n${markdown}`
}

export function queueControlledOutput(agentId, markdown) {
  if (typeof agentId !== 'string' || !agentId || typeof markdown !== 'string' || !markdown.trim()) {
    throw new Error('invalid controlled operation output')
  }
  queuedOutputs.set(agentId, markdown)
}

/** Let one operation-result turn continue through the configured model route. */
export function continueWithModel(agentId) {
  if (typeof agentId !== 'string' || !agentId) throw new Error('invalid model continuation agent')
  modelContinuations.add(agentId)
}

/**
 * Run a trusted UI interaction after the fixed draft has reached the middle
 * transcript, while the same assistant stream is still live. This is the
 * native DSH boundary where the composer can be taken over without moving the
 * draft itself into the question panel.
 */
export function queuePostDeliveryInteraction(agentId, interaction, emergencyBinding) {
  if (typeof agentId !== 'string' || !agentId || typeof interaction !== 'function') {
    throw new Error('invalid post-delivery interaction')
  }
  if (emergencyBinding !== undefined && (emergencyBinding?.domain !== 'emergency'
    || !/^op_[a-f0-9]{32}$/.test(emergencyBinding.operationId ?? '')
    || !Number.isInteger(emergencyBinding.version) || emergencyBinding.version < 1
    || !/^sha256:[a-f0-9]{64}$/.test(emergencyBinding.snapshotDigest ?? ''))) {
    throw new Error('invalid emergency interaction binding')
  }
  // 每次入队有独立不透明标记；保留原队列的函数形态，读取快照不会暴露可执行回调。
  const queued = signal => interaction(signal)
  Object.defineProperty(queued, INTERACTION_METADATA, { value: Object.freeze({
    token: Symbol('queued-interaction'),
    binding: emergencyBinding === undefined ? undefined : Object.freeze({
      domain: 'emergency', operationId: emergencyBinding.operationId,
      version: emergencyBinding.version, snapshotDigest: emergencyBinding.snapshotDigest,
    }),
  }) })
  postDeliveryInteractions.set(agentId, queued)
}

export async function runPostDeliveryInteraction(agentId, signal) {
  const interaction = postDeliveryInteractions.get(agentId)
  postDeliveryInteractions.delete(agentId)
  if (interaction) return interaction(signal)
  return undefined
}

export function deliveryMarkdown(events, turn) {
  const last = events.findLast(event => ['tool/result', 'assistant/message', 'user/message'].includes(event.type))
  const context = controlledContext(last)
  if (context) return context
  if (last?.type !== 'tool/result' || last.data?.turn !== turn) return undefined
  const result = toolResult(events, last)
  if (!result) return undefined
  if (isDepartmentTaskTool(result.name) || isDepartmentTaskResource(result)) return departmentTaskDelivery(result, events, last)
  if ([DEPARTMENT_PREPARE, DEPARTMENT_GET].includes(result.name)) return departmentDelivery(result, events, last)
  if (departmentDraftResource(result)) return departmentResourceDelivery(result, events, last)
  if (result.name === 'read_mcp_resource' && policyResourceKind(result.args.uri) === 'single-invalid') {
    return authorityUnknown(policyResourceIdentity(result.args)?.id)
  }
  if (result.name === `${POLICY_PREFIX}get_policy_configuration_result`) {
    const batch = new Map()
    for (const event of events) {
      if (event.type !== 'tool/result' || event.data?.turn !== turn || event.data?.step !== last.data?.step) continue
      const item = toolResult(events, event)
      if (item?.name !== `${POLICY_PREFIX}get_policy_configuration_result`) continue
      const { data } = envelope(item)
      const op = operationId(item, data)
      if (!/^op_[a-f0-9]{32}$/.test(op ?? '') || item.args?.operationId !== op) continue
      const markdown = policyDelivery(item, events)
      if (typeof markdown === 'string') batch.set(op, markdown)
    }
    if (batch.size > 1) return [...batch].map(([op, markdown], index) =>
      `### 策略操作 ${index + 1}\n\n${operationLine(op)}\n\n${markdown}`).join('\n\n---\n\n')
  }
  if ([...POLICY_PREFLIGHT_TOOLS, POLICY_PREPARE, POLICY_STATUS, POLICY_RESULT,
    `${POLICY_PREFIX}select_policy_configuration_candidate`].includes(result.name)) return policyDelivery(result, events)
  if (result.name.startsWith(EMERGENCY_PREFIX)) {
    const markdown = emergencyDelivery(result)
    const op = operationId(result, envelope(result).data)
    const understanding = emergencyUnderstandingMarkdown(events, op)
    return understanding && typeof markdown === 'string'
      ? `${understanding}\n\n---\n\n${markdown}`
      : markdown
  }
  return undefined
}

function policyBatchMarkdown(batch) {
  if (batch.size === 1) return [...batch.values()][0]
  return [...batch].map(([op, markdown], index) =>
    `### 策略操作 ${index + 1}\n\n${operationLine(op)}\n\n${markdown}`).join('\n\n---\n\n')
}

/** 原生替代已核验新版本；真实 RESULT 可能直接接续，不能继续使用选择前的 STATUS。 */
async function verifiedPolicyDeviceStatus(result, events, signal, logger) {
  const { data, code } = envelope(result)
  const op = result.args?.operationId
  if (result.isError || code !== '200' || data?.operation_id !== op) return undefined
  let selected
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]
    if (event.type !== 'user/message' || event.data?.source?.kind !== 'policy-selection-runtime') continue
    const text = event.data.content?.find(block => block.type === 'text')?.text ?? ''
    if (!text.startsWith('[policy-device-selection/v1]\n')) continue
    let marker
    try { marker = JSON.parse(text.split('\n')[1]) } catch { continue }
    if (marker?.operation_id !== op) continue
    selected = marker
    break
  }
  if (!selected) return undefined
  if (!Number.isInteger(data.version) || data.version < 1 ||
      !Number.isInteger(selected.business_revision) || selected.business_revision < 1 ||
      selected.business_revision > data.version || !/^sha256:[a-f0-9]{64}$/.test(selected.intent_digest ?? '') ||
      typeof selected.label !== 'string' || !selected.label.trim()) return null
  const statusEvent = events.findLast(event => event.type === 'tool/result'
    && toolResult(events, event)?.name === POLICY_STATUS
    && toolResult(events, event)?.args?.operationId === op
    && envelope(toolResult(events, event)).data?.operation_id === op)
  const cached = envelope(statusEvent ? toolResult(events, statusEvent) : null)
  if (cached.code === '200' && cached.data?.candidate?.business_revision === data.version) return undefined
  try {
    const current = await currentPolicyStatus(op, signal)
    const valid = current?.operation_id === op && current.candidate?.business_revision === data.version
      && current.candidate?.intent_digest === selected.intent_digest
    logger?.info?.(`policy device status read operation=${op} version=${String(current?.candidate?.business_revision ?? '')} verified=${valid}`)
    return valid ? current : null
  } catch (error) {
    if (signal?.aborted) throw error
    logger?.warn?.(`policy device status read failed operation=${op}`)
    return null
  }
}

/** 状态工具给状态及记录引用；在同一步真实读取各操作的结果合同后固定交付。 */
async function latestPolicyResults(events, turn, signal, logger, query) {
  const last = events.findLast(event => ['tool/result', 'assistant/message', 'user/message'].includes(event.type))
  if (last?.type !== 'tool/result' || last.data?.turn !== turn) return undefined
  if (![POLICY_STATUS, POLICY_RESULT].includes(toolResult(events, last)?.name)) return undefined
  const getters = new Map()
  for (const event of events) {
    if (event.type !== 'tool/result' || event.data?.turn !== turn || event.data?.step !== last.data?.step) continue
    const result = toolResult(events, event)
    if (![POLICY_STATUS, POLICY_RESULT].includes(result?.name) || !/^op_[a-f0-9]{32}$/.test(result.args?.operationId ?? '')) continue
    getters.set(result.args.operationId, result)
  }
  if (!getters.size) return undefined
  if (!query && [...getters.values()].some(result => {
    const { data, code } = envelope(result)
    return result.name === POLICY_STATUS && !result.isError && code === '200' && data?.operation_id === result.args.operationId
      && data.stage_code !== 'terminal' && !['completed', 'failed', 'cancelled'].includes(data.operation_status)
  })) return undefined
  const batch = new Map(await Promise.all([...getters].map(async ([op, result]) => {
    if (result.name === POLICY_RESULT) {
      const verifiedStatus = await verifiedPolicyDeviceStatus(result, events, signal, logger)
      return [op, policyDelivery(result, events, verifiedStatus) ?? authorityUnknown(op)]
    }
    const { data, code } = envelope(result)
    if (result.isError || code !== '200' || !data) return [op, policyDelivery(result, events) ?? authorityUnknown(op)]
    if (data.operation_id !== op) return [op, authorityUnknown(op)]
    const base = process.env.AI_PLATFORM_URL
    if (!base) return [op, authorityUnknown(op)]
    try {
      signal?.throwIfAborted()
      const response = await fetch(`${base.replace(/\/$/, '')}/api/v1/policy-configurations/${op}/result`, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
      })
      const value = await response.json().catch(() => null)
      logger?.info?.(`policy result read operation=${op} http=${response.status} code=${String(value?.code ?? '')} result=${String(value?.data?.result_code ?? '')}`)
      if (!response.ok) return [op, codeFailure('策略', String(response.status), op)]
      const actualResult = { name: POLICY_RESULT, args: { operationId: op }, value: record(value), isError: false, rawText: null }
      const verifiedStatus = await verifiedPolicyDeviceStatus(actualResult, events, signal, logger)
      return [op, policyDelivery(actualResult, events, verifiedStatus) ?? authorityUnknown(op)]
    } catch (error) {
      if (signal?.aborted) throw error
      logger?.warn?.(`policy result read failed operation=${op}: ${error?.message ?? String(error)}`)
      return [op, toolFailure('策略', op, error?.message)]
    }
  })))
  return policyBatchMarkdown(batch)
}

function modelRoute(config, events, captured) {
  // 研判续接也是临时固定路由，不能把它当作真实模型恢复。
  if (![DELIVERY_PROVIDER, 'threat-analysis-continuation'].includes(config.provider)) return config
  const original = captured ?? events.findLast(event => event.type === 'request/header'
    && ![DELIVERY_PROVIDER, 'threat-analysis-continuation'].includes(event.data.header.config.provider))?.data.header.config
  if (!original) throw new Error('missing original operation-result model route')
  return original
}

export function apply(ctx) {
  const pending = new Map()
  const canonical = name => canonicalToolName(ctx.mcpSessionManager, name, DELIVERY_SOURCES)
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (decision.kind !== 'enter') return decision
    const events = canonicalToolEvents(agent.session.snapshotEvents(), canonical)
    return { ...decision, messages: projectDepartmentTaskMessages(decision.messages, events) }
  })
  ctx.on('agent/request', async ({ agent, turn, signal }, next) => {
    const config = await next()
    // 首轮原生动作澄清会先交付 fixed，再产生首个模型调用；此时尚无原始 request/header。
    if (![DELIVERY_PROVIDER, 'threat-analysis-continuation'].includes(config.provider)) originalRoutes.set(agent.id, config)
    const events = canonicalToolEvents(agent.session.snapshotEvents(), canonical)
    const last = events.findLast(event => ['tool/result', 'assistant/message', 'user/message'].includes(event.type))
    const result = last?.type === 'tool/result' && last.data?.turn === turn ? toolResult(events, last) : null
    const lastCall = !result && last?.type === 'tool/result' && last.data?.turn === turn
      ? events.findLast(event => event.type === 'tool/call') : null
    let unpairedCall = lastCall && { name: lastCall.data?.name, args: {} }
    try { if (unpairedCall) unpairedCall.args = JSON.parse(lastCall.data?.arguments ?? '{}') } catch { /* 保留工具域身份，不以无效参数授信。 */ }
    // 当前Task请求失败后，后续被拒的跨域查询不能把根因改写成应急服务故障。
    // 仅保留原模型路由，不将历史Task或新用户轮次变成可信保存证明。
    const taskInCurrentTurn = events.some(event => event.type === 'tool/call'
      && event.data?.turn === turn && isTaskResult({ name: event.data?.name }))
    const task = isTaskResult(result) || isTaskResult(unpairedCall) || taskInCurrentTurn
    if (task || (result && ([DEPARTMENT_PREPARE, DEPARTMENT_GET].includes(result.name) || departmentDraftResource(result)))) {
      // 部门交付不继承旧 single/应急的正文、模型接续或原生确认回调。
      queuedOutputs.delete(agent.id)
      modelContinuations.delete(agent.id)
      postDeliveryInteractions.delete(agent.id)
    }
    if (task) {
      // Task 只续用已准入的原模型；不将自定义 fixed provider/model 作为策略绕行入口。
      pending.delete(agent.id)
      return modelRoute(config, events, originalRoutes.get(agent.id))
    }
    if (modelContinuations.delete(agent.id)) {
      pending.delete(agent.id)
      queuedOutputs.delete(agent.id)
      return modelRoute(config, events, originalRoutes.get(agent.id))
    }
    const queued = queuedOutputs.get(agent.id)
    queuedOutputs.delete(agent.id)
    const markdown = queued ?? await latestPolicyResults(events, turn, signal, ctx.logger, isPolicyStatusQuery(agent.id)) ?? deliveryMarkdown(events, turn)
    if (typeof markdown === 'string') {
      pending.set(agent.id, markdown)
      return { provider: DELIVERY_PROVIDER, model: 'fixed-operation-result' }
    }
    pending.delete(agent.id)
    return modelRoute(config, events, originalRoutes.get(agent.id))
  })
  ctx.llm.registerAdapter([DELIVERY_PROVIDER], {
    providerInfo: provider => ({ id: provider, name: '安全操作结果（本地固定输出）' }),
    providerRetryPolicy: () => undefined,
    imageRequestPricing: () => undefined,
    listModels: async () => [],
    resolveModel: async (provider, model) => ({ provider, id: model, name: model }),
    async prepareCall(provider, model, signal) {
      return { model: await this.resolveModel(provider, model, signal), stream: options => this.stream(options) }
    },
    async *stream(request) {
      const initialText = pending.get(request.sessionId)
      if (typeof initialText !== 'string') throw new Error('missing controlled operation result')
      pending.delete(request.sessionId)
      request.signal?.throwIfAborted()
      let text = initialText
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text }
      try {
        const appended = await runPostDeliveryInteraction(request.sessionId, request.signal)
        if (typeof appended === 'string' && appended.trim()) {
          const delta = `\n\n---\n\n${appended.trim()}`
          text += delta
          yield { type: 'text-delta', index: 0, text: delta }
        }
      } catch (error) {
        ctx.logger?.warn?.(`post-delivery interaction failed: ${error?.message ?? String(error)}`)
      }
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  })
  ctx.on('agent/disposed', ({ agent }) => {
    pending.delete(agent.id)
    originalRoutes.delete(agent.id)
    queuedOutputs.delete(agent.id)
    modelContinuations.delete(agent.id)
    postDeliveryInteractions.delete(agent.id)
  })
}

export function controlledContextMessage(source, markdown) {
  return {
    id: randomUUID(), role: 'user', source: { kind: source, form: 'result' },
    content: [{ type: 'text', text: controlledOutput(markdown) }],
  }
}
