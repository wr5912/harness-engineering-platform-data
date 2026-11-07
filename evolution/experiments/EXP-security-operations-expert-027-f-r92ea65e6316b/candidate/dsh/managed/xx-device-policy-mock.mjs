import { readFileSync, appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesFile = new URL('./xx-device-policy-fixtures.json', import.meta.url)
const mapKeys = { map1: 'wireless', map2: 'option2', map3: 'option3' }

export function loadFixtures(path = fixturesFile) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactArguments(value, keys) {
  return isObject(value) && Object.keys(value).every(key => keys.includes(key))
    && keys.every(key => Object.hasOwn(value, key))
}

function validMap(value, key) {
  return isObject(value) && Object.entries(value).every(([name, entry]) => name === key && ['1', '2'].includes(entry))
}

function mapSchema(key, description) {
  return { type: 'object', properties: { [key]: { type: 'string', enum: ['1', '2'], description } }, additionalProperties: false }
}

function toolResult(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) }
}

export function createMockPolicyService({ fixtures = loadFixtures(), onEvent = () => {} } = {}) {
  const hosts = structuredClone(fixtures.hosts ?? [])
  if (!Array.isArray(hosts) || hosts.some(host => !isObject(host) || typeof host.hostid !== 'string' || !host.hostid.trim() || typeof host.hostip !== 'string' || isIP(host.hostip) !== 4 || Object.entries(mapKeys).some(([map, key]) => !validMap(host[map], key)))) {
    throw new Error('模拟策略主机及三个map必须符合临时占位合同')
  }
  const events = []
  const writes = []
  const record = event => {
    const entry = { mock: true, ...structuredClone(event) }
    events.push(entry)
    onEvent(structuredClone(entry))
  }
  const errorResult = (code, message) => toolResult({ mock: true, code, message }, true)
  const placeholderDescription = '临时三个map各有一个占位项：map1.wireless为无线网卡，字符串1启用、2禁用；map2.option2和map3.option3暂只接受字符串1或2，具体字段后续由用户确定。'
  const tools = [{
    name: 'read_policy_template',
    title: '读取XX模拟策略模板',
    description: `独立策略模板读工具，按hostip读取模拟主机的hostid、hostip和三个map；未找到返回found:false。${placeholderDescription}不访问真实网络或设备。`,
    inputSchema: {
      type: 'object',
      properties: { hostip: { type: 'string', format: 'ipv4', description: '要读取策略的单个目标IPv4地址' } },
      required: ['hostip'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, {
    name: 'write_policy_template',
    title: '写入XX模拟策略实体',
    description: `独立策略模板写工具。先读取、修改字段并展示本次改动，取得用户确认后再提交五字段实体。只提交本次改动项，无关map必须传空对象，至少有一个改动项。${placeholderDescription}仅记录模拟下发成功，不合并、持久化或应用模板，不验证真实设备应用。`,
    inputSchema: {
      type: 'object',
      properties: {
        hostid: { type: 'string', minLength: 1, description: 'read_policy_template返回并已经确认的hostid，原样传入' },
        hostip: { type: 'string', format: 'ipv4', description: '与该hostid配对、已经确认的目标IPv4地址' },
        map1: mapSchema('wireless', '无线网卡：字符串1启用、2禁用；未修改时省略此键'),
        map2: mapSchema('option2', '临时占位项，值为字符串1或2；未修改时省略此键'),
        map3: mapSchema('option3', '临时占位项，值为字符串1或2；未修改时省略此键'),
      },
      required: ['hostid', 'hostip', 'map1', 'map2', 'map3'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }]

  function callTool(name, args) {
    if (name === 'read_policy_template') {
      if (!exactArguments(args, ['hostip']) || typeof args.hostip !== 'string' || isIP(args.hostip) !== 4) return errorResult('INVALID_ARGUMENTS', '读接口仅接受一个有效IPv4字符串字段hostip')
      const host = hosts.find(value => value.hostip === args.hostip)
      const value = host ? { mock: true, found: true, hostid: host.hostid, hostip: host.hostip, map1: structuredClone(host.map1), map2: structuredClone(host.map2), map3: structuredClone(host.map3) } : { mock: true, found: false }
      record({ tool: name, arguments: args, outcome: host ? 'FOUND' : 'NOT_FOUND' })
      return toolResult(value)
    }
    if (name === 'write_policy_template') {
      if (!exactArguments(args, ['hostid', 'hostip', 'map1', 'map2', 'map3']) || typeof args.hostid !== 'string' || !args.hostid.trim() || typeof args.hostip !== 'string' || isIP(args.hostip) !== 4 || Object.entries(mapKeys).some(([map, key]) => !validMap(args[map], key)) || !Object.keys(mapKeys).some(map => Object.keys(args[map]).length > 0)) {
        return errorResult('INVALID_ARGUMENTS', '写接口仅接受hostid、hostip及三个map；各map仅允许已知占位键和字符串1或2，至少提交一个改动项')
      }
      if (!hosts.some(host => host.hostid === args.hostid && host.hostip === args.hostip)) return errorResult('HOST_MISMATCH', 'hostid与hostip不对应模拟主机，未提交')
      const payload = structuredClone({ hostid: args.hostid, hostip: args.hostip, map1: args.map1, map2: args.map2, map3: args.map3 })
      writes.push(payload)
      record({ tool: name, arguments: payload, outcome: 'SUCCESS' })
      return toolResult({ mock: true, success: true, message: '模拟下发成功' })
    }
    return errorResult('UNKNOWN_TOOL', '没有这个模拟策略工具')
  }

  async function handleRpc(request) {
    if (!isObject(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }
    // 通知不分发；非法ID也必须在任何工具副作用之前拒绝。
    if (!Object.hasOwn(request, 'id')) return undefined
    if (typeof request.id !== 'string' && !Number.isSafeInteger(request.id)) return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request ID' } }
    const response = { jsonrpc: '2.0', id: request.id }
    switch (request.method) {
      case 'initialize':
        return { ...response, result: { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'xx-policy-mock', version: '0.1.0' }, instructions: '独立策略模板开发模拟服务；只记录增量写实体，不连接真实设备，不修改或应用fixture模板。' } }
      case 'ping':
        return { ...response, result: {} }
      case 'tools/list':
        if (request.params?.cursor) return { ...response, error: { code: -32602, message: 'This server does not paginate tools' } }
        return { ...response, result: { tools: structuredClone(tools) } }
      case 'tools/call':
        return { ...response, result: callTool(request.params?.name, request.params?.arguments ?? {}) }
      default:
        return { ...response, error: { code: -32601, message: 'Method not found' } }
    }
  }

  return { tools, events, writes, callTool, handleRpc }
}

export async function serveStdio({ input = process.stdin, output = process.stdout, error = process.stderr, auditLog } = {}) {
  const service = createMockPolicyService({ onEvent: event => {
    const line = `${JSON.stringify(event)}\n`
    if (auditLog) appendFileSync(auditLog, line, { encoding: 'utf8', mode: 0o600 })
    else error.write(line)
  } })
  const lines = createInterface({ input, crlfDelay: Infinity, terminal: false })
  for await (const line of lines) {
    if (!line.trim()) continue
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
