// 合成的合同与传输测试；不请求外部 MCP、不启动 DSH 或浏览器，不代表业务/视觉验收。
import test from 'node:test'
import assert from 'node:assert/strict'
import { payload, assetView, assetsView, topologyView, coverageView, incidentsView, trendView, severityView, reasoningView, judgementsView, reportView, safeData, safeError } from './data.js'
import { queryArgs } from './index.js'
import { timelineDefinition as projection, mergeTimelines } from './timeline.js'
import { parseConfig, createReader } from './mcp.js'

const wrap = data => ({ code: 200, data })
const asset = (assetId, extra = {}) => ({ assetId, hostname: `test-${assetId}`, assetType: 'server', ...extra })
const rejected = code => error => error.code === code

test('business failures and unknown structures are not empty successes', () => {
  assert.throws(() => payload({ code: 401, msg: 'synthetic denial' }), rejected('UPSTREAM_BUSINESS_ERROR'))
  assert.throws(() => assetsView(wrap({ unrelated: [] }), 1, 20), rejected('SOURCE_SHAPE_UNVERIFIED'))
  assert.throws(() => topologyView(wrap({ nodes: [] })), rejected('SOURCE_SHAPE_UNVERIFIED'))
})
test('stable exact IDs are mandatory', () => {
  assert.throws(() => assetView({ hostname: 'synthetic' }), rejected('SOURCE_SHAPE_UNVERIFIED'))
  assert.throws(() => assetView(asset(9007199254740992)), rejected('SOURCE_ID_PRECISION'))
  assert.equal(assetView(asset('9007199254740993')).id, '9007199254740993')
})
test('unknown online state is not offline; classification does not use names', () => {
  assert.equal(assetView(asset(11, { online: 0 })).online, 'unknown')
  assert.equal(assetView(asset(12, { online: 'offline' })).online, 'offline')
  assert.equal(assetView(asset(13, { assetType: 'unknown', hostname: 'AI LLM test' })).category, 'unclassified')
})
test('page counts do not become global totals', () => {
  const value = assetsView({ code: 200, total: 8, rows: [asset(11, { online: 'online' }), asset(12, { online: 'offline' })] }, 1, 2)
  assert.equal(value.total, 8); assert.equal(value.loaded, 2); assert.equal(value.complete, false)
  assert.deepEqual(value.counts, { online: 1, offline: 1, unknown: 0 }); assert.equal(value.countsScope, 'current-page')
})
test('missing total remains unknown; duplicate IDs are reported', () => {
  const value = assetsView(wrap([asset(11), asset(11)]), 1, 2)
  assert.equal(value.total, null); assert.equal(value.items.length, 1); assert.ok(value.issues.length)
})
test('real graph field shape is adapted without inferring online from health', () => {
  const value = topologyView(wrap({ nodes: [{ vid: 'asset:11', tag: 'asset', props: { asset_id: 11, asset_name: 'synthetic', asset_type: 'server' }, healthStatus: 'NORMAL' }], edges: [], truncated: false }))
  assert.equal(value.nodes[0].assetId, '11'); assert.equal(value.nodes[0].name, 'synthetic')
  assert.equal(value.nodes[0].online, 'unknown'); assert.equal(value.complete, true)
})
test('unknown and derived edges cannot become observed connectivity', () => {
  const nodes = [11, 12].map(id => ({ vid: `asset:${id}`, tag: 'asset', props: { asset_id: id } }))
  const value = topologyView(wrap({ nodes, edges: [{ edgeId: 'a', src: 'asset:11', dst: 'asset:12', type: 'hosted_on', props: {}, attr: {} }, { edgeId: 'b', src: 'asset:11', dst: 'asset:12', type: 'phys_link', attr: { derived_from: 'synthetic_registration' } }], truncated: false }))
  assert.equal(value.edges[0].evidence, 'unknown'); assert.equal(value.edges[1].evidence, 'inferred')
})
test('dangling graph endpoints are explicitly partial', () => {
  const value = topologyView(wrap({ nodes: [], edges: [{ src: 'a', dst: 'b' }], truncated: false }))
  assert.equal(value.complete, false); assert.ok(value.issues.length)
})
test('coverage percentage is not recomputed and unavailable discovery is not zero', () => {
  const value = coverageView(wrap({ registered: 8, collected: 3, coveragePct: 27, discovered: 0, discoveredAvailable: false }))
  assert.equal(value.percent, 27); assert.equal(value.discovered, null)
})
test('incidents preserve native identifiers, verdict and unqualified source times', () => {
  const value = incidentsView(wrap({ total: 1, rows: [{ incidentId: 'INC-TEST', incidentType: 'TEST', severity: 'HIGH', judgeStatus: 'DONE', judgeVerdict: 'FALSE_POSITIVE', createdTime: '2026-01-01 10:00:00', affectedAssetId: '11' }] }), 1, 20)
  assert.equal(value.items[0].id, 'INC-TEST'); assert.equal(value.items[0].verdict, 'FALSE_POSITIVE')
  assert.equal(value.items[0].createdAt, '2026-01-01 10:00:00')
})
test('daily trend has an explicit aggregation limitation', () => {
  const value = trendView(wrap([{ date: '2026-01-01', count: 3 }]))
  assert.equal(value.buckets[0].count, 3); assert.ok(value.issues.length)
  assert.equal(severityView(wrap({ CRITICAL: 0, HIGH: 2, MEDIUM: 1, LOW: 0 })).total, 3)
})
test('reasoning keeps exact evidence references and explicit host bindings', () => {
  const value = reasoningView(wrap({ incidentId: 'INC-TEST', steps: [{ ruleId: 'R1', threatType: 'synthetic claim', occurredAt: 1000, evidenceRefs: ['alert.test'], chain: { steps: [{ boundArgs: ['host:11', 'arbitrary:12'] }] } }] }), 'INC-TEST')
  assert.deepEqual(value.steps[0].assetIds, ['11']); assert.deepEqual(value.steps[0].evidenceRefs, ['alert.test'])
  assert.equal(value.steps.length, 1); assert.equal(value.replayAvailable, true)
  assert.throws(() => reasoningView(wrap({ incidentId: 'OTHER', steps: [] }), 'INC-TEST'))
})
test('missing history times do not synthesize replay timing', () => {
  const value = reasoningView(wrap({ incidentId: 'INC-TEST', steps: [{ threatType: 'synthetic claim' }] }), 'INC-TEST')
  assert.equal(value.steps[0].occurredAt, null); assert.equal(value.replayAvailable, false)
})
test('judgement report identity is retained', () => {
  const value = judgementsView(wrap([{ judgementId: 'JDG-TEST', incidentId: 'INC-TEST', verdict: 'FALSE_POSITIVE' }]))
  assert.equal(value.items[0].id, 'JDG-TEST'); assert.equal(value.items[0].verdict, 'FALSE_POSITIVE')
})
test('HTML report stays source text for a sandboxed viewer', () => {
  const html = '<!doctype html><html><body>synthetic report</body></html>'
  const value = reportView({ reportText: html })
  assert.equal(value.text, html); assert.equal(value.format, 'html'); assert.equal(value.redacted, false)
})
test('secret-like keys and error text are redacted', () => {
  const value = safeData({ token: 'unit-test-value', nested: { password: 'unit-test-value' } })
  assert.ok(!JSON.stringify(value).includes('unit-test-value'))
  const error = safeError(new Error('HTTP 401 apiKey="unit-test-value" Bearer unit-test-bearer'), 'synthetic', 'read')
  assert.ok(!error.message.includes('unit-test-value')); assert.ok(!error.message.includes('unit-test-bearer'))
})
test('truncation is visible rather than silent', () => {
  const value = safeData(Array.from({ length: 501 }, (_, index) => index))
  assert.equal(value.truncated, true); assert.equal(value.total, 501); assert.equal(value.items.length, 500)
})
test('widget queries reject unknown, duplicate and unbounded page arguments', () => {
  for (const query of ['url=https://example.test', 'pageNum=1&pageNum=2', 'pageSize=101']) assert.throws(() => queryArgs('assets', new URLSearchParams(query)), rejected('INVALID_QUERY'))
  assert.equal(queryArgs('assets', new URLSearchParams()).includeUnits, false)
})
test('time ranges require explicit zones and bounded duration', () => {
  assert.throws(() => queryArgs('incidents', new URLSearchParams({ createdFrom: '2026-01-01T00:00:00', createdTo: '2026-01-02T00:00:00Z' })), rejected('INVALID_QUERY'))
  assert.throws(() => queryArgs('incidents', new URLSearchParams({ createdFrom: '2026-01-01T00:00:00Z', createdTo: '2026-03-01T00:00:00Z' })), rejected('INVALID_QUERY'))
})
test('monitor group and transport configuration are bounded', async () => {
  assert.throws(() => parseConfig({ groupId: 'other' }))
  const controller = new AbortController(), read = createReader(parseConfig(), {}, controller.signal)
  await assert.rejects(read('assets', {}, controller.signal), rejected('CONNECTION_NOT_CONFIGURED'))
})
test('monitor queries use the managed group transport and retain connection failures', async (t) => {
  const { existsSync } = await import('node:fs')
  // 该用例走真实 MCP client 传输，仅实例容器内具备 /opt/dsh 的包；本机无该路径时跳过而不是判失败。
  if (!existsSync(process.env.DSH_MCP_CLIENT_ANCHOR || '/opt/dsh/packages/mcp/mcp-client')) return t.skip('本机缺少实例内 MCP client 包')
  const controller = new AbortController(), url = 'http://127.0.0.1:9/hep/mcp/groups/network-space-monitoring/v2'
  let calls = 0
  const read = createReader(parseConfig(), {
    groupUrl(id) { assert.equal(id, 'network-space-monitoring'); return url },
    groupFetch(id) {
      assert.equal(id, 'network-space-monitoring')
      return async (input, init) => {
        assert.equal(String(input), url)
        assert.equal(new Headers(init?.headers).has('authorization'), false)
        calls++
        return new Response('{"error":"synthetic denial"}', { status: 401, headers: { 'content-type': 'application/json' } })
      }
    },
  }, controller.signal)
  await assert.rejects(read('threats', {}, controller.signal), error => error.stage === 'connect' && error.statusCode === 401)
  assert.ok(calls > 0, '所有 MCP 握手请求应通过平台分组传输服务')
})
const event = (type, data, seq = 1) => ({ type, data, seq, time: seq * 1000 })
const call = (turn, step, callId = 'same') => event('tool/call', { turn, step, callId, name: 'list_soc_asset', arguments: '{"assetId":11}' })
test('tool results pair by turn, step and raw call ID', () => {
  let state = projection.init({ id: 'SESSION-TEST' })
  state = projection.apply(state, call(1, 1)); state = projection.apply(state, call(2, 1))
  state = projection.apply(state, event('tool/result', { turn: 1, step: 1, message: { toolCallId: 'same', isError: false } }, 3))
  assert.equal(state.rows[0].status, 'completed'); assert.equal(state.rows[1].status, 'running')
  assert.deepEqual(state.rows[1].assetIds, ['11'])
})
test('turn end does not fabricate successful tool completion', () => {
  let state = projection.apply(projection.init({ id: 'SESSION-TEST' }), call(1, 1))
  state = projection.apply(state, event('turn/end', { turn: 1 }))
  assert.equal(state.rows[0].status, 'unknown'); assert.equal(state.rows[0].semantic, 'unknown')
})
test('timeline limits disclose omission and never retain raw arguments', () => {
  let state = projection.init({ id: 'SESSION-TEST' })
  for (let index = 0; index < 66; index++) state = projection.apply(state, call(1, index, String(index)))
  assert.equal(state.rows.length, 64); assert.equal(state.omitted, 2)
  assert.ok(state.rows.every(row => !Object.hasOwn(row, 'arguments')))
})

test('tool results keep duration, summary and semantics', () => {
  let state = projection.apply(projection.init({ id: 'SESSION-TEST' }), call(1, 1, 'c1'))
  assert.equal(state.rows[0].semantic, 'scan')
  assert.deepEqual(state.rows[0].args, { assetId: 11 })
  state = projection.apply(state, event('tool/result', { turn: 1, step: 1, message: {
    toolCallId: 'c1', isError: false, content: [{ type: 'text', text: '返回 16 条资产' }] } }, 4))
  assert.equal(state.rows[0].status, 'completed')
  assert.equal(state.rows[0].semantic, 'scan')
  assert.equal(state.rows[0].durationMs, 3000)
  assert.equal(state.rows[0].result.summary, '返回 16 条资产')
})
test('failures keep a bounded error and redact secret-like output', () => {
  let state = projection.apply(projection.init({ id: 'SESSION-TEST' }), call(1, 1, 'c2'))
  state = projection.apply(state, event('tool/result', { turn: 1, step: 1, message: {
    toolCallId: 'c2', isError: true, content: [{ type: 'text', text: 'token=abc 请求失败，路径 /work/harness/secret/a.json' }] },
    error: { name: 'ToolError', code: 'UNAUTHORIZED', reason: 'missing token' } }, 5))
  assert.equal(state.rows[0].status, 'failed')
  assert.equal(state.rows[0].semantic, 'unknown')
  assert.equal(state.rows[0].error.code, 'UNAUTHORIZED')
  assert.ok(state.rows[0].result.summary.includes('[已脱敏]'))
  assert.ok(state.rows[0].result.summary.includes('[路径]'))
  assert.ok(!state.rows[0].result.summary.includes('harness'))
  assert.ok(state.rows[0].durationMs >= 0)
})

test('approval requests are paired with their decision', () => {
  let state = projection.apply(projection.init({ id: 'SESSION-TEST' }),
    event('approval/asked', { id: 'a1', toolName: 'send_message', callId: 'c1', reason: '需要确认目标会话' }, 2))
  assert.equal(state.approvals.length, 1)
  assert.equal(state.approvals[0].outcome, undefined)
  state = projection.apply(state, event('approval/decided', { id: 'a1', outcome: 'allowed-once' }, 3))
  assert.equal(state.approvals[0].outcome, 'allowed-once')
  assert.equal(state.approvals[0].decidedAt, 3000)
})
test('approval history is bounded and ignores unknown decisions', () => {
  let state = projection.init({ id: 'SESSION-TEST' })
  for (let index = 0; index < 25; index++) state = projection.apply(state, event('approval/asked', { id: `a${index}`, toolName: 't' }, index + 1))
  assert.equal(state.approvals.length, 20)
  state = projection.apply(state, event('approval/decided', { id: 'missing', outcome: 'rejected' }, 30))
  assert.ok(state.approvals.every(item => item.outcome === undefined))
})

test('cross-session merge orders by time and keeps a bounded window', () => {
  const merged = mergeTimelines([
    { rows: [{ callId: 'a', startedAt: 100 }], approvals: [] },
    { rows: [{ callId: 'b', startedAt: 300 }, { callId: 'c', startedAt: 200 }], approvals: [{ id: 'p', askedAt: 250 }] },
  ], 2)
  assert.deepEqual(merged.rows.map(row => row.callId), ['b', 'c'])
  assert.equal(merged.omitted, 1)
  assert.equal(merged.rows[0].sessionIndex, 2)
  assert.equal(merged.approvals[0].id, 'p')
})

test('timeline scope accepts only session or all', () => {
  assert.throws(() => queryArgs('timeline', new URLSearchParams({})), rejected('INVALID_QUERY'))
  assert.throws(() => queryArgs('timeline', new URLSearchParams({ scope: 'all', sessionId: 's1' })), rejected('INVALID_QUERY'))
  assert.throws(() => queryArgs('timeline', new URLSearchParams({ scope: 'recent' })), rejected('INVALID_QUERY'))
  assert.deepEqual(queryArgs('timeline', new URLSearchParams({ scope: 'all' })), { scope: 'all' })
  assert.deepEqual(queryArgs('timeline', new URLSearchParams({ sessionId: 's1' })), { sessionId: 's1' })
})

test('threat view sorts by risk score and keeps bounded fields', async () => {
  const { threatsView } = await import('./data.js')
  const view = threatsView({ data: { total: 2, rows: [
    { incidentId: 'INC-1', severity: 'CRITICAL', riskScore: 0.2, judgeVerdict: 'TRUE_POSITIVE', attackTechniquesJson: '["T1","T2"]', judgeSummary: 'low' },
    { incidentId: 'INC-2', severity: 'CRITICAL', riskScore: 0.9, judgeVerdict: 'TRUE_POSITIVE', attackTechniquesJson: '["T1"]', judgeSummary: 'high' },
  ] } })
  assert.equal(view.items[0].id, 'INC-2')
  assert.equal(view.items[0].techniques, 1)
  assert.equal(view.total, 2)
  assert.equal(view.items[0].summary, 'high')
})

test('report parser extracts ordered chain with observed and speculative steps', async () => {
  const { readFileSync } = await import('node:fs')
  const { parseReportHtml } = await import('./data.js')
  const html = readFileSync(new URL('./test-report-fixture.html', import.meta.url), 'utf8')
  const parsed = parseReportHtml(html)
  assert.equal(parsed.verdict, '真实告警')
  assert.equal(parsed.confidence, 0.86)
  assert.equal(parsed.facts.length, 8)
  assert.equal(parsed.claims.length, 3)
  assert.equal(parsed.chain.length, 8)
  assert.deepEqual(parsed.chain.slice(0, 5).map(step => step.type), ['observed', 'observed', 'observed', 'observed', 'observed'])
  assert.deepEqual(parsed.chain.slice(5).map(step => step.type), ['speculative', 'speculative', 'speculative'])
  assert.equal(parsed.actions.length, 2)
})
test('platform view keys monitoring agents apart from business assets', async () => {
  const { platformView } = await import('./data.js')
  const view = platformView([{ id: 'security-operations-expert', name: '网络安全运营专家' }], [{ provider: 'local-qwen', model: 'Qwen3.8-27B' }])
  assert.equal(view.total, 2)
  assert.equal(view.agents[0].id, 'platform:agent:security-operations-expert')
  assert.equal(view.agents[0].category, 'smart')
  assert.equal(view.models[0].category, 'smart')
})
