// 仅从原生已提交事件派生私有分析线索；缓存只是定向读取提示，绝不作为授权。
const textOnly = content => Array.isArray(content) && content.length > 0
  && content.every(b => b?.type === 'text' && typeof b.text === 'string')
  ? content.map(b => b.text).join('') : undefined

const limit = 256, lifetime = 30 * 60 * 1000
const ids = text => [...new Set(text.match(/\bINC-\d{8}-\d{6}(?![A-Za-z0-9_-])/g) ?? [])]
const realUser = e => e?.type === 'user/message' && e.data?.role === 'user' && e.data?.source?.kind === 'user'
const argsOf = e => { try { return JSON.parse(e.data.arguments) } catch { return undefined } }
const ordered = events => Array.isArray(events) && events.every((e, i) => Number.isSafeInteger(e?.seq)
  && (i === 0 || e.seq > events[i - 1].seq))
const ref = (sessionId, event) => `session:${sessionId}/event:${event.seq}`
const unchanged = (events, user) => !events.some(e => e.seq > user.seq && (realUser(e)
  || e.type === 'agent/inbox/spliced' && e.data?.inserted?.some(m => m.source?.kind === 'user')))
const unseeded = snapshot => snapshot?.session?.isSeeded === false && snapshot.inheritedEventCount === 0
  && ordered(snapshot.events)
// 原生SessionHeader仅对子会话标origin=subagent；普通根可省略depth（等同0）。
// 仍要求明确非seed/零继承及无父，不从模型内容或工具参数推断根身份。
const root = snapshot => unseeded(snapshot) && snapshot.session.version === 4
  && snapshot.session.origin === undefined && snapshot.session.parentSession === undefined
  && (snapshot.session.delegationDepth === undefined || snapshot.session.delegationDepth === 0)
function paired(call, receipt) {
  const m = receipt?.data?.message
  return call?.type === 'tool/call' && receipt?.type === 'tool/result' && call.seq < receipt.seq
    && m?.role === 'tool' && m.source?.kind === 'tool' && m.isError === false
    && m.toolCallId === call.data.callId && m.source.callId === call.data.callId
    && Number.isSafeInteger(call.data.turn) && Number.isSafeInteger(call.data.step)
    && call.data.turn === receipt.data.turn && call.data.step === receipt.data.step
    && (receipt.sourceEventSeqs === undefined || Array.isArray(receipt.sourceEventSeqs)
      && receipt.sourceEventSeqs.includes(call.seq))
}
function userClues(sessionId, user, incidentId) {
  // 只规范化恰好包住事件 ID 的简单配对引号，不剥掉整句引述。
  const raw = textOnly(user?.data?.content)
  if (!realUser(user) || typeof user.data.id !== 'string' || !user.data.id || !raw || raw.length > 4000) return undefined
  const text = raw.replace(/`(INC-\d{8}-\d{6})`|"(INC-\d{8}-\d{6})"|'(INC-\d{8}-\d{6})'|“(INC-\d{8}-\d{6})”|‘(INC-\d{8}-\d{6})’/g,
    (_match, ...groups) => groups.slice(0, 5).find(Boolean)).trim()
  const unique = ids(text)
  // 仅屏蔽明确的数据可引用性描述；重复/反复引用、引用此命令等仍按引述拒绝。
  // 原消息、原生来源、引号/示例/条件及后续否定检查不改，不从工具参数授信。
  const quotationScan = text.replace(/可引用的(?:证据|依据|资料|事实|文档|材料)/gu, '可追溯的资料')
    .replace(/可引用(?=且(?:能|可)[^。；\n，,]{0,64}的(?:覆盖缺口|问题|证据|依据|资料|事实|材料))/gu, '可追溯')
  if (unique.length !== 1 || unique[0] !== incidentId || /[「」『』“”‘’"'`<>]|(?:^|\n)\s*>/u.test(text)
    || /引用|转述|原话|示例|样例|假设|如果|假如|倘若|若是/u.test(quotationScan)) return undefined
  // 仅规则分析是只读请求；“不要执行，只分析规则”不撤销分析意图，疑问句也可明确要求分析。
  if (/(?:不要|别|禁止|不必|无需|不需要|暂不|先不|不再|不允许|不准)\s*(?:再|进行|做|生成|给出|输出)?\s*(?:规则(?:优化|分析|检查|建议|审阅)|(?:分析|检查|核查|审查|审阅|优化|排查|复核)\s*(?:任何|这些|本|该)?\s*(?:检测|关联)?规则)/u.test(text)
    || /(?:不要|别|禁止|不必|无需|不需要|暂不|先不|不再|不允许|不准)(?!\s*(?:再\s*)?(?:执行|创建|修改|启用|下发|处置))\s*[^。；\n，,]{0,160}(?:检测规则|关联规则|规则逻辑|规则)(?:的)?\s*(?:[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}\s*)?(?:进行|做)?\s*(?:专项)?(?:分析|检查|核查|审查|审阅|优化|排查|复核)/u.test(text)) return undefined
  const reference = ref(sessionId, user)
  const request = text.replaceAll(incidentId, '')
  const explicit = !/默认|自动(?:开启|启用)/u.test(request) && (
    /(?:分析|检查|核查|审查|审阅|优化|排查|复核)(?:一下)?\s*(?:(?:本|该|这个|此)?(?:事件|告警)(?:的)?\s*)?(?:(?:对应|相关|关联|检测)(?:的)?\s*)?(?:检测规则|关联规则|规则逻辑|规则)/u.test(request)
    || /(?:检测规则|关联规则|规则逻辑|规则)(?:的)?\s*(?:[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}\s*)?(?:进行|做)?\s*(?:专项)?(?:分析|检查|核查|审查|审阅|优化|排查|复核)/u.test(request))
  // 用户报告只产生待核实线索；固定摘要不复制原用户全文，也不认定缺陷。
  const tests = [
    ['REDUNDANT_EVIDENCE_REUSE', /(?:同一|相同)[^。；\n]{0,16}(?:证据|日志)[^。；\n]{0,28}(?:无益重复|重复(?:使用|引用|计入|计数)|反复(?:使用|引用|计入))/u,
      '用户报告同一证据被重复引用或计入；仅为待取证核对的重复利用线索，未确认规则缺陷。'],
    ['UNRELATED_ENTITY_MIXING', /(?:无关|不相关|不属于该事件的)[^。；\n]{0,18}(?:主机|IP|地址|账号|账户|资产|对象|实体)[^。；\n]{0,20}(?:混入|混合|计入|关联到)|(?:混入|混合|计入)[^。；\n]{0,18}(?:无关|不相关)[^。；\n]{0,12}(?:主机|IP|地址|账号|账户|资产|对象|实体)/u,
      '用户报告无关对象被混入本事件证据或关联结果；仅为待核对的对象归属线索，未确认规则缺陷。'],
    ['RULE_DESIGN_MISMATCH', /(?:规则逻辑|规则条件|规则实现)[^。；\n]{0,24}(?:与|和)[^。；\n]{0,12}(?:设计|预期)[^。；\n]{0,12}(?:不符|不一致|相反|冲突)/u,
      '用户报告规则逻辑与设计或预期不符；仅为待核对的设计一致性线索，未确认规则缺陷。'],
  ]
  const anomalies = tests.filter(([, pattern]) => !/模型|AI|助手|研判输出|研判结论|算法输出|是否|怎么|如何|为什么|怀疑|可能|[?？]|未发现|未观察到|没有发现|没有证据|不存在|并非|不是|尚无|未见|无(?:异常|重复|缺陷)/u.test(text)
    && pattern.test(text)).map(([code, , message]) => ({
    code, source: reference, evidence_refs: [reference], message,
  }))
  return { explicit_rule_review_requested: explicit,
    explicit_rule_review_source: explicit ? { kind: 'user', reference } : {}, observed_rule_anomalies: anomalies,
    ...(!explicit && !anomalies.length ? { source_gap: 'NO_EXPLICIT_RULE_REVIEW_OR_CONCRETE_ANOMALY' } : {}) }
}

export function createRuleReviewRequestTracker() {
  const calls = new Map(), catalogs = new Map(), children = new Map()
  const key = (parentId, id) => `${parentId}\u0000${id}`
  const prune = map => {
    const now = Date.now()
    for (const [id, value] of map) if (now - value.at >= lifetime) map.delete(id)
    while (map.size > limit) map.delete(map.keys().next().value)
  }
  const remember = (map, id, value) => { map.set(id, { ...value, at: Date.now() }); prune(map) }
  function observe(session, event) {
    const parentId = session?.id
    if (typeof parentId !== 'string' || !parentId || !Number.isSafeInteger(event?.seq)) return
    for (const map of [calls, catalogs, children]) prune(map)
    if (event.type === 'tool/call' && event.data?.name === 'delegate_threat_analysis'
      && typeof event.data.callId === 'string') {
      remember(calls, key(parentId, event.data.callId), { seq: event.seq, parentId,
        callId: event.data.callId, turn: event.data.turn, step: event.data.step })
    } else if (event.type === 'subagent/catalog' && event.data?.version === 0
      && event.data.mode === 'continuable' && typeof event.data.childId === 'string' && event.data.childId
      && event.data.childId !== parentId && event.data.childCreatedAt !== undefined && event.data.childCreatedAt !== null) {
      remember(catalogs, key(parentId, event.data.childId), { seq: event.seq, childId: event.data.childId,
        childCreatedAt: event.data.childCreatedAt })
    } else if (event.type === 'tool/result') {
      const m = event.data?.message, text = textOnly(m?.content)
      const childId = typeof text === 'string' && /^started subagent [^\s]+$/.test(text) ? text.slice(17) : undefined
      const call = calls.get(key(parentId, m?.toolCallId)), catalog = catalogs.get(key(parentId, childId))
      if (!childId || !call || !catalog || !(call.seq < catalog.seq && catalog.seq < event.seq)
        || !paired({ type: 'tool/call', seq: call.seq, data: call }, event)) return
      const old = children.get(childId)
      remember(children, childId, { parentId: old && old.parentId !== parentId ? null : parentId,
        childCreatedAt: catalog.childCreatedAt, callId: call.callId, callSeq: call.seq,
        catalogSeq: catalog.seq, receiptSeq: event.seq })
    }
  }
  async function context(ctx, exec, incidentId, runId) {
    const empty = source_gap => ({ trusted_host: true, incident_id: incidentId, run_id: runId,
      review_context: { explicit_rule_review_requested: false, explicit_rule_review_source: {},
        observed_rule_anomalies: [], source_gap } })
    const sessionId = exec.agent?.session?.id
    if (typeof sessionId !== 'string' || !sessionId || typeof exec.callId !== 'string') return empty('NATIVE_RUN_CONTEXT_MISSING')
    try {
      const current = await ctx.sessionQuery.readSession(sessionId)
      exec.signal.throwIfAborted()
      const events = exec.agent.session.snapshotEvents()
      if (current?.session?.id !== sessionId || !unseeded(current) || !ordered(events)) return empty('CURRENT_SESSION_UNVERIFIED')
      const toolCalls = events.filter(e => e.type === 'tool/call' && e.data?.callId === exec.callId)
      const tool = toolCalls[0]
      if (toolCalls.length !== 1 || tool.data.name !== 'analyze_threat_incident'
        || argsOf(tool)?.incident_id !== incidentId) return empty('MANUAL_INCIDENT_CALL_UNVERIFIED')
      let user, sourceId = sessionId, sourceEvents = events
      if (root(current)) {
        user = events.findLast(e => realUser(e) && e.seq < tool.seq)
      } else if (current.session.origin === 'subagent') {
        prune(children)
        const link = children.get(sessionId)
        if (!link?.parentId || link.parentId === sessionId || current.session.createdAt !== link.childCreatedAt) {
          return empty('DIRECT_PARENT_REFERENCE_MISSING')
        }
        // 只读此原生直接子引用绑定的一个父；不列举或扫描其它 sessions。
        const parent = await ctx.sessionQuery.readSession(link.parentId)
        exec.signal.throwIfAborted()
        if (parent?.session?.id !== link.parentId || !root(parent)) return empty('ROOT_PARENT_UNVERIFIED')
        sourceId = link.parentId; sourceEvents = parent.events
        const delegates = sourceEvents.filter(e => e.type === 'tool/call' && e.data?.callId === link.callId)
        const call = delegates[0]
        const catalogs = sourceEvents.filter(e => e.type === 'subagent/catalog' && e.data?.childId === sessionId && e.data.version === 0)
        const catalog = catalogs[0]
        const receipts = sourceEvents.filter(e => e.type === 'tool/result'
          && textOnly(e.data?.message?.content) === `started subagent ${sessionId}`)
        const receipt = receipts[0]
        const promptIds = ids(typeof argsOf(call)?.prompt === 'string' ? argsOf(call).prompt : '')
        if (delegates.length !== 1 || call.data.name !== 'delegate_threat_analysis' || !paired(call, receipt)
          || catalogs.length !== 1 || catalog.data.version !== 0 || catalog.data.mode !== 'continuable'
          || catalog.data.childCreatedAt !== current.session.createdAt || receipts.length !== 1
          || call.seq !== link.callSeq || catalog.seq !== link.catalogSeq || receipt.seq !== link.receiptSeq
          || !(call.seq < catalog.seq && catalog.seq < receipt.seq)
          || promptIds.length !== 1 || promptIds[0] !== incidentId) return empty('DIRECT_DELEGATION_UNVERIFIED')
        user = sourceEvents.findLast(e => realUser(e) && e.seq < call.seq)
        if (!realUser(user) || sourceEvents.filter(e => e.seq > user.seq && e.type === 'tool/call'
          && e.data?.name === 'delegate_threat_analysis').length !== 1) return empty('DELEGATION_REQUEST_AMBIGUOUS')
        // 只要求原生来源锚点及用户意图不变；正常进度/背景消息追加不撤销分析意图。
        const fresh = await ctx.sessionQuery.readSession(sourceId)
        exec.signal.throwIfAborted()
        const anchors = [user, call, catalog, receipt]
        const preserved = root(fresh) && anchors.every(anchor => {
          const matches = fresh.events.filter(e => e.seq === anchor.seq)
          return matches.length === 1 && JSON.stringify(matches[0]) === JSON.stringify(anchor)
        })
        if (fresh?.session?.id !== sourceId || !preserved || !unchanged(fresh.events, user)
          || fresh.events.filter(e => e.type === 'tool/call' && e.data?.callId === link.callId).length !== 1
          || fresh.events.filter(e => e.type === 'subagent/catalog' && e.data?.childId === sessionId && e.data.version === 0).length !== 1
          || fresh.events.filter(e => e.type === 'tool/result' && textOnly(e.data?.message?.content) === `started subagent ${sessionId}`).length !== 1) {
          return empty('PARENT_REQUEST_CHANGED_DURING_READ')
        }
        sourceEvents = fresh.events
      } else return empty('ROOT_OR_DIRECT_CHILD_REQUIRED')
      if (!realUser(user) || !unchanged(sourceEvents, user)) return empty('USER_REQUEST_MISSING_OR_SUPERSEDED')
      const live = exec.agent.session.snapshotEvents()
      if (!ordered(live) || live.some(e => e.seq > tool.seq && (realUser(e)
        || e.type === 'agent/inbox/spliced' && e.data?.inserted?.some(m => m.source?.kind === 'user')))) {
        return empty('CURRENT_USER_UPDATE_SUPERSEDED')
      }
      const review = userClues(sourceId, user, incidentId)
      return review ? { trusted_host: true, incident_id: incidentId, run_id: runId, review_context: review }
        : empty('USER_RULE_REVIEW_SOURCE_UNVERIFIED')
    } catch {
      exec.signal.throwIfAborted()
      return empty('NATIVE_SESSION_READ_UNAVAILABLE')
    }
  }
  return { observe, context }
}
