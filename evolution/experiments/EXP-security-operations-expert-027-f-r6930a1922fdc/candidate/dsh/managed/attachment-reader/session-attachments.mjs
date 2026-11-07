/**
 * 当前会话附件绑定收集：只采信 user/message 且 source.kind === 'user' 的事件。
 * 指令、运行时上下文、工具结果中的同形对象一律不采信，避免伪造引用。
 */

const ATTACHMENT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/
const MAX_WALK_DEPTH = 24
const MAX_WALK_NODES = 5000

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function refFromRecord(value) {
  if (!isRecord(value)) return undefined
  const { attachmentId, name, bytes } = value
  if (typeof attachmentId !== 'string' || !ATTACHMENT_ID_PATTERN.test(attachmentId)) return undefined
  if (typeof name !== 'string' || !name || name.length > 255) return undefined
  if (!Number.isSafeInteger(bytes) || bytes < 0) return undefined
  return { attachmentId, name, bytes }
}

export function collectSessionAttachments(agent) {
  let events
  try { events = agent?.session?.snapshotEvents?.() } catch { return undefined }
  if (!Array.isArray(events)) return undefined
  const found = new Map()
  let visited = 0
  const walk = (node, depth) => {
    if (depth > MAX_WALK_DEPTH || visited > MAX_WALK_NODES || node === null || typeof node !== 'object') return
    visited += 1
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    const ref = refFromRecord(node)
    if (ref) found.set(ref.attachmentId, ref)
    for (const value of Object.values(node)) walk(value, depth + 1)
  }
  for (const event of events) {
    if (event?.type !== 'user/message') continue
    const source = event.data?.source
    if (source?.kind !== undefined && source?.kind !== 'user') continue
    walk(event.data, 0)
    if (visited > MAX_WALK_NODES) break
  }
  return found
}

export { ATTACHMENT_ID_PATTERN }
