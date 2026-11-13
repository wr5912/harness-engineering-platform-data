/**
 * 经 DSH 原生 ctx.attachments 读取附件字节并做输出限长。
 * 原生 readFileStream 负责摘要与字节数完整性校验；这里只加字节上限与错误翻译。
 */
import { LIMITS } from './zip-reader.mjs'

export const MAX_OUTPUT_ROWS = 200

export async function readAttachmentBytes(attachments, ref) {
  if (!attachments || typeof attachments.readFileStream !== 'function') {
    return { error: '当前运行时未挂载原生附件服务，不能读取附件。' }
  }
  if (typeof attachments.fileHostPath === 'function') {
    // fileHostPath 仅确认后端为宿主文件存储；不把路径交给模型或用于读取。
    try { attachments.fileHostPath(ref) } catch { /* 后端可能不支持，读取时按错误报告 */ }
  }
  const chunks = []
  let total = 0
  try {
    for await (const chunk of attachments.readFileStream(ref)) {
      total += chunk.byteLength
      if (total > LIMITS.maxBytes) {
        return { error: `附件超过读取上限 ${LIMITS.maxBytes} 字节，已中止。` }
      }
      chunks.push(Buffer.from(chunk))
    }
  } catch (error) {
    const code = error?.code
    if (code === 'ATTACHMENT_NOT_FOUND') return { error: '附件对象不存在或已被移除，无法读取。' }
    if (code === 'ATTACHMENT_CORRUPT') return { error: '附件字节与登记摘要不一致（完整性校验失败），拒绝解析。' }
    return { error: `读取附件失败：${error?.message ?? code ?? '未知错误'}` }
  }
  if (total !== ref.bytes) return { error: '附件字节数与登记值不一致，拒绝解析。' }
  return { buffer: Buffer.concat(chunks, total) }
}

export function limitRows(sheets) {
  let truncated = false
  const limited = sheets.map(sheet => {
    if (sheet.rows.length <= MAX_OUTPUT_ROWS) return sheet
    truncated = true
    return { ...sheet, rows: sheet.rows.slice(0, MAX_OUTPUT_ROWS) }
  })
  return { sheets: limited, truncated }
}
