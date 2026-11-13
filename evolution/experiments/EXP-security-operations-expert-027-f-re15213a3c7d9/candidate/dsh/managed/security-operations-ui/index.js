import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { connect as connectTcp } from 'node:net'
import { DELEGATE_ROLES } from './delegation.js'

export const name = 'dsh-security-operations-ui'
export const inject = ['storageDomain', 'sessionController', 'webServer']

const ROLES = Object.entries(DELEGATE_ROLES)
const ROLE_NAMES = new Map(ROLES)
const context = new AsyncLocalStorage()
const schema = { parse(value) {
  if (!value || typeof value !== 'object' || !ROLE_NAMES.has(value.role)
    || typeof value.callId !== 'string' || typeof value.parentSessionId !== 'string'
    || typeof value.startedAt !== 'number' || !['running', 'completed', 'failed', 'no_child'].includes(value.status)) {
    throw new Error('invalid overview call record')
  }
  return value
} }
const activitySchema = { parse(value) {
  if (!value || typeof value !== 'object' || typeof value.sessionId !== 'string'
    || typeof value.at !== 'number' || ![0, 1].includes(value.toolCalls)
    || ![0, 1].includes(value.skillLoads)) {
    throw new Error('invalid overview activity record')
  }
  return value
} }
const notificationSchema = { parse(value) {
  if (!value || typeof value !== 'object' || typeof value.eventKey !== 'string'
    || typeof value.topic !== 'string' || typeof value.type !== 'string'
    || !Array.isArray(value.userNames) || value.userNames.some(item => typeof item !== 'string')
    || typeof value.receivedAt !== 'number' || !value.payload || typeof value.payload !== 'object') {
    throw new Error('invalid security notification record')
  }
  return value
} }
const readSchema = { parse(value) {
  if (!value || typeof value !== 'object' || typeof value.userKey !== 'string'
    || typeof value.eventKey !== 'string' || typeof value.readAt !== 'number') {
    throw new Error('invalid security notification read record')
  }
  return value
} }

const TYPE_LABELS = {
  INCIDENT_ACTIVITY: '威胁活动更新',
  INCIDENT_STATE: '威胁状态变化',
  INCIDENT_TIMEOUT: '威胁事件超时',
  AI_INVESTIGATION_READY: '威胁研判完成',
  LM_INCIDENT: '横向移动事件',
  NODE_STATE: '节点状态变化',
  COLLECTION_ALERT: '采集告警',
  'discovery.task.changed': '发现任务变化',
}
const DEFAULT_NATS_URL = 'nats://172.16.138.223:14222'
const DEFAULT_SUBJECTS = ['notify.ws.incident']
const MAX_NOTIFICATION_BODY = 16 * 1024
const MAX_TEXT = 4000

function parseNatsUrl(value) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'nats:' || parsed.username || parsed.password || !['', '/'].includes(parsed.pathname) || parsed.search || parsed.hash) {
    throw new Error('NATS URL must be nats://host:port without credentials')
  }
  const port = Number(parsed.port || 4222)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('NATS port is invalid')
  return { host: parsed.hostname, port }
}

function readBody(req, limit = MAX_NOTIFICATION_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function stableEventKey(topic, payload) {
  return createHash('sha256').update(JSON.stringify({ topic, payload })).digest('hex')
}

function safeText(value, fallback = '', limit = MAX_TEXT) {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function safeLink(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined
  } catch { return undefined }
}

function safeLinks(payload) {
  const values = [payload.link, ...(Array.isArray(payload.links) ? payload.links : [])]
  return [...new Set(values.map(value => typeof value === 'object' && value ? value.url ?? value.href : value)
    .map(safeLink).filter(Boolean))]
}

function normalizeNotification(row, isRead) {
  const payload = row.payload
  const incidentIds = Array.isArray(payload.incident_ids)
    ? payload.incident_ids.map(String).filter(Boolean)
    : []
  const incidentId = payload.incident_id === undefined ? undefined : String(payload.incident_id)
  const eventId = payload.event_id === undefined ? undefined : String(payload.event_id)
  const alertId = payload.alert_id === undefined ? undefined : String(payload.alert_id)
  const type = String(payload.type ?? row.type)
  const severity = safeText(payload.severity)
  const link = safeLink(payload.link)
  let title = TYPE_LABELS[type] ?? 'SOC 威胁通知'
  if (type === 'AI_INVESTIGATION_READY' && payload.title) title = safeText(payload.title, title)
  let summary = '收到一条 SOC 威胁通知。'
  if (type === 'INCIDENT_ACTIVITY') summary = `有 ${incidentIds.length || '新的'} 个威胁事件发生活动变化。`
  if (type === 'INCIDENT_STATE') summary = `${incidentId ?? '未知事件'}：${safeText(payload.from_status, '未知')} → ${safeText(payload.to_status, '未知')}`
  if (type === 'INCIDENT_TIMEOUT') summary = `${incidentId ?? '未知事件'} 已超时${severity ? `，严重性：${severity}` : ''}。`
  if (type === 'AI_INVESTIGATION_READY') summary = safeText(payload.summary, '威胁事件研判结果已就绪。')
  if (type === 'LM_INCIDENT') summary = `${incidentId ?? '未知事件'}：账号 ${safeText(payload.account, '未知')}，边数 ${payload.edge_cnt ?? '未知'}。`
  if (type === 'NODE_STATE') summary = `${incidentId ?? '未知事件'} 的节点 ${safeText(payload.node_id, '未知')} 状态：${safeText(payload.status, '未知')}。`
  if (type === 'COLLECTION_ALERT') summary = `采集绑定 ${safeText(payload.binding_id, '未知')} 的判定：${safeText(payload.verdict, '未知')}。`
  return {
    eventKey: row.eventKey, type, label: TYPE_LABELS[type] ?? 'SOC 威胁通知', receivedAt: row.receivedAt,
    eventId, alertId, incidentId, incidentIds, severity, title,
    summary, status: safeText(payload.to_status ?? payload.status),
    fromStatus: safeText(payload.from_status), toStatus: safeText(payload.to_status),
    confidence: payload.confidence === undefined ? undefined : String(payload.confidence),
    conclusion: safeText(payload.conclusion), investigation: safeText(payload.investigation),
    alertDetail: payload.alert_detail && typeof payload.alert_detail === 'object' ? payload.alert_detail : undefined,
    affectedAssetId: payload.alert_detail?.affected_asset_id === undefined ? undefined : String(payload.alert_detail.affected_asset_id),
    account: safeText(payload.account), edgeCount: payload.edge_cnt,
    hopCount: payload.hop_cnt, compromisedCount: payload.compromised_cnt,
    implant: payload.implant === undefined ? undefined : String(payload.implant),
    nodeId: safeText(payload.node_id), instanceId: safeText(payload.instance_id),
    bindingId: safeText(payload.binding_id), pluginId: safeText(payload.plugin_id),
    verdict: safeText(payload.verdict), recovered: payload.recovered,
    links: safeLinks(payload), link, isRead,
    refreshRequired: type === 'INCIDENT_ACTIVITY',
  }
}

function createNatsSubscriber({ url, subjects, onMessage, logger }) {
  let socket
  let stopped = false
  let buffer = Buffer.alloc(0)
  let reconnectTimer
  let reconnectDelay = 1000
  let announced = false
  let nextSid = 1

  const log = (message, error) => {
    try { logger.error(message, error) } catch { /* logging must not stop reconnect */ }
  }
  const schedule = () => {
    if (stopped || reconnectTimer) return
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      connectNow()
    }, reconnectDelay)
    reconnectTimer.unref?.()
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
  }
  const send = value => {
    if (socket?.writable) socket.write(value)
  }
  const handleLine = line => {
    if (line.startsWith('INFO ')) {
      try { JSON.parse(line.slice(5)) } catch { log('security notifications NATS INFO invalid'); return }
      if (announced) return
      announced = true
      const connect = JSON.stringify({ verbose: false, pedantic: false, lang: 'node', version: '0.1.0', protocol: 1, echo: false, headers: true })
      send(`CONNECT ${connect}\r\n`)
      for (const subject of subjects) send(`SUB ${subject} ${nextSid++}\r\n`)
      send('PING\r\n')
      reconnectDelay = 1000
      return
    }
    if (line === 'PING') { send('PONG\r\n'); return }
    if (line === 'PONG' || line === '+OK') return
    if (line.startsWith('-ERR')) log(`security notifications NATS error: ${line}`)
  }
  const pump = () => {
    while (buffer.length) {
      const lineEnd = buffer.indexOf('\r\n')
      if (lineEnd < 0) return
      const line = buffer.subarray(0, lineEnd).toString('utf8')
      if (line.startsWith('MSG ')) {
        const parts = line.split(/\s+/)
        const length = Number(parts.at(-1))
        const payloadStart = lineEnd + 2
        if (!Number.isSafeInteger(length) || length < 0 || buffer.length < payloadStart + length + 2) return
        const payload = buffer.subarray(payloadStart, payloadStart + length).toString('utf8')
        buffer = buffer.subarray(payloadStart + length + 2)
        try { void Promise.resolve(onMessage(payload)).catch(error => log('security notification handling failed', error)) }
        catch (error) { log('security notification handling failed', error) }
        continue
      }
      buffer = buffer.subarray(lineEnd + 2)
      handleLine(line)
    }
  }
  function connectNow() {
    if (stopped) return
    let target
    try { target = parseNatsUrl(url) } catch (error) { log('security notifications NATS URL invalid', error); return }
    buffer = Buffer.alloc(0)
    announced = false
    const current = connectTcp(target.port, target.host)
    socket = current
    current.setNoDelay(true)
    current.on('data', chunk => { buffer = Buffer.concat([buffer, chunk]); pump() })
    current.on('error', error => log('security notifications NATS connection error', error))
    current.on('close', () => {
      if (socket === current) socket = undefined
      if (!stopped) schedule()
    })
  }
  connectNow()
  return () => {
    stopped = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = undefined
    socket?.end()
    socket?.destroy()
    socket = undefined
  }
}

export async function apply(ctx, config = {}) {
  const hours = 24
  const natsConfig = config?.nats ?? {}
  const natsUrl = typeof natsConfig.url === 'string' ? natsConfig.url : DEFAULT_NATS_URL
  const subjects = Array.isArray(natsConfig.subjects) && natsConfig.subjects.length
    ? natsConfig.subjects.filter(value => typeof value === 'string' && value.trim()) : DEFAULT_SUBJECTS
  const anonymousUserName = typeof config?.anonymousUserName === 'string' && config.anonymousUserName.trim()
    ? config.anonymousUserName.trim() : 'admin'
  let businessRuntime
  try { businessRuntime = ctx.get('businessRuntime') } catch { businessRuntime = undefined }
  const registerApiRoute = options => businessRuntime?.registerApiRoute
    ? businessRuntime.registerApiRoute(options.path, options.handler)
    : ctx.webServer.register(options)
  await ctx.effect(async () => {
    const overviewDomain = await ctx.storageDomain.open({
      name: 'security_operations_overview', version: 1,
      tables: { calls: { valueSchema: schema }, activities: { valueSchema: activitySchema } },
    })
    const notificationDomain = await ctx.storageDomain.open({
      name: 'security_operations_notifications', version: 1,
      tables: { events: { valueSchema: notificationSchema }, reads: { valueSchema: readSchema } },
    })
    const calls = overviewDomain.table('calls')
    const activities = overviewDomain.table('activities')
    const events = notificationDomain.table('events')
    const reads = notificationDomain.table('reads')
    let queue = Promise.resolve()
    let storageFailed = false
    let notificationStorageFailed = false
    let lastPruned = 0
    const disposers = []
    const runIds = new Map()
    const enqueue = update => {
      queue = queue.then(update).catch(error => {
        storageFailed = true
        ctx.logger.error('security-operations-ui overview storage failed', error)
      })
      return queue
    }
    const enqueueNotification = update => {
      queue = queue.then(update).catch(error => {
        notificationStorageFailed = true
        ctx.logger.error('security-operations-ui notification storage failed', error)
      })
      return queue
    }
    const patch = (key, fields) => enqueue(async () => {
      const old = calls.get(key)
      if (old) await calls.put(key, { ...old, ...fields })
    })
    const recordActivity = (key, value) => enqueue(async () => {
      await activities.put(key, value)
      if (value.at - lastPruned < 3_600_000) return
      lastPruned = value.at
      for (const [oldKey, row] of activities.entries()) {
        if (row.at < value.at - hours * 3_600_000) await activities.delete(oldKey)
      }
    })
    const pruneNotifications = async now => {
      for (const [index, [key, row]] of [...events.entries()].sort((a, b) => b[1].receivedAt - a[1].receivedAt).entries()) {
        if (row.receivedAt < now - 7 * 86_400_000 || index >= 200) await events.delete(key)
      }
      const live = new Set([...events.entries()].map(([key]) => key))
      for (const [key, row] of reads.entries()) if (!live.has(row.eventKey)) await reads.delete(key)
    }
    const identityFor = () => {
      try {
        const runtime = ctx.get('businessRuntime')
        const identity = runtime?.currentIdentity?.() ?? runtime?.currentContext?.()?.subject
        if (identity?.id && !identity.shared && identity.identitySource !== 'gateway-shared') return String(identity.id)
      } catch { /* anonymous business instances do not expose a request identity */ }
      return anonymousUserName
    }
    const visibleRows = userKey => {
      if (!userKey) return []
      const readKeys = new Set([...reads.entries()].filter(([, row]) => row.userKey === userKey).map(([, row]) => row.eventKey))
      return [...events.entries()].map(([, row]) => row)
        .filter(row => row.userNames.includes(userKey))
        .sort((a, b) => b.receivedAt - a.receivedAt)
        .map(row => normalizeNotification(row, readKeys.has(row.eventKey)))
    }
    const sendJson = (res, status, value) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
      res.end(JSON.stringify(value))
    }
    const notificationSnapshot = userKey => {
      const items = visibleRows(userKey)
      return { items, unreadCount: items.filter(item => !item.isRead).length }
    }
    const receiveNotification = async message => {
      if (typeof message !== 'string' || Buffer.byteLength(message, 'utf8') > 1_048_576) return
      let payload
      try { payload = JSON.parse(message) } catch (error) { ctx.logger.error('security notification JSON invalid', error); return }
      if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string' || !Array.isArray(payload.user_names)
        || payload.user_names.some(value => typeof value !== 'string' || !value.trim())) return
      const userNames = [...new Set(payload.user_names.map(String))]
      const topic = 'notify.ws.incident'
      const eventKey = stableEventKey(topic, payload)
      await enqueueNotification(async () => {
        if (events.get(eventKey)) return
        await events.put(eventKey, { eventKey, topic, type: payload.type, userNames,
          receivedAt: Date.now(), payload })
        await pruneNotifications(Date.now())
      })
    }
    try {
      disposers.push(ctx.on('tools/execute', async (exec, next) => {
        if (!ROLE_NAMES.has(exec.name)) return next()
        const key = `${exec.agent?.session?.id ?? 'unknown'}:${exec.callId}`
        await enqueue(() => calls.put(key, {
          role: exec.name, callId: String(exec.callId),
          parentSessionId: String(exec.agent?.session?.id ?? 'unknown'),
          startedAt: Date.now(), status: 'running',
        }))
        return context.run(key, next)
      }))
      disposers.push(ctx.on('subagent/start', info => {
        const key = context.getStore()
        if (!key) return
        runIds.set(String(info.runId), key)
        void patch(key, { childSessionId: String(info.id), runId: String(info.runId) })
      }))
      disposers.push(ctx.on('subagent/end', info => {
        const key = runIds.get(String(info.runId))
        if (!key) return
        runIds.delete(String(info.runId))
        void enqueue(async () => {
          const old = calls.get(key)
          if (old) await calls.put(key, { ...old, stopReason: String(info.stopReason),
            ...(old.endedAt ? { status: old.status === 'failed' || info.stopReason !== 'completed' ? 'failed' : 'completed' } : {}) })
        })
      }))
      disposers.push(ctx.on('tools/result', (exec, result) => {
        const sessionId = exec.agent?.session?.id
        if (sessionId) void recordActivity(`${sessionId}:tool:${exec.callId}`, {
          sessionId: String(sessionId), at: Date.now(), toolCalls: 1,
          skillLoads: exec.name === 'skill' && !result.isError ? 1 : 0,
        })
        if (!ROLE_NAMES.has(exec.name)) return
        const key = `${exec.agent?.session?.id ?? 'unknown'}:${exec.callId}`
        void enqueue(async () => {
          const old = calls.get(key)
          const row = old ?? {
            role: exec.name, callId: String(exec.callId),
            parentSessionId: String(exec.agent?.session?.id ?? 'unknown'), startedAt: Date.now(),
          }
          await calls.put(key, {
            ...row, endedAt: Date.now(),
            status: row.childSessionId
              ? result.isError || row.stopReason && row.stopReason !== 'completed' ? 'failed'
                : row.stopReason === 'completed' ? 'completed' : 'running'
              : 'no_child',
          })
        })
      }))
      disposers.push(ctx.on('session/event', (session, event) => {
        if (event.type !== 'user/message' || event.data.source.kind !== 'skill-invocation') return
        void recordActivity(`${session.id}:skill:${event.seq}`, {
          sessionId: String(session.id), at: event.time, toolCalls: 0, skillLoads: 1,
        })
      }))
      disposers.push(registerApiRoute({ kind: 'exact', path: '/api/security-operations/overview', handler: async (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }); res.end(); return }
          try {
            await queue
            if (storageFailed) throw new Error('overview storage unavailable')
            const { items } = await ctx.sessionController.list({}, new AbortController().signal)
            const since = Date.now() - hours * 3_600_000
            const allCalls = [...calls.entries()].map(([, row]) => row)
            const recent = allCalls.filter(row => row.startedAt >= since)
            const sessions = new Map(items.map(item => [String(item.sessionId), item]))
            const parent = items.filter(item => !item.parentSessionId && !item.blank)
            const activeParent = parent.filter(item => item.running)
            const activity = [...activities.entries()].map(([, row]) => row).filter(row => row.at >= since)
            const counts = ids => activity.reduce((sum, row) => {
              if (ids.has(row.sessionId)) {
                sum.toolCalls += row.toolCalls
                sum.skillLoads += row.skillLoads
              }
              return sum
            }, { toolCalls: 0, skillLoads: 0 })
            const roles = ROLES.map(([id, title]) => {
              const rows = recent.filter(row => row.role === id).sort((a, b) => b.startedAt - a.startedAt)
              const children = new Set(allCalls.filter(row => row.role === id && row.childSessionId).map(row => row.childSessionId))
              const active = rows.filter(row => row.status === 'running' && sessions.get(row.childSessionId)?.running).length
              const unknown = rows.filter(row => row.status === 'running' && !sessions.get(row.childSessionId)?.running).length
              return {
                id, title, state: active ? 'running' : unknown ? 'unknown' : 'idle',
                ...counts(children),
                active, completed: rows.filter(row => row.status === 'completed').length,
                failed: rows.filter(row => row.status === 'failed').length,
                noChild: rows.filter(row => row.status === 'no_child').length,
                unknown, recent: rows.slice(0, 5),
              }
            })
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({
              windowHours: hours, asOf: Date.now(),
              parent: { state: activeParent.length ? 'running' : 'idle', active: activeParent.length,
                sessions: parent.length, recentSessionId: parent[0]?.sessionId ?? null,
                ...counts(new Set(parent.map(item => String(item.sessionId)))) },
              roles,
            }))
          } catch (error) {
            ctx.logger.error('security-operations-ui overview unavailable', error)
            res.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ error: 'overview unavailable' }))
          }
        },
      }))
      disposers.push(registerApiRoute({ kind: 'exact', path: '/api/security-operations/notifications', handler: async (req, res) => {
        if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }); res.end(); return }
        try {
          await queue
          if (notificationStorageFailed) throw new Error('notification storage unavailable')
          sendJson(res, 200, notificationSnapshot(identityFor()))
        } catch (error) {
          ctx.logger.error('security-operations-ui notifications unavailable', error)
          sendJson(res, 503, { error: 'notifications unavailable', items: [], unreadCount: 0 })
        }
      }}))
      disposers.push(registerApiRoute({ kind: 'exact', path: '/api/security-operations/notifications/read', handler: async (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end(); return }
        try {
          const userKey = identityFor()
          const body = JSON.parse(await readBody(req))
          const eventKey = typeof body?.eventKey === 'string' ? body.eventKey : ''
          const row = eventKey ? events.get(eventKey) : undefined
          if (!eventKey || !row || !row.userNames.includes(userKey)) { sendJson(res, 404, { error: 'notification not found' }); return }
          await enqueueNotification(() => reads.put(`${userKey}:${eventKey}`, { userKey, eventKey, readAt: Date.now() }))
          await queue
          sendJson(res, 200, notificationSnapshot(userKey))
        } catch (error) {
          ctx.logger.error('security-operations-ui notification read failed', error)
          sendJson(res, 400, { error: 'notification read failed' })
        }
      }}))
      const stopNats = createNatsSubscriber({ url: natsUrl, subjects, onMessage: receiveNotification, logger: ctx.logger })
      disposers.push(() => stopNats())
      return async () => {
        for (const dispose of disposers.reverse()) await dispose()
        await queue
        await notificationDomain.close()
        await overviewDomain.close()
      }
    } catch (error) {
      await notificationDomain.close()
      await overviewDomain.close()
      throw error
    }
  })
}
