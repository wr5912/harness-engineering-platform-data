/**
 * 受控 xlsx 的 ZIP 容器读取层（纯 Node，零依赖）。
 * 只做条目定位与受控解压；不执行任何内容，不接触文件系统。
 */
import { inflateRawSync } from 'node:zlib'

export const LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxEntries: 512,
  maxTotalUncompressed: 32 * 1024 * 1024,
  maxEntryUncompressed: 16 * 1024 * 1024,
  maxSheets: 16,
  maxRowsPerSheet: 2000,
  maxCols: 64,
  maxCellLength: 4096,
  maxHeaderText: 4096,
})

const EOCD_SIG = 0x06054b50
const CDIR_SIG = 0x02014b50
const LFH_SIG = 0x04034b50

export class ExtractError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function decodeEntities(text) {
  if (!text.includes('&')) return text
  return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    switch (entity) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case 'apos': return "'"
      default: {
        const code = entity[0] === '#x' || entity[0] === '#X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number.parseInt(entity.slice(1), 10)
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match
        try { return String.fromCodePoint(code) } catch { return match }
      }
    }
  })
}

function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]*>/g, ''))
}

export function readZipEntries(buffer, limits) {
  if (buffer.length < 22) throw new ExtractError('not_a_zip', '附件不是有效的 xlsx/zip 文件')
  let eocd = -1
  const stop = Math.max(0, buffer.length - 22 - 65535)
  for (let index = buffer.length - 22; index >= stop; index -= 1) {
    if (buffer.readUInt32LE(index) === EOCD_SIG) { eocd = index; break }
  }
  if (eocd < 0) throw new ExtractError('not_a_zip', '未找到 zip 结尾记录，无法解析附件')
  const entryCount = buffer.readUInt16LE(eocd + 10)
  if (entryCount > limits.maxEntries) {
    throw new ExtractError('limits', `附件条目数 ${entryCount} 超过上限 ${limits.maxEntries}`)
  }
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = []
  let totalUncompressed = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CDIR_SIG) {
      throw new ExtractError('not_a_zip', 'zip 中央目录损坏')
    }
    const flags = buffer.readUInt16LE(offset + 8)
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    if (flags & 0x1) throw new ExtractError('encrypted', `附件条目 ${name} 被加密，拒绝解析`)
    if (uncompressedSize > limits.maxEntryUncompressed) {
      throw new ExtractError('limits', `条目 ${name} 解压大小超过上限`)
    }
    totalUncompressed += uncompressedSize
    if (totalUncompressed > limits.maxTotalUncompressed) {
      throw new ExtractError('limits', '附件解压总大小超过上限')
    }
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function readEntry(buffer, entry, limits) {
  const header = entry.localOffset
  if (header + 30 > buffer.length || buffer.readUInt32LE(header) !== LFH_SIG) {
    throw new ExtractError('not_a_zip', `条目 ${entry.name} 本地头损坏`)
  }
  const nameLength = buffer.readUInt16LE(header + 26)
  const extraLength = buffer.readUInt16LE(header + 28)
  const start = header + 30 + nameLength + extraLength
  const end = start + entry.compressedSize
  if (end > buffer.length) throw new ExtractError('not_a_zip', `条目 ${entry.name} 数据不完整`)
  const raw = buffer.subarray(start, end)
  if (entry.method === 0) return Buffer.from(raw)
  if (entry.method !== 8) throw new ExtractError('unsupported', `条目 ${entry.name} 使用不支持的压缩方法 ${entry.method}`)
  try {
    return inflateRawSync(raw, { maxOutputLength: limits.maxEntryUncompressed })
  } catch (error) {
    if (error?.code === 'ERR_BUFFER_TOO_LARGE' || /maxOutputLength/i.test(String(error?.message))) {
      throw new ExtractError('limits', `条目 ${entry.name} 解压超过上限`)
    }
    throw new ExtractError('not_a_zip', `条目 ${entry.name} 解压失败`)
  }
}

export function indexEntries(entries) {
  const byName = new Map()
  for (const entry of entries) byName.set(entry.name.replace(/^\//, ''), entry)
  return byName
}

export function stripMarkup(text) {
  return stripTags(text)
}
