import { canonical } from '../../../src/diagnostic-context.ts'
type Value = Record<string, any>
export const loopConditions = Object.freeze({ sufficient: '证据充分→输出报告', rule: '规则有明确后继→校验并执行下一项', proposal: '无明确分支或存在冲突→受控提议并校验', stop: '无能力、无执行点或预算耗尽→明确停点' })

// 每个方法只完成画布对应的一步；没有隐藏调度循环或跨Run存储。
export function evidenceLoop(components: Value, policy: Value, reassess: (context: any, fact: Value) => void) {
  const state = (context: Value) => context.shared.diagnostic_loop
  const snapshot = (context: Value, extra: Value = {}) => ({ diagnostic_id: context.shared.diagnostic_id ?? context.runId, round: state(context).round, ...extra })
  const stop = (context: Value, reason: string) => { state(context).stop_reason = reason; return snapshot(context, { route: 'stop', reason }) }
  const checks: Value = {
    availability: { component: 'availability', purpose: '固定版本设备可用性复用' },
    identity: { component: 'resolve', purpose: '唯一核对冻结对象' },
    sourceState: { component: 'sourceState', purpose: '区分源SOC状态证据' },
    targetState: { component: 'targetState', purpose: '区分目标SOC状态证据' },
    path: { component: 'path', purpose: '核对原连接配置路径模型' },
    sourceAlerts: { component: 'sourceAlerts', purpose: '读取源历史窗相关告警' },
    targetAlerts: { component: 'targetAlerts', purpose: '读取目标历史窗相关告警' },
    portEvidence: { component: 'readonlyEvidence', purpose: '核对目标原端口的已有监听证据' },
    routeEvidence: { component: 'readonlyEvidence', purpose: '区分原链路路由候选' },
    policyEvidence: { component: 'readonlyEvidence', purpose: '区分原五元组策略证据' },
    pathEvidence: { component: 'readonlyEvidence', purpose: '读取原链路已有路径证据，不发探测' },
    collectionCapability: { component: 'readonlyEvidence', purpose: '疑似离线目标的采集适用性' },
  }
  const fingerprint = (name: string, context: Value) => canonical([name, context.shared.scope.requested, checks[name].purpose])
  // 每轮重算可用规则和区分价值；不是必执行清单，不等待所有分支汇总。
  function nextRule(context: Value) {
    const loop = state(context), assets = context.shared.assets, causes = context.shared.causes
    const unresolved = (ids: string[]) => !causes.length || causes.some((cause: Value) => ids.includes(cause.id) && ['unknown', 'supported', 'insufficient_capability'].includes(cause.status))
    const rules = [
      { check: 'sourceState', ready: !!assets.source, value: 80, ids: ['source-abnormal'], reason: '源身份已唯一，当前状态可区分源端候选' },
      { check: 'targetState', ready: !!assets.target, value: 80, ids: ['target-offline'], reason: '目标身份已唯一，状态检查不依赖源状态结论或时间原子' },
      { check: 'portEvidence', ready: !!assets.target && !!context.shared.scope.requested.port, value: 70, ids: ['service-not-listening'], reason: '原目标和服务已冻结，读取已有监听证据，不依赖源状态' },
      { check: 'policyEvidence', ready: !!assets.source && !!assets.target, value: 65, ids: ['policy-block'], reason: '两端及五元组已冻结，读取已有策略证据' },
      { check: 'pathEvidence', ready: !!assets.source && !!assets.target, value: 60, ids: ['link-abnormal', 'policy-block'], reason: '两端已唯一，读取已有路径证据，不发起探测' },
      { check: 'routeEvidence', ready: !!assets.source && !!assets.target, value: 50, ids: ['link-abnormal'], reason: '两端已唯一，路由候选可补充尚未解释的链路缺口' },
      { check: 'sourceAlerts', ready: !!assets.source && !!context.shared.scope.time.query_window, value: 40, ids: ['source-abnormal'], reason: '已有明确历史窗，读取同源告警补充状态缺口' },
      { check: 'targetAlerts', ready: !!assets.target && !!context.shared.scope.time.query_window, value: 40, ids: ['target-offline', 'service-not-listening'], reason: '已有明确历史窗，读取同目标告警补充独立证据' },
      { check: 'availability', ready: typeof components.availability==='function' && causes.some((cause:Value)=>['source-abnormal','target-offline'].includes(cause.id)&&cause.status==='supported'), value:95, ids:['source-abnormal','target-offline'], reason:'疑似离线按需复用固定版本设备可用性，保留同诊断来源' },
      { check: 'collectionCapability', ready: !!assets.target && causes.some((cause: Value) => cause.id === 'target-offline' && cause.status === 'supported'), value: 90, ids: ['target-offline'], reason: '疑似目标离线，先核同目标采集适用性；不冒充固定子编排复用' },
    ]
    return rules.filter(rule => rule.ready && unresolved(rule.ids) && typeof components[checks[rule.check].component] === 'function' && !loop.attempts[fingerprint(rule.check, context)]).sort((a, b) => b.value - a.value)[0]
  }
  function validate(value: Value, context: Value) {
    const check = checks[value.check], loop = state(context)
    if (!check) return stop(context, '未核能力或无明确执行点；不虚构动作')
    if (context.shared.request_count >= policy.request_limit || loop.round >= loop.round_limit) return stop(context, '预算耗尽')
    // 独立检查只等待自身前置：目标侧检查不因源未匹配而阻断，反之亦然。
    const bothSides = ['policyEvidence', 'pathEvidence', 'routeEvidence', 'availability'].includes(value.check)
    if (value.check !== 'identity') {
      if (bothSides && (!context.shared.assets.source || !context.shared.assets.target)) return stop(context, '该检查需要两端对象唯一解析；缺一端时保留 unknown，不绕过')
      if (/^target/.test(value.check) && !context.shared.assets.target) return stop(context, '目标身份未唯一解析，无法执行目标侧检查')
      if (/^source/.test(value.check) && !context.shared.assets.source) return stop(context, '源身份未唯一解析，无法执行源侧检查')
      if (value.check === 'portEvidence' && !context.shared.assets.target) return stop(context, '目标身份未唯一解析，无法读取端口证据')
      if (value.check === 'collectionCapability' && !context.shared.assets.target) return stop(context, '目标身份未唯一解析，无法核对采集能力')
    }
    if (/Alerts$/.test(value.check) && !context.shared.scope.time.query_window) return stop(context, '历史窗缺失；不猜时间')
    const key = canonical([value.check, context.shared.scope.requested, check.purpose])
    if (loop.attempts[key]) return stop(context, '重复检查已抑制；执行未知须先核原请求，不自动重发')
    loop.pending = { check: value.check, purpose: check.purpose, key }
    return snapshot(context, { validated: true, check: value.check })
  }
  return {
    loopAccept: (_value: Value, _config: Value, context: Value) => snapshot(context, { scope: context.shared.scope, fault_started_at: context.shared.scope.time.fault_started_at }),
    loopContext: (_value: Value, _config: Value, context: Value) => snapshot(context, { request_limit: policy.request_limit, round_limit: state(context).round_limit, continuation: 'resume_run_id: same version/scope/session authorization; unknown attempts never replay' }),
    loopFirst: (_value: Value, _config: Value, context: Value) => {
      if (state(context).stop_reason) return stop(context, state(context).stop_reason)
      // 已由本次resolve唯一核对的对象可选独立检查；用户声明的ID本身不跳过核验。
      const resolved = Object.values<Value>(context.shared.facts).some(fact => fact.check === 'unique-endpoints' && (fact.status === 'observed' || fact.status === 'partial') && fact.result !== false)
      const rule = resolved && nextRule(context)
      return validate({ check: rule ? rule.check : 'identity' }, context)
    },
    async loopExecute(_value: Value, config: Value, context: Value) {
      const loop = state(context), pending = loop.pending
      if (!pending || loop.stop_reason) { loop.staged = []; return stop(context, loop.stop_reason ?? '无经校验的下一检查') }
      loop.attempts[pending.key] = { status: 'unknown', node_id: context.nodeId, round: ++loop.round }
      context.progress({status:'completed',result:{kind:'diagnostic-attempt',diagnostic_loop:structuredClone(loop)}})
      // 事实先暂存，后续append/candidates节点分别提交和评估。
      // 原子组件保留其请求/响应/解析错误；本节点不自动重试。
      loop.staged = []; loop.defer_append = true
      let result
      try { result = await components[checks[pending.check].component]({ check: pending.check }, config, context) }
      finally { loop.defer_append = false }
      loop.last = { check: pending.check, result, fact_ids: loop.staged.map((entry: Value) => entry.fact.id) }
      loop.attempts[pending.key].status = 'returned'
      loop.pending = null
      return snapshot(context, loop.last)
    },
    loopAppend: (_value: Value, _config: Value, context: Value) => {
      for (const { fact, receipts } of state(context).staged ?? []) {
        context.shared.facts[fact.id] = fact
        for (const receipt of receipts) context.shared.receipts[receipt.id] = receipt
      }
      return snapshot(context, { appended_fact_ids: state(context).last?.fact_ids ?? [], facts: Object.values(context.shared.facts), gaps: Object.values<Value>(context.shared.facts).flatMap(fact => fact.gaps ?? []) })
    },
    loopCandidates: (_value: Value, _config: Value, context: Value) => {
      for (const { fact } of state(context).staged ?? []) reassess(context, fact)
      state(context).staged = []
      // 平台按nodeId替换result；循环节点每次提交累计快照，不能只提交本轮。
      context.progress({ status: 'completed', result: { kind: 'fault-check', items: Object.values(context.shared.facts), causes: context.shared.causes, rounds: context.shared.rounds, diagnostic_loop: structuredClone(state(context)) } })
      return snapshot(context, { candidates: context.shared.causes, rounds: context.shared.rounds })
    },
    loopDecision(_value: Value, _config: Value, context: Value) {
      const loop = state(context), causes = context.shared.causes
      if (loop.stop_reason) return stop(context, loop.stop_reason)
      const authenticationFailure = Object.values<Value>(context.shared.facts).find(fact => /(?:\b401\b|\b403\b|API Key 无效|权限拒绝)/i.test(fact.message ?? fact.error ?? ''))
      if (authenticationFailure) {
        loop.blocker = { kind: 'soc-authentication', evidence_id: authenticationFailure.id, retryable: false, message: authenticationFailure.message ?? authenticationFailure.error }
        return stop(context, 'SOC认证/授权401或403：停止本次取证；不自动重试、不沿用旧资产ID，需有效服务凭据或权限变更后复验')
      }
      if (causes.some((cause: Value) => cause.status === 'confirmed') && !causes.some((cause: Value) => cause.status === 'conflict')) return snapshot(context, { route: 'sufficient' })
      if (context.shared.request_count >= policy.request_limit || loop.round >= loop.round_limit) return stop(context, '预算耗尽')
      if (loop.last?.check === 'identity' && loop.last.result.ready !== true) return stop(context, '对象身份缺口或读取错误')
      const offline = causes.find((cause: Value) => ['source-abnormal', 'target-offline'].includes(cause.id) && cause.status === 'supported')
      if (offline && !loop.offline_reuse) loop.offline_reuse = {candidate_id:offline.id,status:'requested',evidence_ids:offline.support?.evidence_ids??[]}
      if (causes.some((cause: Value) => cause.status === 'conflict')) return snapshot(context, { route: 'proposal', reason: '证据冲突需区分性提议' })
      const rule = nextRule(context)
      if (rule) return snapshot(context, { route: 'rule', check: rule.check, reason: rule.reason })
      return snapshot(context, { route: 'proposal', reason: '无尚未尝试且前置满足、有区分价值的明确规则；保留逐项证据缺口' })
    },
    loopRule: (value: Value, _config: Value, context: Value) => {
      const selected = validate(value, context)
      if (selected.validated) {
        state(context).pending.reason = value.reason ?? checks[value.check].purpose
        state(context).pending.selection = 'rule'
        if(context.shared.rounds.at(-1)) Object.assign(context.shared.rounds.at(-1),{next_check:value.check,reason:state(context).pending.reason})
        context.progress({ status: 'completed', result: { kind: 'diagnostic-selection', round: state(context).round + 1, pending: state(context).pending } })
      }
      return selected
    },
    async loopProposal(_value: Value, config: Value, context: Value) {
      if (typeof components.controlledProposal !== 'function') return stop(context, '无公开受控提议执行合同及实时能力Schema校验器；未调用LLM、未执行未核动作')
      if (!context.shared.assets.source || !context.shared.assets.target) return stop(context, '对象尚未唯一核验，拒绝提议')
      if (context.shared.request_count >= policy.request_limit || state(context).round >= state(context).round_limit) return stop(context, '预算耗尽')
      const available_checks = Object.keys(checks).filter(name => name !== 'identity' && !state(context).attempts[fingerprint(name, context)] && (!/Alerts$/.test(name) || context.shared.scope.time.query_window))
      try {
        const proposal = await components.controlledProposal({ available_checks }, config, context)
        if (!proposal?.check) return stop(context, proposal?.reason ?? '无合规的下一检查')
        const validated = validate(proposal, context)
        if (validated.validated) {
          state(context).pending.reason = proposal.reason
          state(context).pending.selection = 'controlled-proposal'
          if(context.shared.rounds.at(-1)) Object.assign(context.shared.rounds.at(-1),{next_check:proposal.check,reason:proposal.reason})
          context.progress({ status: 'completed', result: { kind: 'diagnostic-selection', round: state(context).round + 1, pending: state(context).pending, proposals: state(context).proposals } })
        }
        return validated
      } catch (error: any) {
        // 外部中止（实例重载/请求取消）与提议失败都不丢弃已保存证据：收口为 unknown 报告，由新运行复验。
        const aborted = Boolean(context.signal?.aborted)
        state(context).proposal_error = { message: String(error?.message ?? error), aborted, at: new Date().toISOString() }
        return stop(context, aborted
          ? '本轮在受控提议阶段被外部中止（实例重载或请求取消）；已保存事实保留，停止并输出 unknown 报告；同范围新运行可收口'
          : `受控提议未通过：${error?.message ?? error}；未执行、不自动重试`)
      }
    },
    loopReport: (_value: Value, config: Value, context: Value) => ({ ...components.loopFinalReport({ terminal: state(context).stop_reason ? 'evidence-loop-stopped' : 'evidence-loop-report' }, config, context), diagnostic_loop: structuredClone(state(context)) }),
    loopStop: (_value: Value, config: Value, context: Value) => ({ ...components.loopFinalReport({ terminal: state(context).stop_reason ? 'evidence-loop-stopped' : 'evidence-loop-report' }, config, context), diagnostic_loop: structuredClone(state(context)), stop_reason: state(context).stop_reason ?? '执行点或能力缺口' }),
  }
}
