/**
 * 从提取的工作表中组装策略字段（源、目的、协议、端口）。
 * - 完整 = 四个必需字段均有值且无字段级问题；无效端口、未知协议、缺字段都不生成策略行。
 * - 未识别的列原样保留；现有意图合同不支持的字段（如源端口）单独报告，不静默丢弃。
 */
import { HEADER_SYNONYMS, buildHeaderMap, columnIndexToLetters, isProtocol, isPort } from './policy-headers.mjs'

export function extractPolicyRows(extracted) {
  const issues = []
  const policyRows = []
  const headerFields = {}
  const unsupportedFields = []
  let headerConsumed = false

  for (const sheet of extracted.sheets ?? []) {
    if (!Array.isArray(sheet.rows) || sheet.rows.length === 0) continue
    const headerRow = sheet.rows[0]
    const { mapping, unsupported, issues: headerIssues, knownIndexes } = buildHeaderMap(headerRow.cells)
    issues.push(...headerIssues.map(issue => ({ sheet: sheet.name, ...issue })))
    if (Object.keys(mapping).length === 0) {
      issues.push({
        sheet: sheet.name,
        row: headerRow.row,
        kind: 'header_not_recognized',
        detail: `未识别到策略表头，首行原值：${headerRow.cells.map(cell => `${cell.ref ?? cell.index}=${cell.value}`).join(' | ')}`,
      })
      continue
    }
    if (!headerConsumed) {
      headerConsumed = true
      headerFields[sheet.name] = Object.fromEntries(
        Object.entries(mapping).map(([field, index]) => [field, { column: columnIndexToLetters(index), header: headerRow.cells.find(cell => cell.index === index)?.value ?? '' }]),
      )
      for (const [field, index] of Object.entries(unsupported)) {
        unsupportedFields.push({ field, column: columnIndexToLetters(index), header: headerRow.cells.find(cell => cell.index === index)?.value ?? '', detail: '当前策略意图合同不支持该字段，已保留报告，不静默丢弃' })
      }
    }
    const extraColumns = headerRow.cells
      .filter(cell => cell.index < 64 && !knownIndexes.has(cell.index) && !Object.values(unsupported).includes(cell.index))
      .map(cell => ({ column: cell.ref ?? columnIndexToLetters(cell.index), header: cell.value }))

    for (const row of sheet.rows.slice(1)) {
      const values = new Map(row.cells.map(cell => [cell.index, cell.value]))
      const present = Object.entries(mapping).filter(([, index]) => values.has(index) && String(values.get(index)).trim() !== '')
      if (present.length === 0) continue
      const rowIssues = []
      const record = { sheet: sheet.name, row: row.row }
      for (const field of Object.keys(HEADER_SYNONYMS)) {
        const index = mapping[field]
        if (index === undefined) continue
        const value = values.has(index) ? String(values.get(index)).trim() : null
        if (field === 'destination_port') {
          if (value === null) rowIssues.push({ field, kind: 'missing_field' })
          else if (!isPort(value)) rowIssues.push({ field, kind: 'invalid_port', value })
        } else if (field === 'protocol') {
          if (value === null) rowIssues.push({ field, kind: 'missing_field' })
          else if (!isProtocol(value)) rowIssues.push({ field, kind: 'unknown_protocol', value })
        } else if (value === null) {
          rowIssues.push({ field, kind: 'missing_field' })
        }
        record[field] = value
      }
      for (const [field, index] of Object.entries(unsupported)) {
        if (values.has(index)) record[field] = String(values.get(index)).trim()
      }
      record.raw_cells = row.cells
        .filter(cell => !knownIndexes.has(cell.index) && !Object.values(unsupported).includes(cell.index))
        .map(cell => ({ column: cell.ref ?? columnIndexToLetters(cell.index), value: cell.value }))
      record.complete = ['source', 'destination', 'protocol', 'destination_port']
        .every(field => record[field] !== null && record[field] !== undefined) && rowIssues.length === 0
      if (extraColumns.length > 0) record.extra_columns = extraColumns
      if (rowIssues.length > 0) issues.push(...rowIssues.map(issue => ({ sheet: sheet.name, row: row.row, ...issue })))
      if (record.complete) policyRows.push(record)
      else issues.push({ sheet: sheet.name, row: row.row, kind: 'incomplete_policy_row', detail: '策略字段不完整，未生成策略行' })
    }
  }

  if (!headerConsumed && issues.length === 0) {
    issues.push({ kind: 'no_data', detail: '未找到可用的数据行' })
  }
  return {
    policy_rows: policyRows,
    header_fields: headerFields,
    unsupported_fields: unsupportedFields,
    issues,
    sheets_scanned: extracted.sheets?.length ?? 0,
  }
}
