/**
 * Host-side interaction bridge for dsh-ui-html.
 *
 * It owns three things:
 *
 * 1. The in-memory table of *pending* interactive calls, keyed by tool call id
 *    (the UI instance id). A pending entry resolves when the browser half posts
 *    a validated interaction, when its timeout elapses, or when the turn is
 *    cancelled.
 * 2. The table of *registered* non-blocking interfaces: a displayed interface
 *    whose later submission is delivered as a fresh user message on the owning
 *    session (`agent.followup`), so the agent continues in the conversation
 *    body instead of holding the tool call open.
 * 3. The two exact HTTP routes the browser half talks to: a read-only status
 *    description and the interaction sink.
 *
 * Everything the browser sends is untrusted: the routes demand a loopback peer,
 * a same-origin caller, a package-private request header (which forces a CORS
 * preflight on any cross-origin attempt), a JSON body under a fixed cap, and a
 * strictly validated envelope. Nothing here executes or interprets widget
 * script.
 *
 * @module dsh-ui-html/bridge
 */

import { randomUUID } from 'node:crypto'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  BRIDGE_PATH,
  EVENT_VERSION,
  MAX_UI_ID,
  STATUS_PATH,
  TOOL_NAME,
  buildCsp,
  parseInteractionEvent,
  utf8Bytes,
  isTrustedPeer,
  isSameOriginHeaders,
  isLoopbackAddress,
} from './protocol.js'

/** How long a settled ui id keeps answering `already-settled` instead of `unknown-ui`. */
const SETTLED_MEMORY_MS = 60_000

/** How many settled ui ids are remembered at once. */
const SETTLED_MEMORY_MAX = 64

/** How many live non-blocking interfaces are kept for a later submission. */
const REGISTERED_MAX = 128

/** Body-read cap slack over `maxEventBytes` for the JSON envelope itself. */
const BODY_SLACK_BYTES = 2048

/**
 * @typedef {object} BridgeOptions
 * @property {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @property {object} settings - live settings accessors from `createSettings`.
 * @property {{warn?: (msg: string) => void, info?: (msg: string) => void}} [logger] - host logger.
 */

/**
 * Create the interaction bridge and register its routes.
 *
 * @param {BridgeOptions} options - plugin context, live settings, and logger.
 * @returns {{ waitForEvent: Function, settle: Function, describe: Function, stats: Function, dispose: Function }}
 *   the bridge face used by the tool definition.
 */
export function createBridge({ ctx, settings, logger }) {
  /** @type {Map<string, {resolve: (result: object) => void, finished: boolean, sessionId?: string, createdAt: number, timer: ReturnType<typeof setTimeout> | undefined, abortListener: (() => void) | undefined}>} */
  const pending = new Map()
  /**
   * Live non-blocking interfaces awaiting a later submission, keyed by ui id.
   * Their interaction becomes a fresh user message on the owning session, so
   * the agent opens a new turn in the conversation body.
   *
   * @type {Map<string, {sessionId: string | undefined, title: string, hint: string, createdAt: number}>}
   */
  const registered = new Map()
  /** @type {Map<string, number>} */
  const settledIds = new Map()
  const counters = { accepted: 0, injected: 0, rejected: 0, stale: 0, unknown: 0 }

  /**
   * Remember that one ui id has settled, so a late duplicate gets a precise
   * diagnostic instead of looking like a forged id.
   *
   * @param {string} uiId - the settled UI instance id.
   */
  function rememberSettled(uiId) {
    settledIds.set(uiId, Date.now())
    while (settledIds.size > SETTLED_MEMORY_MAX) {
      const oldest = settledIds.keys().next()
      if (oldest.done === true) break
      settledIds.delete(oldest.value)
    }
  }

  /**
   * Wait for one interaction on a UI instance.
   *
   * @param {object} options - wait parameters.
   * @param {string} options.uiId - the UI instance id (the tool call id).
   * @param {string | undefined} options.sessionId - owning session, for diagnostics.
   * @param {AbortSignal} options.signal - the calling turn's signal.
   * @returns {Promise<{status: 'interaction'|'timeout'|'cancelled', eventName?: string, payload?: unknown}>}
   *   the settled interaction outcome.
   */
  function waitForEvent({ uiId, sessionId, signal }) {
    if (pending.has(uiId)) {
      return Promise.reject(new Error(`UI 实例 ${uiId} 已在等待交互`))
    }
    const timeoutMs = Number(settings.interactionTimeoutMs()) || 0
    /** @type {(result: object) => void} */
    let resolveOuter
    const promise = new Promise((resolve) => {
      resolveOuter = resolve
    })

    /** @type {any} */
    const entry = {
      finished: false,
      sessionId,
      createdAt: Date.now(),
      timer: undefined,
      abortListener: undefined,
      settle(result) {
        if (entry.finished) return false
        entry.finished = true
        rememberSettled(uiId)
        resolveOuter(result)
        return true
      },
    }

    if (signal.aborted) {
      rememberSettled(uiId)
      return Promise.resolve({ status: 'cancelled' })
    }
    const onAbort = () => {
      entry.settle({ status: 'cancelled' })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    entry.abortListener = onAbort

    if (timeoutMs > 0) {
      entry.timer = setTimeout(() => {
        entry.settle({ status: 'timeout' })
      }, timeoutMs)
      if (typeof entry.timer.unref === 'function') entry.timer.unref()
    }

    pending.set(uiId, entry)

    return promise.finally(() => {
      const current = pending.get(uiId)
      if (current === entry) pending.delete(uiId)
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      if (entry.abortListener !== undefined) signal.removeEventListener('abort', entry.abortListener)
    })
  }

  /**
   * Remember one live non-blocking interface, so a later submission can be
   * delivered as a user message on its owning session.
   *
   * @param {object} options - registration facts.
   * @param {string} options.uiId - the UI instance id (the tool call id).
   * @param {string | undefined} options.sessionId - owning session.
   * @param {string} [options.title] - interface title, echoed back to the model.
   * @param {string} [options.hint] - interaction hint, echoed back to the model.
   * @returns {void}
   */
  function registerInteractive({ uiId, sessionId, title = '', hint = '' }) {
    registered.delete(uiId)
    registered.set(uiId, { sessionId, title, hint, createdAt: Date.now() })
    while (registered.size > REGISTERED_MAX) {
      const oldest = registered.keys().next()
      if (oldest.done === true) break
      registered.delete(oldest.value)
    }
  }

  /**
   * Resolve the live agent that owns a session.
   *
   * @param {string | undefined} sessionId - owning session id.
   * @returns {object | undefined} the live agent, or undefined when absent.
   */
  function liveAgent(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    if (agents === undefined || agents === null || typeof agents.get !== 'function') return undefined
    return agents.get(sessionId)
  }

  /**
   * Render one interaction as the model-facing text of a user message.
   *
   * @param {{title: string, hint: string}} entry - registration facts.
   * @param {{name: string, payload: unknown}} event - the validated interaction.
   * @returns {string} the message text.
   */
  function formatInteractionText(entry, event) {
    const lines = [`[交互式 HTML 界面回传] ${entry.title === '' ? '交互界面' : entry.title}`]
    if (entry.hint !== '') lines.push(`界面提示：${entry.hint}`)
    lines.push(`事件名：${event.name}`)
    lines.push(`交互内容：${safeStringify(event.payload)}`)
    lines.push('（这是用户在界面中提交的结果，请据此继续。）')
    return lines.join('\n')
  }

  /**
   * Deliver one interaction as a new user message, so the agent opens a fresh
   * turn in the conversation body (the official UI-plugin pattern:
   * `agent.followup(createUserMessage(...))`).
   *
   * @param {{sessionId: string | undefined, title: string, hint: string}} entry - registration facts.
   * @param {{name: string, payload: unknown}} event - the validated interaction.
   * @returns {boolean} whether the message was handed to a live agent.
   */
  function injectInteraction(entry, event) {
    const agent = liveAgent(entry.sessionId)
    if (agent === undefined || typeof agent.followup !== 'function') return false
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: formatInteractionText(entry, event) }],
        source: { kind: 'user', dshUiReceipt: issueReceipt(entry, event) },
      }),
    )
    return true
  }

  /**
   * 一次性服务端回执：仅记录已通过桥校验的界面事件，绑定会话/批次/事件名。
   * runtime 只以该注册表判定 UI 授权，不信任消息文本或模型自带标记。
   */
  function issueReceipt(entry, event) {
    const registry = (globalThis[Symbol.for('dsh.ui-html.receipts')] ??= new Map())
    const token = randomUUID()
    registry.set(token, {
      sessionId: entry.sessionId,
      digest: event.payload?.preview_digest ?? null,
      eventName: event.name,
      createdAt: Date.now(),
      consumed: false,
    })
    while (registry.size > 200) {
      const oldest = registry.keys().next().value
      registry.delete(oldest)
    }
    return token
  }

  /**
   * Deliver one already-validated interaction event: settle a blocking wait, or
   * inject a registered non-blocking submission as a user message.
   *
   * @param {{uiId: string, name: string, payload: unknown}} event - canonical event.
   * @returns {{ok: true, code: string} | {ok: false, code: string, message: string}} the delivery verdict.
   */
  function settle(event) {
    const entry = pending.get(event.uiId)
    if (entry === undefined) {
      const live = registered.get(event.uiId)
      if (live !== undefined) {
        if (injectInteraction(live, event)) {
          registered.delete(event.uiId)
          rememberSettled(event.uiId)
          counters.injected += 1
          return { ok: true, code: 'injected' }
        }
        // Keep the registration: the session may become live again after the
        // user posts a normal message, and the interface stays queued.
        return {
          ok: false,
          code: 'no-agent',
          message: '该界面所属会话当前不在运行，交互暂未送达；请在该会话中发送一条消息后重试',
        }
      }
      const settledAt = settledIds.get(event.uiId)
      if (settledAt !== undefined && Date.now() - settledAt < SETTLED_MEMORY_MS) {
        counters.stale += 1
        return { ok: false, code: 'already-settled', message: '该界面已经提交过交互，重复事件被忽略' }
      }
      counters.unknown += 1
      return { ok: false, code: 'unknown-ui', message: '该界面已不在等待交互（可能已结束、页面已刷新或插件已重载）' }
    }
    if (entry.finished) {
      counters.stale += 1
      return { ok: false, code: 'already-settled', message: '该界面已经提交过交互，重复事件被忽略' }
    }
    entry.settle({ status: 'interaction', eventName: event.name, payload: event.payload })
    counters.accepted += 1
    return { ok: true, code: 'accepted' }
  }

  /**
   * Describe the bridge for the browser half: one read-only snapshot the client
   * uses to build the widget policy. The host reads its live settings on every
   * call, but the browser half caches this snapshot for the page lifetime — a
   * settings edit therefore needs a page refresh before it reaches the widget
   * policy, while host-side tool behaviour changes immediately.
   *
   * @returns {object} the description payload.
   */
  function describe() {
    return {
      ok: true,
      plugin: '@eaglezlee/dsh-ui-html',
      tool: TOOL_NAME,
      eventVersion: EVENT_VERSION,
      bridgeEnabled: settings.eventBridgeEnabled(),
      maxHtmlBytes: settings.maxHtmlBytes(),
      maxEventBytes: settings.maxEventBytes(),
      interactionTimeoutMs: settings.interactionTimeoutMs(),
      allowedResourceOrigins: settings.allowedResourceOrigins(),
      csp: buildCsp(settings.allowedResourceOrigins()),
      pending: pending.size,
      registered: registered.size,
    }
  }

  /**
   * @returns {object} a copy of the bridge counters.
   */
  function stats() {
    return { ...counters, pending: pending.size, registered: registered.size }
  }

  /**
   * Reject a request that does not come from the local GUI page.
   *
   * @param {import('node:http').IncomingMessage} req - the request.
   * @returns {string | undefined} a refusal code, or undefined when admitted.
   */
  function refuse(req) {
    const trusted = isTrustedProxyPeer(req)
    if (!isLoopbackAddress(req.socket?.remoteAddress) && !trusted) return 'not-loopback'
    if (!isSameOrigin(req, trusted)) return 'cross-origin'
    return undefined
  }

  /** 仅当 peer 精确匹配显式 trustedProxyCidrs 时才视为受信反代；默认空表示仅 loopback。 */
  function isTrustedProxyPeer(req) {
    const list = typeof settings?.trustedProxyCidrs === 'function' ? settings.trustedProxyCidrs() : []
    return isTrustedPeer(req.socket?.remoteAddress, list)
  }

  function isSameOrigin(req, trustedProxy = false) {
    return isSameOriginHeaders(req.headers, trustedProxy)
  }

  /**
   * Admit only a same-origin browser caller, or a non-browser loopback caller
   * that omits `Origin` entirely. A cross-origin page always sends `Origin`, so
   * matching it against `Host` closes the local-CSRF path.
   *
   * @param {import('node:http').IncomingMessage} req - the request.
   * @returns {boolean} whether the request is admitted.
   */
  function isSameOrigin(req, trustedProxy = false) {
    const forwardedHost = trustedProxy ? req.headers['x-forwarded-host'] : undefined
    const host = typeof forwardedHost === 'string' && forwardedHost !== '' ? forwardedHost : req.headers.host
    const origin = req.headers.origin
    if (typeof origin === 'string' && origin !== '') {
      if (typeof host !== 'string' || host === '') return false
      try {
        if (new URL(origin).host !== host) return false
      } catch {
        return false
      }
    }
    const site = req.headers['sec-fetch-site']
    if (typeof site === 'string' && site !== '' && site !== 'same-origin' && site !== 'none') return false
    return true
  }

  /**
   * Write one JSON response.
   *
   * @param {import('node:http').ServerResponse} res - response sink.
   * @param {number} status - HTTP status.
   * @param {unknown} body - JSON body.
   */
  function writeJson(res, status, body) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    })
    res.end(JSON.stringify(body))
  }

  /**
   * Read a request body with a hard byte cap.
   *
   * @param {import('node:http').IncomingMessage} req - request.
   * @param {number} maxBytes - cap.
   * @returns {Promise<{ok: true, text: string} | {ok: false, code: string, message: string}>} the body.
   */
  async function readCappedBody(req, maxBytes) {
    const chunks = []
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > maxBytes) {
        try {
          req.destroy()
        } catch {
          /* the socket may already be gone */
        }
        return { ok: false, code: 'too-large', message: `请求体超过 ${maxBytes} 字节上限` }
      }
      chunks.push(chunk)
    }
    return { ok: true, text: Buffer.concat(chunks).toString('utf8') }
  }

  /**
   * GET /plugins/dsh-ui-html/status — read-only bridge description.
   *
   * @param {import('node:http').IncomingMessage} req - request.
   * @param {import('node:http').ServerResponse} res - response.
   */
  function handleStatus(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      writeJson(res, 405, { ok: false, code: 'method', message: '仅支持 GET' })
      return
    }
    const refusal = refuse(req)
    if (refusal !== undefined) {
      counters.rejected += 1
      writeJson(res, 403, { ok: false, code: 'forbidden', message: refusal })
      return
    }
    writeJson(res, 200, describe())
  }

  /**
   * POST /plugins/dsh-ui-html/event — the interaction sink.
   *
   * @param {import('node:http').IncomingMessage} req - request.
   * @param {import('node:http').ServerResponse} res - response.
   */
  async function handleEvent(req, res) {
    if (req.method === 'OPTIONS') {
      // No CORS surface is offered: refuse the preflight so a cross-origin
      // caller can never turn its request into a simple one.
      writeJson(res, 403, { ok: false, code: 'forbidden', message: 'no-cors' })
      return
    }
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, code: 'method', message: '仅支持 POST' })
      return
    }
    const refusal = refuse(req)
    if (refusal !== undefined) {
      counters.rejected += 1
      writeJson(res, 403, { ok: false, code: 'forbidden', message: refusal })
      return
    }
    if (settings.eventBridgeEnabled() !== true) {
      writeJson(res, 503, { ok: false, code: 'bridge-disabled', message: '交互事件回传已被配置关闭' })
      return
    }
    // A package-private header makes a cross-origin attempt a preflighted
    // request, so it cannot reach this handler at all.
    if (req.headers['x-dsh-ui-html'] !== '1') {
      counters.rejected += 1
      writeJson(res, 403, { ok: false, code: 'forbidden', message: 'missing-package-header' })
      return
    }
    const contentType = req.headers['content-type'] ?? ''
    if (!String(contentType).toLowerCase().startsWith('application/json')) {
      counters.rejected += 1
      writeJson(res, 415, { ok: false, code: 'invalid', message: 'content-type 必须是 application/json' })
      return
    }

    const maxEventBytes = settings.maxEventBytes()
    const bodyLimit = Math.max(1024, maxEventBytes) + BODY_SLACK_BYTES
    const body = await readCappedBody(req, bodyLimit)
    if (!body.ok) {
      counters.rejected += 1
      writeJson(res, 413, body)
      return
    }

    let parsed
    try {
      parsed = JSON.parse(body.text)
    } catch {
      counters.rejected += 1
      writeJson(res, 400, { ok: false, code: 'invalid', message: '请求体不是合法 JSON' })
      return
    }

    const event = parseInteractionEvent(parsed, { maxEventBytes })
    if (!event.ok) {
      counters.rejected += 1
      writeJson(res, 400, event)
      return
    }

    const outcome = settle(event.value)
    if (outcome.ok) {
      writeJson(res, 200, { ok: true, code: outcome.code ?? 'accepted' })
      return
    }
    writeJson(res, outcome.code === 'already-settled' ? 409 : 404, outcome)
  }

  /** @type {(() => void)[]} */
  let routeDisposers = []
  let routesRegistered = false

  /**
   * Register or withdraw the two routes with the master switch. Called at
   * activation and again whenever the Loader commits a volatile edit.
   *
   * @param {boolean} on - whether the bridge should be reachable.
   */
  function setEnabled(on) {
    if (on === routesRegistered) return
    routesRegistered = on
    if (on) {
      routeDisposers = [
        ctx.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: handleStatus }),
        ctx.webServer.register({ kind: 'exact', path: BRIDGE_PATH, handler: handleEvent }),
      ]
      logger?.info?.(`[dsh-ui-html] 事件桥已注册：POST ${BRIDGE_PATH}，GET ${STATUS_PATH}`)
      return
    }
    for (const disposer of routeDisposers.splice(0)) {
      try {
        disposer()
      } catch (error) {
        logger?.warn?.(`[dsh-ui-html] 释放路由失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    for (const [uiId, entry] of pending) {
      entry.settle({ status: 'cancelled' })
      if (entry.timer !== undefined) clearTimeout(entry.timer)
      pending.delete(uiId)
    }
    registered.clear()
    logger?.info?.('[dsh-ui-html] 事件桥已注销')
  }

  /**
   * Release every pending wait and unregister the routes.
   */
  function dispose() {
    setEnabled(false)
  }

  return { waitForEvent, settle, registerInteractive, describe, stats, setEnabled, dispose }
}

/**
 * Serialize a value for a message without ever throwing.
 *
 * @param {unknown} value - value to serialize.
 * @returns {string} compact JSON, or a placeholder.
 */
function safeStringify(value) {
  try {
    const text = JSON.stringify(value)
    return typeof text === 'string' ? text : 'null'
  } catch {
    return '(无法序列化)'
  }
}

/**
 * Report whether a candidate `html` argument is inside the configured cap.
 *
 * @param {string} html - candidate document.
 * @param {number} maxHtmlBytes - cap in UTF-8 bytes.
 * @returns {{ok: true, bytes: number} | {ok: false, bytes: number, message: string}} the verdict.
 */
export function checkHtmlSize(html, maxHtmlBytes) {
  const bytes = utf8Bytes(html)
  const max = Number(maxHtmlBytes)
  if (!Number.isFinite(max) || max <= 0) return { ok: false, bytes, message: 'maxHtmlBytes 未配置' }
  if (bytes > max) return { ok: false, bytes, message: `HTML ${bytes} 字节超过上限 ${max} 字节` }
  return { ok: true, bytes }
}

export { MAX_UI_ID }
