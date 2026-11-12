import assert from 'node:assert/strict'
import { apply } from './index.js'

const records = new Map()
const activities = new Map()
const notificationEvents = new Map()
const notificationReads = new Map()
const handlers = new Map()
const routes = new Map()
let route
let notificationRoute
let notificationReadRoute
let dispose
let listFails = false
const sessions = [
  { sessionId: 'parent-1', running: true, blank: false, updatedAt: 10 },
  { sessionId: 'child-1', parentSessionId: 'parent-1', running: false, blank: false, updatedAt: 9 },
  { sessionId: 'child-2', parentSessionId: 'parent-1', running: false, blank: false, updatedAt: 8 },
]
const ctx = {
  logger: { error() {} },
  effect: async callback => { dispose = await callback() },
  on: (name, handler) => { handlers.set(name, handler); return () => handlers.delete(name) },
  storageDomain: { open: async spec => {
    assert(['security_operations_overview', 'security_operations_notifications'].includes(spec.name))
    const notification = spec.name === 'security_operations_notifications'
    return { table: name => ({
      get: key => (notification ? name === 'events' ? notificationEvents : notificationReads : name === 'calls' ? records : activities).get(key),
      put: async (key, value) => {
        const target = notification ? name === 'events' ? notificationEvents : notificationReads : name === 'calls' ? records : activities
        target.set(key, spec.tables[name].valueSchema.parse(value))
      },
      delete: async key => { (notification ? name === 'events' ? notificationEvents : notificationReads : name === 'calls' ? records : activities).delete(key) },
      entries: () => (notification ? name === 'events' ? notificationEvents : notificationReads : name === 'calls' ? records : activities).entries(),
    }), close: async () => {} }
  } },
  webServer: { register: options => {
    routes.set(options.path, options.handler)
    if (options.path.endsWith('/notifications')) notificationRoute = options.handler
    if (options.path.endsWith('/notifications/read')) notificationReadRoute = options.handler
    return () => routes.delete(options.path)
  } },
  sessionController: { list: async () => {
    if (listFails) throw new Error('list unavailable')
    return { items: sessions }
  } },
}

await apply(ctx, { anonymousUserName: 'admin', nats: { url: 'not-a-nats-url' } })
const invoke = (path, method = 'GET', body = '') => new Promise(resolve => {
  const handler = routes.get(path)
  let status = 200
  let output = ''
  const req = { method, on(name, callback) { if (name === 'data' && body) callback(Buffer.from(body)); if (name === 'end') queueMicrotask(callback) } }
  const res = { writeHead(code) { status = code }, end(value = '') { output += String(value); resolve({ status, body: output ? JSON.parse(output) : undefined }) } }
  handler(req, res)
})
const read = async () => {
  const response = await invoke('/api/security-operations/overview')
  assert.equal(response.status, 200)
  return response.body
}
const readNotifications = async () => {
  const response = await invoke('/api/security-operations/notifications')
  assert.equal(response.status, 200)
  return response.body
}
let overview = await read()
assert.equal(overview.parent.active, 1)
assert.equal(overview.parent.sessions, 1)
assert.equal(overview.roles.length, 3)
assert(overview.roles.every(role => role.state === 'idle'))
assert.deepEqual([overview.parent.toolCalls, overview.parent.skillLoads], [0, 0])
assert(overview.roles.every(role => role.toolCalls === 0 && role.skillLoads === 0))
const notifications = await readNotifications()
assert.deepEqual(notifications.items, [])
assert.equal(notifications.unreadCount, 0)
assert.equal((await invoke('/api/security-operations/notifications/read', 'POST', JSON.stringify({ eventKey: 'missing' }))).status, 404)

const exec = (name, callId, sessionId = 'parent-1') => ({ name, callId, agent: { session: { id: sessionId } } })
activities.set('old', { sessionId: 'parent-1', at: Date.now() - 25 * 3_600_000, toolCalls: 1, skillLoads: 1 })
await handlers.get('tools/execute')(exec('delegate_threat_analysis', 'call-1'), async () => {
  handlers.get('subagent/start')({ runId: 'run-1', id: 'child-1' })
  handlers.get('subagent/end')({ runId: 'run-1', stopReason: 'completed' })
})
handlers.get('tools/result')(exec('delegate_threat_analysis', 'call-1'), { isError: false })
overview = await read()
assert.equal(overview.roles[0].completed, 1)
assert.equal(overview.roles[0].recent[0].childSessionId, 'child-1')
assert.deepEqual([overview.parent.toolCalls, overview.parent.skillLoads], [1, 0])
assert.equal(activities.has('old'), false)

handlers.get('tools/result')(exec('skill', 'skill-1', 'child-1'), { isError: false })
handlers.get('tools/result')(exec('skill', 'skill-2', 'child-1'), { isError: true })
handlers.get('tools/result')(exec('read_file', 'read-1', 'child-1'), { isError: false })
handlers.get('session/event')({ id: 'child-1' }, {
  type: 'user/message', seq: 12, time: Date.now(), data: { source: { kind: 'skill-invocation', name: 'incident-response' } },
})
handlers.get('session/event')({ id: 'child-1' }, {
  type: 'user/message', seq: 13, time: Date.now(), data: { source: { kind: 'user' } },
})
handlers.get('tools/result')(exec('skill', 'skill-main'), { isError: false })
handlers.get('tools/result')({ name: 'unowned', callId: 'no-agent' }, { isError: false })
overview = await read()
assert.deepEqual([overview.parent.toolCalls, overview.parent.skillLoads], [2, 1])
assert.deepEqual([overview.roles[0].toolCalls, overview.roles[0].skillLoads], [3, 2])
assert(overview.roles.slice(1).every(role => role.toolCalls === 0 && role.skillLoads === 0))

await handlers.get('tools/execute')(exec('delegate_fault_analysis', 'call-2'), async () => {
  handlers.get('subagent/start')({ runId: 'run-2', id: 'child-2' })
})
handlers.get('tools/result')(exec('delegate_fault_analysis', 'call-2'), { isError: false })
overview = await read()
assert.equal(overview.roles[1].unknown, 1)
handlers.get('subagent/end')({ runId: 'run-2', stopReason: 'completed' })
overview = await read()
assert.equal(overview.roles[1].completed, 1)
handlers.get('tools/result')(exec('read_file', 'read-2', 'child-2'), { isError: false })
overview = await read()
assert.deepEqual([overview.roles[0].toolCalls, overview.roles[1].toolCalls], [3, 1])

await handlers.get('tools/execute')(exec('delegate_threat_analysis', 'call-3'), async () => {
  handlers.get('subagent/start')({ runId: 'run-3', id: 'child-1' })
})
handlers.get('tools/result')(exec('delegate_threat_analysis', 'call-3'), { isError: true })
handlers.get('subagent/end')({ runId: 'run-3', stopReason: 'completed' })
overview = await read()
assert.equal(overview.roles[0].failed, 1)

handlers.get('tools/result')(exec('delegate_response_planning', 'blocked'), { isError: true })
overview = await read()
assert.equal(overview.roles[2].noChild, 1)
assert.equal(overview.roles[2].recent[0].childSessionId, undefined)
assert.equal(JSON.stringify([...records.values()]).includes('prompt'), false)
assert.equal(JSON.stringify([...activities.values()]).includes('incident-response'), false)

listFails = true
assert.equal((await invoke('/api/security-operations/overview')).status, 503)
listFails = false
await dispose()
assert.equal(handlers.size, 0)
console.log('运行概览采集、持久记录、事件顺序、失败状态通过')
