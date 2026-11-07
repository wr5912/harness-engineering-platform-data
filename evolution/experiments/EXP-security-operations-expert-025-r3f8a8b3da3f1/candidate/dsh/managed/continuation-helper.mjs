// 纯函数；不读会话、不执行工具、不注册 Hook、不维护业务账本。
// analysis_session_id/analysis_run_id 是本次本地工具 schema 新增字段；不是上游 prepare API。
import { createHash } from 'node:crypto'

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const clone = value => JSON.parse(JSON.stringify(value))
const parse = value => { try { return JSON.parse(value) } catch { return undefined } }
const ids = text => [...new Set(text.match(/INC-\d{8}-\d{6}/g) ?? [])]
export const textOnly = content => Array.isArray(content) && content.length > 0
  && content.every(b => b?.type === 'text' && typeof b.text === 'string')
  ? content.map(b => b.text).join('') : undefined
const argsOf = event => typeof event?.data?.arguments === 'string' ? parse(event.data.arguments) : undefined
const realUser = event => event?.type === 'user/message' && event.data?.source?.kind === 'user'
const settled = event => event?.type === 'user/message' && event.data?.source?.kind === 'subagent-settled'
export const continuationStop = (code, message, detail = {}) => ({ kind: 'stop', code, message,
  prepared: false, confirmed: false, submitted: false, ...detail })
const stop = continuationStop
export function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (object(value)) return `{${Object.keys(value).sort().filter(k => value[k] !== undefined)
    .map(k => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
const linked = (event, call) => event.sourceEventSeqs === undefined
  || Array.isArray(event.sourceEventSeqs) && event.sourceEventSeqs.includes(call.seq)
function paired(call, receipt) {
  const message = receipt?.data?.message
  return call?.type === 'tool/call' && receipt?.type === 'tool/result' && call.seq < receipt.seq
    && message?.role === 'tool' && message.source?.kind === 'tool'
    && message.toolCallId === call.data.callId && message.source.callId === call.data.callId
    && receipt.data.turn === call.data.turn && receipt.data.step === call.data.step && linked(receipt, call)
}

/** 只由父原始 source.kind=user 授权；不调用模型理解授权。疑问/引述/条件/矛盾保守澄清。 */
export function validateUserIntent(event) {
  if (!realUser(event) || event.data.role !== 'user' || typeof event.data.id !== 'string') {
    return stop('USER_SOURCE_REQUIRED', '没有父会话真实用户授权。')
  }
  // 仅去除包裹唯一事件 ID 的 Markdown 反引号；其他代码/引述不规范化成授权。
  const text = textOnly(event.data.content)?.replace(/`(INC-\d{8}-\d{6})`/g, '$1').trim()
  const incidentIds = ids(text ?? '')
  if (!text || incidentIds.length !== 1) return stop('SINGLE_INCIDENT_REQUIRED', '需要真实用户明确指定唯一事件。')
  const politeRequest = /(?:能否|可否|可以|能不能|可不可以)(?:请)?(?:你)?帮我/u.test(text)
    || /(?:好吗|可以吗|行吗)[?？。！!\s]*$/u.test(text)
  if (/[「」『』“”"'`<>]|(?:^|\n)\s*>|是否|怎么|如何|什么意思|为什么|是否应该|应不应该/u.test(text)
    || /引用|转述|原话|示例|样例|假设|讨论|如果|假如|倘若|若是/u.test(text)
    || /[?？]|吗[。！!\s]*$|么[。！!\s]*$/u.test(text) && !politeRequest) {
    return stop('INTENT_NEEDS_CLARIFICATION', '请求包含引用、讨论、疑问或条件，未自动取得准备授权。')
  }
  if (/(?:不要|别|禁止|不必|无需|不能|不需要|暂不|先不|不再|不允许|不准)\s*(?:(?:你|帮我|替我|给我|为我|自动|进行|直接|立刻|现在|继续|再|做|创建|生成)\s*)*(?:处置|准备|建草案)|不处置|不准备|(?:仅|只)\s*(?:需要|做|进行)?\s*研判/u.test(text)) {
    return stop('PREPARATION_NOT_AUTHORIZED', '用户限制为仅研判或明确禁止准备/处置，不生成草案。')
  }
  // “不要执行/先看草案/等我确认”不撤销准备授权；原生确认边界始终保留。
  // 意图匹配忽略已绑定事件 ID 和分隔标点，不能把“研判INC…，并处置”误当未授权。
  const requestText = text.replace(incidentIds[0], '').replace(/[，,]/g, ' ')
  const positive = /研判\s*(?:并(?:且)?|后|完后|完成后|再)\s*(?:帮我|请|再|进行)?\s*处置/u.test(requestText)
    || /研判[\s\S]{0,40}(?:后|完成|并|再)[\s\S]{0,24}(?:准备|生成|创建|给出)[\s\S]{0,12}(?:处置草案|处置的草案|应急草案)/u.test(text)
    || /(?:准备|生成|创建)[\s\S]{0,12}处置草案[\s\S]{0,20}研判/u.test(text)
  if (!positive) return stop('PREPARATION_NOT_EXPLICIT', '没有明确要求研判后准备处置草案，请澄清。')
  return { kind: 'authorized', incidentId: incidentIds[0], userMessageId: event.data.id, userSeq: event.seq }
}
export function stableRequestId({ parentId, childId, userMessageId, delegateCallId, incidentId, runId }) {
  const parts = [parentId, childId, userMessageId, delegateCallId, incidentId, runId]
  if (parts.some(v => typeof v !== 'string' || !v)) return undefined
  return `dsp1-${createHash('sha256').update(JSON.stringify(['disposition-continuation/v1', ...parts])).digest('hex').slice(0, 32)}`
}
export function sourceBinding(plan) {
  return { analysis_session_id: plan.gate.childId, analysis_run_id: plan.runId, request_id: plan.requestId }
}
export function latestCompletion(events) {
  const event = events.findLast(e => realUser(e) || settled(e))
  return settled(event) ? event : undefined
}

/** 读子会话前的门禁。allowProgress 仅控制器内部使用，不是模型工具参数。 */
export function validateCompletionEvent({ parentId, parentEvents: events, turn, boundToolCallId,
  allowProgress = false, requirePreparation = true }) {
  if (!parentId || !Array.isArray(events) || events.some((e, i) => !Number.isSafeInteger(e.seq)
    || i > 0 && e.seq <= events[i - 1].seq)) return stop('RAW_PARENT_LOG_REQUIRED', '父原始事件缺失或次序不可信。')
  const start = events.findLast(e => e.type === 'turn/start')
  const notice = latestCompletion(events)
  if (start?.data?.turn !== turn || !notice || notice.seq <= start.seq || notice.data.role !== 'user') {
    return stop('NATIVE_SETTLED_REQUIRED', '当前输入不是本轮原生子任务完成通知。')
  }
  if (!allowProgress && !boundToolCallId && events.some(e => e.seq > notice.seq
    && ['assistant/message', 'tool/result'].includes(e.type))) return stop('CONTINUATION_ADVANCED', '本轮已经推进，不重复启动续办。')
  const childId = notice.data.source.senderSessionId
  if (typeof childId !== 'string' || !childId || childId === parentId) return stop('CHILD_ID_REQUIRED', '完成通知缺少子会话身份。')
  // 同一个子完成通知重复投递不重新触发；已有准备不论成功、失败或未知均不重发。
  if (events.some(e => settled(e) && e.seq < notice.seq && e.data.source.senderSessionId === childId)) {
    return stop('DUPLICATE_SETTLED', '同一子任务完成通知已处理，不重复续办。')
  }
  const catalogs = events.filter(e => e.type === 'subagent/catalog' && e.data?.childId === childId)
  if (catalogs.length !== 1 || catalogs[0].data.version !== 0 || catalogs[0].data.mode !== 'continuable') {
    return stop('DIRECT_CHILD_UNPROVEN', '父原生目录不能唯一证明直接子身份。')
  }
  const catalog = catalogs[0]
  const receipts = events.filter(e => e.type === 'tool/result' && e.data?.message?.isError === false
    && textOnly(e.data.message.content) === `started subagent ${childId}`)
  if (receipts.length !== 1) return stop('DELEGATION_RECEIPT_REQUIRED', '缺少唯一原生委派启动回执。')
  const receipt = receipts[0]
  const calls = events.filter(e => e.type === 'tool/call' && e.data?.callId === receipt.data.message.toolCallId)
  const call = calls[0]
  if (calls.length !== 1 || call.data.name !== 'delegate_threat_analysis' || !paired(call, receipt)
    || !(call.seq < catalog.seq && catalog.seq < receipt.seq && receipt.seq < notice.seq)) {
    return stop('DELEGATION_PAIR_MISMATCH', '威胁研判委派调用、原生目录与回执不匹配。')
  }
  const user = events.findLast(e => realUser(e) && e.seq < call.seq)
  const intent = validateUserIntent(user)
  if (requirePreparation && intent.kind !== 'authorized') return intent
  const userIds = ids(textOnly(user?.data?.content) ?? '')
  if (!realUser(user) || userIds.length !== 1 || !user.data.id) return stop('USER_SOURCE_REQUIRED', '缺少可与委派绑定的唯一真实用户事件。')
  // 控制器可以只读交付已有研判，但不能因此取得准备授权；runtime 始终 requirePreparation。
  const authorization = intent.kind === 'authorized' ? intent : { incidentId: userIds[0],
    userMessageId: user.data.id, userSeq: user.seq, preparationStop: intent }
  // 单事件原始请求只允许一次威胁委派；不同子 ID 也不能把同一授权准备两遍。
  const delegations = events.filter(e => e.type === 'tool/call' && e.seq > user.seq
    && e.data?.name === 'delegate_threat_analysis')
  if (delegations.length !== 1 || delegations[0].data.callId !== call.data.callId) {
    return stop('DELEGATION_NOT_UNIQUE', '同一用户请求存在多个研判委派，停止自动处置并核对来源。')
  }
  if (events.some(e => realUser(e) && e.seq > user.seq || e.type === 'agent/inbox/spliced' && e.seq > user.seq
    && e.data?.inserted?.some(message => message.source?.kind === 'user'))) {
    return stop('USER_INTENT_SUPERSEDED', '用户有更新请求，旧授权失效。')
  }
  const promptIds = ids(typeof argsOf(call)?.prompt === 'string' ? argsOf(call).prompt : '')
  if (promptIds.length !== 1 || promptIds[0] !== authorization.incidentId) return stop('DELEGATE_INCIDENT_MISMATCH', '委派事件与用户请求不一致。')
  if (!allowProgress && events.some(e => e.seq > call.seq && e.type === 'tool/call'
    && e.data?.name === 'disposition_prepare' && e.data.callId !== boundToolCallId)) {
    return stop('PREPARE_ALREADY_ATTEMPTED', '该委派已有准备尝试，不重新发起写调用。')
  }
  return { ...authorization, kind: 'read-child', childId, parentId, delegateCallId: call.data.callId,
    delegateSeq: call.seq, noticeSeq: notice.seq, childCreatedAt: catalog.data.childCreatedAt,
    read: { service: 'sessionQuery', method: 'readSession', args: [childId] } }
}

export function validateChildResult(gate, snapshot) {
  if (gate?.kind !== 'read-child') return stop('READ_GATE_REQUIRED', '未通过直接子读取门禁。')
  const header = snapshot?.session
  if (header?.id !== gate.childId || header.createdAt !== gate.childCreatedAt || header.origin !== 'subagent'
    || header.isSeeded !== false || snapshot.inheritedEventCount !== 0 || !Array.isArray(snapshot.events)) {
    return stop('CHILD_SNAPSHOT_MISMATCH', '子会话头与父原生目录不一致，或含继承内容。')
  }
  const events = snapshot.events
  const results = events.filter(e => e.type === 'tool/result' && e.data?.meta?.threat_analysis !== undefined)
  if (results.length !== 1) return stop('RESULT_NOT_UNIQUE', '没有唯一原始结构化研判结果，不从摘要推断。')
  const receipt = results[0]
  const calls = events.filter(e => e.type === 'tool/call' && e.data?.callId === receipt.data.message?.toolCallId)
  const call = calls[0]
  if (calls.length !== 1 || call.data.name !== 'analyze_threat_incident' || !paired(call, receipt)
    || receipt.data.message.isError !== false || argsOf(call)?.incident_id !== gate.incidentId) {
    return stop('ANALYSIS_TOOL_PAIR_MISMATCH', '原始研判调用与结果不匹配。')
  }
  const analysis = receipt.data.meta.threat_analysis
  if (analysis.incident_id !== gate.incidentId || typeof analysis.run_id !== 'string' || !analysis.run_id) {
    return stop('RESULT_ID_MISMATCH', '研判结果事件或 Run 身份不匹配。')
  }
  const markdown = typeof analysis.delivery?.markdown === 'string' ? analysis.delivery.markdown : ''
  if (!object(analysis.result) || analysis.result.unified_event_id !== gate.incidentId) {
    return stop('STRUCTURED_RESULT_REQUIRED', '本次研判结果缺失或事件不一致。', { markdown })
  }
  const recommendations = analysis.result.recommended_actions
  if (!Array.isArray(recommendations)) {
    return stop('RECOMMENDATIONS_MISSING', '本次研判未返回推荐动作字段。', { markdown })
  }
  // 上游负责研判和质量校验；续接不再裁决整份结果，也不裁剪推荐条数或复合措辞。
  const plan = { kind: 'preview-only', gate, runId: analysis.run_id,
    requestId: stableRequestId({ ...gate, runId: analysis.run_id }), markdown,
    warnings: clone(analysis.validation?.warnings ?? []), validation: clone(analysis.validation ?? null),
    recommendations: clone(recommendations), frozenAnalysis: clone(analysis),
    prepared: false, confirmed: false, submitted: false }
  plan.call = { name: 'disposition_preview', arguments: { incident_id: gate.incidentId,
    analysis_session_id: gate.childId, analysis_run_id: plan.runId } }
  return plan
}

/** 复用既有一次 prepare 的选取语义；输入仍是全量映射，不在续接层重新分类建议。 */
export function validateMappedSingleAction(bound, items, _options = {}) {
  if (!Array.isArray(items)) return stop('MAPPED_ITEMS_REQUIRED', '处置映射没有返回建议列表。')
  const recommendationIndex = items.findIndex(item => object(item) && item.executable === true
    && item.manual !== true && item.action_key)
  if (recommendationIndex < 0) {
    return stop('NO_EXECUTABLE_RECOMMENDATION', '本次推荐暂无可准备项；各项可执行或人工处理说明已保留在预览中。')
  }
  const item = items[recommendationIndex]
  // 一次准备仍选择既有可执行项；不是宣称已为所有建议生成多个草案。
  // 仅防止本次只读预览与实际准备之间悄悄换项，不重审研判质量或自然语言。
  const signature = value => stableSerialize({ action: value.action, action_key: value.action_key,
    params: value.params, hint: value.target?.hint, device: value.target?.device, agent: value.target?.agent })
  if (bound.expectedRecommendationIndex !== undefined && recommendationIndex !== bound.expectedRecommendationIndex
    || bound.expectedMappedItem && signature(item) !== signature(bound.expectedMappedItem)) {
    return stop('PREVIEW_MAPPING_CHANGED', '预览后的处置项或参数发生变化，请核对当前预览；未创建草案。')
  }
  return { kind: 'single-action-validated', item: clone(item), actionKey: item.action_key,
    recommendationIndex, requestId: bound.requestId }
}

export function inspectPreviewReceipt(plan, call, receipt, { classify } = {}) {
  if (plan?.kind !== 'preview-only' || call?.data?.name !== 'disposition_preview' || !paired(call, receipt)
    || receipt.data.message.isError !== false || argsOf(call)?.incident_id !== plan.gate.incidentId
    || argsOf(call)?.analysis_session_id !== plan.gate.childId || argsOf(call)?.analysis_run_id !== plan.runId) {
    return stop('PREVIEW_PAIR_MISMATCH', '缺少匹配的原生预览回执。')
  }
  const value = parse(textOnly(receipt.data.message.content))
  if (value?.source !== 'THREAT_ANALYSIS' || value.resultRef !== plan.gate.incidentId || value.executed !== false
    || stableSerialize(value.source_binding) !== stableSerialize(sourceBinding(plan))) {
    return stop('PREVIEW_BINDING_MISMATCH', '预览不是原始固定研判来源的只读回执。')
  }
  if (value.blocked === true) return stop(value.stop_reason || 'PREVIEW_BLOCKED',
    typeof value.reason === 'string' ? value.reason : '绑定预览已阻断，不准备处置。')
  const checked = validateMappedSingleAction(plan, value.items, { classify })
  if (checked.kind === 'stop') return checked
  return { kind: 'prepare-once', requestId: plan.requestId, expectedMappedItem: checked.item,
    expectedRecommendationIndex: checked.recommendationIndex,
    call: { name: 'disposition_prepare', arguments: { incident_id: plan.gate.incidentId,
      mode: 'recommendation', request_id: plan.requestId, analysis_session_id: plan.gate.childId,
      analysis_run_id: plan.runId } }, confirmed: false, submitted: false }
}

/** 先 validateCompletionEvent 再 readSession；本函数仅复核已读值。exec.callId 必须来自原生上下文。 */
export function deriveBoundAnalysis({ parentId, parentEvents, turn, currentToolCallId, snapshot, args, classify }) {
  if (!currentToolCallId) return stop('NATIVE_TOOL_CONTEXT_REQUIRED', '缺少当前原生工具调用身份。')
  const gate = validateCompletionEvent({ parentId, parentEvents, turn, boundToolCallId: currentToolCallId })
  if (gate.kind !== 'read-child') return gate
  if (args?.analysis_session_id !== gate.childId || args.incident_id !== gate.incidentId) return stop('BOUND_SOURCE_MISMATCH', '绑定来源与父原生委派不一致。')
  const plan = validateChildResult(gate, snapshot)
  if (plan.kind !== 'preview-only') return plan
  if (args.analysis_run_id !== plan.runId) return stop('BOUND_RUN_MISMATCH', '绑定 Run 不匹配。')
  const calls = parentEvents.filter(e => e.type === 'tool/call' && e.data?.callId === currentToolCallId)
  const call = calls[0]
  if (calls.length !== 1 || !['disposition_preview', 'disposition_prepare'].includes(call.data.name)
    || call.seq <= gate.noticeSeq || stableSerialize(argsOf(call)) !== stableSerialize(args)) return stop('BOUND_CALL_MISMATCH', '绑定参数与当前原生调用不一致。')
  const allowed = ['incident_id', 'analysis_session_id', 'analysis_run_id', 'mode', 'request_id']
  if (Object.keys(args).some(key => !allowed.includes(key)) || call.data.name === 'disposition_prepare'
    && (args.request_id !== plan.requestId || args.mode !== 'recommendation')) return stop('BOUND_OVERRIDE_FORBIDDEN', '绑定准备不接受动作、目标、能力覆盖；幂等键和推荐模式必须匹配。')
  let expectedMappedItem
  let expectedRecommendationIndex
  if (call.data.name === 'disposition_prepare') {
    const preview = parentEvents.findLast(e => e.type === 'tool/call' && e.data?.name === 'disposition_preview'
      && e.seq > gate.noticeSeq && e.seq < call.seq && argsOf(e)?.analysis_session_id === gate.childId
      && argsOf(e)?.analysis_run_id === plan.runId)
    const receipts = parentEvents.filter(e => e.type === 'tool/result' && e.seq < call.seq
      && e.data?.message?.toolCallId === preview?.data?.callId)
    if (!preview || receipts.length !== 1) return stop('BOUND_PREVIEW_REQUIRED', '准备前缺少绑定的原生预览回执。')
    const checked = inspectPreviewReceipt(plan, preview, receipts[0], { classify })
    if (checked.kind !== 'prepare-once') return checked
    expectedMappedItem = checked.expectedMappedItem
    expectedRecommendationIndex = checked.expectedRecommendationIndex
  }
  return { ...plan, kind: 'bound-analysis', result: plan.frozenAnalysis.result, expectedMappedItem, expectedRecommendationIndex,
    childSnapshot: clone(snapshot) }
}

/** 本地控制器阶段推导；所有调用由原生工具执行，helper 自身不执行。 */
export function continuationPlan({ gate, snapshot, parentEvents, classify }) {
  const plan = validateChildResult(gate, snapshot)
  const attempts = parentEvents.filter(e => e.type === 'tool/call' && e.seq > gate.delegateSeq && e.data?.name === 'disposition_prepare')
  if (gate.preparationStop) return attempts.length
    ? { kind: 'deliver', markdown: plan.markdown, message: '本轮未取得准备授权；已有准备调用须另行核对，不重发。' }
    : { kind: 'deliver', markdown: plan.markdown, message: gate.preparationStop.message }
  if (plan.kind === 'stop') return attempts.length
    ? { kind: 'deliver', markdown: plan.markdown, message: '已有准备尝试，但当前研判结果检查未通过；须核对操作记录，不能据此断言未建草案，不重发。' }
    : plan
  if (attempts.length > 1) return { kind: 'deliver', markdown: plan.markdown,
    message: '同一请求出现多次准备调用，须核对全部操作记录；本轮不再准备、确认或下发。', requestId: plan.requestId }
  if (attempts.length) {
    const call = attempts[0]
    const receipts = parentEvents.filter(e => e.type === 'tool/result' && e.data?.message?.toolCallId === call.data.callId)
    const receipt = receipts[0]
    const value = receipt && paired(call, receipt) && receipt.data.message.isError === false
      ? parse(textOnly(receipt.data.message.content)) : undefined
    const operationId = value?.operation_id ?? value?.data?.operation_id
    const bindingMatches = stableSerialize(value?.source_binding) === stableSerialize(sourceBinding(plan))
    const attemptedArgs = argsOf(call)
    if (receipts.length === 1 && value?.blocked === true && value.prepared === false
      && attemptedArgs?.request_id === plan.requestId && attemptedArgs.analysis_session_id === gate.childId
      && attemptedArgs.analysis_run_id === plan.runId) {
      return { kind: 'deliver', markdown: plan.markdown,
        message: `处置准备在调用草案创建前停止：${value.reason || '预检未通过'} 不重试。`, requestId: plan.requestId }
    }
    const phase = value?.phase ?? value?.data?.phase
    const executionStatus = value?.execution_status ?? value?.data?.execution_status
    const callMatches = stableSerialize(attemptedArgs) === stableSerialize({
      incident_id: gate.incidentId, mode: 'recommendation', request_id: plan.requestId,
      analysis_session_id: gate.childId, analysis_run_id: plan.runId })
    if (receipts.length === 1 && callMatches && bindingMatches && value?.prepared === true && operationId
      && phase === 'READY' && executionStatus === 'NOT_SUBMITTED' && value.ready === true) {
      // 交还已有 operation-result-delivery，不能用一句操作号抢走完整草案及原生确认交付。
      return { kind: 'native-draft', operationId, requestId: plan.requestId }
    }
    if (receipts.length === 1 && bindingMatches && operationId) return { kind: 'deliver', markdown: plan.markdown,
      message: `操作 ${String(operationId)} 当前阶段：${String(phase ?? 'unknown')}；执行状态：${String(executionStatus ?? 'unknown')}。本轮未发确认或下发；请查询该操作记录，不重发准备请求。`, requestId: plan.requestId }
    return { kind: 'deliver', markdown: plan.markdown,
      message: `处置准备已尝试，结果待核对；不重发，不确认或下发。请求号：${plan.requestId}`, requestId: plan.requestId }
  }
  const previews = parentEvents.filter(e => e.type === 'tool/call' && e.seq > gate.noticeSeq && e.data?.name === 'disposition_preview')
  if (!previews.length) return plan
  if (previews.length !== 1) return stop('PREVIEW_NOT_UNIQUE', '存在多个预览尝试，停止自动续办。', { markdown: plan.markdown })
  const call = previews[0]
  const receipts = parentEvents.filter(e => e.type === 'tool/result' && e.data?.message?.toolCallId === call.data.callId)
  if (receipts.length !== 1) return stop('PREVIEW_RESULT_UNKNOWN', '预览结果缺失或不唯一，不准备草案。', { markdown: plan.markdown })
  const next = inspectPreviewReceipt(plan, call, receipts[0], { classify })
  return { ...next, markdown: plan.markdown }
}
