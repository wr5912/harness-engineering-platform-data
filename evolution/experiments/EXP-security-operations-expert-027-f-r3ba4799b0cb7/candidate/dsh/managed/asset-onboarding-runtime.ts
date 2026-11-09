import { createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readAssetWorkbook, requireAssetRootAgent } from './asset-workbook.mjs'

type Value = Record<string, any>
export const name = 'asset-onboarding-runtime'
export const inject = ['tools', 'mcpSessionManager']
export const TOOL_NAME = 'asset_onboarding'
export const GROUP_ID = 'asset-management'
const STATE_ROOT = '/var/lib/dsh/asset-onboarding'
const MAX_ASSETS = 200
const MAX_HOSTS = 4096
const MAX_OUTPUT = 128 * 1024
const operations = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const hash = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const text = (value: any) => typeof value?.content === 'string' ? value.content : (value?.content ?? []).filter((part: any) => part.type === 'text').map((part: any) => part.text).join('')
const object = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = (value: any) => Number.isSafeInteger(value) && value > 0
const cell = (value: any) => value === undefined || value === null ? '未提供' : String(value).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ')

export function mainIdentity(exec: any) {
  const agent = requireAssetRootAgent(exec), header = agent.session.header
  const events = agent.session.snapshotEvents()
  if (!Array.isArray(events)) throw new Error('无法核对当前会话记录')
  const boundary = [...events].reverse().find((event: any) => event.type === 'turn/start' || event.type === 'turn/end')
  if (boundary?.type !== 'turn/start') throw new Error('没有正在办理的真实用户轮次')
  const users = events.slice(events.indexOf(boundary) + 1).filter((event: any) => event.type === 'user/message' && event.data?.source?.kind === 'user')
  const current = users.at(-1)
  if (!current?.data?.id) throw new Error('本轮缺少真实用户消息，历史确认、工具结果、附件正文、内部续办和定时消息均不构成授权')
  if ([...(agent.inbox?.nextTurn ?? []), ...(agent.inbox?.nextStep ?? [])].some((message: any) => message?.source?.kind === 'user')) throw new Error('有新的用户消息正在等待，先处理改参或取消，不继续提交原请求')
  if (exec.signal?.aborted) throw new Error('本次操作已取消')
  return { agent, events, current, sessionId: header.id, messageId: current.data.id, request: text(current.data).trim() }
}

const IPV4_TEXT = String.raw`\d{1,3}(?:\.\d{1,3}){3}`
const RANGE_TOKEN = String.raw`(?<![\w.:/\-])${IPV4_TEXT}(?:-${IPV4_TEXT}|/\d{1,2})?(?![\w.:/\-])`
const canonicalIpv4 = (value: string) => isIP(value) === 4 && value.split('.').every(part => String(Number(part)) === part)

/** 只改完整合法端点间的连接符；不拼接散落IP、不换算CIDR或补齐端点。 */
function normalizeRangeText(raw: string) {
  return raw.replace(new RegExp(String.raw`(?<![\w.:/\-])(${IPV4_TEXT})\s*(?:到|至|-)\s*(${IPV4_TEXT})(?![\w.:/\-])`, 'gu'),
    (original, start: string, end: string) => canonicalIpv4(start) && canonicalIpv4(end) ? `${start}-${end}` : original)
}

export function normalizeRange(raw: string) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) throw new Error('请提供明确的IPv4、CIDR或起止IPv4范围')
  const number = (ip: string) => ip.split('.').reduce((result, part) => result * 256 + Number(part), 0)
  const ip = canonicalIpv4
  const ranges = [...new Set(normalizeRangeText(raw).trim().split(/[\s,，;；]+/).filter(Boolean))]
  let count = 0
  for (const range of ranges) {
    if (ip(range)) { count++; continue }
    const cidr = /^([^/]+)\/(\d{1,2})$/.exec(range)
    if (cidr && ip(cidr[1])) {
      const bits = Number(cidr[2]), size = 2 ** (32 - bits)
      if (bits > 32 || number(cidr[1]) % size !== 0) throw new Error('CIDR必须是网络地址对齐的IPv4范围')
      count += size; continue
    }
    const bounds = range.split('-')
    if (bounds.length !== 2 || !bounds.every(ip) || number(bounds[1]) < number(bounds[0])) throw new Error('IP范围格式无效，不推导或扩大用户网段')
    count += number(bounds[1]) - number(bounds[0]) + 1
  }
  if (!count || count > MAX_HOSTS) throw new Error(`单次范围最多${MAX_HOSTS}个地址，请明确拆分范围`)
  return { ranges: ranges.join(','), count }
}

/** 仅比较当前用户显式范围片段；意图、真实轮次及取消仍由调用方核对。 */
export function validateDiscoveryRanges(request: string, ranges: string, excludedRanges?: string) {
  const range = normalizeRange(ranges)
  const excluded = excludedRanges ? normalizeRange(excludedRanges).ranges : ''
  const source = normalizeRangeText(request)
  const tokens = [...source.matchAll(new RegExp(RANGE_TOKEN, 'gu'))].map(match => {
    const start = match.index!, end = start + match[0].length
    if (/(?:到|至|-|\/)\s*$/u.test(source.slice(0, start)) || /^\s*(?:到|至|-|\/)/u.test(source.slice(end))) {
      throw new Error('用户范围缺少完整端点，不能借参数补齐或推导范围')
    }
    return { start, end, value: normalizeRange(match[0]).ranges }
  })
  // 只识别紧邻显式列表的排除标记，不解释不明确的自然语言排除条件。
  const list = String.raw`${RANGE_TOKEN}(?:[\s,，、;；和及与]+${RANGE_TOKEN})*`
  const postfixList = list
  const exclusions = [
    ...source.matchAll(new RegExp(String.raw`(?:排除|不含|跳过|除了)\s*(?:(?:IP|地址|范围|网段)\s*[:：]?\s*)?${list}`, 'gu')),
    ...source.matchAll(new RegExp(String.raw`${postfixList}\s*除外`, 'gu')),
  ].map(match => ({ start: match.index!, end: match.index! + match[0].length }))
  for (const marker of source.matchAll(/排除|除外|跳过|不含|除了/gu)) {
    if (!exclusions.some(span => span.start <= marker.index! && span.end >= marker.index! + marker[0].length)) {
      throw new Error('用户含不能准确映射的排除约束，请先澄清，不启动扫描')
    }
  }
  for (const span of exclusions) {
    const next = tokens.find(token => token.start >= span.end)
    if (next && !exclusions.some(other => other.start <= next.start && other.end >= next.end)
      && !/^[,，;；。]\s*(?:仅|只)?(?:对|发现|探测|扫描|识别|包含|包括)\s*$/u.test(source.slice(span.end, next.start))) {
      throw new Error('排除列表后仍有不能明确归属的IP，请先澄清，不静默漏排除')
    }
    if (source.slice(span.start, span.end).endsWith('除外')) {
      const previous = tokens.filter(token => token.end <= span.start).at(-1)
      if (previous && !/[,，;；。!?！？]/u.test(source.slice(previous.end, span.start))) {
        throw new Error('除外列表前仍有不能明确归属的IP，请先澄清，不将排除项当包含项')
      }
    }
  }
  const includedSource = new Set<string>(), excludedSource = new Set<string>()
  for (const token of tokens) {
    const excludedToken = exclusions.some(span => span.start <= token.start && span.end >= token.end)
    ;(excludedToken ? excludedSource : includedSource).add(token.value)
  }
  if (range.ranges.split(',').some(part => !includedSource.has(part))) {
    throw new Error('包含范围必须与当前用户的完整显式范围同值，不拼接、推导或扩大目标')
  }
  const excludedParts = excluded.split(',').filter(Boolean)
  if (excludedParts.length !== excludedSource.size || excludedParts.some(part => !excludedSource.has(part))) {
    throw new Error('排除范围必须完整对应当前用户的排除项，不能缺失、错配或冒充包含范围')
  }
  return { range, excluded }
}

export function normalizeAssets(rows: any[]) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ASSETS) throw new Error(`每批待纳管设备应为1至${MAX_ASSETS}条，不接受空清单或静默截断`)
  const allowed = new Set(['ip', 'hostname', 'assetType', 'modelId', 'deployForm', 'hostAssetId', 'findingId'])
  const seen = new Set()
  return rows.map((row, index) => {
    if (!object(row) || Object.keys(row).some(key => !allowed.has(key))) throw new Error(`第${index + 1}条含不支持字段；软件资产不能冒用设备新增入口`)
    if (isIP(row.ip) !== 4 || row.ip.split('.').some((part: string) => String(Number(part)) !== part)) throw new Error(`第${index + 1}条缺少规范IPv4，Excel导入不将范围展开为设备`)
    if (seen.has(row.ip)) throw new Error(`IP ${row.ip}重复，请先合并或澄清冲突字段`)
    seen.add(row.ip)
    const value: Value = { ip: row.ip }
    for (const field of ['hostname', 'assetType', 'deployForm']) if (row[field] !== undefined) {
      if (typeof row[field] !== 'string' || !row[field].trim() || row[field].length > 255 || /[\u0000-\u001f]/u.test(row[field])) throw new Error(`第${index + 1}条${field}无效`)
      value[field] = row[field].trim()
    }
    for (const field of ['modelId', 'hostAssetId', 'findingId']) if (row[field] !== undefined) {
      if (!positive(row[field])) throw new Error(`第${index + 1}条${field}必须来自真实资料且为正整数`)
      value[field] = row[field]
    }
    return value
  })
}

class SocFailure extends Error {
  businessFailure: boolean
  constructor(code: any, message: string) { super(message); this.businessFailure = /^4\d\d$/.test(String(code)) }
}
const validAssetId = (value: any) => positive(value) || typeof value === 'string' && /^[1-9]\d*$/.test(value)

/** 同一Session按IP跨清单、跨手工/发现路线拦住未核写入，不影响无关目标。 */
async function reserveTarget(directory: string, asset: any, preview: any) {
  const path = join(directory, `target-${hash(asset.ip)}.json`)
  let previous
  try { previous = JSON.parse(await readFile(path, 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
  if (previous && !['failed', 'not_submitted'].includes(previous.state)) return { path, previous }
  const value = { ip: asset.ip, state: 'pending', preview_digest: preview.preview_digest, route: preview.route, taskId: preview.taskId, findingId: asset.findingId ?? null }
  await writeFile(path, JSON.stringify(value), { ...(previous ? {} : { flag: 'wx' }), mode: 0o600, flush: true })
  return { path, previous: null }
}
async function settleTarget(path: string, result: any, preview: any) {
  await writeFile(path, JSON.stringify({ ip: result.ip, state: result.status, preview_digest: preview.preview_digest, result }), { mode: 0o600, flush: true })
}
export function unpack(result: any): any {
  if (result?.isError) throw new Error('SOC工具返回错误，未取得业务成功回执')
  let value = result?.value ?? result?.structuredContent
  if (value === undefined && object(result) && result.code !== undefined) value = result
  if (value === undefined) {
    const blocks = (result?.content ?? []).flatMap((part: any) => part.type === 'tool-result' ? part.content ?? [] : [part])
    const raw = blocks.filter((part: any) => part.type === 'text').map((part: any) => part.text).join('')
    try { value = JSON.parse(raw) } catch { throw new Error('SOC回执不是可核验JSON，不能视为成功') }
  }
  if (object(value) && value.structuredContent !== undefined) value = value.structuredContent
  if (object(value) && Array.isArray(value.content) && value.code === undefined) return unpack(value)
  if (!object(value) || value.code === undefined) throw new Error('SOC回执缺少业务状态')
  if (!['200', '0'].includes(String(value.code))) throw new SocFailure(value.code, `SOC拒绝请求：${String(value.msg ?? value.message ?? value.code).slice(0, 300)}`)
  return value.data ?? null
}

export function history(events: any[]) {
  const calls = new Map(), records: any[] = []
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event.type === 'tool/call' && event.data?.name === TOOL_NAME) calls.set(event.data.callId, event.data)
    const message = event.data?.message
    if (event.type !== 'tool/result' || message?.source?.kind !== 'tool' || message.isError || !calls.has(message.source.callId)) continue
    const block = message.content?.find((part: any) => part.type === 'tool-result' && part.toolCallId === message.source.callId)
    if (block?.isError) continue
    const raw = (block?.content ?? message.content ?? []).find((part: any) => part.type === 'text')?.text
    try {
      const value = JSON.parse(raw)
      if (value.schema_version === 'asset-onboarding/v1') records.push({ value, index })
    } catch { /* 非本工具的可重建JSON不作授权依据。 */ }
  }
  return records
}

export function priorPreview(identity: any, expected: string) {
  const records = history(identity.events)
  const record = records.filter(item => item.value.kind === 'preview').at(-1)
  if (!record || record.value.session_id !== identity.sessionId || record.value.group_id !== GROUP_ID || record.value.preview_digest !== expected || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('没有匹配的本会话最新待导入清单，请先重新预览')
  if (hash([GROUP_ID, identity.sessionId, record.value.preview_user_message_id, record.value.assets, record.value.source, record.value.route, record.value.taskId ?? null]) !== expected) throw new Error('清单摘要与当前会话或冻结字段不符，不能确认继承或改写的清单')
  if (records.some(item => item.index > record.index && item.value.kind === 'cancelled')) throw new Error('本批次已取消，旧确认失效')
  const after = identity.events.slice(record.index + 1).filter((event: any) => event.type === 'user/message' && event.data?.source?.kind === 'user')
  if (after.length !== 1 || after[0].data.id !== identity.messageId || !/^确认(?:导入|纳管)$/.test(identity.request)) throw new Error('查看完整清单后请单独回复“确认导入”或“确认纳管”；其他新消息使旧确认失效')
  const confirmedIndex = identity.events.indexOf(after[0])
  const visible = identity.events.slice(record.index + 1, confirmedIndex).some((event: any) => event.type === 'assistant/message' && text(event.data?.message ?? event.data).includes(record.value.markdown))
  if (!visible) throw new Error('本清单尚未在确认前完整呈现在聊天正文，请先原样展示清单')
  return record.value
}

function sourceEvidence(identity: any, source: any) {
  const records = history(identity.events).filter(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID)
  const record = source?.kind === 'excel'
    ? records.filter(item => item.value.kind === 'workbook' && item.value.attachment_id === source.attachment_id).at(-1)
    : source?.kind === 'discovery'
      ? records.filter(item => ['discovery', 'discovery-result'].includes(item.value.kind) && item.value.evidence_id === source.evidence_id).at(-1) : undefined
  if (!record || record.value.evidence_complete === false || ['pending', 'failed', 'unknown'].includes(record.value.state)) throw new Error('清单必须引用本会话真实、完整的Excel或SOC发现回执，不能使用失败、未知或不完整来源')
  return record.value
}
function contains(value: any, predicate: (item: any) => boolean): boolean {
  if (predicate(value)) return true
  return Array.isArray(value) ? value.some(item => contains(item, predicate)) : object(value) ? Object.values(value).some(item => contains(item, predicate)) : false
}
export function previewAssets(identity: any, args: any) {
  const source = sourceEvidence(identity, args.source), assets = normalizeAssets(args.assets)
  for (const asset of assets) {
    if (!contains(source, item => item === asset.ip)) throw new Error(`IP ${asset.ip}没有所选来源依据，不允许补造设备`)
    if (source.taskId && !positive(asset.findingId)) throw new Error('任务发现结果必须保留findingId并使用发现纳管，不能改走手工登记')
    if (asset.findingId !== undefined && (!source.taskId || !contains(source.facts, item => object(item) && item.ip === asset.ip && (item.findingId ?? item.id) === asset.findingId))) throw new Error('findingId与IP未绑定到同一真实发现结果')
  }
  const route = source.taskId ? 'adopt' : 'manual'
  const preview_digest = hash([GROUP_ID, identity.sessionId, identity.messageId, assets, args.source, route, source.taskId ?? null])
  const markdown = [`待导入设备 ${assets.length} 条 · 批次 ${preview_digest.slice(0, 12)}`, '|序号|IP|主机名|资产类型|型号ID|部署形态|宿主ID|', '|---|---|---|---|---|---|---|', ...assets.map((asset, index) => `|${index + 1}|${cell(asset.ip)}|${cell(asset.hostname)}|${cell(asset.assetType)}|${cell(asset.modelId)}|${cell(asset.deployForm)}|${cell(asset.hostAssetId)}|`)].join('\n')
  return { kind: 'preview', preview_digest, preview_user_message_id: identity.messageId, assets, source: args.source, route, taskId: source.taskId ?? null, markdown, saved: false }
}

const GROUP_TARGET = 'io.deepseek.dsh/mcp-group-target'
const GROUP_OWNER = 'io.deepseek.dsh/mcp-group-tool'
const TASK_QUERY = 'get_soc_discovery_tasks_by_task_id'
const bindingError = (code: string) => Object.assign(new Error(`资产组接线未就绪：${code}；未发送SOC业务请求，不表示设备离线或SOC无数据`), { code })

/** 复用现有公开组v2合同，不注册底层工具、不猜本地命名、不读取认证或跨作用域取工具。 */
export function createAssetGroupBackend(ctx: any) {
  const pending = new WeakMap<object, Promise<any>>()
  const identity = (exec: any) => {
    mainIdentity(exec)
    if (!exec.agent?.session?.id || typeof exec.callId !== 'string' || !exec.callId) throw bindingError('ASSET_NATIVE_CONTEXT_MISSING')
  }
  const supported = () => typeof ctx.mcpSessionManager?.listGroupTools === 'function' && typeof ctx.mcpSessionManager?.callGroupTool === 'function'
  const catalog = async (exec: any) => {
    identity(exec)
    if (!supported()) throw bindingError('ASSET_GROUP_API_UNAVAILABLE')
    if (!pending.has(exec)) pending.set(exec, (async () => {
      const value = await ctx.mcpSessionManager.listGroupTools(GROUP_ID, 2)
      identity(exec)
      const target = value?._meta?.[GROUP_TARGET]
      if (!Array.isArray(value?.tools) || value.nextCursor || value?._meta?.['io.deepseek.dsh/mcp-group-discovery']?.unavailable?.length
        || target?.version !== 2 || typeof target.digest !== 'string' || !/^[a-f0-9]{64}$/u.test(target.digest)) throw bindingError('ASSET_GROUP_CATALOG_INVALID')
      return { tools: value.tools, meta: { [GROUP_TARGET]: { digest: target.digest, version: 2 } } }
    })())
    const value = await pending.get(exec)
    identity(exec)
    return value
  }
  const matches = (directory: any, operation: string) => directory.tools.filter((tool: any) => tool.name === operation)
  const verified = (tool: any, operation: string) => {
    const owner = tool?._meta?.[GROUP_OWNER]
    return owner?.serverId === 'ai-soc-master' && owner.sourceName === operation && owner.kind === (operation === TASK_QUERY ? 'template' : 'tool')
  }
  const taskContract = (tool: any) => {
    const uri = tool?._meta?.[GROUP_OWNER]?.sourceUri, schema = tool?.inputSchema
    const property = schema?.properties?.taskId
    const type = ['integer', 'number', 'string'].includes(property?.type) ? property.type
      : property?.oneOf?.some((item: any) => item.type === 'string') ? 'string' : undefined
    if (!verified(tool, TASK_QUERY) || typeof uri !== 'string' || !/\/soc\/discovery\/tasks\/\{taskId\}$/u.test(uri)
      || /[{}]/u.test(uri.replace('{taskId}', '')) || schema?.type !== 'object' || !Array.isArray(schema.required)
      || schema.required.length !== 1 || schema.required[0] !== 'taskId' || !type) throw bindingError('ASSET_TASK_TEMPLATE_INVALID')
    return { uri, type }
  }
  const lookup = async (operation: string, exec: any) => {
    if (![...operations, TASK_QUERY].includes(operation)) throw bindingError('ASSET_OPERATION_OUT_OF_SCOPE')
    const directory = await catalog(exec), rows = matches(directory, operation)
    if (rows.length !== 1 || !verified(rows[0], operation)) throw bindingError('ASSET_GROUP_BINDING_NOT_UNIQUE')
    if (operation === TASK_QUERY) taskContract(rows[0])
    return { tool: rows[0], meta: directory.meta }
  }
  const dispatch = async (operation: string, args: any, exec: any) => {
    let binding
    try { identity(exec); binding = await lookup(operation, exec); identity(exec) }
    catch (error: any) { error.notSent = true; throw error }
    // 现有服务内部保持目标摘要、原生Session/callId、叶子许可及取消信号，不重新发现或自动重发。
    return ctx.mcpSessionManager.callGroupTool(GROUP_ID, 2, binding.tool.name, args, binding.meta, exec)
  }
  return {
    lookup,
    call: async (operation: string, args: any, exec: any) => {
      if (!operations.includes(operation)) throw bindingError('ASSET_OPERATION_OUT_OF_SCOPE')
      return unpack(await dispatch(operation, args, exec))
    },
    resource: async (taskId: number, exec: any) => {
      if (!positive(taskId)) throw bindingError('ASSET_TASK_ID_INVALID')
      const binding = await lookup(TASK_QUERY, exec), { uri, type } = taskContract(binding.tool)
      const result = await dispatch(TASK_QUERY, { taskId: type === 'string' ? String(taskId) : taskId }, exec)
      if (result?.isError) throw new Error('资产分组资源请求失败')
      const value = result?.structuredContent
      // 公开组资源合同保留代理URI，不把上游HTTP URI当组资源回执。
      const proxy = `mcp-group:/${GROUP_ID}/ai-soc-master/t/${Buffer.from(uri).toString('base64url')}`
      const entries = value?.contents?.filter((item: any) => [proxy, `${proxy}?taskId=${encodeURIComponent(String(taskId))}`].includes(item.uri) && typeof item.text === 'string')
      if (!Array.isArray(entries) || entries.length !== 1) throw new Error('发现任务回执与已绑定资源URI不匹配，不能据展示占位或空数组判完成')
      return unpack({ value: JSON.parse(entries[0].text) })
    },
    status: async (exec: any) => {
      let directory: any, error: string | null = null
      try { directory = await catalog(exec) }
      catch (failure: any) { error = typeof failure.code === 'string' && /^ASSET_[A-Z_]+$/u.test(failure.code) ? failure.code : 'ASSET_GROUP_DIRECTORY_UNAVAILABLE' }
      const interfaces = operations.map(operation => {
        const rows = directory ? matches(directory, operation) : []
        return { operation, registered_count: rows.length, registered_names: rows.map((tool: any) => tool.name), source_verified: rows.length === 1 && verified(rows[0], operation) }
      })
      const templates = directory ? matches(directory, TASK_QUERY) : []
      let templateReady = false
      if (templates.length === 1) try { taskContract(templates[0]); templateReady = true } catch { error ??= 'ASSET_TASK_TEMPLATE_INVALID' }
      const interfacesLoaded = interfaces.every(item => item.source_verified)
      return { configured: null, configuration_check_supported: false, expected_namespace: GROUP_ID, expected_member: 'ai-soc-master',
        transport: 'group-v2-public-service', group_api_supported: supported(), local_tool_registration_required: false,
        interfaces, interfaces_loaded: interfacesLoaded, task_query_resource: templateReady ? 'loaded' : directory ? 'missing_or_ambiguous' : 'unavailable',
        task_query_template_count: directory ? templates.length : null, binding_error: error, tooling_ready: interfacesLoaded && templateReady }
    },
  }
}

export function apply(ctx: any) {
  const locks = new Map<string, Promise<any>>()
  // 原生高层工具拥有固定流程。底层SOC工具不对模型开放，内部仍沿既有MCP连接，不新增HTTP代理。
  ctx.tools.guard((exec: any) => exec.name.startsWith(`mcp__${GROUP_ID}__`) || exec.name === 'read_mcp_resource' && exec.arguments?.server === GROUP_ID ? '请使用资产纳管高层入口；底层接口不能绕过清单与真实用户确认' : undefined)
  const { lookup, call, resource, status } = createAssetGroupBackend(ctx)
  const perform = async (args: any, exec: any) => {
    const identity = mainIdentity(exec)
    const respond = (value: any) => {
      const { raw_adopt_result: _raw, ...projection } = value
      const result = { ...projection, schema_version: 'asset-onboarding/v1', session_id: identity.sessionId, group_id: GROUP_ID }
      if (JSON.stringify(result).length <= MAX_OUTPUT) return result
      if (value.kind === 'receipt') return { schema_version: 'asset-onboarding/v1', session_id: identity.sessionId, group_id: GROUP_ID, kind: 'receipt', preview_digest: value.preview_digest, state: value.state, saved: value.saved, output_limited: true, message: '原批次可能已经发送并已保存回执。输出超过预算，不能据此判断未提交，也不能重发；请按原批次核对SOC记录。' }
      if (['discovery', 'discovery-result'].includes(value.kind)) return { schema_version: 'asset-onboarding/v1', session_id: identity.sessionId, group_id: GROUP_ID, kind: value.kind, taskId: positive(value.taskId) ? value.taskId : null, evidence_id: value.evidence_id, evidence_complete: false, state: value.state ?? 'received', saved: false, autoAdopt: false, message: '已收到发现回执，但完整证据超过展示预算；未新增资产，不生成部分清单或重新扫描，请缩小后续处理范围。' }
      throw new Error('完整清单超过输出预算，尚未生成可确认的预览；请拆分输入，不导入未展示部分')
    }
    if (args.action === 'status') {
      const backend = await status(exec)
      return respond({ kind: 'status', local_entry_loaded: true, evidence_scope: 'current_session_group_v2_directory_only', backend,
        business_verification: 'not_performed', registration_performed: false,
        message: backend.tooling_ready ? '本会话资产组v2六动作及任务模板已唯一绑定；未向模型注册底层工具。这仅是受管目录/调用路径证据，未验证SOC业务或发现、登记闭环，未探测、未新增。' : '本地入口已加载，但受管组v2提供者或精确来源绑定未就绪；请按binding_error核接线，不表示设备离线或SOC无数据。未探测、未新增。' })
    }
    if (args.action === 'read_excel' && typeof args.attachment_id !== 'string') throw new Error('请先列出真实附件，再传入要解析的attachment_id')
    if (['attachments', 'read_excel'].includes(args.action)) return respond({ ...await readAssetWorkbook(ctx, exec, args.action === 'read_excel' ? args.attachment_id : undefined), backend_connection_checked: false, group_id_is_connection_proof: false })
    if (args.action === 'receipt') {
      if (!history(identity.events).some(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.preview_digest === args.preview_digest)) throw new Error('只能读取本会话真实批次的原回执')
      const path = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]), `${args.preview_digest}.json`)
      return respond({ kind: 'receipt', ...JSON.parse(await readFile(path, 'utf8')), replayed: true })
    }
    if (args.action === 'discover') {
      const denied = /取消|停止|撤销|如何|怎么|能否|是否|会影响|有什么影响|[?？]|(?:不|别|暂不|无需|禁止|勿)\s*(?:要\s*)?(?:再\s*)?(?:探测|发现|扫描|识别|执行|做任何动作)|(?:只|仅|先)(?:做|生成)?(?:整理|说明|解释|咨询|预览|清单|方案)/u.test(identity.request)
      if (denied || !/(探测|发现|识别|扫描)/u.test(identity.request)) throw new Error('没有本轮明确探测授权，咨询和Excel导入不启动扫描')
      const { range, excluded } = validateDiscoveryRanges(identity.request, args.ranges, args.excluded_ranges)
      const single = !excluded && range.count === 1 && isIP(range.ranges) === 4
      await lookup(single ? 'create_soc_asset_probe' : 'create_soc_discovery_tasks', exec)
      await lookup(single ? 'create_soc_discovery_identify' : 'start_soc_discovery_tasks', exec)
      const directory = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId]))
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const path = join(directory, `discovery-${hash([identity.messageId, range.ranges, excluded])}.json`)
      let existing
      try { existing = JSON.parse(await readFile(path, 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
      if (existing) return respond({ ...existing, replayed: true, hint: '本轮已发送发现请求，不重复创建或扫描；有taskId仅查询原任务' })
      const state: any = { kind: 'discovery', evidence_id: hash([identity.sessionId, identity.messageId, range.ranges, excluded]), ranges: range.ranges, excluded_ranges: excluded, autoAdopt: false, saved: false, state: 'pending' }
      let phase = single ? 'create_soc_asset_probe' : 'create_soc_discovery_tasks'
      await writeFile(path, JSON.stringify(state), { flag: 'wx', mode: 0o600 })
      try {
        if (single) {
          state.facts = { ip: range.ranges }
          state.facts.connectivity = await call('create_soc_asset_probe', { ip: range.ranges, mode: 'hybrid' }, exec)
          if (state.facts.connectivity === null) throw new Error('SOC缺少连通性检查结果')
          await writeFile(path, JSON.stringify(state), { mode: 0o600 })
          phase = 'create_soc_discovery_identify'
           state.facts.identification = await call('create_soc_discovery_identify', { ip: range.ranges }, exec)
          if (state.facts.identification === null) throw new Error('SOC缺少设备识别结果')
          state.state = 'completed'
        } else {
          const prepared = await call('create_soc_discovery_tasks', { includedRanges: range.ranges, ...(excluded ? { excludedRanges: excluded } : {}), autoAdopt: false }, exec)
          const taskId = prepared?.taskId ?? prepared?.id ?? prepared?.task?.taskId ?? prepared?.task?.id
          state.taskId = positive(taskId) ? taskId : null
          const previewHash = prepared?.previewHash ?? prepared?.task?.previewHash
          state.facts = { prepared }
          if (!positive(state.taskId) || typeof previewHash !== 'string' || !previewHash) throw new Error('SOC缺少可核实taskId和previewHash，未启动扫描且不能猜测标识重发')
          await writeFile(path, JSON.stringify(state), { mode: 0o600 })
          phase = 'start_soc_discovery_tasks'
           state.facts.started = await call('start_soc_discovery_tasks', { taskId: state.taskId, body: { previewHash } }, exec)
          state.state = 'accepted'
        }
        state.evidence_complete = true
      } catch (error: any) { state.state = error.businessFailure ? 'failed' : 'unknown'; state.reason = `${phase}：${error.message}`; state.evidence_complete = false }
      await writeFile(path, JSON.stringify(state), { mode: 0o600 })
      return respond(state)
    }
    if (args.action === 'query') {
      if (!positive(args.task_id) || !history(identity.events).some(item => item.value.session_id === identity.sessionId && item.value.group_id === GROUP_ID && item.value.taskId === args.task_id)) throw new Error('只能查询本会话已受理的发现任务')
      const facts = await resource(args.task_id, exec)
      return respond({ kind: 'discovery-result', evidence_id: hash([identity.sessionId, args.task_id, facts]), taskId: args.task_id, facts, autoAdopt: false, saved: false })
    }
    if (args.action === 'preview') return respond(previewAssets(identity, args))
    if (args.action === 'cancel') return respond({ kind: 'cancelled', saved: false, message: '已取消，不新增资产，旧确认失效' })
    if (args.action !== 'commit') throw new Error('未知资产纳管动作')
    const preview = priorPreview(identity, args.preview_digest)
    await lookup(preview.route === 'adopt' ? 'create_soc_discovery_tasks_adopt' : 'create_soc_asset', exec)
    const directory = join(STATE_ROOT, hash([GROUP_ID, identity.sessionId])), path = join(directory, `${preview.preview_digest}.json`)
    await mkdir(directory, { recursive: true, mode: 0o700 })
    let previous
    try { previous = JSON.parse(await readFile(path, 'utf8')) } catch (error: any) { if (error.code !== 'ENOENT') throw error }
    if (previous) return respond({ kind: 'receipt', ...previous, replayed: true, hint: '本批次已发送，不重复新增；未知项需核对SOC原记录' })
    const journal: any = { preview_digest: preview.preview_digest, taskId: preview.taskId, state: 'pending', results: [], saved: false }
    await writeFile(path, JSON.stringify(journal), { flag: 'wx', mode: 0o600, flush: true })
    const save = async () => writeFile(path, JSON.stringify(journal), { mode: 0o600, flush: true })
    const previousResult = (asset: any, previous: any) => previous.state === 'registered'
      ? { ip: asset.ip, status: 'previously_registered', previous_receipt: previous.result, reason: '返回此前登记回执，未刷新当前SOC状态，本批次不重复登记或覆盖属性' }
      : { ip: asset.ip, status: 'blocked_unknown', previous_preview_digest: previous.preview_digest, reason: '本会话此前有同IP待核写入，不能换清单、来源或接口重发；先核对SOC原记录' }
    if (preview.route === 'adopt') {
      const active: any[] = []
      for (const asset of preview.assets) {
        const reservation = await reserveTarget(directory, asset, preview)
        journal.results.push(reservation.previous ? previousResult(asset, reservation.previous) : { ip: asset.ip, findingId: asset.findingId, status: 'pending' })
        if (!reservation.previous) active.push({ asset, path: reservation.path, index: journal.results.length - 1 })
      }
      await save()
      if (active.length) {
        try {
          const data = await call('create_soc_discovery_tasks_adopt', { taskId: preview.taskId, body: active.map(item => item.asset) }, exec)
          journal.raw_adopt_result = data
          journal.adopt_summary = { adopted: typeof data?.adopted === 'number' ? data.adopted : null, failed: typeof data?.failed === 'number' ? data.failed : null }
          const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : []
          for (const item of active) {
            const matches = rows.filter((row: any) => row.findingId === item.asset.findingId)
            const row = matches.length === 1 ? matches[0] : null
            const assetId = row?.assetId ?? row?.data?.assetId
            journal.results[item.index] = validAssetId(assetId)
              ? { ip: item.asset.ip, findingId: item.asset.findingId, status: 'registered', assetId, created: row.created ?? null }
              : { ip: item.asset.ip, findingId: item.asset.findingId, status: 'unknown', reason: '已收到批量回执，但该发现记录缺少唯一可核实资产ID；不重发' }
            await settleTarget(item.path, journal.results[item.index], preview)
          }
        } catch (error: any) {
          for (const item of active) {
            journal.results[item.index] = { ip: item.asset.ip, findingId: item.asset.findingId, status: error.notSent ? 'not_submitted' : error.businessFailure ? 'failed' : 'unknown', reason: String(error.message).slice(0, 300) }
            await settleTarget(item.path, journal.results[item.index], preview)
          }
        }
        await save()
      }
    } else {
      for (let index = 0; index < preview.assets.length; index++) {
        try { mainIdentity(exec) } catch (error: any) { journal.interruption_reason = error.message; break }
        const { findingId: _findingId, ...asset } = preview.assets[index]
        const reservation = await reserveTarget(directory, asset, preview)
        if (reservation.previous) { journal.results.push(previousResult(asset, reservation.previous)); await save(); continue }
        journal.results.push({ ip: asset.ip, status: 'pending' }); await save()
        try {
          const data = await call('create_soc_asset', { body: asset }, exec)
          const assetId = validAssetId(data) ? data : data?.assetId
          if (!validAssetId(assetId)) throw new Error('SOC未返回有效资产ID，写入结果未知')
          journal.results[index] = { ip: asset.ip, status: 'registered', assetId, created: object(data) ? data.created ?? null : null }
        } catch (error: any) { journal.results[index] = { ip: asset.ip, status: error.notSent ? 'not_submitted' : error.businessFailure ? 'failed' : 'unknown', reason: String(error.message).slice(0, 300) } }
        await settleTarget(reservation.path, journal.results[index], preview)
        await save()
      }
    }
    journal.state = journal.results.every((item: any) => item.status === 'registered') && journal.results.length === preview.assets.length ? 'completed' : 'partial_or_unknown'
    journal.saved = journal.results.some((item: any) => item.status === 'registered') || (journal.adopt_summary?.adopted ?? 0) > 0
    journal.unsubmitted = [...journal.results.filter((item: any) => item.status === 'not_submitted').map((item: any) => item.ip), ...preview.assets.slice(journal.results.length).map((item: any) => item.ip)]
    await save()
    return respond({ kind: 'receipt', ...journal, message: '逐条以SOC回执及实际资产ID为准；相同IP可能复用已有资产，未返回created不称全部新建；历史回执未刷新，未知项不换批次或接口重发' })
  }
  ctx.tools.register({
    name: TOOL_NAME,
    description: '资产纳管：status仅只读核对本会话后端工具和任务查询模板；attachments/read_excel仅本地附件，不证明SOC接入。按明确IP范围发现，以真实来源完整预览，新用户确认后才登记。Excel不探测，自动纳管关闭，未知写入不重放。',
    parameters: { type: 'object', additionalProperties: false, required: ['action'], properties: {
      action: { type: 'string', enum: ['status', 'attachments', 'read_excel', 'discover', 'query', 'preview', 'commit', 'receipt', 'cancel'] },
      attachment_id: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }, ranges: { type: 'string' }, excluded_ranges: { type: 'string', description: '用户明确排除的IP或范围，不能省略排除约束' }, task_id: { type: 'integer', minimum: 1 },
      source: { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string', enum: ['excel', 'discovery'] }, attachment_id: { type: 'string' }, evidence_id: { type: 'string' } } },
      assets: { type: 'array', minItems: 1, maxItems: MAX_ASSETS, items: { type: 'object', additionalProperties: false, required: ['ip'], properties: { ip: { type: 'string' }, hostname: { type: 'string' }, assetType: { type: 'string' }, modelId: { type: 'integer' }, deployForm: { type: 'string' }, hostAssetId: { type: 'integer' }, findingId: { type: 'integer' } } } },
      preview_digest: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    } },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args: any, value: any) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 120000, isConcurrencySafe: () => false,
    async execute(args: any, exec: any) {
      const key = hash(mainIdentity(exec).sessionId)
      const previous = locks.get(key) ?? Promise.resolve()
      const current = previous.catch(() => {}).then(() => perform(args, exec))
      locks.set(key, current)
      try { return await current } finally { if (locks.get(key) === current) locks.delete(key) }
    },
  })
}
