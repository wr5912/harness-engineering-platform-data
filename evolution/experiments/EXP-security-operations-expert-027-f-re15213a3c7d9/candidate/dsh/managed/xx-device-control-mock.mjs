import { readFileSync, appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const commandsFile = new URL('./xx-device-command-map.json', import.meta.url)
const fixturesFile = new URL('./xx-device-control-fixtures.json', import.meta.url)

export function loadCommandMap(path = commandsFile) {
  const value = JSON.parse(readFileSync(path, 'utf8'))
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('指令映射必须是ID到名称的对象')
  const entries = Object.entries(value)
  if (entries.length !== 11 || new Set(entries.map(([, name]) => name)).size !== 11 || entries.some(([id, name]) => !id.trim() || id !== id.trim() || typeof name !== 'string' || !name.trim())) {
    throw new Error('开发映射必须包含11项非空字符串ID及唯一中文名称；ID原样保留，不转数字')
  }
  return Object.freeze({ ...value })
}

export function loadFixtures(path = fixturesFile) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function argumentsObject(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key))
    && keys.every(key => Object.hasOwn(value, key))
}

function toolResult(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) }
}

export function createMockDeviceService({ commandMap = loadCommandMap(), fixtures = loadFixtures(), onEvent = () => {} } = {}) {
  const hosts = structuredClone(fixtures.hosts ?? [])
  if (!Array.isArray(hosts) || hosts.some(host => typeof host.hostId !== 'string' || !host.hostId || isIP(host.hostIp) !== 4 || typeof host.hostName !== 'string') || new Set(hosts.map(host => host.hostId)).size !== hosts.length) {
    throw new Error('模拟主机数据无效或hostId重复')
  }
  const events = []
  const writes = []
  const legend = Object.entries(commandMap).map(([id, name]) => `${id}=${name}`).join('；')
  const record = event => {
    const entry = { mock: true, ...structuredClone(event) }
    events.push(entry)
    onEvent(structuredClone(entry))
  }
  const errorResult = (code, message) => toolResult({ mock: true, code, message }, true)

  const tools = [{
    name: 'lookup_host',
    title: '查询XX模拟主机',
    description: `仅查询开发模拟主机，不扫描网络。按hostIp返回候选主机及hostId；无匹配与查询错误分别返回。唯一指令映射由本版本配置生成：${legend}。这些ID仅为开发约定，绝不操作真实设备。`,
    inputSchema: {
      type: 'object',
      properties: { hostIp: { type: 'string', format: 'ipv4', description: '用户指定的单个目标IPv4地址' } },
      required: ['hostIp'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, {
    name: 'send_command',
    title: '下发XX模拟指令',
    description: `只向开发Mock提交三个业务参数，不控制真实设备。必须先查询主机并展示本次草案，取得DSH原生问题的精确确认后再调用；取消不调用。唯一指令映射：${legend}。工具本身不提供真实设备审批保证，不能用于真实服务。`,
    inputSchema: {
      type: 'object',
      properties: {
        hostid: { type: 'string', minLength: 1, description: '本次lookup_host回执中的hostId，原样作为字符串传入，不能猜测' },
        hostip: { type: 'string', format: 'ipv4', description: '与该hostid对应、已经确认的目标IP，作为字符串传入' },
        commandid: { type: 'string', minLength: 1, enum: Object.keys(commandMap), description: `按中文动作取唯一映射，ID原样作为字符串传入，支持UUID样式，不转数字：${legend}` },
      },
      required: ['hostid', 'hostip', 'commandid'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }]

  function callTool(name, args) {
    if (name === 'lookup_host') {
      if (!argumentsObject(args, ['hostIp']) || isIP(args.hostIp) !== 4) return errorResult('INVALID_ARGUMENTS', '读接口只接受一个有效IPv4参数hostIp')
      if ((fixtures.readFailureIps ?? []).includes(args.hostIp)) {
        record({ tool: name, arguments: args, outcome: 'QUERY_FAILED' })
        return errorResult('QUERY_FAILED', '模拟设备查询失败；这不表示当前IP无对应设备')
      }
      const matched = hosts.filter(host => host.hostIp === args.hostIp)
      const value = { mock: true, found: matched.length > 0, total: matched.length, hosts: structuredClone(matched) }
      record({ tool: name, arguments: args, outcome: matched.length ? 'FOUND' : 'NOT_FOUND', count: matched.length })
      return toolResult(value)
    }
    if (name === 'send_command') {
      if (!argumentsObject(args, ['hostid', 'hostip', 'commandid']) || typeof args.hostid !== 'string' || !args.hostid || typeof args.hostip !== 'string' || isIP(args.hostip) !== 4 || typeof args.commandid !== 'string' || !args.commandid || !Object.hasOwn(commandMap, args.commandid)) {
        return errorResult('INVALID_ARGUMENTS', '写接口仅接受hostid、hostip、commandid三个小写字符串字段；指令ID必须来自映射并原样传入')
      }
      if (!hosts.some(host => host.hostId === args.hostid && host.hostIp === args.hostip)) return errorResult('HOST_MISMATCH', 'hostid与hostip不对应任何模拟主机，未提交')
      const status = fixtures.writeOutcomes?.[args.hostid] ?? 'SUCCESS'
      if (!['SUCCESS', 'FAILED', 'UNKNOWN', 'ACCEPTED'].includes(status)) return errorResult('INVALID_FIXTURE', '模拟写入结果配置无效')
      const payload = { hostid: args.hostid, hostip: args.hostip, commandid: args.commandid }
      const executionId = `mock-${randomUUID()}`
      writes.push(structuredClone(payload))
      record({ tool: name, arguments: payload, outcome: status, executionId })
      const messages = {
        SUCCESS: '模拟下发成功；未操作真实设备',
        FAILED: '模拟下发失败；未操作真实设备',
        UNKNOWN: '模拟提交结果待核实；不能自动重发，未操作真实设备',
        ACCEPTED: '模拟请求已受理；不代表设备执行完成，未操作真实设备',
      }
      return toolResult({ mock: true, status, message: messages[status], executionId, ...payload, commandName: commandMap[args.commandid] }, status === 'FAILED')
    }
    return errorResult('UNKNOWN_TOOL', '没有这个模拟工具')
  }

  // 只复用相同MCP请求ID的回包，不按三参数永久去重；新的合法请求仍可再次执行模拟动作。
  const writeRpcReplies = new Map()

  async function handleRpc(request) {
    if (!request || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
    }
    if (!Object.hasOwn(request, 'id')) return undefined
    if (typeof request.id !== 'string' && !Number.isSafeInteger(request.id)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request ID' } }
    const response = { jsonrpc: '2.0', id: request.id }
    switch (request.method) {
      case 'initialize':
        return { ...response, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'xx-device-control-mock', version: '0.1.0' }, instructions: '开发模拟服务；主机和执行结果均为模拟数据，不连接或控制真实设备。' } }
      case 'ping':
        return { ...response, result: {} }
      case 'tools/list':
        if (request.params?.cursor) return { ...response, error: { code: -32602, message: 'This server does not paginate tools' } }
        return { ...response, result: { tools: structuredClone(tools) } }
      case 'tools/call': {
        if (request.params?.name !== 'send_command') return { ...response, result: callTool(request.params?.name, request.params?.arguments ?? {}) }
        const key = `${typeof request.id}:${request.id}`
        const fingerprint = JSON.stringify(request.params)
        const cached = writeRpcReplies.get(key)
        if (cached) return cached.fingerprint === fingerprint ? structuredClone(cached.response) : { ...response, error: { code: -32600, message: 'Request ID reused with different command parameters' } }
        if (writeRpcReplies.size >= 10000) return { ...response, error: { code: -32000, message: 'Mock transport request cache is full; no command submitted' } }
        const reply = { ...response, result: callTool(request.params.name, request.params.arguments ?? {}) }
        writeRpcReplies.set(key, { fingerprint, response: structuredClone(reply) })
        return reply
      }
      default:
        return { ...response, error: { code: -32601, message: 'Method not found' } }
    }
  }

  return { tools, events, writes, callTool, handleRpc }
}

export async function serveStdio({ input = process.stdin, output = process.stdout, error = process.stderr, auditLog } = {}) {
  const service = createMockDeviceService({ onEvent: event => {
    const line = `${JSON.stringify(event)}\n`
    if (auditLog) appendFileSync(auditLog, line, { encoding: 'utf8', mode: 0o600 })
    else error.write(line)
  } })
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false })
  for await (const line of lines) {
    if (!line.trim()) continue
    if (Buffer.byteLength(line) > 1024 * 1024) {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request exceeds mock development limit' } })}\n`)
      continue
    }
    let request
    try { request = JSON.parse(line) } catch {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`)
      continue
    }
    const response = await service.handleRpc(request)
    if (response) output.write(`${JSON.stringify(response)}\n`)
  }
  return service
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const auditIndex = process.argv.indexOf('--audit-log')
  const auditLog = auditIndex < 0 ? undefined : process.argv[auditIndex + 1]
  if (auditIndex >= 0 && !auditLog) throw new Error('--audit-log需要明确的开发日志文件路径')
  await serveStdio({ auditLog })
}
