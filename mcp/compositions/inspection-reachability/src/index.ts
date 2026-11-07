import { isIP } from 'node:net'
import { base, cidrMatch, scopeComponent, summary, tools, type Soc } from '../../../src/inspection/index.ts'

export function matches(asset: any, selector: any) {
  if (!selector || selector.bizIds?.length || !['ASSETS', 'ALL', null, undefined].includes(selector.scope)) throw new Error('规则含当前无法解析的选择条件')
  const hasCriteria = ['cidrs', 'networkTiers', 'assetTypes'].some(key => selector[key]?.length)
  if (!hasCriteria && selector.scope !== 'ALL') throw new Error('规则没有明确的目标条件')
  return (!selector.cidrs?.length || selector.cidrs.some((value: string) => isIP(value) ? asset.ip === value : cidrMatch(asset.ip ?? '', value))) && (!selector.networkTiers?.length || selector.networkTiers.includes(asset.networkTier)) && (!selector.assetTypes?.length || selector.assetTypes.includes(asset.assetType))
}
export function create(soc: Soc) {
  const api = tools(soc)
  function pairResult(pair: any, facts: any, status: string, message: string) {
    const { rule: _rule, ...target } = pair
    return { ...target, status, message, facts, recommendation: status === 'normal' ? undefined : '核对拓扑、路由与逐跳访问策略；路径计算不证明实际业务连通或已执行主动探测。' }
  }
  return { ...base(soc, true), components: {
    scope: scopeComponent(soc, true),
    summary: (value: any, _config: any, context: any) => summary('reachability', [...(value.prior ?? []), ...value.items], context),
    mode: (value: any, _config: any, context: any) => ({ mode: value.reachability ? 'explicit' : context.shared.rules_error ? 'rulesError' : !context.shared.rules.some((rule: any) => rule.enabled === true || rule.enabled === 1) ? 'noRules' : 'rules' }),
    explicit: (value: any) => ({ ...value, prior: [], items: [{ ...value.reachability, mode: value.reachability.mode ?? 'FULL', ruleType: 'REQUIRED' }] }),
    rulesError: (value: any, _config: any, context: any) => ({ ...value, items: [{ status: 'failed', message: '可达性规则读取失败，未核查路径', error: context.shared.rules_error, facts: { rules_frozen_at: context.shared.rules_frozen_at } }] }),
    noRules: (value: any, _config: any, context: any) => ({ ...value, items: [{ status: 'unknown', message: '没有启用的可达性规则；需补充源、目的地址或配置规则', facts: { rules: context.shared.rules, rules_frozen_at: context.shared.rules_frozen_at } }] }),
    rules: (value: any, _config: any, context: any) => {
      const snapshot = context.shared, items: any[] = [], pairs: any[] = []
    for (const rule of snapshot.rules.filter((rule: any) => rule.enabled === true || rule.enabled === 1)) {
      try {
        if (rule.selectorIssues?.length || !['FORBIDDEN', 'REQUIRED'].includes(rule.ruleType) || rule.allowedPorts || rule.destPort && (!/^\d+$/.test(String(rule.destPort)) || Number(rule.destPort) < 1 || Number(rule.destPort) > 65535) || rule.protocol && !['tcp', 'udp', 'icmp'].includes(String(rule.protocol).toLowerCase())) throw new Error('规则存在选择器问题或当前无法解释的策略条件')
        const sources = snapshot.assets.filter((asset: any) => matches(asset, rule.sourceSelector)), destinations = snapshot.assets.filter((asset: any) => matches(asset, rule.destSelector))
        if (!sources.length || !destinations.length) { items.push({ ruleId: rule.id, ruleName: rule.name, status: 'unknown', message: '冻结范围内未匹配到规则的完整检查对，未核查该规则', facts: { rule } }); continue }
        const seen = new Set<string>()
        for (const source of sources) for (const destination of destinations) {
          if (!isIP(source.ip ?? '') || !isIP(destination.ip ?? '')) throw new Error('规则目标缺少有效 IP')
          if (source.ip === destination.ip) continue
          const key = `${source.ip}>${destination.ip}`
          if (!seen.has(key)) { seen.add(key); pairs.push({ rule, ruleId: rule.id, ruleName: rule.name, ruleType: rule.ruleType, srcIp: source.ip, dstIp: destination.ip, mode: 'FULL', ...(rule.destPort ? { port: Number(rule.destPort) } : {}), ...(rule.protocol ? { protocol: rule.protocol.toLowerCase() } : {}) }) }
        }
        if (!seen.size) items.push({ ruleId: rule.id, ruleName: rule.name, status: 'unknown', message: '规则只匹配同一地址，未生成跨地址检查对' })
      } catch (error: any) { items.push({ ruleId: rule.id, ruleName: rule.name, status: 'unknown', message: error.message, facts: { rule } }) }
    }
      return { ...value, prior: items, items: pairs }
    },
    path: async (value: any, config: any, context: any) => {
      const pair = value.item
      try {
        const path = (await api.request(config.connections.graph, 'get_reachability_path_by_ip', { srcIp: pair.srcIp, dstIp: pair.dstIp }, context.signal, context)).data
        return { ...value, facts: { rule: pair.rule, path, path_observed_at: new Date().toISOString() } }
      } catch (error: any) { context.signal.throwIfAborted(); return { ...value, early: pairResult(pair, { error: error.message }, 'failed', '计算路径读取失败，未核查后续策略') } }
    },
    evidence: (value: any) => {
      if (value.early) return value
      const pair = value.item, facts = value.facts, path = facts.path
      const done = (status: string, message: string) => ({ ...value, facts, early: pairResult(pair, facts, status, message) })
        const clear = path && (path.reachable === true && path.verdict === 'REACHABLE' || path.reachable === false && path.verdict === 'UNREACHABLE')
        if (!clear) return done('unknown', '路径缺少一致的可达性证据')
        if (path.natApplied === true || path.viaSrcIp && path.viaSrcIp !== pair.srcIp || path.viaDstIp && path.viaDstIp !== pair.dstIp) return done('unknown', '路径涉及地址转换，当前接口证据不足以关联端到端策略')
        if (!path.reachable) return done(pair.ruleType === 'FORBIDDEN' ? 'normal' : 'abnormal', 'SOC 计算路径不可达；未执行主动探测')
        const pathNodes = Array.isArray(path.routeOnlyPath) ? path.routeOnlyPath : path.path
        if (!Array.isArray(pathNodes)) return done('unknown', '路径没有逐跳节点')
        if (pair.mode === 'MUST_PASS' && !pair.via.every((node: string) => pathNodes.map(String).includes(node))) return done('abnormal', '计算路径未经过指定的全部节点')
        const devices = [...new Set(pathNodes.map(String).filter((id: string) => /^\d+$/.test(id)))] as string[]
        if (!devices.length && path.reason === 'l2_same_segment') {
          facts.policy = { status: 'not_applicable', reason: 'SOC 明确为同网段二层路径，无过境设备' }
          return { ...value, facts, devices, policy: 'permit' }
        }
        if (!devices.length) return done('unknown', '计算路径可达，逐跳 ACL 证据不完整；不据此宣称业务可达')
        return { ...value, facts, devices }

    },
    acl: async (value: any, config: any, context: any) => {
      const pair = value.item, devices = value.devices, facts = { ...value.facts }
        let policy = 'unknown'
        try {
          const response = await api.request(config.connections!.graph, 'get_reachability_acl_hit', { srcIp: pair.srcIp, dstIp: pair.dstIp, devices: devices.join(','), ...(pair.port ? { port: pair.port } : {}), ...(pair.protocol ? { protocol: pair.protocol } : {}) }, context.signal, { ...context, shared: context.shared })
          facts.policy = response.data; facts.policy_observed_at = new Date().toISOString()
          const hops = response.data?.hops
          if (Array.isArray(hops)) {
            const ids = hops.map((hop: any) => String(hop.deviceId))
            if (ids.length === devices.length && new Set(ids).size === ids.length && devices.every((id: string) => ids.includes(id))) {
              if (hops.some((hop: any) => hop.verdict === 'DENY')) policy = 'deny'
              else if (hops.every((hop: any) => ['PERMIT', 'NO_TRANSIT_FILTER'].includes(hop.verdict))) policy = 'permit'
            }
          }
        } catch (error: any) { context.signal.throwIfAborted(); facts.policy_error = error.message }
      return { ...value, facts, policy }
    },
    assess: (value: any) => {
      const pair = value.item, { early, facts, policy } = value
        if (early) return early
        if (policy === 'unknown') return pairResult(pair, facts, 'unknown', '计算路径可达，逐跳 ACL 证据不完整；不据此宣称业务可达')
        const permitted = policy === 'permit', compliant = pair.ruleType === 'FORBIDDEN' ? !permitted : permitted
        return pairResult(pair, facts, compliant ? 'normal' : 'abnormal', `计算路径可达，${policy === 'deny' ? '策略拒绝' : '策略允许或无过境过滤'}；${pair.ruleType === 'FORBIDDEN' ? '按禁止可达规则核对' : '按要求可达目标核对'}${pair.port ? '' : '，未验证具体业务端口'}`)
    },
  } }
}
