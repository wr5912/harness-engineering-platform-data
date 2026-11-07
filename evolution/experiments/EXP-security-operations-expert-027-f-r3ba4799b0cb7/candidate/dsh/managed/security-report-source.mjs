import { createHash } from 'node:crypto'

// 纯函数：调用方只传入原生 Session 日志和 sessionQuery 返回的快照。
// 不读取文件、不调用工具、不执行报告文字，也不维护另一份运行账本。
// 主助手正文是可见语义分析；来源只从本 Root 会话的真实回执绑定，不从正文解析。
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const identifier = value => typeof value === 'string' && value.length > 0
  && value.length <= 512 && !/[\s\u0000-\u001f\u007f]/u.test(value)
const integer = value => Number.isSafeInteger(value) && value >= 0
const fail = message => { throw new Error(message) }
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex')
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char])
const textOnly = content => Array.isArray(content) && content.length > 0
  && content.every(part => part?.type === 'text' && typeof part.text === 'string')
  ? content.map(part => part.text).join('') : undefined
const visibleText = content => Array.isArray(content)
  ? content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('')
  : ''
const parseObject = text => {
  if (typeof text !== 'string') return undefined
  try { const value = JSON.parse(text); return object(value) ? value : undefined } catch { return undefined }
}

function ownEvents(input) {
  if (!Array.isArray(input) || input.some((event, index) => !object(event)
    || !integer(event.seq) || typeof event.type !== 'string' || !object(event.data)
    || index > 0 && event.seq <= input[index - 1].seq)) {
    fail('报告来源必须是按序、无重复序号的原生会话事件。')
  }
  // Fork 继承前缀不能给当前会话建立新的运行/直接子绑定。
  const cut = input.findLastIndex(event => event.type === 'session/end-seed' && event.data.inherited === true)
  return input.slice(cut + 1)
}

function successfulPairs(events, includeErrors = false) {
  const calls = new Map(), receipts = new Map()
  for (const event of events) {
    if (event.type === 'tool/call' && identifier(event.data.callId)) {
      const list = calls.get(event.data.callId) ?? []
      list.push(event); calls.set(event.data.callId, list)
    } else if (event.type === 'tool/result' && identifier(event.data.message?.toolCallId)) {
      const list = receipts.get(event.data.message.toolCallId) ?? []
      list.push(event); receipts.set(event.data.message.toolCallId, list)
    }
  }
  const pairs = []
  for (const [callId, entries] of calls) {
    const results = receipts.get(callId) ?? []
    if (entries.length !== 1 || results.length !== 1) continue
    const call = entries[0], receipt = results[0], message = receipt.data.message
    if (call.seq >= receipt.seq || typeof call.data.name !== 'string'
      || !integer(call.data.turn) || !integer(call.data.step)
      || call.data.turn !== receipt.data.turn || call.data.step !== receipt.data.step
      || message?.role !== 'tool' || message.source?.kind !== 'tool'
      || message.source.callId !== callId || message.toolCallId !== callId
      || message.isError !== undefined && typeof message.isError !== 'boolean') continue
    const isError = message.isError === true || receipt.data.error !== undefined
    if (!includeErrors && isError) continue
    if (receipt.sourceEventSeqs !== undefined && (!Array.isArray(receipt.sourceEventSeqs)
      || !receipt.sourceEventSeqs.includes(call.seq)
      || receipt.sourceEventSeqs.some(seq => !integer(seq) || seq >= receipt.seq))) continue
    const args = parseObject(call.data.arguments)
    if (args) pairs.push({ call, receipt, args, isError })
  }
  return pairs
}

function inspectionValue(message) {
  let value = parseObject(textOnly(message.content))
  for (let depth = 0; object(value) && depth < 6; depth++) {
    if (value.isError === true || value.ok !== undefined && value.ok !== true) return undefined
    if (value.structuredContent !== undefined) { value = value.structuredContent; continue }
    if (Array.isArray(value.content)) { value = parseObject(textOnly(value.content)); continue }
    if (value.code !== undefined) {
      if (String(value.code) !== '200') return undefined
      value = value.data; continue
    }
    // 先认外层 Run，绝不把它的 result.status（业务完整性）当执行状态。
    if (identifier(value.run_id)) return value
    if (object(value.result)) { value = value.result; continue }
    if (object(value.run)) { value = value.run; continue }
    return undefined
  }
  return undefined
}

const inspectionTools = new Map(['status', 'baseline', 'vulnerabilities', 'reachability', 'routine', 'deep']
  .map(kind => [`mcp__inspection-compositions__inspection_${kind}`, `inspection-${kind}`]))
/** 仅从本会话真实成功调用绑定原运行；终态不能取自可能被spill裁剪的展示文本。 */
export function selectInspectionRun(input, runId, canonicalName = name => name) {
  return selectInspectionRuns(input, runId, canonicalName)[0]
}

/** 返回同会话可核验来源的倒序候选；完成状态由调用方以本次完整回执核验。 */
export function selectInspectionRuns(input, runId, canonicalName = name => name) {
  if (runId !== undefined && !identifier(runId)) fail('巡检报告运行标识无效。')
  if (typeof canonicalName !== 'function') fail('巡检工具来源解析器无效。')
  const events = ownEvents(input), origins = new Map()
  for (const pair of successfulPairs(events)) {
    const workflow = inspectionTools.get(canonicalName(pair.call.data.name))
    if (!workflow) continue
    const value = inspectionValue(pair.receipt.data.message)
    if (!value) continue
    if (value.composition_id !== undefined && value.composition_id !== workflow
      || value.workflow !== undefined && value.workflow !== workflow) continue
    const previous = origins.get(value.run_id)
    if (previous && previous.workflow !== workflow) fail('同一巡检运行出现冲突的原始启动来源。')
    origins.set(value.run_id, { runId: value.run_id, workflow, seq: pair.receipt.seq })
  }
  const candidates = runId !== undefined ? [origins.get(runId)].filter(Boolean)
    : [...origins.values()].sort((left, right) => right.seq - left.seq)
  if (!candidates.length) fail('本会话没有可核验的巡检启动回执，不能借外部运行标识导出。')
  return Object.freeze(candidates.map(origin => Object.freeze({ run_id: origin.runId, workflow: origin.workflow })))
}

const troubleshootingTools = new Map([
  ['mcp__troubleshooting-compositions__diagnose_business_access', 'troubleshooting-business-access'],
  ['mcp__troubleshooting-compositions__diagnose_device_offline', 'troubleshooting-device-offline'],
])
const troubleshootingWorkflows = new Set(troubleshootingTools.values())
const troubleshootingGetters = new Set(['get_composition_run', 'get_composition_artifact', 'get_composition_details']
  .map(raw => `mcp__troubleshooting-compositions__${raw}`))
const safeResourceId = value => identifier(value) && /^[a-z\d][a-z\d._-]*$/iu.test(value) && !value.includes('..')
const safeHtmlName = value => typeof value === 'string' && value.length <= 512 && value === value.trim()
  && /\.html$/iu.test(value) && !/[\\/:*?"<>|%\u0000-\u001f\u007f]/u.test(value) && !value.startsWith('.')
const htmlMime = value => typeof value === 'string'
  && /^text\/html(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/iu.test(value)
const sameJson = (left, right) => stableReportJson(left) === stableReportJson(right)
function matchesParent(parentId, ...values) {
  return values.every(value => !object(value) || ['session_id', 'sessionId', 'parent_session_id', 'parentSessionId']
    .every(key => !Object.hasOwn(value, key) || value[key] === parentId))
}

// 仅识别“存在目标流程痕迹”，不是成功来源解析；错误封装、缺id也不能洗成没有活动。
function troubleshootingReceiptMarker(message) {
  let value = parseObject(textOnly(message?.content))
  for (let depth = 0; object(value) && depth < 6; depth++) {
    if (troubleshootingWorkflows.has(value.composition_id) || troubleshootingWorkflows.has(value.workflow)) return true
    if (identifier(value.run_id)) return false // 不把其他外层Run的业务result内引用误认成新启动。
    if (object(value.structuredContent)) { value = value.structuredContent; continue }
    if (Array.isArray(value.content)) { value = parseObject(textOnly(value.content)); continue }
    if (object(value.result)) { value = value.result; continue }
    if (object(value.run)) { value = value.run; continue }
    if (object(value.data)) { value = value.data; continue }
    return false
  }
  return false
}
function uncertainTroubleshootingReceipt(event, events, canonicalName) {
  if (event.type !== 'tool/result' || event.data.message?.role !== 'tool'
    || event.data.message.source?.kind !== 'tool' || !troubleshootingReceiptMarker(event.data.message)) return false
  const calls = events.filter(call => call.type === 'tool/call' && call.data.callId === event.data.message.toolCallId)
  // 无call或无法核准的工具身份都不是合法启动；明确get_run/artifact/details只查询，不建立新来源。
  return !calls.length || calls.some(call => {
    const name = canonicalName(call.data.name)
    return !troubleshootingTools.has(name) && !troubleshootingGetters.has(name)
  })
}

/** undefined 只表示没有新流程活动；存在新尝试但回执不可靠时必须抛错，不能降级到 legacy。 */
export function selectTroubleshootingRun(parentId, input, runId, canonicalName = name => name) {
  if (!identifier(parentId) || runId !== undefined && !safeResourceId(runId)) fail('故障报告主会话或运行标识无效。')
  if (typeof canonicalName !== 'function') fail('故障组合工具来源解析器无效。')
  const events = ownEvents(input)
  // 活动检测故意不依赖成功配对/JSON解码：裁剪、错误、未返回与新尝试都不能被当成“没有来源”。
  const attempts = events.filter(event => event.type === 'tool/call'
    && troubleshootingTools.has(canonicalName(event.data.name)))
  const pairs = successfulPairs(events, true).filter(pair => troubleshootingTools.has(canonicalName(pair.call.data.name)))
  if (events.some(event => uncertainTroubleshootingReceipt(event, events, canonicalName))) {
    fail('发现缺少本会话原始调用或工具身份不明的故障组合回执，来源待核，不能回退旧报告。')
  }
  if (!attempts.length) {
    if (runId !== undefined) fail('本会话没有该故障组合的真实启动来源，不能借外部运行标识导出。')
    return undefined
  }
  const origins = new Map()
  for (const pair of pairs) {
    const value = inspectionValue(pair.receipt.data.message)
    if (!value || !safeResourceId(value.run_id)) continue
    const workflow = troubleshootingTools.get(canonicalName(pair.call.data.name))
    const previous = origins.get(value.run_id)
    if (previous && (previous.workflow !== workflow || previous.callId !== pair.call.data.callId)) {
      fail('同一故障运行出现冲突或重复的原始启动来源，不能回退旧报告。')
    }
    origins.set(value.run_id, { workflow, callId: pair.call.data.callId })
  }
  const explicit = runId !== undefined ? pairs.filter(pair => inspectionValue(pair.receipt.data.message)?.run_id === runId) : undefined
  if (explicit && explicit.length !== 1) fail('指定故障运行没有本会话唯一真实启动来源，不能使用外部、冲突或inspection运行。')
  const latest = explicit ? explicit[0].call : attempts.at(-1), matching = pairs.filter(pair => pair.call === latest)
  if (matching.length !== 1) fail('所选故障组合调用尚无唯一、同turn/step的完整回执，状态未知，不能回退旧报告。')
  const pair = matching[0], value = inspectionValue(pair.receipt.data.message)
  const toolName = canonicalName(latest.data.name), workflow = troubleshootingTools.get(toolName)
  const request = requestBefore(events, latest.seq)
  if (pair.isError || !value || receiptFailed(pair)) fail('所选故障组合启动失败或回执已裁剪，不能回退旧报告。')
  if (!request || !safeResourceId(value.run_id) || value.composition_id !== workflow
    || value.workflow !== undefined && value.workflow !== workflow
    || !matchesParent(parentId, latest, latest.data, pair.receipt, pair.receipt.data,
      pair.receipt.data.message, pair.receipt.data.message.source, value)
    || pair.args.run_id !== undefined && pair.args.run_id !== value.run_id
    || pair.args.composition_id !== undefined && pair.args.composition_id !== workflow
    || pair.args.workflow !== undefined && pair.args.workflow !== workflow) {
    fail('所选故障运行与本会话、原始工具或流程冲突，不能回退旧报告。')
  }
  if (!['accepted', 'pending', 'queued', 'running', 'in_progress', 'completed'].includes(value.status)) {
    fail(`所选故障组合启动状态为${typeof value.status === 'string' ? value.status : 'unknown'}，失败或未知，不能回退旧报告。`)
  }
  return Object.freeze({ parent_session_id: parentId, run_id: value.run_id, composition_id: workflow, workflow,
    start_tool_name: toolName, start_registered_tool_name: latest.data.name, start_call_id: latest.data.callId,
    start_turn: latest.data.turn, start_step: latest.data.step, start_seq: latest.seq,
    start_result_seq: pair.receipt.seq, user_message_id: request.user.data.id, request_seq: request.user.seq,
    request_sha256: hash(request.request), start_receipt_hash_scope: 'native-tool-result.visible-text/v1',
    start_receipt_sha256: hash(textOnly(pair.receipt.data.message.content)) })
}

/** 完整 canonical 外层 Run 是唯一终态依据；业务 result.status=incomplete 不改变 completed。 */
export function selectTroubleshootingArtifact(binding, run) {
  if (!object(binding) || !identifier(binding.parent_session_id) || !safeResourceId(binding.run_id)
    || !troubleshootingWorkflows.has(binding.workflow) || binding.composition_id !== binding.workflow
    || !object(run) || run.isError === true || run.ok !== undefined && run.ok !== true
    || run.run_id !== binding.run_id || run.composition_id !== binding.composition_id
    || run.workflow !== binding.workflow
    || !matchesParent(binding.parent_session_id, run)) fail('故障组合 canonical 结果与本会话原运行或流程不一致。')
  if (run.status !== 'completed') fail(`所选故障组合尚未成功完成（status=${typeof run.status === 'string' && run.status ? run.status : 'unknown'}），不能导出或回退旧报告。`)
  const reports = Array.isArray(run.artifacts) ? run.artifacts.filter(item => object(item)
    && (typeof item.filename === 'string' && /\.html?$/iu.test(item.filename)
      || typeof item.contentType === 'string' && /^text\/html\b/iu.test(item.contentType))) : []
  const report = reports[0]
  if (reports.length !== 1 || !safeResourceId(report.id) || !safeHtmlName(report.filename) || !htmlMime(report.contentType)
    || !Number.isSafeInteger(report.bytes) || report.bytes <= 0 || report.bytes > 32 * 1024 * 1024
    || run.artifacts.filter(item => item?.id === report.id).length !== 1) {
    fail('原故障运行没有唯一、合法且不超过32MiB的HTML产物，不能仅按report标识挑选或回退。')
  }
  return report
}

/** 保留公开 getter 的原 UTF-8 body；不渲染模板、不拼正文、不执行 URL/路径。 */
export function troubleshootingReportSource(binding, run, artifact) {
  const report = selectTroubleshootingArtifact(binding, run)
  if (!object(artifact) || artifact.isError === true || artifact.ok !== undefined && artifact.ok !== true
    || typeof artifact.body !== 'string' || artifact.filename !== report.filename
    || artifact.contentType !== report.contentType || !htmlMime(artifact.contentType)
    || artifact.id !== undefined && artifact.id !== report.id
    || artifact.artifactId !== undefined && artifact.artifactId !== report.id
    || artifact.run_id !== undefined && artifact.run_id !== binding.run_id
    || artifact.composition_id !== undefined && artifact.composition_id !== binding.composition_id
    || artifact.workflow !== undefined && artifact.workflow !== binding.workflow
    || !matchesParent(binding.parent_session_id, report, artifact)) fail('原故障HTML与Run、产物身份或MIME不一致，未保存。')
  const html = artifact.body, data = Buffer.from(html, 'utf8'), sha256 = hash(html)
  if (data.toString('utf8') !== html
    || !/^\s*<!doctype\s+html(?:\s+[^<>]*)?>\s*(?:<!--[\s\S]*?-->\s*)*<html(?:\s+[^<>]*)?>[\s\S]*<\/html>\s*$/iu.test(html)) {
    fail('原故障产物不是完整UTF-8 HTML，未截断或重绘。')
  }
  if (data.byteLength !== report.bytes || data.byteLength > 32 * 1024 * 1024
    || artifact.bytes !== undefined && artifact.bytes !== data.byteLength) fail('原故障HTML字节数与产物元数据不一致。')
  for (const value of [report, artifact, report.metadata, artifact.metadata].filter(object)) {
    if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !/^[a-f\d]{64}$/iu.test(value.sha256)
      || value.sha256.toLowerCase() !== sha256)) fail('原故障HTML SHA-256与产物元数据不一致。')
    if (value.bytes !== undefined && value.bytes !== data.byteLength
      || value.filename !== undefined && value.filename !== report.filename
      || value.contentType !== undefined && value.contentType !== report.contentType
      || ['id', 'artifactId', 'artifact_id'].some(key => value[key] !== undefined && value[key] !== report.id)
      || value.run_id !== undefined && value.run_id !== binding.run_id
      || value.composition_id !== undefined && value.composition_id !== binding.composition_id
      || value.workflow !== undefined && value.workflow !== binding.workflow
      || !matchesParent(binding.parent_session_id, value)) fail('原故障产物身份、字节或额外metadata与原运行不一致。')
  }
  for (const [key, value] of Object.entries(report)) {
    if (['id', 'filename', 'contentType', 'bytes', 'sha256'].includes(key)) continue
    // 公开get_artifact只保证filename/contentType/body；不要求回显descriptor的任意额外字段。
    if (Object.hasOwn(artifact, key) && !sameJson(value, artifact[key])) fail('原故障产物双方提供的额外metadata冲突。')
  }
  const sourceBase = { kind: 'fault-troubleshooting', ...binding, artifact_id: report.id,
    original_filename: report.filename, original_content_type: report.contentType,
    original_sha256: sha256, original_sha256_scope: 'sha256-of-original-utf8-body', original_bytes: data.byteLength,
    artifact_metadata: { ...report }, artifact_response_metadata: Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== 'body')) }
  return { html, filename: report.filename,
    source: Object.freeze({ ...sourceBase, source_sha256: hash(JSON.stringify(sourceBase)) }) }
}

/** 直接子来源必须先在父原生日志中证实，调用方随后才能读取该 childId。 */
export function selectFaultChild(parentId, input, childId) {
  if (!identifier(parentId) || childId !== undefined && (!identifier(childId) || childId === parentId)) {
    fail('故障报告主/子会话标识无效。')
  }
  const events = ownEvents(input), pairs = successfulPairs(events)
    .filter(pair => pair.call.data.name === 'delegate_fault_analysis')
  const candidates = []
  for (const catalog of events.filter(event => event.type === 'subagent/catalog')) {
    const data = catalog.data, id = data.childId
    if (childId !== undefined && id !== childId) continue
    if (!identifier(id) || id === parentId || data.version !== 0 || data.mode !== 'continuable'
      || !integer(data.childCreatedAt)) continue
    const catalogs = events.filter(event => event.type === 'subagent/catalog' && event.data.childId === id)
    if (catalogs.length !== 1) fail('故障子任务目录身份重复或冲突，不能选择报告来源。')
    const matches = pairs.filter(pair => textOnly(pair.receipt.data.message.content) === `started subagent ${id}`)
    if (matches.length !== 1) continue
    const { call, receipt, args } = matches[0]
    if (!(call.seq < catalog.seq && catalog.seq < receipt.seq)
      || typeof args.prompt !== 'string' || !args.prompt.trim()) continue
    const notices = events.filter(event => event.type === 'user/message' && event.data.role === 'user'
      && event.data.source?.kind === 'subagent-settled' && event.data.source.form === 'notice'
      && typeof event.data.source.summary === 'string' && event.data.source.senderSessionId === id
      && event.seq > receipt.seq)
    // 重复投递不使只读导出失效，也不能把旧任务伪装成最近新任务。
    const notice = notices[0]
    if (!notice || !integer(notice.time) || notice.time < data.childCreatedAt) continue
    const user = events.findLast(event => event.seq < call.seq && event.type === 'user/message'
      && event.data.role === 'user' && event.data.source?.kind === 'user')
    const request = visibleText(user?.data.content)
    if (!user || !identifier(user.data.id) || !request.trim()) continue
    candidates.push(Object.freeze({ parentId, childId: id, childCreatedAt: data.childCreatedAt,
      delegateCallId: call.data.callId, request, userMessageId: user.data.id, requestSeq: user.seq,
      delegateSeq: call.seq, receiptSeq: receipt.seq, noticeSeq: notice.seq, noticeTime: notice.time }))
  }
  candidates.sort((left, right) => right.noticeSeq - left.noticeSeq)
  if (!candidates.length) fail('本会话没有已证实完成的故障分析委派，不能读取任意会话或导出启动回执。')
  const selected = candidates[0]
  if (childId === undefined && rootReadonlyPairs(events).some(pair => pair.receipt.seq > selected.noticeSeq)) {
    fail('主助手已有更新证据，请用analysis导出完整分析；不能仅保存补证前的旧子任务正文。')
  }
  return selected
}

function startupOnly(body) {
  const value = body.trim()
  return /^started subagent \S+$/u.test(value)
    || /^已启动故障分析子智能体[。.!！]?(?:\s*任务[：:][^\n]*)?(?:\s*结果将在任务结束后返回[。.!！]?)?$/u.test(value)
}

/** 渲染既有只读分析；不进行新的诊断、推理、处置或外部持久化。 */
export function faultReportSource(binding, snapshot) {
  if (!object(binding) || !identifier(binding.parentId) || !identifier(binding.childId)
    || binding.parentId === binding.childId || !identifier(binding.delegateCallId)
    || !identifier(binding.userMessageId) || typeof binding.request !== 'string' || !binding.request.trim()
    || !['childCreatedAt', 'requestSeq', 'delegateSeq', 'receiptSeq', 'noticeSeq', 'noticeTime'].every(key => integer(binding[key]))
    || !(binding.requestSeq < binding.delegateSeq && binding.delegateSeq < binding.receiptSeq
      && binding.receiptSeq < binding.noticeSeq)) fail('故障报告缺少受管选择的真实来源绑定。')
  const header = snapshot?.session
  if (!object(header) || header.id !== binding.childId || header.createdAt !== binding.childCreatedAt
    || header.origin !== 'subagent' || header.isSeeded !== false || snapshot.inheritedEventCount !== 0
    || header.delegationDepth !== undefined && header.delegationDepth !== 1
    || header.agentPreset !== undefined && header.agentPreset !== 'security-operations-fault-analysis') {
    fail('故障子会话快照与父目录不一致，或包含继承/其他角色内容。')
  }
  const events = ownEvents(snapshot.events)
  const start = events.findLast(event => event.type === 'turn/start')
  const end = events.findLast(event => event.type === 'turn/end')
  if (!start || !end || !integer(start.data.turn) || end.seq <= start.seq
    || end.data.turn !== start.data.turn || end.data.reason?.kind !== 'completed'
    || !integer(end.time) || end.time < binding.childCreatedAt || end.time > binding.noticeTime
    || events.filter(event => event.type === 'turn/end' && event.data.turn === end.data.turn).length !== 1) {
    fail('故障子任务没有与原生完成通知匹配的成功终态，不能导出运行中、失败或后续改动的结果。')
  }
  const tail = events.filter(event => event.seq > start.seq && event.seq < end.seq
    && ['assistant/message', 'tool/call', 'tool/result', 'user/message', 'assistant/attempt'].includes(event.type)).at(-1)
  const message = tail?.data?.message
  if (tail?.type !== 'assistant/message' || tail.data.turn !== end.data.turn || tail.data.interrupted === true
    || message?.role !== 'assistant' || message.source?.kind !== 'model'
    || !identifier(message.id) || typeof message.source.provider !== 'string' || !message.source.provider
    || typeof message.source.model !== 'string' || !message.source.model
    || !Array.isArray(message.content) || message.content.some(part => !object(part)
      || !['text', 'reasoning'].includes(part.type) || typeof part.text !== 'string')) {
    fail('故障子任务没有真实、完整的最终助手正文，不能把工具回执或未完成片段当报告。')
  }
  // reasoning 块不是用户可见正文，永不写入报告。
  const body = visibleText(message.content)
  if (!body.trim() || startupOnly(body)) fail('故障分析结果为空或只有启动通知，不能生成内容报告。')
  const sourceBase = {
    kind: 'fault-readonly', parent_session_id: binding.parentId, child_session_id: binding.childId,
    child_created_at: binding.childCreatedAt, delegate_call_id: binding.delegateCallId,
    user_message_id: binding.userMessageId, request_seq: binding.requestSeq, delegate_seq: binding.delegateSeq,
    receipt_seq: binding.receiptSeq, notice_seq: binding.noticeSeq, result_seq: tail.seq,
    completed_turn: end.data.turn, completed_seq: end.seq, completed_at: new Date(end.time).toISOString(),
    request_sha256: hash(binding.request), content_sha256: hash(body),
  }
  const source = Object.freeze({ ...sourceBase, source_sha256: hash(JSON.stringify(sourceBase)) })
  const rows = [
    ['报告性质', '只读取证与分析；不是外部平台诊断归档，不表示问题已修复或已执行处置'],
    ['分析完成时间（UTC）', source.completed_at], ['主会话', source.parent_session_id],
    ['故障子会话', source.child_session_id], ['委派调用', source.delegate_call_id],
    ['原用户消息', source.user_message_id], ['请求事件序号', source.request_seq],
    ['委派/启动回执/完成通知序号', `${source.delegate_seq} / ${source.receipt_seq} / ${source.notice_seq}`],
    ['最终正文/成功终态序号', `${source.result_seq} / ${source.completed_seq}`],
    ['原请求 SHA-256', source.request_sha256], ['原正文 SHA-256', source.content_sha256],
    ['来源记录 SHA-256', source.source_sha256],
  ]
  return { html: renderFaultHtml(binding.request, body, rows), source }
}

function renderFaultHtml(request, body, rows, options = {}) {
  const note = options.note ?? '只读取证与分析。原文中的事实、推断、证据缺口与未执行建议均按原文保留；未列出的内容不补造。生成本文件不会重新取证、主动探测、执行处置或证明问题已修复。'
  const bodyTitle = options.bodyTitle ?? '只读取证与分析正文（原文）'
  const html = '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'">'
    + '<meta name="referrer" content="no-referrer"><title>故障排查报告（只读取证与分析）</title>'
    + '<style>html{color-scheme:light}body{margin:0;background:#f3f5f7;color:#202a36;font:16px/1.7 system-ui,sans-serif}.paper{max-width:1040px;margin:32px auto;padding:36px;background:white;border:1px solid #dfe5eb;border-radius:12px}h1{font-size:27px;margin:0 0 12px}h2{font-size:20px;margin-top:28px}.note{padding:12px 16px;border-left:4px solid #56728e;background:#edf3f8}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;margin:0}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #dfe5eb;padding:9px 12px;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{width:27%;font-weight:600}@media(max-width:600px){.paper{margin:0;padding:20px;border:0;border-radius:0}th{width:32%}}@media print{body{background:white}.paper{margin:0;max-width:none;border:0;padding:0}}</style>'
    + '</head><body><main class="paper"><h1>故障排查报告</h1>'
    + '<p class="note">' + escape(note) + '</p>'
    + '<section><h2>原用户请求</h2><pre>' + escape(request) + '</pre></section>'
    + '<section><h2>' + escape(bodyTitle) + '</h2><pre>' + escape(body) + '</pre></section>'
    + (options.extra ?? '')
    + '<section><h2>来源与完整性</h2><p>以下标识和哈希用于回溯原始记录；来源可追溯不代表分析结论已被独立验证。</p><table><tbody>'
    + rows.map(([label, value]) => '<tr><th scope="row">' + escape(label) + '</th><td>' + escape(value) + '</td></tr>').join('')
    + '</tbody></table></section></main></body></html>\n'
  return html
}

const faultReadSources = new Set([
  'mcp__sec-ops__get_event_by_id',
  'mcp__sec-ops__get_ingest_devices_by_asset_by_asset_id',
])
const faultReadonlyName = name => typeof name === 'string' && (faultReadSources.has(name)
  || name.startsWith('mcp__soc-readonly__') && identifier(name.slice('mcp__soc-readonly__'.length)))

function requestBefore(events, seq) {
  const user = events.findLast(event => event.seq < seq && event.type === 'user/message'
    && event.data.role === 'user' && event.data.source?.kind === 'user')
  const request = visibleText(user?.data.content)
  return user && identifier(user.data.id) && request.trim() ? { user, request } : undefined
}

function receiptFailed(pair) {
  if (pair.isError) return true
  let value = parseObject(textOnly(pair.receipt.data.message.content))
  for (let depth = 0; object(value) && depth < 4; depth++) {
    if (value.isError === true || value.ok === false) return true
    if (Object.hasOwn(value, 'code') && Object.hasOwn(value, 'data')
      && /^\d+$/u.test(String(value.code)) && String(value.code) !== '200') return true
    if (object(value.structuredContent)) { value = value.structuredContent; continue }
    if (Array.isArray(value.content)) { value = parseObject(textOnly(value.content)); continue }
    break
  }
  return false
}

function rootReadonlyPairs(events, canonicalName = name => name) {
  const pairs = []
  for (const pair of successfulPairs(events, true)) {
    const toolName = canonicalName(pair.call.data.name)
    if (!faultReadonlyName(toolName) || !Array.isArray(pair.receipt.data.message.content)) continue
    const request = requestBefore(events, pair.call.seq)
    if (!request) continue
    pairs.push({ ...pair, ...request, toolName })
  }
  return pairs
}

/** Root 身份由 Runtime 核实；本函数只绑定该 Root 原生日志中已有的只读回执。 */
export function mainFaultReportSource(parentId, input, analysis, evidenceCallIds, canonicalName = name => name) {
  if (!identifier(parentId) || typeof analysis !== 'string' || !analysis.trim() || startupOnly(analysis)) {
    fail('主助手故障报告需要真实主会话和非空的可见分析正文。')
  }
  if (typeof canonicalName !== 'function') fail('故障只读来源解析器无效。')
  const events = ownEvents(input), available = rootReadonlyPairs(events, canonicalName)
  let selected
  if (evidenceCallIds !== undefined) {
    if (!Array.isArray(evidenceCallIds) || evidenceCallIds.length === 0
      || evidenceCallIds.some(id => !identifier(id)) || new Set(evidenceCallIds).size !== evidenceCallIds.length) {
      fail('故障证据调用标识必须是非空、无重复的本会话真实调用集合。')
    }
    selected = evidenceCallIds.map(id => {
      const matches = available.filter(pair => pair.call.data.callId === id)
      if (matches.length !== 1) fail('指定证据不是本会话可核验的只读调用/回执配对；不能使用用户JSON、子日志或未知调用。')
      return matches[0]
    })
  } else {
    // 下载等新消息尚未取证时，仍可选最近一次真正含回执的用户批次。
    const requestSeq = available.reduce((latest, pair) => Math.max(latest, pair.user.seq), -1)
    selected = available.filter(pair => pair.user.seq === requestSeq)
  }
  if (!selected.length) fail('本会话没有真实只读回执，不能仅凭模型正文生成有事实来源的故障报告。')
  selected.sort((left, right) => left.receipt.seq - right.receipt.seq)
  const requests = [...new Map(selected.map(pair => [pair.user.data.id, { user: pair.user, request: pair.request }])).values()]
    .sort((left, right) => left.user.seq - right.user.seq)
  const primary = requests.at(-1), last = selected.at(-1)
  if (!integer(last.receipt.time) || !Number.isFinite(new Date(last.receipt.time).getTime())) {
    fail('故障证据没有可核验的原生回执时间，不能补造证据时点。')
  }
  const evidence = selected.map(pair => {
    const isError = receiptFailed(pair)
    const projection = { projection: 'native-tool-result.visible-text/v1', is_error: isError,
      content: pair.receipt.data.message.content.filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => ({ type: 'text', text: part.text })) }
    return Object.freeze({ call_id: pair.call.data.callId, tool_name: pair.toolName,
      call_seq: pair.call.seq, result_seq: pair.receipt.seq, is_error: isError,
      user_message_id: pair.user.data.id, request_seq: pair.user.seq,
      receipt_projection: projection.projection, receipt_sha256: hash(JSON.stringify(projection)) })
  })
  const sourceBase = { kind: 'fault-main-readonly', parent_session_id: parentId,
    user_message_id: primary.user.data.id, request_seq: primary.user.seq,
    evidence, evidence_until_seq: last.receipt.seq, evidence_until_utc: new Date(last.receipt.time).toISOString(),
    requests: requests.map(item => ({ user_message_id: item.user.data.id, request_seq: item.user.seq,
      request_sha256: hash(item.request) })),
    receipt_hash_scope: '仅已保留的原生工具结果可见text投影及错误标记，不是完整HTTP响应或canonical原文',
    request_sha256: hash(primary.request), content_sha256: hash(analysis) }
  const source = Object.freeze({ ...sourceBase, source_sha256: hash(JSON.stringify(sourceBase)) })
  const rows = [
    ['报告性质', '主助手依据本会话真实只读回执整理的可见分析；不是独立子任务原文、外部诊断归档或修复证明'],
    ['证据截止时间（UTC）', source.evidence_until_utc], ['主会话', parentId],
    ['最近取证请求消息', source.user_message_id], ['最近取证请求事件序号', source.request_seq],
    ['真实回执数', evidence.length], ['标记失败的回执数', evidence.filter(item => item.is_error).length],
    ['回执哈希范围', source.receipt_hash_scope], ['最近原请求 SHA-256', source.request_sha256],
    ['可见分析正文 SHA-256', source.content_sha256], ['来源记录 SHA-256', source.source_sha256],
  ]
  const requestHtml = requests.map(item => '<details><summary>取证请求 · ' + escape(item.user.data.id)
    + ' · 事件 ' + escape(item.user.seq) + '</summary><pre>' + escape(item.request) + '</pre></details>').join('')
  const evidenceHtml = evidence.map((item, index) => '<details><summary>回执 ' + escape(item.call_id) + ' · '
    + escape(item.tool_name) + ' · ' + (item.is_error ? '失败/已尝试' : '已返回，业务结论见原文')
    + '</summary><p>调用/结果事件：' + escape(item.call_seq) + ' / ' + escape(item.result_seq)
    + '；所属用户请求：' + escape(item.user_message_id) + '；可见投影 SHA-256：'
    + escape(item.receipt_sha256) + '</p><pre>' + escape(visibleText(selected[index].receipt.data.message.content))
    + '</pre></details>').join('')
  const html = renderFaultHtml(primary.request, analysis, rows, {
    note: '只读取证与分析。本报告正文由主助手依据所绑定的真实回执整理，语义判断由主助手承担；不是独立子任务原文。事实、推断、证据缺口与未执行建议按正文保留，不自动证明结论正确或问题已修复。导出不会重新查询、探测或处置。',
    bodyTitle: '主助手可见分析正文',
    extra: '<section><h2>取证所对应的真实请求</h2>' + requestHtml + '</section>'
      + '<section><h2>已保留的回执可见投影</h2><p>这里只保存本会话实际保留的可见文字，可能包含错误、截断或缺失；不是完整HTTP响应或canonical原文。非错误回执也不自动等于业务成功。</p>'
      + evidenceHtml + '</section>',
  })
  return { html, source }
}

function validSavedReport(value, parentId, kind, args) {
  if (!object(value) || value.schema_version !== 'security-report/v1' || value.kind !== kind
    || value.session_id !== parentId || !identifier(value.attachment_id) || !object(value.source)
    || typeof value.filename !== 'string' || !/\.html$/iu.test(value.filename)
    || /[\\/\u0000-\u001f\u007f]/u.test(value.filename)
    || typeof value.file_path !== 'string' || !value.file_path.startsWith('/')
    || /[\u0000-\u001f\u007f]/u.test(value.file_path) || value.file_path.split(/[\\/]/u).includes('..')
    || !Number.isSafeInteger(value.bytes) || value.bytes <= 0
    || typeof value.sha256 !== 'string' || !/^[a-f\d]{64}$/iu.test(value.sha256)
    || value.attachment_id !== `sha256:${value.sha256.toLowerCase()}`
    || value.content_type !== 'text/html; charset=utf-8'
    || args.attachment_id !== undefined && args.attachment_id !== value.attachment_id
    || kind === 'fault' && value.source.parent_session_id !== parentId
    || args.run_id !== undefined && value.source.run_id !== args.run_id
    || args.child_id !== undefined && value.source.child_session_id !== args.child_id) return false
  return true
}

const savedIdentityFields = ['schema_version', 'kind', 'session_id', 'attachment_id', 'file_path',
  'filename', 'content_type', 'bytes', 'sha256', 'source']
const savedPublicFields = [...savedIdentityFields, 'generated_at', 'message']
const stableReportJson = value => JSON.stringify(value, (_key, item) => object(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
function savedFieldsConflict(left, right) {
  return savedIdentityFields.some(key => Object.hasOwn(left, key) && Object.hasOwn(right, key)
    && stableReportJson(key === 'sha256' && typeof left[key] === 'string' ? left[key].toLowerCase() : left[key])
      !== stableReportJson(key === 'sha256' && typeof right[key] === 'string' ? right[key].toLowerCase() : right[key]))
}

function isOpaqueMcp(name) {
  if (typeof name !== 'string' || !name.startsWith('mcp__')) return false
  // 只用于保守阻止旧文件静默复用；未知来源绝不因此变成合法取证能力。
  const knownGroups = ['soc-readonly', 'sec-ops', 'inspection-compositions', 'troubleshooting-compositions', 'policy-configuration', 'emergency-action', 'asset-management']
  return !knownGroups.some(group => name.startsWith(`mcp__${group}__`))
}

function hasNewTroubleshootingSource(events, cutoff, canonicalName) {
  if (events.some(event => {
    if (event.seq <= cutoff) return false
    if (event.type === 'tool/call' && troubleshootingTools.has(canonicalName(event.data.name))) return true
    return uncertainTroubleshootingReceipt(event, events, canonicalName)
  })) return true
  for (const pair of successfulPairs(events, true)) {
    if (pair.receipt.seq <= cutoff) continue
    const name = canonicalName(pair.call.data.name)
    if (troubleshootingTools.has(name)) return true
    if (name === 'mcp__troubleshooting-compositions__get_composition_run') {
      const value = inspectionValue(pair.receipt.data.message)
      if (pair.isError || !value || value.status !== 'completed') return true
    }
    if (name === 'mcp__troubleshooting-compositions__get_composition_artifact' && receiptFailed(pair)) return true
  }
  return false
}

function hasNewReportSource(parentId, events, kind, cutoff, canonicalName, newTroubleshooting) {
  if (newTroubleshooting) return true
  const pairs = successfulPairs(events, true)
  for (const pair of pairs) {
    if (pair.receipt.seq <= cutoff || !requestBefore(events, pair.call.seq)) continue
    const name = canonicalName(pair.call.data.name)
    if (isOpaqueMcp(name ?? pair.call.data.name)) return true
    if (kind === 'fault' && faultReadonlyName(name)) return true
    if (kind === 'inspection' && (inspectionTools.has(name)
      || ['get_composition_run', 'get_composition_details', 'get_composition_artifact']
        .some(raw => name === `mcp__inspection-compositions__${raw}`))) return true
  }
  if (kind !== 'fault') return false
  if (events.some(event => event.seq > cutoff && event.type === 'tool/call'
    && event.data.name === 'delegate_fault_analysis' && identifier(event.data.callId)
    && requestBefore(events, event.seq))) return true
  const children = new Set()
  for (const event of events) {
    if (event.type !== 'user/message' || event.data.source?.kind !== 'subagent-settled') continue
    const childId = event.data.source.senderSessionId
    if (!identifier(childId) || children.has(childId)) continue
    children.add(childId)
    try {
      // 显式选择只核原始直接子来源，不把同child重复通知当作新的分析。
      if (selectFaultChild(parentId, events, childId).noticeSeq > cutoff) return true
    } catch { /* 未证实的通知不能自行建立新的报告来源。 */ }
  }
  return false
}

/** 只复用本会话真实导出回执；不探测路径、不读文件、不重建附件。 */
export function selectSavedSecurityReport(parentId, input, kind, attachmentId, canonicalName = name => name) {
  if (!identifier(parentId) || !['inspection', 'fault'].includes(kind)) fail('已保存报告的主会话或类型无效。')
  if (typeof canonicalName !== 'function') fail('已保存报告工具来源解析器无效。')
  if (attachmentId !== undefined && !identifier(attachmentId)) return undefined
  const events = ownEvents(input), records = []
  for (const pair of successfulPairs(events)) {
    if (pair.call.data.name !== 'export_security_report' || pair.args.kind !== kind) continue
    const body = parseObject(textOnly(pair.receipt.data.message.content))
    const rawMeta = pair.receipt.data.meta
    const meta = object(rawMeta) && rawMeta.schema_version === 'security-report/v1' ? rawMeta : undefined
    const value = meta ?? body
    if (!validSavedReport(value, parentId, kind, pair.args)) continue
    if (kind === 'fault' && value.source.kind === 'fault-troubleshooting') {
      // 再交付不能替原导出建立来源；绑定必须已存在于该次export调用之前的当前Root日志。
      let binding
      try { binding = selectTroubleshootingRun(parentId, events.filter(event => event.seq < pair.call.seq), value.source.run_id, canonicalName) }
      catch { continue }
      if (binding && pair.args.attachment_id !== undefined
        && hasNewTroubleshootingSource(events.filter(event => event.seq < pair.call.seq), binding.start_result_seq, canonicalName)) continue
      if (!binding || Object.entries(binding).some(([key, item]) => !sameJson(item, value.source[key]))
        || value.filename !== value.source.original_filename || value.bytes !== value.source.original_bytes
        || value.sha256.toLowerCase() !== value.source.original_sha256
        || !object(value.source.artifact_metadata) || value.source.artifact_metadata.id !== value.source.artifact_id
        || value.source.artifact_metadata.filename !== value.filename || value.source.artifact_metadata.bytes !== value.bytes
        || value.source.artifact_metadata.contentType !== value.source.original_content_type) continue
      const { source_sha256, ...sourceBase } = value.source
      if (source_sha256 !== hash(JSON.stringify(sourceBase))) continue
    } else if (kind === 'fault') {
      if (pair.args.run_id !== undefined) continue
      // 新流程已经开始后，晚保存的legacy来源也不能冒充本会话最新合法故障报告。
      try {
        if (selectTroubleshootingRun(parentId, events.filter(event => event.seq < pair.call.seq), undefined, canonicalName)) continue
      } catch { continue }
    }
    // 正文即使缺字段或MIME无效，只要声明v1，明确提供的身份/来源冲突仍须拒绝。
    // 缺失/无法解析的裁剪正文不补字段，也不覆盖完整meta。
    if (meta !== undefined && object(body) && body.schema_version === 'security-report/v1'
      && savedFieldsConflict(meta, body)) continue
    if (attachmentId !== undefined && value.attachment_id !== attachmentId) continue
    records.push({ value, receipt_seq: pair.receipt.seq })
  }
  if (!records.length) return undefined
  records.sort((left, right) => left.receipt_seq - right.receipt_seq)
  const selected = records.at(-1)
  const sameAttachment = records.filter(item => item.value.attachment_id === selected.value.attachment_id)
  if (sameAttachment.some(item => savedFieldsConflict(item.value, selected.value))) return undefined
  const original = sameAttachment[0]
  let cutoff = original.receipt_seq
  const source = original.value.source
  if (kind === 'fault') {
    const evidenceSeqs = Array.isArray(source.evidence) ? source.evidence.map(item => item?.result_seq).filter(integer) : []
    const sourceSeq = source.kind === 'fault-troubleshooting' ? source.start_result_seq
      : evidenceSeqs.length ? Math.max(...evidenceSeqs) : source.notice_seq
    if (integer(sourceSeq)) cutoff = Math.min(cutoff, sourceSeq)
  }
  const value = Object.fromEntries(savedPublicFields.filter(key => Object.hasOwn(selected.value, key)
    && (!['generated_at', 'message'].includes(key) || typeof selected.value[key] === 'string'))
    .map(key => [key, selected.value[key]]))
  const newTroubleshooting = kind === 'fault' && hasNewTroubleshootingSource(events, cutoff, canonicalName)
  return { value, receipt_seq: selected.receipt_seq, has_new_troubleshooting_source: newTroubleshooting,
    has_new_source: hasNewReportSource(parentId, events, kind, cutoff, canonicalName, newTroubleshooting) }
}
