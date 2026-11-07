/**
 * 受控 xlsx 提取入口：组装 ZIP 层与 XML 层，输出工作表/单元格原值。
 * 不执行公式、宏、外部链接；全部资源上限见 zip-reader 的 LIMITS。
 */
import { LIMITS, ExtractError, decodeEntities, readZipEntries, indexEntries, readEntry } from './zip-reader.mjs'
import { parseWorkbook, parseSharedStrings, columnToIndex } from './xlsx-xml.mjs'

export { LIMITS, ExtractError }

function parseSheet(buffer, entry, sharedStrings, limits, issues, sheetName) {
  const xml = readEntry(buffer, entry, limits).toString('utf8')
  const rows = []
  let currentRow = null
  let rowNumber = 0
  let truncated = false
  const rowPattern = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g
  for (const rowMatch of xml.matchAll(rowPattern)) {
    if (rows.length >= limits.maxRowsPerSheet) { truncated = true; break }
    const attrs = rowMatch[1] ?? rowMatch[3] ?? ''
    const body = rowMatch[2] ?? ''
    const declared = Number.parseInt(/r="(\d+)"/.exec(attrs)?.[1] ?? '', 10)
    rowNumber = Number.isFinite(declared) ? declared : rowNumber + 1
    currentRow = { row: rowNumber, cells: [] }
    let lastIndex = -1
    for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const cellAttrs = cellMatch[1] ?? ''
      const cellBody = cellMatch[2] ?? ''
      const ref = /r="([A-Z]+)(\d+)"/.exec(cellAttrs)
      const colIndex = ref ? columnToIndex(ref[1]) : lastIndex + 1
      if (colIndex >= limits.maxCols) continue
      lastIndex = colIndex
      const type = /t="([^"]*)"/.exec(cellAttrs)?.[1] ?? ''
      const hasFormula = /<f\b/.test(cellBody)
      let value = null
      if (type === 'inlineStr') {
        const inline = /<is>([\s\S]*?)<\/is>/.exec(cellBody)?.[1] ?? ''
        value = decodeEntities([...inline.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => m[1]).join(''))
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(cellBody)?.[1]
        if (raw !== undefined) {
          const text = decodeEntities(raw)
          if (type === 's') {
            const index = Number.parseInt(text, 10)
            value = Number.isInteger(index) && index >= 0 && index < sharedStrings.length ? sharedStrings[index] : null
            if (value === null) issues.push({ sheet: sheetName, row: rowNumber, kind: 'shared_string_out_of_range', detail: `索引 ${text}` })
          } else if (type === 'b') {
            value = text === '1' ? 'TRUE' : 'FALSE'
          } else {
            value = text
          }
        }
      }
      if (hasFormula) issues.push({ sheet: sheetName, row: rowNumber, kind: 'formula_present', detail: ref ? ref[0] : '未知单元格' })
      if (type === 'e') issues.push({ sheet: sheetName, row: rowNumber, kind: 'cell_error_value', detail: value ?? '' })
      if (value !== null) {
        if (value.length > limits.maxCellLength) {
          issues.push({ sheet: sheetName, row: rowNumber, kind: 'cell_truncated', detail: ref ? ref[0] : '' })
          value = value.slice(0, limits.maxCellLength)
        }
        currentRow.cells.push({ index: colIndex, ref: ref ? ref[1] + ref[2] : undefined, value })
      }
    }
    if (currentRow.cells.length > 0) rows.push(currentRow)
  }
  if (truncated) issues.push({ sheet: sheetName, kind: 'rows_truncated', detail: `超过 ${limits.maxRowsPerSheet} 行` })
  return { rows, truncated }
}

function detectMacroAndLinks(entries, issues) {
  const macro = entries.some(entry => /vbaProject/i.test(entry.name))
  if (macro) issues.push({ kind: 'macro_present', detail: '工作簿包含宏，仅提取单元格缓存值，未执行宏' })
  const externals = entries.filter(entry => /^xl\/externalLinks\//.test(entry.name))
  if (externals.length > 0) issues.push({ kind: 'external_links_present', detail: '工作簿包含外部链接，未解析外部数据' })
  const contentType = entries.find(entry => entry.name === '[Content_Types].xml')
  return { macro, externalLinks: externals.length > 0, contentTypePresent: Boolean(contentType) }
}

export function extractWorkbook(buffer, options = {}) {
  const limits = { ...LIMITS, ...(options.limits ?? {}) }
  if (!Buffer.isBuffer(buffer)) throw new ExtractError('invalid_input', '附件内容必须是内存缓冲区')
  if (buffer.length === 0) throw new ExtractError('invalid_input', '附件为空')
  if (buffer.length > limits.maxBytes) {
    throw new ExtractError('limits', `附件 ${buffer.length} 字节超过上限 ${limits.maxBytes}`)
  }
  const issues = []
  const entries = readZipEntries(buffer, limits)
  const byName = indexEntries(entries)
  const features = detectMacroAndLinks(entries, issues)
  const sheetDefs = parseWorkbook(buffer, byName, limits, issues)
  if (sheetDefs.length === 0) throw new ExtractError('invalid_input', '工作簿没有工作表')
  const sharedStrings = parseSharedStrings(buffer, byName, limits)
  const sheets = []
  for (const def of sheetDefs) {
    const entry = def.path ? byName.get(def.path) : undefined
    if (!entry) {
      issues.push({ sheet: def.name, kind: 'sheet_unreadable', detail: '未找到工作表数据文件' })
      sheets.push({ name: def.name, rows: [], truncated: false })
      continue
    }
    const parsed = parseSheet(buffer, entry, sharedStrings, limits, issues, def.name)
    sheets.push({ name: def.name, rows: parsed.rows, truncated: parsed.truncated })
  }
  return { sheets, issues, features }
}
