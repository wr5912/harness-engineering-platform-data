// 只解码本次工具回执中的候选行；不访问 spill 路径，不读取文件，不拼接被省略的中段。
const parse = text => { try { return JSON.parse(text) } catch { return undefined } }
const validPage = value => value?.code === 200 && Array.isArray(value.data?.rows)

export function decodeThreatCandidatePage(text) {
  if (typeof text !== 'string') return undefined
  const complete = parse(text)
  if (complete !== undefined) return validPage(complete) ? { rows: complete.data.rows, truncated: false } : undefined
  // 仅识别已观测的原生长输出格式；其它非法 JSON 不作为候选证据。
  const cut = text.indexOf('\n\n[...]\n\n')
  if (cut < 0 || !/\n\n\(Omitted \d+ bytes\. Full formatted result stored at: [\s\S]*\)\s*$/.test(text)) return undefined
  const prefix = text.slice(0, cut)
  const start = /"rows"\s*:\s*\[/.exec(prefix)
  if (!start) return undefined
  const offset = start.index + start[0].length
  // 完整解析已接收的顶层成功响应头；不能从任意日志字符串中提取 code 或 incidentId。
  const header = parse(prefix.slice(0, offset) + ']}}')
  if (!validPage(header)) return undefined
  const rows = []
  let position = offset
  while (position < prefix.length) {
    while (/\s/.test(prefix[position] ?? '') && position < prefix.length) position++
    if (position >= prefix.length || prefix[position] === ']') break
    if (rows.length) {
      if (prefix[position] !== ',') return undefined
      position++
      while (position < prefix.length && /\s/.test(prefix[position])) position++
    }
    if (position >= prefix.length) break
    if (prefix[position] !== '{') return undefined
    const rowStart = position
    let depth = 0, quoted = false, escaped = false, finished = false
    for (; position < prefix.length; position++) {
      const ch = prefix[position]
      if (quoted) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') quoted = false
        continue
      }
      if (ch === '"') quoted = true
      else if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') {
        depth--
        if (depth === 0) {
          const row = parse(prefix.slice(rowStart, position + 1))
          if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
          rows.push(row)
          position++
          finished = true
          break
        }
      }
    }
    if (!finished) break // 最后一条不完整记录不作身份依据，也不跳到尾段凑数。
  }
  return rows.length ? { rows, truncated: true } : undefined
}
