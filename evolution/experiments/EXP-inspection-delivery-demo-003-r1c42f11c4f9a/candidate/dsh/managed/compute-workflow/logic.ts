export type Intent = 'identity' | 'role' | 'full' | 'first-page' | 'unsupported'
type ToolContext = { signal: AbortSignal; callTool(name: string, args: Record<string, unknown>): Promise<any> }
const assetIds = ['asset-0001', 'asset-0002', 'asset-0003', 'asset-0004', 'asset-0005']

/** 规则只识别本智能体已声明的有限业务意图，不把测试题目作为路由键。 */
export function classifyRequest(request: string): Intent {
  const text = request.toLowerCase().replace(/\s/g, '')
  if (/重启|关机|下发|配置更改|删除设备|真实(?:设备)?健康检测|漏洞扫描/.test(text) && !/是不是|是否|说明|明确/.test(text)) return 'unsupported'
  if (/只(?:读取|读|看|取|拉取)?(?:第?一|1|首)页|不要(?:继续|再读|读取后续|读后续)|仅(?:读取|读|看)?(?:第?一|1|首)页/.test(text)) return 'first-page'
  if (/你是谁|你的身份|什么身份|介绍自己/.test(text)) return 'identity'
  if (/你能|能如何|如何帮助|怎么开始|主要职责|工作范围|业务范围|信息不足|需要.*了解/.test(text)) return 'role'
  if (/(巡检|台账|资产|设备)/.test(text) && /(全部|所有|完整|五台|5台|生成.*报告|处理.*分页|开始.*巡检|执行.*巡检|做.*巡检)/.test(text)) return 'full'
  return 'unsupported'
}

function ensure(condition: unknown, reason: string): asserts condition { if (!condition) throw new Error(reason) }
function sameRun(value: any, runId: string) {
  ensure(value?.run_id === runId && value.source_kind === 'basic_mock', '工具回执的任务或来源不一致')
}
function checkPage(page: any, runId: string, read: Set<string>) {
  sameRun(page, runId)
  ensure(page.total === 5 && Array.isArray(page.rows) && page.rows.length > 0, '分页总数或记录无效')
  for (const row of page.rows) {
    ensure(assetIds.includes(row.asset_id) && !read.has(row.asset_id), '分页设备重复或不在固定范围内')
    read.add(row.asset_id)
  }
  ensure(page.next_cursor === null || Number.isInteger(page.next_cursor) && page.next_cursor >= 0, '分页游标无效')
}

export async function executeIntent(intent: Intent, context: ToolContext, expectedSourceSha256: string) {
  if (intent === 'identity') return { status: 'completed', reply: '我是基础台账巡检助手（Agent ID: inspection-delivery-demo）。我只读分页核对 asset-0001 至 asset-0005 五台基础模拟资产台账，交付逐设备 Markdown 与 CSV 报告及下载入口；未读完整时如实说明缺口，不提供真实设备健康结论。' }
  if (intent === 'role') return { status: 'completed', reply: '我可以按分页读取固定 asset-0001 至 asset-0005 五台基础模拟资产台账，核对完整后生成逐设备 Markdown 与 CSV 报告，并提供实际下载入口。若只读第一页，我会保留未完成状态并说明剩余设备，不生成完整报告。这些台账不是真实设备健康检测。开始前需要明确你希望完整巡检还是只读第一页；本轮仅说明职责，尚未启动任务或调用业务工具。' }
  if (intent === 'unsupported') return { status: 'unsupported', reply: '当前纯代码规则支持身份与职责说明、完整基础台账巡检和只读取第一页。这个请求未匹配已覆盖的业务规则，已中止，尚未调用业务工具；请说明要执行完整巡检还是只读第一页。不会自动改用模型处理。' }
  context.signal.throwIfAborted()
  const started = await context.callTool('task_inspection', { action: 'start' })
  ensure(typeof started?.run_id === 'string' && /^task-[0-9a-f-]{36}$/.test(started.run_id), '启动回执缺少真实任务 ID')
  const runId = started.run_id
  sameRun(started, runId)
  ensure(started.total === 5 && started.next_cursor === 0 && started.source_sha256 === expectedSourceSha256, 'Mock 资产快照或分页起点不符合冻结输入')
  const read = new Set<string>(), cursors = new Set<number>()
  let cursor: number | null = started.next_cursor
  while (cursor !== null) {
    context.signal.throwIfAborted()
    ensure(!cursors.has(cursor) && cursors.size < 5, '分页游标重复或未终止')
    cursors.add(cursor)
    const page = await context.callTool('task_inspection', { action: 'page', run_id: runId, cursor })
    checkPage(page, runId, read)
    cursor = page.next_cursor
    if (intent === 'first-page') {
      ensure(cursor !== null && read.size < 5, '第一页回执与固定分页范围不一致')
      return { status: 'partial', run_id: runId, source_sha256: started.source_sha256, read_device_ids: [...read], remaining: 5 - read.size,
        reply: `现在不能交付完整五台报告。任务 ${runId} 已启动，只读取第一页 ${read.size} 台（${[...read].join('、')}）；next_cursor=${cursor}，还有 ${5 - read.size} 台未读取。已按要求停止，没有继续后续分页，也没有调用 report 或生成完整报告。数据为基础模拟台账，未连接或检测真实设备。` }
    }
  }
  ensure(read.size === 5 && assetIds.every(id => read.has(id)), '尚未读取全部固定资产，不能生成报告')
  context.signal.throwIfAborted()
  const report = await context.callTool('task_inspection', { action: 'report', run_id: runId })
  sameRun(report, runId)
  ensure(report.completed === true && report.device_count === 5 && Array.isArray(report.device_ids) && report.device_ids.length === 5 && assetIds.every(id => report.device_ids.includes(id)), '报告设备范围不完整')
  ensure(typeof report.markdown === 'string' && assetIds.every(id => report.markdown.includes(id)) && typeof report.csv === 'string' && report.csv.trim().split('\n').length === 6, '报告正文缺少完整设备记录')
  ensure(typeof report.download_url === 'string' && report.download_url.includes(runId) && typeof report.csv_url === 'string' && report.csv_url.includes(runId), '报告缺少实际下载入口')
  return { status: 'completed', run_id: runId, source_sha256: started.source_sha256, device_count: 5, report_sha256: report.report_sha256,
    download_url: report.download_url, csv_url: report.csv_url,
    reply: `基础台账只读巡检已完成，同一任务 ${runId} 已按返回游标读完全部 ${cursors.size} 页，覆盖 ${assetIds.join('、')} 五台资产，报告设备数量为 5。\n\n[下载 Markdown 报告](${report.download_url})\n\n[下载 CSV 明细](${report.csv_url})\n\n本次读取的是基础模拟台账，未连接或检测真实设备，报告不提供实时设备健康结论。` }
}
