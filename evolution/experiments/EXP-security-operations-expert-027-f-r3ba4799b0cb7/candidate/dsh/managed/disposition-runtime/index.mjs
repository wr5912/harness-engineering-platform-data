import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { resolveToolName } from './tool-resolver.mjs'
import { validateCompletionEvent, deriveBoundAnalysis, validateMappedSingleAction,
  sourceBinding, continuationStop } from '../continuation-helper.mjs'

export const name = 'disposition-runtime'
export const inject = ['tools', 'webServer', 'sessionQuery']

const runtimeRequire = createRequire(
  process.env.DSH_MCP_CLIENT_ANCHOR || '/opt/dsh/packages/mcp/mcp-client/package.json',
)
const TOOL_TIMEOUT_MS = 60_000

function parseText(text) {
  if (typeof text !== 'string' || !text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function payloadOf(result) {
  if (result?.structuredContent !== undefined) return result.structuredContent
  const text = result?.content?.find(item => item?.type === 'text' && typeof item?.text === 'string')?.text
  return parseText(text)
}

/** 组端点把资源模板包装成工具时，回执可能是 resources/read 的 contents 结构。 */
function unwrapContents(value) {
  if (value && Array.isArray(value.contents)) {
    const text = value.contents.find(item => typeof item?.text === 'string')?.text
    if (typeof text === 'string') return parseText(text)
  }
  return value
}

function recommendedActions(resultJson) {
  let root = resultJson
  for (let i = 0; i < 2 && typeof root === 'string'; i += 1) {
    try {
      root = JSON.parse(root)
    } catch {
      return []
    }
  }
  const candidates = [root?.result?.recommended_actions, root?.recommended_actions, root?.data?.recommended_actions]
  const actions = candidates.find(Array.isArray)
  if (!actions) return []
  return actions
    .filter(item => item && typeof item.action === 'string' && item.action.trim())
    .map(item => ({
      action: item.action,
      target: item.target,
      priority: item.priority,
      reason: item.reason,
    }))
}

async function openGroup(groupUrl, token, fetchImpl) {
  const { Client, StreamableHTTPClientTransport } = runtimeRequire('@modelcontextprotocol/client')
  const client = new Client({ name: 'disposition-runtime', version: '0.1.0' })
  const options = {}
  if (token) options.requestInit = { headers: { authorization: `Bearer ${token}` } }
  // 业务实例没有分组 token：由平台业务运行时按 Session 签发业务断言。
  if (typeof fetchImpl === 'function') options.fetch = fetchImpl
  const transport = new StreamableHTTPClientTransport(new URL(groupUrl), options)
  await client.connect(transport, { timeout: 20_000 })
  return client
}

// ---------------------------------------------------------------------------
// 研判建议 → 可执行/人工 的分类，以及设备与可执行节点（agent）解析。
//
// 语义约定（与 emergency-disposition SKILL 的「处置目标 / 攻击来源」区分一致）：
//  - 目录感知：动作是否可执行先查应急动作目录 get_resp_action_defs 的
//    enabled 与 agentExecutable，两者都为真才允许 executable=true。
//  - 「隔离 / 网络隔离」= 对该主机本身执行网络隔离，动作键 host-selfblock-net，
//    目标就是被隔离的主机；按 target.ip/host/asset_id 解析设备与可执行节点。
//    host-selfblock-net 目录不可执行时临时替代为 host-block-ip：
//    params.src_ip = 目标主机 IP（不是承载设备地址），目标仍是该主机 agent，
//    并标记 fallback=true 与中文 fallback_reason（隔离落点待 SOC 确认）。
//  - 「封禁 / 阻断」= 封禁建议中的那个地址（params.src_ip），不是在该地址所属
//    设备上做操作；执行侧（防火墙侧 block-ip / 主机侧 host-block-ip）能确定才
//    可执行，否则给出中文候选。被封禁地址永远不会被当成承载设备参数。
//  - 「核验 / 排查 / 取证 / 确认 / 哈希 / 签名」= 需人工核验，暂不能自动处置。
//  - 其他文本 = 暂不能自动处置，给中文原因与建议。
// ---------------------------------------------------------------------------

const IPV4_CANDIDATE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g
const ISOLATE_PHRASE = /网络隔离|隔离/
// 「解除封禁」含「封禁」子串，必须先按解封判定，再按封禁判定。
const UNBLOCK_PHRASE = /解封|解除封禁|解除阻断|解除封堵|解除封锁|取消封禁|解除[^。；，]{0,24}(?:封禁|阻断|封堵|封锁)|unblock/i
const BLOCK_PHRASE = /封禁|阻断/
const ACCOUNT_NOUN = /账号|账户|用户名|用户|account|username/i
const ACCOUNT_DISABLE_PHRASE = /禁用|停用|冻结|停权|disable|deactivate/i
const ACCOUNT_ENABLE_PHRASE = /启用|激活|恢复|解禁|解锁|enable|activate/i
const SCAN_PHRASE = /扫描|查杀|scan/i
// 扫描意图需要排除的强核验措辞：出现核验/取证等时仍按人工核验处理。
const MANUAL_STRONG_PHRASE = /核验|取证|哈希|签名/
const MANUAL_PHRASE = /核验|排查|取证|确认|哈希|签名/
const FIREWALL_SIDE_PHRASE = /防火墙|网络设备|跨厂商|边界设备|访问控制列表/
const HOST_SIDE_PHRASE = /主机侧|主机上|在主机|终端上|端点上|服务器上|主机设备/

export function extractIpv4(text) {
  for (const raw of String(text ?? '').match(IPV4_CANDIDATE) ?? []) {
    const parts = raw.split('.').map(Number)
    if (parts.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) return raw
  }
  return null
}

/** 把研判建议的 target 归一成 {host_name, ip, asset_id, raw}，不丢原始字段。 */
export function targetHint(target) {
  if (typeof target === 'string') {
    const trimmed = target.trim()
    return {
      host_name: extractIpv4(trimmed) || /^\d+$/.test(trimmed) ? null : trimmed,
      ip: extractIpv4(trimmed),
      asset_id: /^\d+$/.test(trimmed) ? trimmed : null,
      raw: target,
    }
  }
  if (target && typeof target === 'object') {
    return {
      host_name: typeof target.host_name === 'string' && target.host_name.trim()
        ? target.host_name.trim()
        : (typeof target.host === 'string' && target.host.trim() ? target.host.trim() : null),
      ip: typeof target.ip === 'string' && extractIpv4(target.ip) ? extractIpv4(target.ip) : null,
      asset_id: target.asset_id !== undefined && target.asset_id !== null && String(target.asset_id).trim()
        ? String(target.asset_id).trim() : null,
      raw: target,
    }
  }
  return { host_name: null, ip: null, asset_id: null, raw: target ?? null }
}

/** 从建议文本/目标中提取账号（用户名）；提取不到返回 null，不做猜测。 */
export function extractAccount(text, target) {
  if (target && typeof target === 'object') {
    for (const key of ['user', 'username', 'account', 'account_name']) {
      const value = target[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  const raw = String(text ?? '')
  const patterns = [
    /(?:账号|账户|用户名|用户)\s*(?:为|是|[:：=])\s*[「"'\[【]?([A-Za-z0-9_.@\-]+)[」"'\]】]?/,
    /(?:账号|账户|用户名|用户)\s+[「"'\[【]?([A-Za-z0-9_.@\-]+)[」"'\]】]?/,
    /(?:account|username|user)\s*(?:=|:|：|is\s+)?\s*[「"'\[【]?([A-Za-z0-9_.@\-]+)[」"'\]】]?/i,
  ]
  for (const pattern of patterns) {
    const value = raw.match(pattern)?.[1]
    if (value && !extractIpv4(value) && !/^\d+$/.test(value)) return value
  }
  return null
}

/** 解封所需的规则标识（封禁时返回的规则 UUID 或显式规则名）；提取不到返回 null，不猜。 */
export function extractRuleId(text, target) {
  if (target && typeof target === 'object') {
    for (const key of ['rule_name', 'rule_id', 'rule_uuid', 'rule']) {
      const value = target[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  const raw = String(text ?? '')
  const named = raw.match(
    /(?:规则(?:标识|名|名称|号|UUID)?|rule[_ ]?(?:id|name|uuid))\s*(?:为|是|[:：=])?\s*[「"'\[【]?([A-Za-z0-9_.\-{}]+)[」"'\]】]?/i,
  )
  if (named?.[1]) return named[1]
  const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return uuid?.[0] ?? null
}

/** 纯函数：自然语言建议 → 动作键 / 参数 / 是否需要解析设备与可执行节点。 */
export function classifyRecommendation(action, target) {
  const text = String(action ?? '')
  const hint = targetHint(target)
  if (ISOLATE_PHRASE.test(text)) {
    return {
      kind: 'isolate-host', action_key: 'host-selfblock-net', action_key_candidates: null,
      params: {}, side: 'host', manual: false, needs_device_agent: true,
    }
  }
  // 封禁/解封：主机侧 host-block-ip / host-unblock-ip（src_ip + 命中 agent 的 agent_id），
  // 防火墙侧 block-ip / unblock-ip（src_ip + rule_name）；执行侧不明确只给候选，不猜。
  const unblock = UNBLOCK_PHRASE.test(text)
  if (unblock || BLOCK_PHRASE.test(text)) {
    const kind = unblock ? 'unblock-ip' : 'block-ip'
    const srcIp = extractIpv4(text) ?? hint.ip
    if (!srcIp) {
      return {
        kind, action_key: null, action_key_candidates: null, params: {},
        side: null, manual: false, needs_device_agent: false, failure: 'missing-ip',
      }
    }
    const params = { src_ip: srcIp }
    const firewall = FIREWALL_SIDE_PHRASE.test(text)
    const host = HOST_SIDE_PHRASE.test(text)
    if (firewall && !host) {
      const ruleName = extractRuleId(text, hint.raw)
      return {
        kind, action_key: kind, action_key_candidates: null,
        params: ruleName ? { ...params, rule_name: ruleName } : params,
        side: 'firewall', manual: false, needs_device_agent: false,
        // 解封必须使用封禁时返回的规则标识，建议里没有就不猜。
        ...(kind === 'unblock-ip' && !ruleName ? { failure: 'missing-rule-id' } : {}),
      }
    }
    if (host && !firewall) {
      return {
        kind, action_key: kind === 'block-ip' ? 'host-block-ip' : 'host-unblock-ip',
        action_key_candidates: null, params, side: 'host', manual: false, needs_device_agent: true,
      }
    }
    return {
      kind, action_key: null,
      action_key_candidates: kind === 'block-ip' ? ['block-ip', 'host-block-ip'] : ['unblock-ip', 'host-unblock-ip'],
      params, side: null, manual: false, needs_device_agent: false, failure: 'unknown-side',
    }
  }
  // 禁用/启用账号：host-disable-account / host-enable-account；缺账号参数时不猜。
  const accountNoun = ACCOUNT_NOUN.test(text)
  const accountDisable = ACCOUNT_DISABLE_PHRASE.test(text)
  const accountEnable = ACCOUNT_ENABLE_PHRASE.test(text)
  if (accountNoun && accountDisable !== accountEnable) {
    const account = extractAccount(text, hint.raw)
    return {
      kind: accountEnable ? 'enable-account' : 'disable-account',
      action_key: accountEnable ? 'host-enable-account' : 'host-disable-account',
      action_key_candidates: null,
      params: account ? { user: account } : {},
      side: 'host', manual: false, needs_device_agent: true,
      ...(account ? {} : { failure: 'missing-account' }),
    }
  }
  // 扫描：trigger-scan；目标主机有可执行节点才可执行（needs_device_agent）。
  if (SCAN_PHRASE.test(text) && !MANUAL_STRONG_PHRASE.test(text)) {
    return {
      kind: 'trigger-scan', action_key: 'trigger-scan', action_key_candidates: null,
      params: {}, side: 'host', manual: false, needs_device_agent: true,
    }
  }
  if (MANUAL_PHRASE.test(text)) {
    return {
      kind: 'manual-review', action_key: null, action_key_candidates: null, params: {},
      side: null, manual: true, needs_device_agent: false,
    }
  }
  return {
    kind: 'unsupported', action_key: null, action_key_candidates: null, params: {},
    side: null, manual: false, needs_device_agent: false,
  }
}

const deviceView = asset => (asset && typeof asset === 'object' ? {
  asset_id: asset.asset_id ?? asset.assetId ?? null,
  ip: asset.ip ?? null,
  host_name: asset.host_name ?? asset.hostname ?? asset.name ?? null,
  host_asset_id: asset.host_asset_id ?? asset.hostAssetId ?? null,
  deploy_form: asset.deploy_form ?? asset.deployForm ?? null,
} : null)

const agentView = device => (device && typeof device === 'object' ? {
  device_id: device.device_id ?? device.deviceId ?? null,
  asset_id: device.asset_id ?? device.assetId ?? null,
  ip: device.ip ?? device.sourceIp ?? null,
} : null)

/**
 * 按 target.ip/host/asset_id 解析资产与其采集设备（仅用于展示资产归属）。
 * query(name, args) 是「现有设备/agent 查询」的注入点：
 *   get_graph_resolve_ip_host / search_graph_assets / get_soc_asset_by_asset_id /
 *   get_ingest_devices_by_asset_by_asset_id。返回值统一取响应里的 data。
 * 注意：该路径（虚拟机资产 → 宿主 asset → 宿主设备）只说明资产归属，
 * 不再作为主机类动作的执行体；执行体由 resolveHostAgentTarget 解析。
 */
export async function resolveHostTarget(target, query) {
  const hint = targetHint(target)
  const candidates = []
  let assetId = hint.asset_id
  if (!assetId && hint.ip) {
    const resolved = await query('get_graph_resolve_ip_host', { ip: hint.ip }).catch(() => null)
    assetId = resolved?.assetId !== undefined && resolved?.assetId !== null ? String(resolved.assetId) : null
  }
  if (!assetId && hint.host_name) {
    const found = await query('search_graph_assets', { q: hint.host_name, limit: 10 }).catch(() => null)
    const rows = Array.isArray(found) ? found : []
    if (rows.length === 1 && rows[0]?.assetId !== undefined) assetId = String(rows[0].assetId)
    else rows.forEach(row => candidates.push(deviceView({ ...row, host_name: row?.name })))
  }
  if (!assetId) {
    return {
      status: candidates.length > 1 ? 'ambiguous' : 'unresolved',
      device: null, agent: null, agent_via_host: false, candidates,
      reason: candidates.length > 1 ? 'multiple-devices' : 'device-not-found',
    }
  }
  const asset = await query('get_soc_asset_by_asset_id', { assetId: Number(assetId) }).catch(() => null)
  const device = deviceView(asset)
  if (!device || device.asset_id === null) {
    return { status: 'unresolved', device: null, agent: null, agent_via_host: false, candidates, reason: 'device-not-found' }
  }
  if (hint.ip && device.ip && hint.ip !== device.ip) {
    return {
      status: 'ambiguous', device, agent: null, agent_via_host: false,
      candidates: [device], reason: 'target-conflict',
    }
  }
  let agents = await query('get_ingest_devices_by_asset_by_asset_id', { assetId: Number(device.asset_id) })
    .catch(() => null)
  agents = Array.isArray(agents) ? agents : []
  let viaHost = false
  if (agents.length === 0 && device.host_asset_id) {
    const hosted = await query('get_ingest_devices_by_asset_by_asset_id', { assetId: Number(device.host_asset_id) })
      .catch(() => null)
    if (Array.isArray(hosted) && hosted.length) {
      agents = hosted
      viaHost = true
    }
  }
  const agentCandidates = agents.map(agentView).filter(Boolean)
  if (agentCandidates.length === 1) {
    return {
      status: 'unique', device, agent: agentCandidates[0], agent_via_host: viaHost,
      candidates: [], reason: null,
    }
  }
  return {
    status: agentCandidates.length > 1 ? 'ambiguous' : 'unresolved',
    device, agent: null, agent_via_host: viaHost, candidates: agentCandidates,
    reason: agentCandidates.length > 1 ? 'multiple-agents' : 'agent-not-found',
  }
}

const respDeviceView = row => (row && typeof row === 'object' ? {
  device_id: row.device_id ?? row.deviceId ?? row.value ?? null,
  ip: row.ip ?? null,
  host_name: row.host_name ?? row.hostname ?? row.name
    ?? (typeof row.label === 'string' ? (row.label.split('(')[0].trim() || null) : null),
  asset_id: row.asset_id ?? row.assetId ?? null,
} : null)

const respAgentView = row => (row && typeof row === 'object' ? {
  agent_id: row.agent_id ?? row.agentId ?? null,
  hostname: row.hostname ?? row.host_name ?? row.name ?? null,
  ip: row.ip ?? null,
} : null)

const sameText = (left, right) => Boolean(left && right)
  && String(left).trim().toLowerCase() === String(right).trim().toLowerCase()

/**
 * 主机类动作（host-*）的执行体解析：走应急动作目录的目标候选与设备 agent，
 *   get_resp_actions_target_candidates(actionKey) → 候选设备
 *   get_resp_actions_device_agents(deviceId)     → 设备名下 agent
 * 在 agent 列表里按 IP（优先）或主机名匹配目标；命中才算可执行。
 * query(name, args) 是注入点，返回值统一取响应里的 data。
 */
export async function resolveHostAgentTarget(target, actionKey, query) {
  const hint = targetHint(target)
  const rawCandidates = await query('get_resp_actions_target_candidates', { actionKey }).catch(() => null)
  const candidates = (Array.isArray(rawCandidates) ? rawCandidates : [])
    .map(respDeviceView)
    .filter(row => row && row.device_id)
  const agentsSeen = []
  for (const device of candidates) {
    const rawAgents = await query('get_resp_actions_device_agents', { deviceId: device.device_id }).catch(() => null)
    const agents = (Array.isArray(rawAgents) ? rawAgents : [])
      .map(respAgentView)
      .filter(row => row && row.agent_id)
    const matched = (hint.ip ? agents.find(agent => agent.ip === hint.ip) : null)
      ?? (hint.host_name ? (agents.find(agent => sameText(agent.hostname, hint.host_name)) ?? null) : null)
    if (matched) {
      return {
        status: 'unique',
        device: { device_id: device.device_id, ip: device.ip, host_name: device.host_name },
        agent: { agent_id: matched.agent_id, hostname: matched.hostname, ip: matched.ip },
        candidates: [], reason: null,
      }
    }
    agentsSeen.push(...agents.map(agent => ({ ...agent, device_id: device.device_id })))
  }
  return {
    status: 'unresolved', device: null, agent: null, candidates: agentsSeen,
    reason: candidates.length ? 'agent-not-found' : 'device-not-found',
  }
}

// 隔离落点未获 SOC 确认前的临时替代：按阻断该主机 IP 处置。
export const ISOLATE_FALLBACK_ACTION_KEY = 'host-block-ip'
export const ISOLATE_FALLBACK_REASON = '隔离动作暂不可用，临时按阻断该主机 IP 处置（待 SOC 确认隔离落点）'

/**
 * 目录可用性：get_resp_action_defs 读 enabled 与 agentExecutable，
 * 只有两者都为真（且目录里确有该动作）才允许该动作 executable=true。
 * query(name, args) 走现有 deviceAgentQuery/降级链；查不到或查询失败一律按不可执行处理。
 */
export async function catalogActionExecutable(actionKey, query) {
  const wanted = String(actionKey ?? '').trim()
  if (!wanted) return false
  const defs = await query('get_resp_action_defs', {}).catch(() => null)
  const list = Array.isArray(defs) ? defs
    : (defs && typeof defs === 'object'
      ? (Array.isArray(defs.items) ? defs.items : (Array.isArray(defs.data) ? defs.data : []))
      : [])
  const def = list.find(row => row && typeof row === 'object'
    && String(row.actionKey ?? row.action_key ?? '').trim() === wanted)
  if (!def) return false
  return def.enabled === true && def.agentExecutable === true
}

// display 一律中文短句：结论 → 原因 → 后续建议；不写英文枚举、错误码与原始回执。
const DISPLAY_TEXT = {
  isolateReady: {
    conclusion: '可执行：可对目标主机执行网络隔离（当前仅预览，未建草案、未确认）。',
    reason: '目标设备与其可执行节点已唯一解析。',
    next_steps: ['核对目标与参数后调用处置准备生成草案', '草案生成后仍需用户确认，确认前不会提交或执行'],
  },
  isolateFallbackReady: {
    conclusion: '可执行：临时阻断目标主机地址，替代网络隔离（当前仅预览，未建草案、未确认）。',
    reason: '隔离动作暂不可用，临时按阻断该主机地址处置（隔离落点待确认）。',
    next_steps: ['核对临时阻断的目标与参数后调用处置准备生成草案', '隔离落点确认后再改用网络隔离', '草案生成后仍需用户确认，确认前不会提交或执行'],
  },
  actionUnavailable: {
    conclusion: '暂不能自动处置：处置动作暂不可用。',
    reason: '该动作在处置目录中未启用或不允许由可执行节点执行，暂不能自动处置。',
    next_steps: ['改用处置目录内可用的动作（如网络隔离或封禁）', '或转人工核验，由安全运营人员确认后继续', '确认后再进入处置准备'],
  },
  blockReady: {
    conclusion: '可执行：可按建议封禁该地址（当前仅预览，未建草案、未确认）。',
    reason: '执行侧已确定。',
    next_steps: ['核对被封禁地址与执行侧后调用处置准备生成草案', '草案生成后仍需用户确认，确认前不会提交或执行'],
  },
  unblockReady: {
    conclusion: '可执行：可按建议解除该地址的封禁（当前仅预览，未建草案、未确认）。',
    reason: '执行侧已确定。',
    next_steps: ['核对被解封地址与执行侧后调用处置准备生成草案', '草案生成后仍需用户确认，确认前不会提交或执行'],
  },
  accountDisableReady: {
    conclusion: '可执行：可按建议禁用该账号（当前仅预览，未建草案、未确认）。',
    reason: '目标主机与其可执行节点已唯一解析。',
    next_steps: ['核对账号与目标主机后调用处置准备生成草案', '草案生成后仍需用户确认，确认前不会提交或执行'],
  },
  accountEnableReady: {
    conclusion: '可执行：可按建议启用该账号（当前仅预览，未建草案、未确认）。',
    reason: '目标主机与其可执行节点已唯一解析。',
    next_steps: ['核对账号与目标主机后调用处置准备生成草案', '草案生成后仍需用户确认，确认前不会提交或执行'],
  },
  scanReady: {
    conclusion: '可执行：可对该主机触发扫描（当前仅预览，未建草案、未确认）。',
    reason: '目标主机与其可执行节点已唯一解析。',
    next_steps: ['核对目标主机后调用处置准备生成草案', '草案生成后仍需用户确认，确认前不会提交或执行'],
  },
  manualReview: {
    conclusion: '暂不能自动处置（需人工核验）。',
    reason: '需人工核验，暂不能自动处置。',
    next_steps: ['转人工核验，由安全运营人员完成取证与确认', '核验完成后再决定是否处置'],
  },
  unsupported: {
    conclusion: '暂不能自动处置。',
    reason: '该建议不在当前可自动处置的处置类别内。',
    next_steps: ['转人工复核，并补充目标、参数或授权信息', '或改用可执行的处置动作，例如网络隔离或封禁'],
  },
}
const DEVICE_REASON = {
  'device-not-found': '未找到与建议目标匹配的设备，请补充设备标识。',
  'multiple-devices': '匹配到多个候选设备，请从候选中指定唯一目标。',
  'target-conflict': '建议中的地址与设备记录不一致，请确认目标后重试。',
  'agent-not-found': '该设备当前没有可执行节点，需先接入可执行节点。',
  'multiple-agents': '该设备匹配到多个可执行节点，请指定唯一执行点。',
}

// 主机侧各意图解析成功后的中文展示（隔离走临时替代逻辑，另行处理）。
const HOST_READY_TEXT = {
  'block-ip': {
    ...DISPLAY_TEXT.blockReady,
    reason: '执行侧已确定为主机侧，承载设备与其可执行节点已唯一解析。',
  },
  'unblock-ip': {
    ...DISPLAY_TEXT.unblockReady,
    reason: '执行侧已确定为主机侧，承载设备与其可执行节点已唯一解析。',
  },
  'disable-account': DISPLAY_TEXT.accountDisableReady,
  'enable-account': DISPLAY_TEXT.accountEnableReady,
  'trigger-scan': DISPLAY_TEXT.scanReady,
}

function chineseDisplay(overrides = {}) {
  const base = {
    conclusion: overrides.conclusion ?? DISPLAY_TEXT.unsupported.conclusion,
    reason: overrides.reason ?? DISPLAY_TEXT.unsupported.reason,
    next_steps: overrides.next_steps ?? DISPLAY_TEXT.unsupported.next_steps,
  }
  return {
    ...base,
    text: [`结论：${base.conclusion}`, `原因：${base.reason}`, '后续建议：', ...base.next_steps.map(step => `- ${step}`)].join('\n'),
    technical_note: '原始动作、目标与优先级为技术细节，默认不展开',
  }
}

/**
 * 单条研判建议 → 处置项。options.query 注入设备/agent 查询，便于测试。
 * 输出：action_key、target（设备/agent）、params、executable、manual、display；
 * 原始字段（action/recommended_target/priority/reason）保留在 technical_fields。
 */
export async function mapRecommendation(recommendation, options = {}) {
  const classify = options.classify ?? classifyRecommendation
  const query = options.query ?? (async () => null)
  const decision = classify(recommendation.action, recommendation.target)
  const hint = targetHint(recommendation.target)
  const base = {
    action: recommendation.action,
    recommended_target: hint.raw,
    priority: recommendation.priority,
    reason: recommendation.reason,
  }
  const item = {
    ...base,
    action_key: decision.action_key,
    action_key_candidates: decision.action_key_candidates ?? undefined,
    params: decision.params,
    manual: decision.manual,
    target: { hint, device: null, agent: null, resolution: 'unresolved', candidates: [], agent_via_host: false },
    technical_fields: Object.keys(base).filter(key => base[key] !== undefined),
  }
  if (decision.manual) {
    return { ...item, executable: false, display: chineseDisplay(DISPLAY_TEXT.manualReview) }
  }
  const unblockIntent = decision.kind === 'unblock-ip'
  const sideVerb = unblockIntent ? '解封' : '封禁'
  if (decision.failure === 'missing-ip') {
    const accountish = ACCOUNT_NOUN.test(String(recommendation.action ?? ''))
    return {
      ...item,
      executable: false,
      display: chineseDisplay(accountish ? {
        conclusion: '暂不能自动处置：需补充账号。',
        reason: '该建议针对账号处置，未给出账号参数，需补充账号。',
        next_steps: ['补充要禁用或启用的账号（用户名）', '或补充要封禁或解封的地址', '确认后再进入处置准备'],
      } : {
        conclusion: `暂不能自动处置：缺少被${sideVerb}地址。`,
        reason: `未能从处置建议中提取要${sideVerb}的地址。`,
        next_steps: [`补充要${sideVerb}的源地址`, '确认后再进入处置准备'],
      }),
    }
  }
  if (decision.failure === 'missing-account') {
    return {
      ...item,
      executable: false,
      display: chineseDisplay({
        conclusion: '暂不能自动处置：需补充账号。',
        reason: '建议里没有账号参数，需补充账号后才能自动处置。',
        next_steps: ['补充要禁用或启用的账号（用户名）', '确认后再进入处置准备'],
      }),
    }
  }
  if (decision.failure === 'missing-rule-id') {
    return {
      ...item,
      executable: false,
      display: chineseDisplay({
        conclusion: '暂不能自动处置：需补充封禁规则标识。',
        reason: '解除封禁要使用封禁时返回的规则标识，建议中未提供，不能猜测。',
        next_steps: ['补充封禁时返回的规则标识', '确认后再进入处置准备'],
      }),
    }
  }
  if (decision.failure === 'unknown-side') {
    return {
      ...item,
      executable: false,
      display: chineseDisplay({
        conclusion: `暂不能自动处置：需要确认${sideVerb}执行侧。`,
        reason: `无法从建议中确定由防火墙侧还是主机侧执行${sideVerb}。`,
        next_steps: [`明确在防火墙侧${sideVerb}，还是在指定主机侧${sideVerb}`, '选择主机侧时请给出承载主机的设备标识', '确认后再进入处置准备'],
      }),
    }
  }
  // 主机侧封禁/解封：被处置地址与目标设备是同一台时，说明目标只是该地址的归属，
  // 不能在其所属设备上直接操作，需要另行指定承载规则的主机。
  const sameHostRule = (decision.kind === 'block-ip' || decision.kind === 'unblock-ip') && decision.side === 'host'
    && decision.params.src_ip && hint.ip && decision.params.src_ip === hint.ip
  if (decision.needs_device_agent && sameHostRule) {
    return {
      ...item,
      action_key: null,
      executable: false,
      display: chineseDisplay({
        conclusion: `暂不能自动处置：需要指定承载${sideVerb}规则的主机。`,
        reason: `建议${sideVerb}的是该地址本身，不能在其所属设备上直接操作，需另行指定承载主机。`,
        next_steps: [`给出承载${sideVerb}规则的主机设备标识`, `或改为防火墙侧${sideVerb}`, '确认后再进入处置准备'],
      }),
    }
  }
  if (decision.needs_device_agent) {
    // 执行体只走应急动作目录：候选设备 → 设备 agent → 按 IP/主机名命中目标。
    // 旧的「虚拟机资产 → 宿主设备」路径仅保留为资产归属展示，不再决定可执行性。
    const ownership = await resolveHostTarget(recommendation.target, query).catch(() => null)
    const isolate = decision.kind === 'isolate-host'
    // 目录感知：只有 enabled && agentExecutable 的动作才允许 executable=true。
    const preferredKey = decision.action_key
    let actionKey = await catalogActionExecutable(preferredKey, query) ? preferredKey : null
    let fallback = false
    if (isolate && !actionKey) {
      // 隔离落点未获 SOC 确认前的临时替代：改按阻断该主机 IP 处置（仍走该主机 agent）。
      if (await catalogActionExecutable(ISOLATE_FALLBACK_ACTION_KEY, query)) {
        actionKey = ISOLATE_FALLBACK_ACTION_KEY
        fallback = true
      }
    }
    if (!actionKey) {
      return {
        ...item,
        action_key: preferredKey,
        executable: false,
        display: chineseDisplay(isolate
          ? {
            conclusion: '暂不能自动处置：隔离动作与临时替代动作均不可用。',
            reason: '隔离动作暂不可用，临时替代的阻断动作在处置目录中也未启用或不可执行，暂不能自动处置。',
            next_steps: ['改用处置目录内可用的动作', '或转人工核验，由安全运营人员确认后继续', '确认后再进入处置准备'],
          }
          : DISPLAY_TEXT.actionUnavailable),
      }
    }
    item.action_key = actionKey
    if (fallback) {
      item.fallback = true
      item.fallback_reason = ISOLATE_FALLBACK_REASON
    }
    const resolution = await resolveHostAgentTarget(recommendation.target, actionKey, query)
    item.target = {
      hint,
      device: resolution.device,
      agent: resolution.agent,
      resolution: resolution.status,
      candidates: resolution.candidates,
      agent_via_host: false,
      asset_ownership: ownership && ownership.device ? ownership.device : null,
    }
    if (resolution.status !== 'unique') {
      return {
        ...item,
        executable: false,
        display: chineseDisplay({
          conclusion: '暂不能自动处置：目标主机的可执行节点未能解析。',
          reason: resolution.reason === 'device-not-found'
            ? '处置目录未返回该动作的候选设备，暂不能自动处置。'
            : (isolate
              ? (fallback
                ? '未找到该主机的终端防护可执行节点，暂不能临时阻断。'
                : '未找到该主机的终端防护可执行节点，暂不能自动隔离。')
              : '未找到该主机的终端防护可执行节点，暂不能自动执行该主机动作。'),
          next_steps: ['补充该主机的地址或主机名后重新匹配终端防护代理', '或改为在防火墙侧执行等价处置', '确认后再进入处置准备'],
        }),
      }
    }
    if (fallback) {
      // 临时替代：src_ip 用目标主机自身的地址（不是承载设备地址），目标仍是该主机 agent。
      const srcIp = hint.ip ?? resolution.agent.ip
      if (!srcIp) {
        return {
          ...item,
          executable: false,
          display: chineseDisplay({
            conclusion: '暂不能自动处置：缺少目标主机地址。',
            reason: '未能确定目标主机的地址，无法临时阻断该主机。',
            next_steps: ['补充该主机的地址后重试', '或改为在防火墙侧执行等价处置', '确认后再进入处置准备'],
          }),
        }
      }
      item.params = { src_ip: srcIp, agent_id: resolution.agent.agent_id }
    } else {
      item.params = { ...decision.params, agent_id: resolution.agent.agent_id }
    }
    return {
      ...item,
      executable: true,
      display: chineseDisplay(fallback
        ? DISPLAY_TEXT.isolateFallbackReady
        : (isolate
          ? DISPLAY_TEXT.isolateReady
          : (HOST_READY_TEXT[decision.kind]
            ?? { ...DISPLAY_TEXT.blockReady, reason: '执行侧已确定为主机侧，承载设备与其可执行节点已唯一解析。' }))),
    }
  }
  if ((decision.kind === 'block-ip' || decision.kind === 'unblock-ip') && decision.side === 'firewall') {
    const executable = await catalogActionExecutable(decision.action_key, query)
    const givenRuleName = typeof decision.params.rule_name === 'string' && decision.params.rule_name
      ? decision.params.rule_name : null
    // 防火墙侧：src_ip + rule_name；封禁未给规则名时按流程与台账命名生成，解封必须使用已给出的规则标识。
    const params = decision.kind === 'block-ip'
      ? {
        src_ip: decision.params.src_ip,
        rule_name: givenRuleName ?? `block-${decision.params.src_ip}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      }
      : { src_ip: decision.params.src_ip, rule_name: givenRuleName }
    return {
      ...item,
      params,
      ...(decision.kind === 'block-ip' && !givenRuleName ? { rule_name_generated: true } : {}),
      executable,
      display: chineseDisplay(executable
        ? (decision.kind === 'unblock-ip'
          ? { ...DISPLAY_TEXT.unblockReady, reason: '执行侧已确定为防火墙侧。' }
          : { ...DISPLAY_TEXT.blockReady, reason: '执行侧已确定为防火墙侧。' })
        : DISPLAY_TEXT.actionUnavailable),
    }
  }
  return { ...item, executable: false, display: chineseDisplay(DISPLAY_TEXT.unsupported) }
}

export async function mapRecommendations(actions, options = {}) {
  const items = []
  for (const [index, action] of (actions ?? []).entries()) {
    const query = options.queryForRecommendation?.(action, index) ?? options.query
    items.push(await mapRecommendation(action, { ...options, query }))
  }
  return items
}

// ---------------------------------------------------------------------------
// 多动作规则（分组在映射/预览层完成，只在返回里追加 groups 与中文说明，不改变 items 结构）：
//  - 同一目标、都可逆 → 合并为一组，建议「一次确认」；
//  - 不同目标 → 按目标分组；
//  - 不可逆动作（删账号、重启等）→ 单独一组，单独确认；
//  - 部分可执行 → 组内给出 executable 子集与 manual/unsupported 列表。
// ---------------------------------------------------------------------------
const IRREVERSIBLE_PHRASE = /删除|删掉|销毁|抹除|擦除|格式化|重启|关机|终止进程|杀死进程|卸载|重置|清除|永久/

export const GROUPING_NOTE = '已按多动作规则分组：同一目标且均为可逆动作的处置合并为一组并建议一次确认，不同目标按目标分组，不可逆动作（如删除账号、重启等）单独成组；组内分别列出可执行项与需人工核验、暂不可执行项。'

/** 该项处置是否可逆：删账号、重启等不可逆动作需单独一组。 */
export function itemReversible(item) {
  return !IRREVERSIBLE_PHRASE.test(String(item?.action ?? ''))
}

/** 分组目标键：优先 IP，其次主机名、资产 ID，最后原目标文本。 */
export function groupTargetKey(item) {
  const hint = item?.target?.hint
  const ip = hint && typeof hint === 'object' ? hint.ip : null
  const hostName = hint && typeof hint === 'object' ? hint.host_name : null
  const assetId = hint && typeof hint === 'object' && hint.asset_id !== null && hint.asset_id !== undefined
    ? String(hint.asset_id) : null
  if (ip) return ip
  if (hostName) return hostName
  if (assetId) return assetId
  const raw = (hint && typeof hint === 'object' ? hint.raw : null) ?? item?.target ?? item?.recommended_target
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  return '未指定目标'
}

function groupTargetView(item, key) {
  const hint = item?.target?.hint
  if (hint && typeof hint === 'object') {
    return {
      ip: hint.ip ?? null,
      host_name: hint.host_name ?? null,
      asset_id: hint.asset_id ?? null,
    }
  }
  return { ip: null, host_name: null, asset_id: null, label: key }
}

function buildGroup(entries, key) {
  const executable = entries.filter(entry => entry.item?.executable === true)
  const manual = entries.filter(entry => entry.item?.executable !== true && entry.item?.manual === true)
  const unsupported = entries.filter(entry => entry.item?.executable !== true && entry.item?.manual !== true)
  const standalone = entries.some(entry => !entry.reversible)
  const mergedReversible = !standalone && entries.length > 1
  const actionsOf = list => list.map(entry => String(entry.item?.action ?? ''))
  const counts = `其中可执行 ${executable.length} 项、需人工核验 ${manual.length} 项、暂不可执行 ${unsupported.length} 项。`
  const description = standalone
    ? `单独一组：不可逆动作（如删除账号、重启等）不与其他处置合并，本组共 ${entries.length} 项。${counts}`
    : `按目标分组：目标 ${key} 的处置共 ${entries.length} 项${mergedReversible ? '，均为可逆动作，合并为一组' : ''}。${counts}`
  const suggestion = standalone
    ? '不可逆动作单独成组，需单独确认后再执行。'
    : (executable.length === 0
      ? (manual.length ? '本组需人工核验，暂不进入处置确认。' : '本组暂无可执行项，请补充信息或转人工复核。')
      : ((manual.length + unsupported.length) > 0
        ? '部分可执行：可执行项可一次确认，其余项转人工核验或补充信息。'
        : (mergedReversible ? '同一目标且均为可逆动作，建议一次确认。' : '可执行项可一次确认。')))
  return {
    target: groupTargetView(entries[0].item, key),
    target_label: key,
    reversible: !standalone,
    standalone,
    item_indexes: entries.map(entry => entry.index),
    executable_indexes: executable.map(entry => entry.index),
    manual_indexes: manual.map(entry => entry.index),
    unsupported_indexes: unsupported.map(entry => entry.index),
    executable_actions: actionsOf(executable),
    manual_actions: actionsOf(manual),
    unsupported_actions: actionsOf(unsupported),
    confirm_hint: standalone ? '单独确认' : (executable.length ? '一次确认' : '暂无可确认项'),
    description,
    suggestion,
  }
}

/**
 * 多动作分组：输入 mapRecommendations 的 items（顺序即建议顺序），
 * 输出按规则分好的 groups（含中文说明与各组 items 索引），不修改 items。
 */
export function groupRecommendations(items) {
  const list = Array.isArray(items) ? items : []
  const buckets = new Map()
  const standaloneGroups = []
  list.forEach((item, index) => {
    const entry = { item, index, reversible: itemReversible(item) }
    if (!entry.reversible) {
      // 不可逆动作（删账号、重启等）单独一组。
      standaloneGroups.push({ minIndex: index, key: groupTargetKey(item), entries: [entry] })
      return
    }
    const key = groupTargetKey(item)
    if (!buckets.has(key)) buckets.set(key, { minIndex: index, key, entries: [] })
    buckets.get(key).entries.push(entry)
  })
  const ordered = [...buckets.values(), ...standaloneGroups].sort((a, b) => a.minIndex - b.minIndex)
  return ordered.map((group, position) => ({
    id: `G${position + 1}`,
    ...buildGroup(group.entries, group.key),
  }))
}

async function readResource(client, uri) {
  const result = await client.readResource({ uri }, { timeout: TOOL_TIMEOUT_MS })
  const text = result?.contents?.find(item => typeof item?.text === 'string')?.text
  return parseText(text)
}

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args }, { timeout: TOOL_TIMEOUT_MS })
  if (result?.isError) {
    const text = result?.content?.find(item => item?.type === 'text')?.text
    throw new Error(`${name}: ${typeof text === 'string' ? text : 'MCP tool error'}`)
  }
  return payloadOf(result)
}

/** 资源模板形态的操作（GET + path 参数）按 URI 读取，避免把模板误判成缺失工具。 */
async function resourceUriFor(client, operation, args) {
  if (typeof client?.listResourceTemplates === 'function') {
    let listed
    try { listed = await client.listResourceTemplates({}, { timeout: TOOL_TIMEOUT_MS }) } catch { listed = undefined }
    const template = (listed?.resourceTemplates || []).find(item => item?.name === operation)
    if (template && typeof template.uriTemplate === 'string') {
      let uri = template.uriTemplate
      for (const [key, value] of Object.entries(args || {})) {
        if (value === undefined || value === null) continue
        uri = uri.replaceAll(`{${key}}`, encodeURIComponent(String(value)))
      }
      // 组端点模板是 {?a,b} 查询形式；只放实际提供的参数。
      uri = uri.replace(/\{\?([^}]+)\}/g, (_, names) => {
        const pairs = names.split(',').map(name => name.trim()).filter(name => args?.[name] !== undefined && args?.[name] !== null)
        return pairs.length ? `?${pairs.map(name => `${name}=${encodeURIComponent(String(args[name]))}`).join('&')}` : ''
      })
      if (!/\{[^}]*\}/.test(uri)) return uri
    }
  }
  // 无参 GET 在组里是固定资源（resourceUris），按 name 直接取 URI。
  if (typeof client?.listResources === 'function') {
    let listed
    try { listed = await client.listResources({}, { timeout: TOOL_TIMEOUT_MS }) } catch { return null }
    const resource = (listed?.resources || []).find(item => item?.name === operation)
    return typeof resource?.uri === 'string' ? resource.uri : null
  }
  return null
}

async function callOperation(client, operation, args) {
  try {
    const name = await resolveToolName(client, operation, toolBindings)
    return unwrapContents(await callTool(client, name, args))
  } catch (error) {
    const uri = await resourceUriFor(client, operation, args)
    if (!uri) throw error
    console.error('[disposition-runtime] resource-read', operation, uri)
    try {
      return unwrapContents(await readResource(client, uri))
    } catch (readError) {
      throw new Error(`${operation} 资源读取失败：${uri}：${readError?.message || readError}`)
    }
  }
}

function targetText(target) {
  if (typeof target === 'string') return target
  if (target && typeof target === 'object') return String(target.ip || target.host_name || '')
  return ''
}

/** 草案 target_hint：分类项优先取解析出的设备，其次取建议目标，再退回原目标文本。 */
function itemTargetHint(item) {
  const device = item?.target?.device
  if (device && typeof device === 'object') {
    const resolved = device.device_id || device.ip || device.host_name
      || (device.asset_id !== null && device.asset_id !== undefined ? String(device.asset_id) : '')
    if (resolved) return resolved
  }
  const hint = item?.target?.hint
  if (hint && typeof hint === 'object') {
    const fromHint = hint.ip || hint.host_name || (hint.asset_id ? String(hint.asset_id) : '')
    if (fromHint) return fromHint
    return targetText(hint.raw)
  }
  return targetText(item?.target)
}

// 用户可见展示一律中文：原始枚举/错误码只留在技术细节字段里，默认不展开。
const STATUS_TEXT = {
  NEEDS_HUMAN_REVIEW: '需人工复核',
  NEEDS_INPUT: '待补充',
  ATOMIC_ACTION: '原子动作',
  PUBLISHED_PLAYBOOK: '整本剧本',
  APPROVED: '已批准',
  FAILED: '执行失败',
  NOT_SUBMITTED: '未提交',
  SUBMITTED: '已提交',
  QUEUED: '排队中',
  READY: '待确认',
  TERMINAL: '已结束',
  RUNNING: '执行中',
  PENDING: '待审批',
  REJECTED: '审批已拒绝',
  CANCELLED: '已取消',
  CANCELED: '已取消',
  UNAVAILABLE: '能力不可用',
  PLATFORM_DEPENDENCY_REJECTED: '平台依赖校验未通过',
}
const ACTION_TEXT = {
  'block-ip': '防火墙封禁源 IP',
  'unblock-ip': '解除防火墙源 IP 封禁',
  'host-block-ip': '主机封禁源 IP',
  'host-block-ip-port': '主机封禁源 IP 指定端口',
  'host-unblock-ip': '解除主机源 IP 封禁',
  'host-unblock-ip-port': '解除主机源 IP 指定端口封禁',
  'host-lock-screen': '主机锁屏',
  'host-disable-account': '主机禁用账号',
  'host-enable-account': '主机启用账号',
  'trigger-scan': '主机触发扫描',
}
const statusText = value => {
  const key = String(value ?? '').trim().toUpperCase()
  return Object.hasOwn(STATUS_TEXT, key) ? STATUS_TEXT[key] : null
}
const actionText = value => {
  const key = String(value ?? '').trim()
  return Object.hasOwn(ACTION_TEXT, key) ? ACTION_TEXT[key] : (key || null)
}

function phraseList(value) {
  if (Array.isArray(value)) return value.flatMap(item => phraseList(item))
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (value && typeof value === 'object') {
    const text = value.message ?? value.reason ?? value.detail ?? value.text
    return typeof text === 'string' && text.trim() ? [text.trim()] : []
  }
  return []
}

const ENGLISH_HINTS = [
  [/(?:no|without|missing|lack\w*)\s+(?:an?\s+)?(?:acl|access control)/i, '缺少 ACL 访问控制授权'],
  [/(?:no|without|missing|lack\w*)\s+(?:authoriz|ticket|approval)/i, '缺少受信授权依据（工单或预授权）'],
  [/(?:no|missing|without)\s+(?:agent|executor)/i, '目标设备没有可执行 agent'],
  [/(?:no|not in)\s+(?:the\s+)?(?:catalog|directory|playbook)/i, '当前动作目录内没有等价的可执行动作'],
  [/(?:unknown|unresolved|ambiguous|identify|identif\w*)\s*(?:target|object|device)?/i, '目标对象不可识别，需要明确设备标识'],
]

/** 缺口/依据文本中文化；已知英文枚举与错误码翻译成中文，不向用户抛原始枚举。 */
function chinesePhrase(text) {
  const value = String(text ?? '').trim()
  if (!value) return null
  const mapped = value
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, token => statusText(token) ?? '内部状态标识')
    .replace(/\b(?:NEEDS_HUMAN_REVIEW|NEEDS_INPUT|APPROVED|FAILED|NOT_SUBMITTED|READY|TERMINAL|QUEUED|SUBMITTED)\b/g,
      token => statusText(token) ?? token)
  if (/[\u3400-\u9fff]/.test(mapped)) return mapped
  const hint = ENGLISH_HINTS.find(([pattern]) => pattern.test(value))
  return hint ? hint[1] : '平台判定该处置建议暂不可自动执行'
}

function reviewDisplay(item) {
  const reasons = [...phraseList(item?.choice?.basis), ...phraseList(item?.plan?.gaps)]
    .map(chinesePhrase).filter(Boolean)
  const reason = reasons.length ? reasons.join('；') : '平台判定缺少可执行的处置路径。'
  const source = reasons.join('；')
  const steps = []
  if (/对象|标识|澄清|识别|目标不可/.test(source)) steps.push('请补充明确的设备 IP、资产 ID 或主机名，或先澄清对象类型')
  if (/目录|等价|无候选|不可用|没有/.test(source)) steps.push('改用当前动作目录内可执行的动作（如主机锁屏、防火墙封禁），或申请人工执行该动作')
  if (/ACL|授权|工单|预授权/.test(source)) steps.push('补全 ACL 规则或受信授权依据（工单/预授权）')
  if (/agent|主机侧/.test(source)) steps.push('为该设备接入可执行 agent，或改为防火墙侧动作')
  steps.push('转人工复核，由安全运营人员确认后继续')
  const nextSteps = [...new Set(steps)]
  return {
    conclusion: '不可执行：该处置建议当前无法自动执行。',
    reason,
    next_steps: nextSteps,
    text: [`结论：不可执行，需要人工补充信息或人工复核。`, `原因：${reason}`,
      '后续建议：', ...nextSteps.map(step => `- ${step}`)].join('\n'),
    technical_note: 'plan/choice 等原始字段为技术细节，默认不展开',
  }
}

function itemDisplay(item) {
  const kind = String(item?.choice?.kind ?? item?.plan?.resolution ?? '').toUpperCase()
  const reason = [...phraseList(item?.choice?.basis), ...phraseList(item?.plan?.gaps)]
    .map(chinesePhrase).filter(Boolean).join('；')
  if (kind === 'NEEDS_HUMAN_REVIEW') return reviewDisplay(item)
  if (kind === 'ATOMIC_ACTION') {
    const chosen = actionText(item?.choice?.chosen) ?? '原子动作'
    return {
      conclusion: `可执行：平台已路由到原子动作「${chosen}」；当前仅预览，未建草案、未确认。`,
      reason: reason || '平台已完成目标解析与执行体路由。',
      next_steps: ['核对目标与参数后调用 disposition_prepare 生成草案', '草案生成后仍需用户确认，确认前不会提交或执行'],
      text: [`结论：可执行，已路由到原子动作「${chosen}」（仅预览）。`,
        `原因：${reason || '平台已完成目标解析与执行体路由。'}`, '后续建议：',
        '- 核对目标与参数后调用 disposition_prepare 生成草案', '- 草案生成后仍需用户确认，确认前不会提交或执行'].join('\n'),
      technical_note: 'plan/choice 等原始字段为技术细节，默认不展开',
    }
  }
  return {
    conclusion: kind === 'PUBLISHED_PLAYBOOK'
      ? '不可直接执行：整本剧本处置由受信控制面接管。'
      : '暂不可自动执行：平台未给出可执行的处置路径。',
    reason: reason || '平台未返回可执行的处置路径。',
    next_steps: ['转人工复核，并补充目标、参数或授权信息'],
    text: [`结论：${kind === 'PUBLISHED_PLAYBOOK' ? '整本剧本处置由受信控制面接管，本会话不执行。' : '暂不可自动执行。'}`,
      `原因：${reason || '平台未返回可执行的处置路径。'}`, '后续建议：', '- 转人工复核，并补充目标、参数或授权信息'].join('\n'),
    technical_note: 'plan/choice 等原始字段为技术细节，默认不展开',
  }
}

async function loadActions(client, args) {
  // 研判并处置：只要带 incident_id，就走事件研判建议分类；action/target 仅用于对话入口。
  if (!args.incident_id && !args.result_ref && (args.action || args.action_key)) {
    return {
      source: 'DIALOGUE',
      actions: [
        {
          action: args.action || args.intent || args.action_key,
          target: args.target,
          priority: args.priority,
          reason: args.reason,
        },
      ],
    }
  }
  const ref = args.incident_id || args.result_ref
  if (!ref) throw new Error('需要 incident_id 或 action')
  // 组端点只接受分组包装 URI；按操作名解析，由资源回退统一读取。
  const judgements = await callOperation(client, 'get_correlate_incident_judgements', { incidentId: ref })
  const list = Array.isArray(judgements?.data) ? judgements.data
    : Array.isArray(judgements) ? judgements
    : Array.isArray(judgements?.data?.items) ? judgements.data.items : []
  const latest = list[0]
  return {
    source: 'THREAT_ANALYSIS',
    actions: recommendedActions(latest?.resultJson),
    judgementCount: list.length,
    judgementDebug: {
      type: Array.isArray(judgements) ? 'array' : typeof judgements,
      keys: judgements && typeof judgements === 'object' && !Array.isArray(judgements) ? Object.keys(judgements).slice(0, 8) : [],
      dataType: Array.isArray(judgements?.data) ? 'array' : typeof judgements?.data,
      dataLen: Array.isArray(judgements?.data) ? judgements.data.length : null,
      latestKeys: latest && typeof latest === 'object' ? Object.keys(latest).slice(0, 12) : [],
    },
  }
}

async function runPreview(client, args, options = {}) {
  const ref = args.incident_id || args.result_ref
  // 绑定分支只接受内部经原生父子事件核对的结果，不接收模型传入的结果对象。
  if (options.boundAnalysis) {
    const bound = options.boundAnalysis
    const items = await mapRecommendations(bound.result.recommended_actions, {
      query: options.query, queryForRecommendation: options.queryForRecommendation,
    })
    options.signal?.throwIfAborted()
    // 直接复用既有映射的可执行性与明确提示，不由续接层再次裁决替代方案。
    return { source: 'THREAT_ANALYSIS', resultRef: ref, mode: 'recommendation',
      items, groups: groupRecommendations(items), grouping_note: GROUPING_NOTE,
      preparation_note: '已展示本次全部建议；原有准备入口每次仅选择一个可执行项建草案，不批量创建；仍需用户原生确认，不自动下发。',
      executed: false, prepared: false, source_binding: sourceBinding(bound),
      validation_warnings: bound.warnings }
  }
  const loaded = await loadActions(client, args)
  const capabilities = args.capabilities ?? {}
  // 研判推荐的建议：在本运行时做「自然语言 → 可执行/人工」分类与设备/agent 解析，
  // 不再让「隔离」落到目录里不存在的动作，也不把承载主机当成被封禁地址。
  if (loaded.source === 'THREAT_ANALYSIS') {
    const items = await mapRecommendations(loaded.actions, { query: options.query })
    // 多动作规则在预览层分组返回：groups 为新增字段，items 保持原有结构不变。
    return {
      source: 'THREAT_ANALYSIS', resultRef: ref, mode: 'recommendation',
      items, groups: groupRecommendations(items), grouping_note: GROUPING_NOTE, executed: false,
      ...(loaded.judgementCount !== undefined ? { judgementCount: loaded.judgementCount } : {}),
      ...(loaded.judgementDebug ? { judgementDebug: loaded.judgementDebug } : {}),
    }
  }
  // 对话入口（显式动作文本）：仍由平台做入口解析与执行体路由，保持原有行为。
  const items = []
  for (const action of loaded.actions) {
    const preview = await callOperation(
      client,
      'preview_disposition',
      {
        body: {
          action: action.action,
          target: action.target,
          priority: action.priority,
          reason: action.reason,
          resultRef: ref,
          capabilities,
        },
      },
    )
    const item = {
      action: action.action,
      target: action.target,
      priority: action.priority,
      reason: action.reason,
      plan: preview?.data?.plan,
      choice: preview?.data?.choice,
    }
    // display 是用户可见的中文展示；plan/choice 等原始字段保留，但标记为技术细节。
    items.push({ ...item, display: itemDisplay(item), technical_fields: ['plan', 'choice'] })
  }
  return { source: 'DIALOGUE', resultRef: ref, items, executed: false }
}

function operationDisplay(operation) {
  const data = operation?.data && typeof operation.data === 'object' ? operation.data : operation
  const status = [
    data?.soc_observation?.evidence?.status,
    data?.execution_status,
    data?.approval_status,
    data?.phase,
  ].map(statusText).find(Boolean) ?? '待核实'
  const id = typeof data?.operation_id === 'string' ? data.operation_id : null
  return {
    status,
    text: [`当前状态：${status}`, id ? `操作号：${id}` : null].filter(Boolean).join('\n'),
    technical_note: '原始状态枚举、summary_markdown 与回执字段为技术细节，默认不展开',
  }
}

const plain = value => JSON.parse(JSON.stringify(value))

function render(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function blockedBoundPreview(args, reason, bound, preview) {
  return { ...preview, source: 'THREAT_ANALYSIS', resultRef: args.incident_id, mode: 'recommendation',
    items: preview?.items ?? [], groups: preview?.groups ?? [],
    executed: false, prepared: false, blocked: true, stop_reason: reason.code,
    reason: reason.message, display: { conclusion: reason.message, text: reason.message },
    ...(bound ? { source_binding: sourceBinding(bound) } : {}) }
}
const hasAnalysisBinding = args => args.analysis_session_id !== undefined || args.analysis_run_id !== undefined

let toolBindings = {}

export function apply(ctx, config = {}) {
  toolBindings = config.toolBindings && typeof config.toolBindings === 'object' ? config.toolBindings : {}
  const groupId = String(config.groupId || 'disposition-runtime')
  const token = String(config.token || process.env.DISPOSITION_MCP_TOKEN || '')
  // 业务实例经平台业务运行时以签名方式访问 MCP 分组；独立/本地运行时仍可用 Bearer token。
  // 运行时服务可能晚于本插件加载，调用时再取。
  const businessRuntime = () => (typeof ctx.get === 'function' ? ctx.get('businessRuntime') : undefined)
  const groupPath = `/mcp/groups/${encodeURIComponent(groupId)}`
  const groupUrl = () => {
    const runtime = businessRuntime()
    if (!token && !runtime) throw new Error('disposition-runtime: missing group token or business runtime')
    return runtime?.groupUrl
      ? String(runtime.groupUrl(groupId))
      : `http://127.0.0.1:${ctx.webServer.port}${ctx.webServer.publicPath?.(groupPath) ?? groupPath}`
  }
  const groupFetch = sessionId => {
    const runtime = businessRuntime()
    return runtime?.groupFetch && sessionId ? runtime.groupFetch(groupId, sessionId) : undefined
  }
  // SOC 只读查询走 HEP 组；未配置明确失败，不再静默回退旧平台 50500/232。
  const secOpsUrl = String(config.secOpsUrl || process.env.DISPOSITION_SEC_OPS_URL || '')
  if (!secOpsUrl) throw new Error('disposition-runtime: 未配置 DISPOSITION_SEC_OPS_URL（SOC 只读组）')
  // 应急动作目录的目标候选/设备 agent 查询（get_resp_actions_*）与 SOC 只读共用 HEP 组。
  const respActionsUrls = [
    String(config.respActionsUrl || process.env.DISPOSITION_RESP_ACTIONS_URL || ''),
  ].filter(Boolean)
  const RESP_ACTIONS_TOOLS = new Set([
    'get_resp_action_defs',
    'get_resp_actions_target_candidates',
    'get_resp_actions_device_agents',
  ])

  const withClient = async (work, sessionId) => {
    const client = await openGroup(groupUrl(), token, groupFetch(sessionId))
    try {
      return await work(client)
    } finally {
      await client.close().catch(() => undefined)
    }
  }

  /** HEP 组地址经业务运行时签名访问；非组地址保留本地直连。 */
  const openChannel = async (url, sessionId) => {
    const runtime = businessRuntime()
    const match = /\/mcp\/groups\/([A-Za-z0-9_-]{1,32})\/v2$/.exec(String(url))
    if (match && runtime?.groupFetch) {
      const fetchImpl = runtime.groupFetch(match[1], sessionId)
      if (!fetchImpl) throw new Error(`SOC 分组请求缺少当前 Session：${match[1]}`)
      return openGroup(String(runtime.groupUrl(match[1])), '', fetchImpl)
    }
    return openGroup(url, '')
  }

  const withSecOps = async (work, sessionId) => {
    const client = await openChannel(secOpsUrl, sessionId)
    try {
      return await work(client)
    } finally {
      await client.close().catch(() => undefined)
    }
  }

  const withRespActions = async (work, sessionId) => {
    let lastError = null
    for (const url of respActionsUrls) {
      let client
      try {
        client = await openChannel(url, sessionId)
      } catch (error) {
        lastError = error
        continue
      }
      try {
        return await work(client)
      } catch (error) {
        lastError = error
      } finally {
        await client.close().catch(() => undefined)
      }
    }
    throw lastError ?? new Error('resp-actions: 无可用应急动作查询入口')
  }

  // query(name, args)：设备/agent 查询注入点，失败时返回空（降级为“未解析”）。
  // get_resp_actions_* 优先走运行时组里的应急动作工具，其次直连应急动作上游。
  const deviceAgentQuery = (client, sessionId) => async (name, args) => {
    if (RESP_ACTIONS_TOOLS.has(name)) {
      // 优先按操作名从当前组解析；未暴露时再走同一 SOC 只读组的应急动作上游。
      try {
        const payload = await callOperation(client, name, args)
        return payload?.data ?? payload
      } catch {
        // 组内未暴露时继续回退
      }
      try {
        return await withRespActions(async resp => {
          const payload = await callOperation(resp, name, args)
          return payload?.data ?? payload
        }, sessionId)
      } catch {
        return null
      }
    }
    try {
      const payload = await callOperation(client, name, args)
      return payload?.data ?? payload
    } catch {
      return null
    }
  }

  // 原查询与原解析器负责目标匹配；绑定入口只补取消检查，不另造全量候选准入。
  const boundDeviceAgentQuery = (client, sessionId, signal) => {
    const query = deviceAgentQuery(client, sessionId)
    return async (operation, args) => {
      signal.throwIfAborted()
      const value = await query(operation, args)
      signal.throwIfAborted()
      return value
    }
  }

  // 仅使用已证实的直接子 Session 精确读取。每次异步读取后重新检查取消及父日志。
  const readBoundAnalysis = async (args, exec) => {
    exec.signal.throwIfAborted()
    const agent = exec.agent
    const parentId = agent?.session?.id
    const events = agent?.session.snapshotEvents() ?? []
    const turn = events.findLast(event => event.type === 'turn/start')?.data.turn
    const gate = validateCompletionEvent({ parentId, parentEvents: events, turn, boundToolCallId: exec.callId })
    if (gate.kind !== 'read-child') return gate
    if (args.analysis_session_id !== gate.childId || args.incident_id !== gate.incidentId) {
      return continuationStop('BOUND_SOURCE_MISMATCH', '绑定来源与父原生直接委派不一致。')
    }
    const snapshot = await ctx.sessionQuery.readSession(gate.childId)
    exec.signal.throwIfAborted()
    const fresh = agent.session.snapshotEvents()
    return deriveBoundAnalysis({ parentId, parentEvents: fresh,
      turn: fresh.findLast(event => event.type === 'turn/start')?.data.turn,
      currentToolCallId: exec.callId, snapshot, args, classify: classifyRecommendation })
  }
  const resolveBoundPrepareTool = async (client, signal) => {
    const toolName = await resolveToolName(client, 'prepare_emergency_action', toolBindings)
    signal.throwIfAborted()
    // 显式 toolBindings 在既有 resolver 内会跳过发现；仍只读核对当前真实工具目录。
    const listed = await client.listTools()
    signal.throwIfAborted()
    if (!listed?.tools?.some(tool => tool.name === toolName)) throw new Error('prepare capability not exposed')
    return toolName
  }
  const boundPreview = async (args, exec) => {
    try {
      const bound = await readBoundAnalysis(args, exec)
      exec.signal.throwIfAborted()
      if (bound.kind !== 'bound-analysis') return blockedBoundPreview(args, bound)
      const sessionId = exec.agent.session.id
      // 绑定预览只依赖只读查询，不以草案创建服务就绪为前提。
      return await withSecOps(secops => runPreview(secops, args, {
        query: boundDeviceAgentQuery(secops, sessionId, exec.signal),
        boundAnalysis: bound, signal: exec.signal,
      }), sessionId)
    } catch {
      exec.signal.throwIfAborted()
      return blockedBoundPreview(args, continuationStop('BOUND_PREVIEW_FAILED', '绑定预览读取失败，不准备处置。'))
    }
  }
  const boundPrepare = async (args, exec) => {
    let bound
    let preview
    let dispatched = false
    try {
      bound = await readBoundAnalysis(args, exec)
      exec.signal.throwIfAborted()
      if (bound.kind !== 'bound-analysis') return blockedBoundPreview(args, bound)
      const sessionId = exec.agent.session.id
      return await withClient(client => withSecOps(async secops => {
        preview = await runPreview(client, args, {
          query: boundDeviceAgentQuery(secops, sessionId, exec.signal),
          boundAnalysis: bound, signal: exec.signal })
        exec.signal.throwIfAborted()
        if (preview.blocked) return preview
        // 映射期间可能有新用户/取消；重新验证最新父日志，且保持原生预览快照绑定。
        const events = exec.agent.session.snapshotEvents()
        const freshBound = deriveBoundAnalysis({ parentId: sessionId, parentEvents: events,
          turn: events.findLast(event => event.type === 'turn/start')?.data.turn,
          currentToolCallId: exec.callId, snapshot: bound.childSnapshot, args, classify: classifyRecommendation })
        if (freshBound.kind !== 'bound-analysis') return blockedBoundPreview(args, freshBound, bound, preview)
        const checked = validateMappedSingleAction(freshBound, preview.items, { classify: classifyRecommendation })
        if (checked.kind === 'stop') return blockedBoundPreview(args, checked, bound, preview)
        const item = checked.item
        // 复用既有一次 prepare：仅为所选映射项创建一个草案，不循环创建。
        const body = { request_id: checked.requestId, intent: item.action, action_key: item.action_key,
          target_hint: itemTargetHint(item), params: { ...item.params } }
        if (!body.target_hint) return blockedBoundPreview(args, continuationStop('TARGET_HINT_REQUIRED', '缺少明确执行目标。'), bound, preview)
        // 只解析工具名，不使用 callOperation 的错误后资源 fallback，避免未知写入被重试。
        let toolName
        try {
          toolName = await resolveBoundPrepareTool(client, exec.signal)
        } catch {
          exec.signal.throwIfAborted()
          return blockedBoundPreview(args, continuationStop('PREPARE_SERVICE_UNAVAILABLE',
            '应急草案服务当前未暴露可核对的准备能力，未调用创建；只读映射结果已保留。'), bound, preview)
        }
        exec.signal.throwIfAborted()
        // 就绪发现的异步期间也可能有新用户，最终门禁紧邻写入。
        const finalEvents = exec.agent.session.snapshotEvents()
        const finalGate = validateCompletionEvent({ parentId: sessionId, parentEvents: finalEvents,
          turn: finalEvents.findLast(event => event.type === 'turn/start')?.data.turn, boundToolCallId: exec.callId })
        if (finalGate.kind !== 'read-child') return blockedBoundPreview(args, finalGate, bound, preview)
        if (finalGate.childId !== bound.gate.childId || finalGate.delegateCallId !== bound.gate.delegateCallId
          || finalGate.userMessageId !== bound.gate.userMessageId) {
          return blockedBoundPreview(args, continuationStop('FINAL_SOURCE_CHANGED', '最终门禁的用户或委派来源变化，停止准备。'), bound, preview)
        }
        exec.signal.throwIfAborted()
        dispatched = true
        const operation = unwrapContents(await callTool(client, toolName, { body }))
        exec.signal.throwIfAborted()
        const merged = { ...preview, ...(operation || {}), prepared: true, ready: false,
          actionKey: item.action_key, recommendation_index: checked.recommendationIndex,
          preparation_note: `本次仅对第 ${checked.recommendationIndex + 1} 项建议调用一次草案准备；本草案仅覆盖实际动作「${actionText(item.action_key)}」，不表示整条复合建议已经完成。其他可执行项尚未准备，非不支持。完整建议与分组仍保留，需用户原生确认，不自动下发。${item.fallback_reason ? ` 方案差异：${item.fallback_reason}；临时阻断不等同网络隔离。` : ''}`,
          mode: 'recommendation', source_binding: sourceBinding(bound) }
        // 上游操作记录存在不代表已可确认；不继承未核对的 draft 交付标记。
        delete merged.delivery
        const opData = operation?.data && typeof operation.data === 'object' && !Array.isArray(operation.data)
          ? operation.data : null
        if (opData) for (const field of ['operation_id', 'phase', 'execution_status', 'approval_status']) {
          if (merged[field] === undefined && opData[field] !== undefined) merged[field] = opData[field]
        }
        if (!merged.operation_id) return { source: 'THREAT_ANALYSIS', resultRef: args.incident_id,
          prepared: 'unknown', result_status: 'unknown', source_binding: sourceBinding(bound),
          request_id: bound.requestId, reason: '准备调用已返回但缺少可核对操作号，结果待核对，不重试。' }
        if (merged.phase === 'READY' && merged.execution_status === 'NOT_SUBMITTED') {
          merged.ready = true
          merged.delivery = { domain: 'emergency', kind: 'draft', mode: 'recommendation' }
        } else {
          merged.result_status = 'needs_verification'
          merged.reason = '已取得操作记录，但尚未核对为待确认且未提交；请按操作号核对实际阶段与执行状态。本轮未发出确认或下发请求，不重试。'
        }
        if (merged.data && typeof merged.data === 'object' && !Array.isArray(merged.data)) {
          merged.data = { ...merged.data, mode: 'recommendation' }
        }
        return merged
      }, sessionId), sessionId)
    } catch {
      if (dispatched) return { source: 'THREAT_ANALYSIS', resultRef: args.incident_id,
        prepared: 'unknown', result_status: 'unknown', request_id: bound?.requestId ?? args.request_id,
        ...(bound ? { source_binding: sourceBinding(bound) } : {}),
        reason: '准备请求已经发起，结果待核对；未重试，未确认或下发。' }
      exec.signal.throwIfAborted()
      return blockedBoundPreview(args, continuationStop('BOUND_PREPARE_PREFLIGHT_FAILED', '准备前校验或依赖读取失败，未调用草案创建。'), bound, preview)
    }
  }

  const commonParameters = {
    analysis_session_id: { type: 'string', description: '本地固定来源：父原生目录中直接威胁研判子 Session ID；不能引用其他会话。' },
    analysis_run_id: { type: 'string', description: '该子 Session 原始结构化研判 Run ID；必须与事件及调用绑定。' },
    incident_id: { type: 'string', description: 'SOC 事件 ID；用于读取最新一轮研判建议' },
    action: { type: 'string', description: '直接处置的动作文本（对话入口）' },
    target: { description: '目标：字符串或 {host_name, ip, asset_id}' },
    priority: { type: 'string' },
    reason: { type: 'string' },
    result_ref: { type: 'string', description: '研判结果引用（可选，默认同 incident_id）' },
    capabilities: {
      type: 'object',
      description: '能力快照；可选 actions 数组，如 ["block-ip","host-block-ip"]',
      properties: {
        hostTargetResolvable: { type: 'boolean' },
        actions: { type: 'array', items: { type: 'string' } },
      },
    },
  }

  ctx.tools.register({
    name: 'disposition_preview',
    description:
      '处置预览：读取研判建议做可执行/人工分类与设备、可执行节点解析，或对直接输入的动作调用平台做入口解析与执行体路由（不建草案、不确认）。',
    parameters: {
      type: 'object',
      properties: commonParameters,
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => render(value) },
    timeoutMs: TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (hasAnalysisBinding(args)) return plain(await boundPreview(args, exec))
      const sessionId = exec?.agent?.session?.id
      return plain(await withClient(client => withSecOps(secops =>
        runPreview(client, args, { query: deviceAgentQuery(secops, sessionId) }), sessionId), sessionId))
    },
  })

  ctx.tools.register({
    name: 'disposition_get',
    description: '查询处置操作：传 operationId 读取草案/执行状态；不传则列出本实例最近的应急操作（只读）。',
    parameters: {
      type: 'object',
      properties: {
        operationId: { type: 'string', description: '操作号；不传则 list' },
      },
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => render(value) },
    timeoutMs: TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const sessionId = exec?.agent?.session?.id
      return plain(await withClient(async client => {
        if (args.operationId) {
          const operation = await callOperation(client, 'get_emergency_action', { operationId: args.operationId })
          const result = await callOperation(client, 'get_emergency_action_result', { operationId: args.operationId }).catch(() => undefined)
          // display 是用户可见的中文状态展示；原始字段保留为技术细节。
          return { operation, result, display: operationDisplay(operation), technical_fields: ['operation', 'result'] }
        }
        return callOperation(client, 'list_emergency_actions', {})
      }, sessionId))
    },
  })

  ctx.tools.register({
    name: 'disposition_revise',
    description: '修订处置草案：携带操作号、expected_version、新的 request_id 与完整 intent/action_key/target_hint/params，替换草案内容（不确认、不提交）。',
    parameters: {
      type: 'object',
      properties: {
        operationId: { type: 'string' },
        expected_version: { type: 'integer' },
        request_id: { type: 'string' },
        intent: { type: 'string' },
        action_key: { type: 'string' },
        target_hint: { type: 'string' },
        params: { type: 'object' },
      },
      required: ['operationId'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => render(value) },
    timeoutMs: TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const sessionId = exec?.agent?.session?.id
      return plain(await withClient(async client => {
        const params = { ...(args.params || {}) }
        if (args.action_key === 'block-ip' || args.action_key === 'unblock-ip') {
          delete params.port
          delete params.protocol
        }
        const body = {
          request_id: args.request_id || `disp-revise-${randomUUID()}`,
          ...(args.expected_version === undefined ? {} : { expected_version: args.expected_version }),
          ...(args.intent === undefined ? {} : { intent: args.intent }),
          ...(args.action_key === undefined ? {} : { action_key: args.action_key }),
          ...(args.target_hint === undefined ? {} : { target_hint: args.target_hint }),
          params,
        }
        const operation = await callOperation(client, 'revise_emergency_action', { operationId: args.operationId, body })
        return { ...(operation || {}), delivery: { domain: 'emergency', kind: 'draft' } }
      }, sessionId))
    },
  })

  ctx.tools.register({
    name: 'disposition_cancel',
    description: '取消处置草案（不确认、不提交）：按操作号调用取消。',
    parameters: {
      type: 'object',
      properties: { operationId: { type: 'string' } },
      required: ['operationId'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => render(value) },
    timeoutMs: TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const sessionId = exec?.agent?.session?.id
      return plain(await withClient(client => callOperation(client, 'cancel_emergency_action', { operationId: args.operationId }), sessionId))
    },
  })

  ctx.tools.register({
    name: 'disposition_prepare',
    description:
      '处置准备：先做解析/路由；对可执行的原子动作调用平台 prepare 生成草案（不确认、不提交）。可直接指定 action_key/target_hint/params。研判推荐来源的草案标记 mode=recommendation。',
    parameters: {
      type: 'object',
      properties: {
        ...commonParameters,
        action_key: { type: 'string', description: '显式动作键，如 block-ip / host-block-ip-port' },
        target_hint: { type: 'string', description: '平台 target_hint（设备 IP/ID/主机名）' },
        params: { type: 'object', description: '动作参数，如 {src_ip, port, rule_name}' },
        intent: { type: 'string', description: '原始处置意图' },
        request_id: { type: 'string', description: '幂等键；不传则自动生成' },
        mode: { type: 'string', description: "草案来源标记；'recommendation' 表示按研判推荐处置，研判来源默认自动标记" },
      },
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => render(value) },
    timeoutMs: TOOL_TIMEOUT_MS,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (hasAnalysisBinding(args)) return plain(await boundPrepare(args, exec))
      const sessionId = exec?.agent?.session?.id
      return plain(await withClient(client => withSecOps(async secops => {
        let preview
        try {
          preview = await runPreview(client, args, { query: deviceAgentQuery(secops, sessionId) })
        } catch (error) {
          // SOC 上游不可达时，显式给出的动作键仍允许直接生成草案（只到草案）
          if (!args.action_key) throw error
          preview = { source: 'DIALOGUE', resultRef: args.incident_id || args.result_ref, items: [], executed: false, preview_error: String(error?.message || error) }
        }
        // 草案来自「按推荐处置」时打上 mode:'recommendation'，原生确认框据此走唯一确认。
        const mode = preview.source === 'THREAT_ANALYSIS' || args.mode === 'recommendation'
          ? 'recommendation' : undefined
        const explicit = args.action_key
        const items = Array.isArray(preview.items) ? preview.items : []
        const item = items.find(entry => entry.executable === true) || items[0] || {
          action: args.action || args.intent,
          target: args.target,
          priority: args.priority,
          reason: args.reason,
          choice: undefined,
        }
        const classified = items.includes(item) && typeof item.executable === 'boolean'
        const atomic = item.choice?.kind === 'ATOMIC_ACTION' ? item.choice.chosen : undefined
        // 分类后的推荐项只在 executable 时建草案；人工核验项与不可执行项不建草案。
        const actionKey = explicit || (classified ? (item.executable ? item.action_key : null) : atomic)
        if (!actionKey) {
          return {
            ...preview,
            ...(mode ? { mode } : {}),
            prepared: false,
            reason: item.manual
              ? '需人工核验，暂不能自动处置（不建草案）'
              : (classified ? '该建议暂不能自动处置（不建草案）' : '无可用原子动作（转人工）'),
            ...(item.display ? { display: item.display } : {}),
          }
        }
        const params = { ...(classified ? (item.params || {}) : {}), ...(args.params || {}) }
        // block-ip（防火墙/跨厂商）只接受 src_ip + rule_name；port/protocol 属主机侧动作
        if (actionKey === 'block-ip' || actionKey === 'unblock-ip') {
          delete params.port
          delete params.protocol
        }
        if (actionKey === 'block-ip' && !params.rule_name && params.src_ip) {
          params.rule_name = `block-${params.src_ip}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
        }
        const body = {
          request_id: args.request_id || `disp-${randomUUID()}`,
          intent: args.intent || item.action,
          action_key: actionKey,
          target_hint: args.target_hint || itemTargetHint(item),
          params,
        }
        const operation = await callOperation(
          client,
          'prepare_emergency_action',
          { body },
        )
        const merged = {
          ...preview, prepared: true, actionKey, ...(operation || {}),
          delivery: { domain: 'emergency', kind: 'draft', ...(mode ? { mode } : {}) },
        }
        // 草案关键字段（操作号/阶段/执行状态）平铺到返回顶层，便于上层直接核对。
        const opData = operation?.data && typeof operation.data === 'object' && !Array.isArray(operation.data)
          ? operation.data : null
        if (opData) {
          for (const field of ['operation_id', 'phase', 'execution_status', 'approval_status']) {
            if (merged[field] === undefined && opData[field] !== undefined) merged[field] = opData[field]
          }
        }
        if (mode) {
          merged.mode = mode
          if (merged.data && typeof merged.data === 'object' && !Array.isArray(merged.data)) {
            merged.data = { ...merged.data, mode }
          }
        }
        return merged
      }, sessionId), sessionId))
    },
  })
}
