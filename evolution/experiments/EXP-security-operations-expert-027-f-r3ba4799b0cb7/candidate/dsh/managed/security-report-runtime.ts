import { createHash } from 'node:crypto'
import { selectInspectionRuns, selectTroubleshootingRun, selectTroubleshootingArtifact, troubleshootingReportSource, selectFaultChild, faultReportSource, mainFaultReportSource, selectSavedSecurityReport } from './security-report-source.mjs'

type RecordValue = Record<string, any>
export const name = 'security-report-runtime'
export const inject = ['tools', 'attachments', 'sessionQuery', 'mcpSessionManager']
const record = (value: any): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value)

/** MCP 的公开 JSON 回执；工具错误、业务错误和无法解码均不成为报告。 */
export function reportValue(value: any): RecordValue {
  if (value?.isError === true) throw new Error('报告读取失败，未生成下载文件')
  if (record(value?.structuredContent)) value = value.structuredContent
  else if (Array.isArray(value?.content)) {
    const text = value.content.filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('')
    try { value = JSON.parse(text) } catch { throw new Error('报告服务未返回完整的结构化产物') }
  }
  if (record(value) && Object.hasOwn(value, 'code')) {
    if (String(value.code) !== '200') throw new Error('报告服务返回业务失败，未生成下载文件')
    value = value.data
  }
  // 平台组合查询使用ok/result；失败或缺失产物不能作为已读取的报告。
  if (record(value) && Object.hasOwn(value, 'ok')) {
    if (value.ok !== true || !record(value.result)) throw new Error('平台报告读取失败或缺少完整产物')
    value = value.result
  }
  if (!record(value)) throw new Error('报告产物回执无效')
  if (value.isError === true) throw new Error('报告读取失败，未生成下载文件')
  return value
}

export function requireReportRequest(exec: any) {
  const agent = exec?.agent, session = agent?.session
  if (!agent?.id || session?.id !== agent.id || (session.header?.delegationDepth ?? 0) !== 0
    || typeof session.snapshotEvents !== 'function') throw new Error('报告仅能由当前真实主会话生成')
  const events = session.snapshotEvents()
  const user = events.findLast((event: any) => event?.type === 'user/message' && event.data?.source?.kind === 'user')
  const content = user?.data?.content
  const text = typeof content === 'string' ? content : Array.isArray(content)
    ? content.filter((part: any) => part?.type === 'text').map((part: any) => part.text).join('') : ''
  const requested = /(?:生成|导出|下载|保存|提供|交付|输出|给我|给出|出具|发我|发给我|附上)[\s\S]{0,40}(?:报告|HTML)|(?:报告|HTML)[\s\S]{0,20}(?:生成|导出|下载|保存|给我|给出|出具|发我|发给我)|(?:执行|开始|运行)[\s\S]{0,20}巡检/iu.test(text)
  const inquiryOnly = /^\s*(?:(?:(?:请问|请(?:介绍|说明|解释))\s*)?(?:如何|怎么|怎样)[\s\S]*(?:报告|HTML)|(?:请问\s*)?(?:本次|这次)?(?:完整|巡检)?(?:报告|HTML)\s*(?:如何|怎么|怎样)[\s\S]*|请(?:介绍|说明|解释)[\s\S]{0,20}(?:报告|HTML)[\s\S]{0,20}(?:步骤|方法|用途|格式|内容))[\s\S]*$/iu.test(text)
  const declined = /(?:不要|禁止|无需|不需要|暂不|先不|别|取消|停止)[\s\S]{0,8}(?:生成|导出|下载|保存|提供|交付|输出|给我|给出|出具|发我|发给我|附上|报告|HTML)/iu.test(text)
  const downloadExisting = /(?:下载|导出)[\s\S]{0,40}(?:报告|HTML)|(?:报告|HTML)[\s\S]{0,20}(?:下载|导出)/iu.test(text)
    && /(?:刚才|上次|先前|此前|已有|已(?:生成|导出|保存)|原(?:有|始)?(?:的)?(?:HTML|报告|文件)|同一(?:份|个)?)/iu.test(text)
  const declinedCreation = /(?:不要|禁止|无需|不需要|暂不|先不|别|取消|停止)[^，。！？；;,\n]{0,8}生成/iu.test(text)
  const declinedTransfer = /(?:不要|禁止|无需|不需要|暂不|先不|别|取消|停止)[^，。！？；;,\n]{0,8}(?:下载|导出|保存|提供|交付|输出|给我|给出|出具|发我|发给我|附上)/iu.test(text)
  const reuseOnly = downloadExisting && declinedCreation && !declinedTransfer
  if (!user?.data?.id || !requested || inquiryOnly || declinedTransfer || declined && !reuseOnly) {
    throw new Error('当前请求没有报告生成或下载意图，未写入文件')
  }
  return { agent, events, reuseOnly }
}

/** 只取原报告或已完成的故障分析；不启动巡检、诊断、探测或处置。 */
export function apply(ctx: any) {
  ctx.tools.register({
    name: 'export_security_report',
    description: '保存当前会话真实巡检或故障组合的原HTML，可原生预览、下载。fault默认核验本会话最新真实启动的troubleshooting-business-access/diagnose_business_access或troubleshooting-device-offline/diagnose_device_offline；显式run_id可选择本会话真实绑定的原故障Run，不冒称最新。只读原Run及唯一完整HTML，保留原filename/UTF-8字节，不让模型重绘。新流程失败、运行中、未知或读取校验失败均拒绝，不回退旧报告。仅无新流程活动时兼容analysis主助手只读取证正文或已完成故障子结果。再次下载复用真实attachment_id/原file；出现更晚新故障组合来源时不能用旧附件绕过；无新编排时仍可显式复用真实历史附件。不能传HTML、路径、URL或其他会话；生成不等于修复或已下载。',
    parameters: { type: 'object', additionalProperties: false, required: ['kind'], properties: {
      kind: { type: 'string', enum: ['inspection', 'fault'] },
      run_id: { type: 'string', description: '可选：本会话真实启动回执的原运行编号。inspection省略时选择本会话最近已完成报告，显式编号只核该原巡检；fault仅允许本会话真实启动的troubleshooting故障运行，与child_id/analysis/evidence_call_ids/attachment_id互斥，fault省略默认最新尝试。显式原Run不是最新结果声明；拒绝外部、未知或inspection假冒。' },
      child_id: { type: 'string', description: '可选，仅无新故障组合来源时：明确导出本会话指定已完成子分析；不得与analysis/run_id混用。主助手已补证时应改用analysis。' },
      analysis: { type: 'string', minLength: 1, maxLength: 65536, description: '仅无新故障组合来源时：主助手依据本会话实际SOC只读回执整理的完整可见报告正文，含事实、推断、证据缺口、未执行建议；不是HTML或隐藏reasoning。语义分析由模型负责，来源由入口核对。' },
      evidence_call_ids: { type: 'array', minItems: 1, maxItems: 32, uniqueItems: true, items: { type: 'string', minLength: 1 }, description: '可选，配合analysis绑定本会话真实只读查询调用；省略自动选择最近实际取证批次。不让用户填写编号，不以用户材料冒充原生回执。' },
      attachment_id: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$', description: '再次下载时仅传本会话上次真实导出回执的attachment_id；与run_id/child_id/analysis/evidence_call_ids互斥，不新生成或取证。' },
    } },
    output: {
      schema: { type: 'object' },
      render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }],
      presentationMeta: (_args: any, value: any) => value,
    },
    async execute(args: RecordValue, exec: any) {
      const { agent, events, reuseOnly } = requireReportRequest(exec)
      if (!record(args) || !['inspection', 'fault'].includes(args.kind)
        || Object.keys(args).some(key => !['kind', 'run_id', 'child_id', 'analysis', 'evidence_call_ids', 'attachment_id'].includes(key))
        || args.run_id !== undefined && typeof args.run_id !== 'string'
        || args.child_id !== undefined && typeof args.child_id !== 'string'
        || args.kind === 'inspection' && ['child_id', 'analysis', 'evidence_call_ids'].some(key => args[key] !== undefined)
        || args.run_id !== undefined && ['child_id', 'analysis', 'evidence_call_ids', 'attachment_id'].some(key => args[key] !== undefined)
        || args.analysis !== undefined && (typeof args.analysis !== 'string' || !args.analysis.trim() || args.analysis.length > 65536)
        || args.evidence_call_ids !== undefined && (args.analysis === undefined || !Array.isArray(args.evidence_call_ids)
          || args.evidence_call_ids.length < 1 || args.evidence_call_ids.length > 32 || args.evidence_call_ids.some((id: any) => typeof id !== 'string' || !id.trim())
          || new Set(args.evidence_call_ids).size !== args.evidence_call_ids.length)
        || args.analysis !== undefined && args.child_id !== undefined
        || args.attachment_id !== undefined && (typeof args.attachment_id !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(args.attachment_id)
          || ['run_id', 'child_id', 'analysis', 'evidence_call_ids'].some(key => args[key] !== undefined))) throw new Error('报告类型或来源参数不符合合同')
      exec.signal?.throwIfAborted()
      const canonical = (tool: string) => {
        for (const [group, names] of [
          ['inspection-compositions', ['inspection_status', 'inspection_baseline', 'inspection_vulnerabilities', 'inspection_reachability', 'inspection_routine', 'inspection_deep', 'get_composition_run', 'get_composition_details', 'get_composition_artifact']],
          ['troubleshooting-compositions', ['diagnose_business_access', 'diagnose_device_offline', 'get_composition_run', 'get_composition_details', 'get_composition_artifact']],
        ] as const) {
          for (const raw of names) {
            const actual = ctx.mcpSessionManager?.resolveTool?.(group, raw)
            if (actual && actual === tool) return `mcp__${group}__${raw}`
          }
        }
        // 原生日志中的完整公开名仍可识别活动；实际读取另须resolveTool + tools.get可见。
        return tool
      }
      const saved = selectSavedSecurityReport(agent.id, events, args.kind, args.attachment_id, canonical)
      if (args.attachment_id !== undefined && !saved) throw new Error('本会话没有该真实已导出报告，不猜测附件或文件路径')
      if (args.attachment_id !== undefined && args.kind === 'fault' && saved!.has_new_troubleshooting_source) {
        throw new Error('本会话已有更新故障来源或新尝试，不能指定旧attachment_id绕过；请核对最新运行。')
      }
      if (args.attachment_id !== undefined || (args.kind === 'fault' || reuseOnly) && args.run_id === undefined
        && args.analysis === undefined && args.child_id === undefined && saved && !saved.has_new_source) {
        return { ...saved!.value, message: '已复用本会话原HTML文件，未重新取证、分析或生成。可预览或下载；文件读取时仍核对原始字节和SHA-256。' }
      }
      if (reuseOnly) throw new Error('当前请求仅允许下载本会话真实已导出的原附件；没有可复用原文件或存在更新来源，未重新生成、取证或读取Run。')
      const troubleshooting = args.kind === 'fault' ? selectTroubleshootingRun(agent.id, events, args.run_id, canonical) : undefined
      if (troubleshooting && ['analysis', 'child_id', 'evidence_call_ids'].some(key => args[key] !== undefined)) {
        throw new Error('当前已有新故障组合来源，请省略analysis/child_id/evidence_call_ids读取原HTML；不回退旧分析。')
      }
      let html: string, source: RecordValue, filename: string
      let expectedInspectionBytes: number | undefined
      if (args.kind === 'inspection') {
        // 巡检来源必须被当前同组resolver精确确认；不借故障活动识别的旧名回退放行。
        const inspectionCanonical = (tool: string) => {
          for (const raw of ['inspection_status', 'inspection_baseline', 'inspection_vulnerabilities', 'inspection_reachability', 'inspection_routine', 'inspection_deep']) {
            const actual = ctx.mcpSessionManager.resolveTool('inspection-compositions', raw)
            if (actual && actual === tool) return `mcp__inspection-compositions__${raw}`
          }
          return undefined
        }
        const candidates = selectInspectionRuns(events, args.run_id, inspectionCanonical)
        const query = ctx.mcpSessionManager.resolveTool('inspection-compositions', 'get_composition_run')
        if (!query || !ctx.tools.get(query, agent)) throw new Error('当前没有同次巡检终态读取入口')
        let selected: (typeof candidates)[number] | undefined
        let report: RecordValue | undefined
        // 有限遍历本会话来源，不轮询业务；显式run_id的候选始终只有它自己。
        for (const [index, candidate] of candidates.entries()) {
          const state = await ctx.tools.execute({ name: query,
            callId: `${exec.callId}:status${index ? `:${index}` : ''}`, rootCallId: exec.rootCallId, parent: exec.token,
            arguments: { run_id: candidate.run_id }, agent, signal: exec.signal })
          for (const context of state.additionalContexts ?? []) exec.deferContext(context)
          exec.signal?.throwIfAborted()
          if (state.isError) throw new Error('原巡检终态读取失败，未导出报告')
          const run = reportValue(state.value)
          if (run.run_id !== candidate.run_id || run.composition_id !== candidate.workflow
            || run.workflow !== undefined && run.workflow !== candidate.workflow) throw new Error('巡检结果与本会话原始运行或流程不一致')
          // result.status是业务完整性；未知/读取失败不能跳过并冒称较旧报告最新。
          if (run.status !== 'completed') {
            if (args.run_id === undefined && ['accepted', 'pending', 'queued', 'running', 'failed', 'canceled', 'cancelled'].includes(run.status)) continue
            throw new Error('原巡检尚未成功结束，不能将运行中或失败状态导出为已完成报告。')
          }
          const reports = Array.isArray(run.artifacts) ? run.artifacts.filter((item: any) => item?.id === 'report') : []
          const item = reports[0]
          if (reports.length !== 1 || typeof item.filename !== 'string' || !/\.html$/iu.test(item.filename)
            || typeof item.contentType !== 'string' || !/^text\/html(?:\s*;|\s*$)/iu.test(item.contentType)
            || !Number.isSafeInteger(item.bytes) || item.bytes <= 0) throw new Error('原巡检未返回唯一、非空的HTML报告产物')
          selected = candidate; report = item; break
        }
        if (!selected || !report) throw new Error('本会话尚无已完成的原巡检报告；未生成或切换外部来源')
        expectedInspectionBytes = report.bytes
        const actual = ctx.mcpSessionManager.resolveTool('inspection-compositions', 'get_composition_artifact')
        if (!actual || !ctx.tools.get(actual, agent)) throw new Error('当前没有同次巡检报告读取入口')
        const result = await ctx.tools.execute({ name: actual,
          callId: `${exec.callId}:report`, rootCallId: exec.rootCallId, parent: exec.token,
          arguments: { run_id: selected.run_id, artifactId: report.id }, agent, signal: exec.signal })
        for (const context of result.additionalContexts ?? []) exec.deferContext(context)
        exec.signal?.throwIfAborted()
        if (result.isError) throw new Error('原巡检报告读取失败，未重新启动巡检')
        const artifact = reportValue(result.value)
        if (typeof artifact.body !== 'string' || !/^text\/html(?:\s*;|$)/iu.test(artifact.contentType ?? '')
          || !/\.html$/iu.test(artifact.filename ?? '')) throw new Error('原运行尚无可导出的完整HTML报告')
        if (artifact.filename !== report.filename || artifact.contentType !== report.contentType) throw new Error('原报告与同次产物元数据不一致')
        html = artifact.body
        source = { kind: 'inspection', run_id: selected.run_id, artifact_id: report.id,
          original_filename: artifact.filename, original_sha256: createHash('sha256').update(html).digest('hex') }
        filename = `inspection-report-${selected.run_id}.html`
      } else if (troubleshooting) {
        const readOriginal = async (raw: string, suffix: string, arguments_: RecordValue) => {
          const actual = ctx.mcpSessionManager?.resolveTool?.('troubleshooting-compositions', raw)
          if (!actual || !ctx.tools.get(actual, agent)) throw new Error('当前没有真实可见的故障组合只读入口，不能回退旧报告。')
          const result = await ctx.tools.execute({ name: actual,
            callId: `${exec.callId}:${suffix}`, rootCallId: exec.rootCallId, parent: exec.token,
            arguments: arguments_, agent, signal: exec.signal })
          for (const context of result.additionalContexts ?? []) exec.deferContext(context)
          exec.signal?.throwIfAborted()
          if (result.isError) throw new Error('原故障组合读取失败，未保存，也不会回退旧报告。')
          return reportValue(result.value)
        }
        const run = await readOriginal('get_composition_run', 'fault-status', { run_id: troubleshooting.run_id })
        const original = selectTroubleshootingArtifact(troubleshooting, run)
        const artifact = await readOriginal('get_composition_artifact', 'fault-report', {
          run_id: troubleshooting.run_id, artifactId: original.id })
        const fresh = selectTroubleshootingRun(agent.id, agent.session.snapshotEvents(), args.run_id, canonical)
        if (JSON.stringify(fresh) !== JSON.stringify(troubleshooting)) throw new Error('故障运行来源已变化，未保存过时报告。')
        const report = troubleshootingReportSource(troubleshooting, run, artifact)
        html = report.html
        source = { ...report.source }
        filename = report.filename
      } else if (args.analysis !== undefined) {
        const report = mainFaultReportSource(agent.id, events, args.analysis, args.evidence_call_ids)
        html = report.html
        source = { ...report.source }
        filename = `fault-report-${report.source.content_sha256.slice(0, 16)}.html`
      } else {
        const selected = selectFaultChild(agent.id, events, args.child_id)
        const snapshot = await ctx.sessionQuery.readSession(selected.childId)
        exec.signal?.throwIfAborted()
        // 读取期间重新核对本会话的真实委派，不能以过时的来源选择继续生成。
        const fresh = selectFaultChild(agent.id, agent.session.snapshotEvents(), args.child_id)
        if (fresh.childId !== selected.childId || fresh.delegateCallId !== selected.delegateCallId || fresh.noticeSeq !== selected.noticeSeq) throw new Error('故障分析来源已变化，请核对原结果')
        const report = faultReportSource(fresh, snapshot)
        html = report.html
        source = { ...report.source }
        filename = `fault-report-${selected.childId}.html`
      }
      if (!/^\s*<!doctype\s+html\b/iu.test(html) || !/<html\b/iu.test(html) || !/<\/html>\s*$/iu.test(html)) {
        throw new Error('报告不是完整HTML文档，未把片段冒充完整报告')
      }
      const data = Buffer.from(html, 'utf8')
      if (expectedInspectionBytes !== undefined && data.byteLength !== expectedInspectionBytes) throw new Error('原报告字节数与同次产物元数据不一致，未截断交付')
      if (data.byteLength > 32 * 1024 * 1024) throw new Error('报告超过原生完整文件预览的32MiB默认上限，未截断交付')
      exec.signal?.throwIfAborted()
      if (args.kind === 'fault' && !troubleshooting
        && selectTroubleshootingRun(agent.id, agent.session.snapshotEvents(), undefined, canonical)) {
        throw new Error('读取旧故障结果期间已出现新组合来源，未保存legacy报告。')
      }
      const attachment = await ctx.attachments.saveFile({ name: filename, data })
      const path = ctx.attachments.fileHostPath(attachment)
      if (!path || attachment.bytes !== data.byteLength) throw new Error('HTML已保存但当前文件后端不能提供可核对的下载文件')
      if (troubleshooting && (attachment.name !== filename || attachment.attachmentId !== `sha256:${source.original_sha256}`)) {
        throw new Error('HTML已保存但原生附件filename或SHA与原故障产物不一致，未声明成功交付。')
      }
      exec.signal?.throwIfAborted()
      return { schema_version: 'security-report/v1', kind: args.kind, session_id: agent.id,
        file_path: path, filename: attachment.name, content_type: 'text/html; charset=utf-8', bytes: attachment.bytes,
        sha256: createHash('sha256').update(data).digest('hex'), attachment_id: attachment.attachmentId,
        source, generated_at: new Date().toISOString(),
        message: troubleshooting && args.run_id !== undefined
          ? '已按显式run_id保存本会话原故障Run的完整HTML，不冒称本会话最新结果。可原生预览、下载；不表示故障已修复。'
          : 'HTML报告文件已生成。可在本次报告卡片预览或下载HTML；生成文件不表示故障已修复或巡检全部正常。' }
    },
  })
}
