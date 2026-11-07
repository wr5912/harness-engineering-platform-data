/**
 * xlsx 的 workbook / sharedStrings 解析（在 zip-reader 之上）。
 */
import { readEntry, decodeEntities, ExtractError, stripMarkup } from './zip-reader.mjs'

export function columnToIndex(letters) {
  let value = 0
  for (const char of letters) {
    value = value * 26 + (char.charCodeAt(0) - 64)
  }
  return value - 1
}

export function parseWorkbook(buffer, byName, limits, issues) {
  const workbookEntry = byName.get('xl/workbook.xml')
  if (!workbookEntry) throw new ExtractError('not_a_zip', '附件缺少 xl/workbook.xml，不是 xlsx 工作簿')
  const workbookXml = readEntry(buffer, workbookEntry, limits).toString('utf8')
  const relsEntry = byName.get('xl/_rels/workbook.xml.rels')
  const rels = new Map()
  if (relsEntry) {
    const relsXml = readEntry(buffer, relsEntry, limits).toString('utf8')
    for (const match of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
      const id = /Id="([^"]*)"/.exec(match[0])?.[1]
      const target = /Target="([^"]*)"/.exec(match[0])?.[1]
      if (id && target) rels.set(id, target.replace(/^\//, ''))
    }
  }
  const sheets = []
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = match[0]
    const name = decodeEntities(/name="([^"]*)"/.exec(tag)?.[1] ?? '')
    const relId = /r:id="([^"]*)"/.exec(tag)?.[1]
    const target = rels.get(relId ?? '')
    const path = target ? (target.startsWith('xl/') ? target : `xl/${target}`) : ''
    sheets.push({ name, path })
    if (sheets.length > limits.maxSheets) {
      throw new ExtractError('limits', `工作表数量超过上限 ${limits.maxSheets}`)
    }
  }
  return sheets
}

export function parseSharedStrings(buffer, byName, limits) {
  const entry = byName.get('xl/sharedStrings.xml')
  if (!entry) return []
  const xml = readEntry(buffer, entry, limits).toString('utf8')
  const strings = []
  for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = ''
    for (const part of match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += part[1]
    if (!text) text = stripMarkup(match[1])
    strings.push(decodeEntities(text))
    if (strings.length > limits.maxRowsPerSheet * limits.maxCols) {
      throw new ExtractError('limits', '共享字符串数量超过上限')
    }
  }
  return strings
}
