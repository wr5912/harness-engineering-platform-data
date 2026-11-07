import { base, assetItem, scopeComponent, summary, tools, type Soc } from '../../../src/inspection/index.ts'

export function classify(assetId: number, report: any, ready: any) {
  const facts = { report, readiness: ready, consistency: '两次读取不构成事务快照，未核实模板内容版本' }
  const unknown = (message: string) => ({ status: 'unknown', message, facts, recommendation: '在 SOC 核对模板分配、有效核查项与采集状态，取得当前报告后重新巡检。' })
  if (!report || typeof report !== 'object' || !ready || String(ready.assetId) !== String(assetId) || !Array.isArray(ready.items) || typeof ready.templateScopeMatched !== 'boolean' || !Number.isSafeInteger(ready.memberCount) || ready.memberCount < 0 || !Number.isSafeInteger(ready.applicableCount) || ready.applicableCount < 0 || ready.applicableCount > ready.memberCount || ready.items.length !== ready.memberCount) return unknown('基线报告或就绪信息结构、对象与数量不一致')
  const run = report.run
  if (run != null && (typeof run !== 'object' || Array.isArray(run))) return unknown('基线报告结构无效')
  if ([report.assetId, run?.assetId].some(id => id != null && String(id) !== String(assetId))) return unknown('基线报告返回了不同资产')
  if (!ready.templateId) return unknown('当前未分配基线模板，不能判为通过或不适用')
  if (!ready.templateScopeMatched || !ready.memberCount || ready.items.some((item: any) => item.conditionError != null)) return unknown('模板范围不匹配、没有成员项或存在配置错误')
  const ids = new Set(), applicable = ready.items.filter((item: any) => item.applicable === true)
  if (ready.items.some((item: any) => item.itemId == null || ids.has(String(item.itemId)) || !ids.add(String(item.itemId)) || typeof item.applicable !== 'boolean' || item.applicable !== (item.applicabilityReason === 'MATCHED')) || applicable.length !== ready.applicableCount) return unknown('逐项适用依据缺失、重复或矛盾')
  if (!run) return unknown('SOC 未返回基线报告')
  if (run.assetId == null || String(run.templateId ?? report.templateId) !== String(ready.templateId)) return unknown('报告主体或当前模板身份无法核实')
  const pass = run.passFlag == null ? '' : String(run.passFlag), reason = run.notCheckedReason
  if (['0', '1'].includes(pass) && reason) return unknown('基线通过标志与未检查原因冲突')
  if (!ready.applicableCount) {
    if (ready.assetType && ready.coverageReason === 'NO_APPLICABLE_ITEM' && ready.items.every((item: any) => item.applicabilityReason === 'ASSET_SCOPE_NOT_MATCHED') && !pass && ['NO_APPLICABLE_ITEM', 'NO_APPLICABLE_ITEMS'].includes(reason)) return { status: 'not_applicable', message: '报告与当前逐项证据均明确无适用项', facts }
    return unknown('没有有效适用项；停用、不支持及缺少配置不能当作不适用')
  }
  if (ready.coverageReason !== 'APPLICABLE_ITEMS_PRESENT') return unknown('当前适用数量与覆盖原因冲突')
  if (pass === '1') return { status: 'normal', message: '读取到的基线报告标记为达标；未核实模板内容版本及报告时效', facts }
  if (pass === '0') return { status: 'abnormal', message: '读取到的基线报告标记为不达标；未核实模板内容版本及报告时效', facts, recommendation: '按报告中的不合规项整改并重新核查。' }
  return unknown('SOC 未给出可判定的基线结论')
}
export function create(soc: Soc) {
  const api = tools(soc)
  return { ...base(soc), components: {
    scope: scopeComponent(soc),
    summary: (value: any, _config: any, context: any) => summary('baseline', value.items, context),
    report: async (value: any, config: any, context: any) => read(value, config, context, 'get_admin_baseline_report_latest', true),
    readiness: async (value: any, config: any, context: any) => read(value, config, context, 'get_admin_baseline_readiness'),
    assess: (value: any) => {
      const { report, readiness: ready } = value
      return assetItem(value.item, report.error || ready.error
        ? { status: 'failed', message: '基线接口未完整返回，保留已取得的证据', facts: { report: report.error ? report : report.data, readiness: ready.error ? ready : ready.data } }
        : classify(value.item.assetId, report.data, ready.data))
    },
  } }
  async function read(value: any, config: any, context: any, operation: string, report = false) {
    try { return { data: (await api.request(config.connections.ingest, operation, { assetId: value.item.assetId, ...(report ? { includeChildren: false } : {}) }, context.signal, context)).data } }
    catch (error: any) { context.signal.throwIfAborted(); return { error: error.message } }
  }
}
