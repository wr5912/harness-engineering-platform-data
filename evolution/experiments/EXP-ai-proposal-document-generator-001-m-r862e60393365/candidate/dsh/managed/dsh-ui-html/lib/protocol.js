/**
 * Shared protocol vocabulary for dsh-ui-html.
 *
 * This module is plain data plus pure validators so both the host half and the
 * node test suite load it without any Harness import. It is deliberately a
 * *transfer envelope*, not an HTML carrier: HTML travels inside the ordinary
 * tool-call arguments, while an interaction travels as one small, validated
 * JSON object.
 *
 * @module dsh-ui-html/protocol
 */

/** Wire tool name registered in the host and keyed in `tool.call.toolview`. */
export const TOOL_NAME = 'show_ui'

/** Exact HTTP path of the interaction bridge (root-absolute on the host side). */
export const BRIDGE_PATH = '/plugins/dsh-ui-html/event'

/** Exact HTTP path of the read-only bridge description (GET). */
export const STATUS_PATH = '/plugins/dsh-ui-html/status'

/** Envelope version carried by every widget→host interaction. */
export const EVENT_VERSION = 1

/** Marker key the widget stamps on its postMessage envelope. */
export const WIDGET_MARKER = '__dshUiEvent'

/** Marker key the host stamps on the message it posts into the widget. */
export const HOST_MARKER = '__dshUiHost'

/** Longest accepted interaction event name. */
export const MAX_EVENT_NAME = 64

/** Accepted interaction event name shape. */
export const EVENT_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/

/** Deepest accepted payload nesting (objects/arrays). */
export const MAX_PAYLOAD_DEPTH = 8

/** Largest accepted total JSON key count across one payload. */
export const MAX_PAYLOAD_KEYS = 200

/** Longest accepted ui id (a tool call id). */
export const MAX_UI_ID = 160

/** Largest HTML document accepted per call, in UTF-8 bytes. */
export const DEFAULT_MAX_HTML_BYTES = 262144

/** Largest serialized interaction payload accepted per event, in UTF-8 bytes. */
export const DEFAULT_MAX_EVENT_BYTES = 65536

/** Default interaction wait: 0 means "until the turn is cancelled". */
export const DEFAULT_INTERACTION_TIMEOUT_MS = 0

/**
 * @typedef {object} BridgeLimits
 * @property {boolean} eventBridgeEnabled
 * @property {number} maxEventBytes
 * @property {string} csp
 */

/**
 * Build the Content-Security-Policy for one widget document.
 *
 * Default posture denies everything and then re-opens only what an inline
 * widget needs: its own inline styles and scripts, `data:`/`blob:` images and
 * fonts. Any entry of `allowedResourceOrigins` is added to the matching
 * directives; no entry ever opens `frame-src`, `object-src`, `form-action`,
 * `base-uri`, or the top-level navigation surface.
 *
 * @param {readonly string[]} allowedResourceOrigins - `scheme://host[:port]` origins.
 * @returns {string} one CSP directive string.
 */
export function buildCsp(allowedResourceOrigins) {
  const origins = []
  for (const raw of allowedResourceOrigins ?? []) {
    const value = String(raw ?? '').trim()
    if (value === '') continue
    // Only an absolute http(s) origin is admitted; a wildcard or a bare host
    // would silently widen the policy, so it is rejected here and the caller
    // reports the configuration error at activation time.
    if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(value)) continue
    origins.push(value)
  }
  const extra = origins.length > 0 ? ` ${origins.join(' ')}` : ''
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'" + extra,
    "style-src 'unsafe-inline'" + extra,
    "img-src data: blob:" + extra,
    "font-src data:" + extra,
    "media-src data: blob:" + extra,
    "connect-src 'none'" + extra,
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "manifest-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

/**
 * Reject the configured origins that {@link buildCsp} would drop, so a typo is
 * reported at activation instead of silently producing a weaker policy.
 *
 * @param {readonly string[]} allowedResourceOrigins - configured origins.
 * @returns {string[]} human-readable diagnostics, empty when the list is valid.
 */
export function validateResourceOrigins(allowedResourceOrigins) {
  const problems = []
  for (const raw of allowedResourceOrigins ?? []) {
    const value = String(raw ?? '').trim()
    if (value === '') {
      problems.push('allowedResourceOrigins contains an empty entry')
      continue
    }
    if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(value)) {
      problems.push(
        `allowedResourceOrigins entry ${JSON.stringify(raw)} is not an absolute http(s) origin (expected "https://host[:port]"); ` +
          'wildcards, paths, and bare hosts are refused so the policy cannot widen silently',
      )
    }
  }
  return problems
}

/**
 * Measure the UTF-8 byte length of a string without allocating a Buffer.
 *
 * @param {string} text - the string to measure.
 * @returns {number} its UTF-8 byte length.
 */
export function utf8Bytes(text) {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4
      index += 1
    } else bytes += 3
  }
  return bytes
}

/**
 * Validate one interaction event exactly as it arrives from the widget.
 *
 * @param {unknown} input - parsed postMessage data or HTTP body.
 * @param {{ maxEventBytes: number }} limits - active bridge limits.
 * @returns {{ ok: true, value: { uiId: string, name: string, payload: unknown } } | { ok: false, code: string, message: string }}
 *   the canonical event, or a stable failure code with a human-readable message.
 */
export function parseInteractionEvent(input, limits) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return fail('invalid', '事件必须是 JSON 对象')
  }
  const record = /** @type {Record<string, unknown>} */ (input)
  if (record.v !== EVENT_VERSION) {
    return fail('invalid', `不支持的事件版本 v=${JSON.stringify(record.v)}（期望 ${EVENT_VERSION}）`)
  }
  const uiId = record.uiId
  if (typeof uiId !== 'string' || uiId === '' || uiId.length > MAX_UI_ID) {
    return fail('invalid', 'uiId 必须是非空字符串且长度受限')
  }
  const name = record.name
  if (typeof name !== 'string' || !EVENT_NAME_PATTERN.test(name)) {
    return fail('invalid', '事件名必须匹配 /^[A-Za-z0-9_.:-]{1,64}$/')
  }
  const payload = record.payload === undefined ? null : record.payload
  const payloadCheck = inspectPayload(payload)
  if (!payloadCheck.ok) return payloadCheck

  let serialized
  try {
    serialized = JSON.stringify({ uiId, name, payload })
  } catch {
    return fail('invalid', 'payload 无法序列化为 JSON')
  }
  if (typeof serialized !== 'string') return fail('invalid', 'payload 无法序列化为 JSON')
  const bytes = utf8Bytes(serialized)
  const max = Number(limits?.maxEventBytes)
  if (!Number.isFinite(max) || max <= 0) return fail('invalid', '事件大小上限未配置')
  if (bytes > max) return fail('too-large', `交互事件 ${bytes} 字节超过上限 ${max} 字节`)

  return { ok: true, value: { uiId, name, payload } }
}

/**
 * Validate the payload as bounded, lossless JSON: no functions, symbols,
 * undefined holes, cyclic references, prototype keys, or over-deep nesting.
 *
 * @param {unknown} payload - candidate payload.
 * @returns {{ ok: true } | { ok: false, code: string, message: string }} the verdict.
 */
export function inspectPayload(payload) {
  const seen = new WeakSet()
  let keys = 0
  /** @type {{ value: unknown, depth: number }[]} */
  const stack = [{ value: payload, depth: 0 }]
  while (stack.length > 0) {
    const { value, depth: current } = stack.pop()
    if (value === null) continue
    const type = typeof value
    if (type === 'string' || type === 'boolean') continue
    if (type === 'number') {
      if (!Number.isFinite(value)) return fail('invalid', 'payload 含非有限数字')
      continue
    }
    if (type !== 'object') return fail('invalid', `payload 含不可传输的值（${type}）`)
    if (current >= MAX_PAYLOAD_DEPTH) return fail('too-large', `payload 嵌套超过 ${MAX_PAYLOAD_DEPTH} 层`)
    if (seen.has(value)) return fail('invalid', 'payload 存在循环引用')
    seen.add(value)
    if (Array.isArray(value)) {
      if (value.length > MAX_PAYLOAD_KEYS) return fail('too-large', `payload 数组过长（${value.length}）`)
      for (const item of value) stack.push({ value: item, depth: current + 1 })
      continue
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      return fail('invalid', 'payload 含非纯对象')
    }
    for (const [key, item] of Object.entries(value)) {
      keys += 1
      if (keys > MAX_PAYLOAD_KEYS) return fail('too-large', `payload 键数量超过 ${MAX_PAYLOAD_KEYS}`)
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return fail('invalid', `payload 含保留键 ${JSON.stringify(key)}`)
      }
      if (item === undefined) return fail('invalid', `payload.${key} 为 undefined，不是无损 JSON`)
      stack.push({ value: item, depth: current + 1 })
    }
  }
  return { ok: true }
}

/**
 * Build the model-facing text blocks for one call, used as both the model
 * result and the generic card fallback when the client view is unavailable.
 *
 * @param {string} text - summary text.
 * @returns {{ type: 'text', text: string }[]} one content block.
 */
export function textBlock(text) {
  return [{ type: 'text', text }]
}

/**
 * @param {string} code - stable failure code.
 * @param {string} message - human-readable diagnostic.
 * @returns {{ ok: false, code: string, message: string }} the failure.
 */
function fail(code, message) {
  return { ok: false, code, message }
}
