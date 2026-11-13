const tool = 'analyze_threat_incident'
const delegate = 'delegate_threat_analysis'
const text = content => typeof content === 'string' ? content : (content ?? []).filter(part => part.type === 'text').map(part => part.text).join('')
const quote = value => String(value ?? '').replace(/[&<>`*_[\]\\|]/g, char => `&#${char.charCodeAt(0)};`).replace(/\r?\n/g, '<br>')
export const incidentIds = value => [...new Set(String(value ?? '').match(/\bINC-\d{8}-\d{6}\b/g) ?? [])]
const ownEvents = events => events.slice(events.findLastIndex(event => event.type === 'session/end-seed' && event.data.inherited === true) + 1)

function pairs(events, name) {
  return events.filter(event => event.type === 'tool/call' && event.data.name === name).flatMap(call => {
    const calls = events.filter(event => event.type === 'tool/call' && event.data.callId === call.data.callId)
    const results = events.filter(event => event.type === 'tool/result' && event.data.message?.toolCallId === call.data.callId)
    if (calls.length !== 1 || results.length !== 1) return []
    const receipt = results[0], message = receipt.data.message
    if (receipt.seq <= call.seq || receipt.data.turn !== call.data.turn || receipt.data.step !== call.data.step
      || message.role !== 'tool' || message.source?.kind !== 'tool' || message.source.callId !== call.data.callId
      || receipt.sourceEventSeqs && !receipt.sourceEventSeqs.includes(call.seq)) return []
    try {
      const args = JSON.parse(call.data.arguments)
      return args && typeof args === 'object' && !Array.isArray(args) ? [{ call, receipt, args }] : []
    } catch { return [] }
  })
}

export function threatTaskGroups(input) {
  const events = ownEvents(input), groups = new Map()
  for (const pair of pairs(events, delegate)) {
    const { call, receipt, args } = pair
    if (receipt.data.message.isError || receipt.data.error || typeof args.prompt !== 'string') continue
    const content = receipt.data.message.content
    if (!Array.isArray(content) || content.length !== 1 || content[0].type !== 'text') continue
    const childId = /^started subagent (\S+)$/.exec(content[0].text)?.[1]
    const catalogs = events.filter(event => event.type === 'subagent/catalog' && event.data.childId === childId)
    const catalog = catalogs[0]
    if (!childId || catalogs.length !== 1 || catalog.data.version !== 0 || catalog.data.mode !== 'continuable'
      || !Number.isSafeInteger(catalog.data.childCreatedAt) || !(call.seq < catalog.seq && catalog.seq < receipt.seq)) continue
    const source = events.findLast(event => event.seq < call.seq && event.type === 'user/message'
      && event.data.role === 'user' && event.data.source?.kind === 'user')
    const request = text(source?.data.content), ids = incidentIds(args.prompt)
    if (!source?.data.id || !request.trim() || !ids.length) continue
    const group = groups.get(source.seq) ?? { source, request, children: [] }
    group.children.push({ ...pair, childId, createdAt: catalog.data.childCreatedAt, ids })
    groups.set(source.seq, group)
  }
  return [...groups.values()].map((group, index) => ({ ...group, label: `研判任务 #${index + 1}` }))
}

export function isThreatNotice(message, groups) {
  return message.role === 'user' && message.source?.kind === 'subagent-settled'
    && message.source.form === 'notice' && typeof message.source.summary === 'string'
    && groups.some(group => group.children.some(child => child.childId === message.source.senderSessionId))
}

function resultsFor(events, ids, turn) {
  const attempts = pairs(events, tool).filter(pair => turn === undefined || pair.call.data.turn === turn)
  return ids.map(id => {
    const matches = attempts.filter(pair => pair.args.incident_id === id)
    if (matches.length !== 1) return { id, status: matches.length ? '结果待核验' : '未完成' }
    const { receipt } = matches[0], value = receipt.data.meta?.threat_analysis
    if (receipt.data.message.isError || receipt.data.error) return { id, status: '执行失败' }
    if (value?.incident_id !== id || !/^run-[a-f0-9-]{36}$/i.test(value.run_id ?? '')
      || typeof value.status !== 'string' || typeof value.delivery?.markdown !== 'string') return { id, status: '结果待核验' }
    if (value.result?.unified_event_id !== undefined && value.result.unified_event_id !== id) return { id, status: '结果待核验' }
    const completed = value.status === 'completed'
    const skipped = value.status === 'claim_failed' && Number(value.error_code) === 409
    return { id, status: completed ? '完成' : skipped ? '已跳过（认领冲突）' : '执行失败', value }
  })
}

function reportLink(value) {
  const url = value?.delivery?.storage?.report?.download_url
  if (typeof url !== 'string' || /[\s<>"'()\\]/.test(url)) return undefined
  try {
    const parsed = new URL(url, 'http://same-origin.invalid')
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password
      || parsed.search || parsed.hash || !parsed.pathname.endsWith(`/threat-analysis/reports/${value.run_id}/download`)) return undefined
    return url
  } catch { return undefined }
}

function renderResults(rows) {
  const completed = rows.filter(row => row.status === '完成').length
  const skipped = rows.filter(row => row.status.startsWith('已跳过')).length
  const failed = rows.filter(row => row.status === '执行失败').length
  const unknown = rows.length - completed - skipped - failed
  const counts = `共 ${rows.length} 个事件：完成 ${completed}，失败 ${failed}，跳过 ${skipped}${unknown ? `，未完成或待核验 ${unknown}` : ''}。`
  if (rows.length === 1) {
    const row = rows[0]
    return `${counts}\n\n事件：${row.id} · ${row.status}\n\n${row.value?.delivery.markdown ?? '未取得可核验的研判结果，请查看任务详情；不据此判断事件性质。'}`
  }
  const table = ['| 事件 ID | 执行状态 | 研判结论 | 置信度 | 报告 |', '| --- | --- | --- | --- | --- |']
  for (const row of rows) {
    const result = row.status === '完成' ? row.value?.result : undefined
    const confidence = result?.confidence_score
    const link = reportLink(row.value)
    table.push(`| ${row.id} | ${row.status} | ${quote(result?.verdict ?? '—')} | ${Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : '—'} | ${link ? `[下载 HTML 报告](${link})` : '暂无可用报告'} |`)
  }
  const failures = rows.filter(row => row.status !== '完成').map(row => `**${row.id} · ${row.status}**\n\n${row.value?.delivery.markdown ?? '未取得可核验的研判结果，请查看任务详情。'}`)
  return `${counts}\n\n${table.join('\n')}\n\n置信度表示结论可信程度，非恶意概率。逐事件证据、推理与运行信息见各自报告；无报告的事件请查看任务详情。${failures.length ? `\n\n${failures.join('\n\n')}` : ''}`
}

export function startedThreatMarkdown(events, turn) {
  const groups = threatTaskGroups(events).filter(group => group.children.some(child => child.receipt.data.turn === turn))
  if (!groups.length) return undefined
  return groups.map(group => {
    const ids = [...new Set(group.children.flatMap(child => child.ids))]
    return `**${group.label} · 已开始**\n\n原始请求：${quote(group.request)}\n\n本次范围：${ids.length} 个事件（${ids.join('、')}）。结果将在本任务结束后统一返回，可继续其他问答。`
  }).join('\n\n')
}

// 多事件沿用单事件工具，每个 ID 只尝试一次；失败不阻塞其余事件，也不扩大子角色权限。
export function manualThreatDelivery(events, turn, header) {
  if (header?.origin !== 'subagent' || header.agentPreset !== 'security-operations-threat-analysis') return undefined
  const last = events.findLast(event => ['tool/result', 'assistant/message', 'user/message'].includes(event.type))
  if (last?.type !== 'tool/result' || last.data.turn !== turn) return undefined
  const start = events.findLast(event => event.type === 'turn/start' && event.data.turn === turn)
  const request = events.findLast(event => event.type === 'user/message' && event.seq > (start?.seq ?? -1) && event.data.source?.kind === 'user')
  const ids = incidentIds(text(request?.data.content))
  const attempts = pairs(events, tool).filter(pair => pair.call.data.turn === turn)
  if (!ids.length || !attempts.some(pair => pair.receipt === last)) return undefined
  const nextId = ids.find(id => !attempts.some(pair => pair.args.incident_id === id))
  if (nextId) return { incident_id: nextId }
  return renderResults(resultsFor(events, ids, turn))
}

export async function settledThreatMarkdown(parentId, input, messages, readSession) {
  const events = ownEvents(input), groups = threatTaskGroups(events)
  const notices = messages.filter(message => isThreatNotice(message, groups))
  if (!notices.length || messages.some(message => ['user', 'schedule'].includes(message.source?.kind)
    || message.source?.kind === 'subagent-settled' && !notices.includes(message))) return undefined
  const output = []
  for (const group of groups.filter(group => group.children.some(child => notices.some(message => message.source.senderSessionId === child.childId)))) {
    const marker = `**${group.label} · 已结束**`
    if (events.some(event => event.type === 'assistant/message' && text(event.data.message?.content).includes(marker))) continue
    const rows = []
    let running = false
    for (const child of group.children) {
      try {
        const snapshot = await readSession(child.childId), header = snapshot?.session
        if (header?.id !== child.childId || header.createdAt !== child.createdAt || header.parentSession !== parentId
          || header.origin !== 'subagent' || header.isSeeded !== false || header.delegationDepth !== 1
          || header.agentPreset !== 'security-operations-threat-analysis' || snapshot.inheritedEventCount !== 0) throw new Error('unbound child')
        const childEvents = snapshot.events
        const start = childEvents.find(event => event.type === 'turn/start')
        const prompt = childEvents.find(event => event.type === 'user/message' && event.data.source?.kind === 'user')
        if (!start || text(prompt?.data.content) !== child.args.prompt) throw new Error('unbound request')
        const end = childEvents.findLast(event => event.type === 'turn/end' && event.data.turn === start?.data.turn)
        if (!end) {
          if (notices.some(notice => notice.source.senderSessionId === child.childId)) {
            rows.push(...child.ids.map(id => ({ id, status: '结果待核验' })))
          } else running = true
          continue
        }
        rows.push(...resultsFor(childEvents, child.ids, start.data.turn))
      } catch {
        rows.push(...child.ids.map(id => ({ id, status: '结果待核验' })))
      }
    }
    if (running) continue
    output.push(`${marker}\n\n原始请求：${quote(group.request)}\n\n${renderResults(rows)}`)
  }
  return output.join('\n\n')
}
