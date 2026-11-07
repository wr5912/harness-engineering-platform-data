/**
 * 策略表头识别与字段校验规则（提取层的纯函数部分）。
 * 表头按同义词匹配；匹配不到的列原样保留，不静默丢弃。
 */

export const HEADER_SYNONYMS = Object.freeze({
  source: ['源', '源ip', '源地址', '源ip地址', '源端点', '源主机', 'source', 'src', 'source_ip', 'sourceip'],
  destination: ['目的', '目的ip', '目的地址', '目的ip地址', '目的端点', '目的主机', '目标', '目标ip', '目标地址', 'destination', 'dest', 'dst', 'destination_ip', 'destinationip'],
  protocol: ['协议', 'protocal', 'protocol', 'ip协议'],
  destination_port: ['端口', '目的端口', '目标端口', '目的port', 'port', 'dport', 'destination_port', '目标port'],
})

export const UNSUPPORTED_SYNONYMS = Object.freeze({
  source_port: ['源端口', '源port', 'source_port', 'sport', '源端口范围'],
  action: ['动作', '操作', 'action', '策略动作', '允许/阻断'],
  enabled: ['启用', '状态', 'enabled', 'valid'],
  expires: ['有效期', '过期时间', '到期', 'expires'],
})

export const MAX_HEADER_COLUMNS = 64

export function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '')
}

export function columnIndexToLetters(index) {
  let value = index + 1
  let letters = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    letters = String.fromCharCode(65 + remainder) + letters
    value = Math.floor((value - 1) / 26)
  }
  return letters
}

export function buildHeaderMap(headerCells) {
  const mapping = {}
  const issues = []
  const used = new Set()
  for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
    for (const cell of headerCells) {
      const normalized = normalizeHeader(cell.value)
      if (!normalized) continue
      if (synonyms.includes(normalized)) {
        if (mapping[field] !== undefined) {
          issues.push({ kind: 'duplicate_header_field', field, detail: `列 ${cell.ref ?? cell.index} 与列 ${columnIndexToLetters(mapping[field])} 同时匹配 ${field}` })
          break
        }
        mapping[field] = cell.index
        used.add(cell.index)
        break
      }
    }
  }
  const unsupported = {}
  for (const [field, synonyms] of Object.entries(UNSUPPORTED_SYNONYMS)) {
    for (const cell of headerCells) {
      const normalized = normalizeHeader(cell.value)
      if (normalized && synonyms.includes(normalized)) { unsupported[field] = cell.index; break }
    }
  }
  return { mapping, unsupported, issues, knownIndexes: used }
}

export function isProtocol(value) {
  return ['TCP', 'UDP', 'ICMP', 'ANY'].includes(String(value ?? '').trim().toUpperCase())
}

export function isPort(value) {
  if (!/^\d+$/.test(String(value ?? '').trim())) return false
  const port = Number.parseInt(value, 10)
  return Number.isInteger(port) && port >= 1 && port <= 65535
}
