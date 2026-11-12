/**
 * Plugin configuration schema and live accessors for dsh-ui-html.
 *
 * The schema IS the settings form: the Host serves one configuration page per
 * Loader entry from the entry's own `Config`. Fields the user may edit while
 * the plugin is live are marked `.volatile()`, which makes the Loader hand them
 * over as *stable references it commits in place*; a live value must therefore
 * be read at use time rather than captured when the plugin activates. Every
 * field is read through {@link createSettings}.
 *
 * `Config` must be a native schemastery schema: dsh-app-boot probes
 * `Config[Symbol.for('schemastery')] === true` and treats a plain function as
 * unsupported, which would silently swallow the activation error and never run
 * `apply`.
 *
 * @module dsh-ui-html/config
 */

import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_INTERACTION_TIMEOUT_MS,
  DEFAULT_MAX_EVENT_BYTES,
  DEFAULT_MAX_HTML_BYTES,
} from './protocol.js'

export const Config = z.object({
  /** Master switch: registers the tool, the bridge routes, and the prompt section. */
  enabled: z.boolean().default(true).volatile(),
  /** Announce the plugin to every agent's system prompt. */
  announceToAgent: z.boolean().default(true).volatile(),
  /** Largest accepted `html` argument, in UTF-8 bytes. */
  maxHtmlBytes: z.natural().default(DEFAULT_MAX_HTML_BYTES).volatile(),
  /** Largest accepted serialized interaction payload, in bytes. */
  maxEventBytes: z.natural().default(DEFAULT_MAX_EVENT_BYTES).volatile(),
  /** Interaction wait in milliseconds; 0 waits until the turn is cancelled. */
  interactionTimeoutMs: z.natural().default(DEFAULT_INTERACTION_TIMEOUT_MS).volatile(),
  /** Absolute `http(s)://host[:port]` origins the widget may load resources from. */
  allowedResourceOrigins: z.array(z.string()).default([]).volatile(),
  /** Exact proxy peer CIDRs admitted to forward browser requests (empty = loopback only). */
  trustedProxyCidrs: z.array(z.string()).default([]).volatile(),
  /** When false, no interaction is returned and an interactive call degrades loudly. */
  eventBridgeEnabled: z.boolean().default(true).volatile(),
})

/**
 * Read one config field's current value.
 *
 * A `Volatile` reference exposes `get()`; a plain value (a programmatic mount,
 * or a field the schema does not mark volatile) is returned as it stands.
 *
 * @param {unknown} field - the config field as the Loader handed it.
 * @param {unknown} fallback - value to use when the field is absent.
 * @returns {unknown} the effective field value.
 */
export function readConfigField(field, fallback) {
  if (field === undefined || field === null) return fallback
  if (typeof field === 'object' && typeof (/** @type {any} */ (field).get) === 'function') {
    return /** @type {any} */ (field).get()
  }
  return field
}

/**
 * Build the live settings face passed to the bridge and the tool.
 *
 * @param {object | undefined} cfg - the validated row config.
 * @returns {{enabled: () => boolean, announceToAgent: () => boolean, maxHtmlBytes: () => number, maxEventBytes: () => number, interactionTimeoutMs: () => number, allowedResourceOrigins: () => string[], eventBridgeEnabled: () => boolean, snapshot: () => object}}
 *   accessors that always read the current value.
 */
export function createSettings(cfg) {
  const read = (key, fallback) => readConfigField(cfg?.[key], fallback)
  const settings = {
    enabled: () => read('enabled', true) === true,
    announceToAgent: () => read('announceToAgent', true) === true,
    maxHtmlBytes: () => Number(read('maxHtmlBytes', DEFAULT_MAX_HTML_BYTES)),
    maxEventBytes: () => Number(read('maxEventBytes', DEFAULT_MAX_EVENT_BYTES)),
    interactionTimeoutMs: () => Number(read('interactionTimeoutMs', DEFAULT_INTERACTION_TIMEOUT_MS)),
    allowedResourceOrigins: () => {
      const value = read('allowedResourceOrigins', [])
      return Array.isArray(value) ? value.map((entry) => String(entry)) : []
    },
    eventBridgeEnabled: () => read('eventBridgeEnabled', true) === true,
    trustedProxyCidrs: () => {
      const value = read('trustedProxyCidrs', [])
      return Array.isArray(value) ? value.map((entry) => String(entry)) : []
    },
    snapshot: () => ({
      enabled: settings.enabled(),
      announceToAgent: settings.announceToAgent(),
      maxHtmlBytes: settings.maxHtmlBytes(),
      maxEventBytes: settings.maxEventBytes(),
      interactionTimeoutMs: settings.interactionTimeoutMs(),
      allowedResourceOrigins: settings.allowedResourceOrigins(),
      eventBridgeEnabled: settings.eventBridgeEnabled(),
      trustedProxyCidrs: settings.trustedProxyCidrs(),
    }),
  }
  return settings
}

export default Config
