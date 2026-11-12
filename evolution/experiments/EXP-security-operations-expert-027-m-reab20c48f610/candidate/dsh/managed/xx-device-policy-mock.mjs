import { readFileSync, appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesFile = new URL('./xx-device-policy-fixtures.json', import.meta.url)
export const policyMapFields = {
  '设备控制': {
    '蓝牙设备': { type: 'string', enum: ['1', '2'], description: '蓝牙设备：字符串1启用、2禁用；未修改时省略此键' },
    '光驱': { type: 'string', enum: ['1', '2', '3'], description: '光驱：字符串1启用、2禁用、3只读；未修改时省略此键' },
    '串口': { type: 'string', enum: ['1', '2'], description: '串口：字符串1启用、2禁用；未修改时省略此键' },
    '无线网卡': { type: 'string', enum: ['1', '2'], description: '无线网卡：字符串1启用、2禁用；未修改时省略此键' },
    '打印设备': { type: 'string', enum: ['1', '2'], description: '打印设备：字符串1启用、2禁用；未修改时省略此键' },
    'USB存储设备': { type: 'string', enum: ['1', '2', '3'], description: 'USB存储设备：字符串1启用、2禁用、3只读；未修改时省略此键' },
  },
  login: {
    alogin: { type: 'string', enum: ['0', '1'], description: 'alogin字段，允许字符串0、1；未修改时省略此键' },
    oscreenoff: { type: 'string', enum: ['0', '5', '10', '30', '-1'], description: 'oscreenoff字段，允许字符串0、5、10、30、-1；未修改时省略此键' },
    ltype: { type: 'string', enum: ['0', '1', '2', '3'], description: 'ltype字段，允许字符串0、1、2、3；未修改时省略此键' },
    man: { type: 'string', enum: ['0', '1'], description: 'man字段，允许字符串0、1；未修改时省略此键' },
    finger: { type: 'string', enum: ['0', '1'], description: 'finger字段，允许字符串0、1；未修改时省略此键' },
    sm: { type: 'string', enum: ['0', '1'], description: 'sm字段，允许字符串0、1；未修改时省略此键' },
    trust: { type: 'string', enum: ['0', '1'], description: 'trust字段，允许字符串0、1；未修改时省略此键' },
    osuer: { type: 'string', enum: ['0', '1'], description: 'osuer字段，允许字符串0、1；保留原拼写，未修改时省略此键' },
  },
  net: {
    rulename: { type: 'string', description: '字符串规则名，例如阻断；未修改时省略此键' },
    control: { type: 'string', enum: ['0', '1'], description: '字符串0禁用、1启用；未修改时省略此键' },
    index: { type: 'string', enum: ['1', '2', '3', '4'], description: '排序字段，允许字符串1、2、3、4；未修改时省略此键' },
    action: { type: 'string', enum: ['deny', 'allow'], description: '字符串deny阻断、allow允许；未修改时省略此键' },
    proctocol: { type: 'string', enum: ['ip', 'tcp', 'udp', 'icmp'], description: '协议字段，允许字符串ip、tcp、udp、icmp；保留原拼写，未修改时省略此键' },
    sourceip: { type: 'string', description: '源地址字符串，例如179.16.1.1或179.16.1.1/24，原样传参；未修改时省略此键' },
    sourceport: { type: 'string', description: '源端口字符串，例如80,1-20，原样传参；未修改时省略此键' },
    targetip: { type: 'string', description: '目标地址字符串，例如179.16.1.1或179.16.1.1/24，原样传参；未修改时省略此键' },
    targetport: { type: 'string', description: '目标端口字符串，例如80,1-20，原样传参；未修改时省略此键' },
    reserved: { type: 'string', enum: ['0', '1', '2'], description: '字符串0进、1出、2双向；未修改时省略此键' },
  },
}
const mapNames = Object.keys(policyMapFields)
const entityKeys = ['hostid', 'hostip', ...mapNames]

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

function validMap(value, map, complete = false) {
  const fields = policyMapFields[map]
  return isObject(value) && Object.entries(value).every(([name, entry]) => Object.hasOwn(fields, name)
    && typeof entry === fields[name].type && (!fields[name].enum || fields[name].enum.includes(entry)))
    && (!complete || Object.keys(fields).every(name => Object.hasOwn(value, name)))
}

function mapSchema(map) {
  return { type: 'object', properties: structuredClone(policyMapFields[map]), additionalProperties: false }
}

function toolResult(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) }
}

export function createMockPolicyService({ fixtures = loadFixtures(), onEvent = () => {} } = {}) {
  const hosts = structuredClone(fixtures.hosts ?? [])
  if (!Array.isArray(hosts) || hosts.some(host => !exactArguments(host, entityKeys) || typeof host.hostid !== 'string' || !host.hostid.trim() || typeof host.hostip !== 'string' || isIP(host.hostip) !== 4 || mapNames.some(map => !validMap(host[map], map, true)))) {
    throw new Error('模拟策略主机必须包含hostid、hostip及字段完整、值合法的设备控制、login、net')
  }
  const events = []
  const writes = []
  const record = event => {
    const entry = { mock: true, ...structuredClone(event) }
    events.push(entry)
    onEvent(structuredClone(entry))
  }
  const errorResult = (code, message) => toolResult({ mock: true, code, message }, true)
  const entityDescription = '实体为hostid、hostip、设备控制、login、net五字段，三个Map的值全部为字符串。login业务含义及单位尚未确认；net仅做基础传参，地址和端口字符串原样保留。所有值均为Mock数据，不代表真实配置。'
  const tools = [{
    name: 'read_policy_template',
    title: '读取XX模拟策略模板',
    description: `独立策略模板读工具，按hostip读取模拟主机的完整五字段实体，附加mock和found；未找到返回found:false。${entityDescription}不访问真实网络或设备。`,
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
    description: `独立策略模板写工具。先读取、修改字段并展示本次改动，取得用户确认后再提交五字段实体。只提交本次改动项，未修改的Map必须传空对象，至少有一个改动项；一次可提交多个配置项，不增加映射动作键。${entityDescription}仅记录模拟下发成功，不合并、持久化或应用模板，不验证真实设备应用。`,
    inputSchema: {
      type: 'object',
      properties: {
        hostid: { type: 'string', minLength: 1, description: 'read_policy_template返回并已经确认的hostid，原样传入' },
        hostip: { type: 'string', format: 'ipv4', description: '与该hostid配对、已经确认的目标IPv4地址' },
        ...Object.fromEntries(mapNames.map(map => [map, mapSchema(map)])),
      },
      required: [...entityKeys],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }]

  function callTool(name, args) {
    if (name === 'read_policy_template') {
      if (!exactArguments(args, ['hostip']) || typeof args.hostip !== 'string' || isIP(args.hostip) !== 4) return errorResult('INVALID_ARGUMENTS', '读接口仅接受一个有效IPv4字符串字段hostip')
      const host = hosts.find(value => value.hostip === args.hostip)
      const value = host ? { mock: true, found: true, ...structuredClone(host) } : { mock: true, found: false }
      record({ tool: name, arguments: args, outcome: host ? 'FOUND' : 'NOT_FOUND' })
      return toolResult(value)
    }
    if (name === 'write_policy_template') {
      if (!exactArguments(args, entityKeys) || typeof args.hostid !== 'string' || !args.hostid.trim() || typeof args.hostip !== 'string' || isIP(args.hostip) !== 4 || mapNames.some(map => !validMap(args[map], map)) || !mapNames.some(map => Object.keys(args[map]).length > 0)) {
        return errorResult('INVALID_ARGUMENTS', '写接口仅接受hostid、hostip、设备控制、login、net；Map仅允许已知字段、字符串值及字段枚举，至少提交一个改动项')
      }
      if (!hosts.some(host => host.hostid === args.hostid && host.hostip === args.hostip)) return errorResult('HOST_MISMATCH', 'hostid与hostip不对应模拟主机，未提交')
      const payload = structuredClone(args)
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
