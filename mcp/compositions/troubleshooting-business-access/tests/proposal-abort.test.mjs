import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceLoop } from '../src/evidence-loop.ts'
import { offlineEvidenceLoop } from '../../troubleshooting-device-offline/src/evidence-loop.ts'
import { buildConclusion } from '../../../src/reports/conclusion.ts'

const scope = { requested: { source: { ip: '192.0.2.10' }, target: { ip: '192.0.2.20' }, protocol: 'tcp', port: 80 }, time: { fault_started_at: null, query_window: null } }
function onlineContext(aborted) {
  const shared = { assets: { source: { assetId: 10 }, target: { assetId: 20 } }, causes: [], facts: {}, scope, request_count: 8,
    diagnostic_loop: { round: 6, round_limit: 24, attempts: {}, pending: null } }
  const signal = { aborted, throwIfAborted() { if (aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }) } }
  return { runId: 'run-x', nodeId: 'root/proposal', signal, shared, progress() {}, call: fn => fn() }
}
function offlineContext(aborted) {
  const shared = { scope: { requested: { asset: { ip: '192.0.2.5' } }, time: { query_window: null } }, facts: {}, rounds: [], causes: [], request_count: 2,
    diagnostic_loop: { round: 2, round_limit: 24, attempts: {}, pending: null, management: null, binding: null } }
  const signal = { aborted, throwIfAborted() { if (aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }) } }
  return { runId: 'run-y', nodeId: 'root/proposal', signal, shared, progress() {}, call: fn => fn() }
}
const failing = { controlledProposal: async () => { throw new Error('诊断提议模型未正常完成（TIMEOUT）：请求超时') }, loopFinalReport: () => ({ ok: true }) }

test('受控提议失败：收口为 stop 并保留错误，不抛出整条 Run', async () => {
  const loop = evidenceLoop(failing, { request_limit: 48 }, () => {})
  const ctx = onlineContext(false)
  const result = await loop.loopProposal({}, {}, ctx)
  assert.equal(result.route, 'stop')
  assert.match(result.reason, /受控提议未通过：.*TIMEOUT/)
  assert.equal(ctx.shared.diagnostic_loop.proposal_error.aborted, false)
  assert.match(ctx.shared.diagnostic_loop.proposal_error.message, /TIMEOUT/)
  const report = loop.loopStop({}, {}, ctx)
  assert.equal(report.ok, true)
})

test('外部中止（实例重载/取消）：停止并输出 unknown 报告，不丢已保存事实', async () => {
  const loop = evidenceLoop(failing, { request_limit: 48 }, () => {})
  const ctx = onlineContext(true)
  ctx.shared.facts.saved = { id: 'root/append:1', check: 'portEvidence', status: 'unknown', atoms: [] }
  const result = await loop.loopProposal({}, {}, ctx)
  assert.equal(result.route, 'stop')
  assert.match(result.reason, /外部中止/)
  assert.equal(ctx.shared.diagnostic_loop.proposal_error.aborted, true)
  assert.equal(Object.keys(ctx.shared.facts).length, 1)
  assert.equal(loop.loopStop({}, {}, ctx).ok, true)
})

test('离线提议失败与中止同样收口，不抛整条 Run', async () => {
  const loop = offlineEvidenceLoop(failing, () => {})
  const one = offlineContext(false)
  const failed = await loop.loopProposal({}, {}, one)
  assert.equal(failed.route, 'stop')
  assert.match(failed.reason, /受控提议未通过/)
  const two = offlineContext(true)
  const aborted = await loop.loopProposal({}, {}, two)
  assert.equal(aborted.route, 'stop')
  assert.match(aborted.reason, /外部中止/)
  assert.equal(two.shared.diagnostic_loop.proposal_error.aborted, true)
  assert.ok(loop.loopStop({}, {}, two).diagnostic_loop)
})

test('建议按实际停止缺口具体化：离线到宿主/采集责任方，访问到监听与网络责任方', () => {
  const offline = buildConclusion({
    kind: 'device-offline', run_id: 'run-a', scope: { asset: { ip: '172.16.1.10' } },
    items: [{ check: 'management-observation', status: 'unavailable', execution_status: 'not_executed', gaps: ['未核得当前管理侧电源/系统/网卡观察原子'] },
      { check: 'alerts', status: 'observed', execution_status: 'completed', gaps: [] }],
    causes: [{ id: 'device-offline', title: '设备当前离线', status: 'unknown', support: { evidence_ids: [] }, refutation: { evidence_ids: [] } }],
    gaps: ['未核得当前管理侧电源/系统/网卡观察原子；SOC标签和历史探测不能替代本次真实响应'],
  })
  assert.match(offline.primaryRecommendation.category, /只读/)
  assert.match(offline.primaryRecommendation.title, /虚拟化\/宿主平台责任方/)
  const titles = offline.followupRecommendations.map(item => item.title).join(' | ')
  assert.match(offline.primaryRecommendation.owner, /宿主平台管理员/)
  assert.match(offline.followupRecommendations.map(item => item.owner).join(' '), /SOC 采集/)
  assert.match(titles, /采集设备|心跳/)
  assert.ok(offline.followupRecommendations.every(item => /只读|不执行/.test(item.authorization + item.risk)))

  const access = buildConclusion({
    kind: 'business-access', run_id: 'run-b', scope: { source: { ip: '172.16.1.40' }, target: { ip: '172.16.138.232' }, protocol: 'tcp', port: 80 },
    items: [{ check: 'portEvidence', status: 'unknown', execution_status: 'completed', gaps: ['SOC端口证据 status=NO_RECORD'] }],
    causes: [{ id: 'service-not-listening', title: '服务未监听', status: 'unknown', support: { evidence_ids: [] }, refutation: { evidence_ids: [] } }],
    gaps: ['SOC端口证据 status=NO_RECORD', '各跳记录未确认为同一会话；NAT 转换前后地址及非对称回程尚未关联'],
  })
  assert.match(access.primaryRecommendation.title, /监听与主机防火墙规则/)
  const accessTitles = access.followupRecommendations.map(item => item.title).join(' | ')
  assert.match(accessTitles, /策略决策、NAT 转换与回程路径/)
  assert.match(access.followupRecommendations[0].verificationMethod, /重跑本诊断/)
})

test('根因缺口去重，重复来源不重复列出', () => {
  const duplicated = '上游未提供可核带时区观测时间；查询窗口和记录时间不替代观测时间'
  const c = buildConclusion({
    kind: 'business-access', run_id: 'run-c', scope: { source: { ip: '192.0.2.10' }, target: { ip: '192.0.2.20' }, protocol: 'tcp', port: 80 },
    items: [{ check: 'portEvidence', status: 'unknown', execution_status: 'completed', gaps: [{ check: 'portEvidence', reason: duplicated }] },
      { check: 'pathEvidence', status: 'unknown', execution_status: 'completed', gaps: [{ check: 'pathEvidence', reason: duplicated }] }],
    causes: [{ id: 'service-not-listening', title: 'x', status: 'unknown', support: { evidence_ids: [] }, refutation: { evidence_ids: [] } }],
    gaps: [duplicated],
  })
  assert.equal(c.rootCause.gaps.filter(gap => (typeof gap === 'string' ? gap : gap?.reason) === duplicated).length, 1)
})

test('组件序列（非LFX执行器）：已追加多轮事实后提议中止仍产出unknown报告与HTML', async () => {
  const { create } = await import('../src/index.ts')
  const soc = async () => { throw new Error('该用例不访问上游') }
  soc.fingerprint = id => `f:${id}`
  const workflow = create(soc)
  const config = { connections: { master: 'm', detect: 'd', graph: 'g' } }
  const input = { source: { ip: '172.16.138.226' }, target: { ip: '172.16.1.160' }, protocol: 'tcp', port: 8834 }
  const shared = workflow.prepare(input, config, new AbortController().signal)
  // 模拟已完成 7 轮：事实/回执/轮次均已追加（真实形状）
  for (let index = 1; index <= 7; index++) {
    const fact = { id: `root/append:${index}`, check: index === 1 ? 'unique-endpoints' : index === 2 ? 'portEvidence' : 'routeEvidence',
      status: index === 2 ? 'unknown' : 'unknown', execution_status: index === 3 ? 'failed' : 'completed', run_id: 'run-full', node_id: 'root/execute',
      atoms: [], gaps: [{ check: 'portEvidence', reason: 'SOC端口证据 status=NO_RECORD' }], raw_receipt_refs: [{ receipt_id: `r${index}` }],
      error: index === 3 ? '503 API Key 认证服务暂不可用' : undefined, observed_at: null, source_timezone: 'unknown' }
    shared.facts[fact.id] = fact
    shared.receipts[`r${index}`] = { id: `r${index}`, serverId: 'm', operation: 'x', attempted: true, response_received: true }
    shared.rounds.push({ id: `round-${index}`, node_id: 'root/execute', known_facts: Object.keys(shared.facts), candidates: [], evidence_ids: [fact.id], gaps: [], next_check: null, reason: 'x' })
  }
  shared.assets = { source: { assetId: 9141, ip: '172.16.138.226' }, target: { assetId: 9136, ip: '172.16.1.160' } }
  shared.diagnostic_loop.round = 7
  let aborted = true
  const context = { runId: 'run-full', nodeId: 'root/proposal', signal: { get aborted() { return aborted }, throwIfAborted() { if (aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }) } },
    shared, progress() {}, call: fn => fn() }
  let proposeCalls = 0
  workflow.components.controlledProposal = async () => { proposeCalls++; throw new Error('诊断提议模型未正常完成（UNKNOWN）：实例重建中止') }
  const stopped = await workflow.components.loopProposal({}, config, context)
  assert.equal(proposeCalls, 1, '必须真实进入受控提议并触发中止')
  assert.equal(stopped.route, 'stop')
  assert.equal(shared.diagnostic_loop.proposal_error.aborted, true)
  const report = workflow.components.loopStop({}, config, context)
  assert.equal(report.status, 'incomplete')
  assert.notEqual(report.conclusion, 'confirmed')
  assert.equal(report.unified_conclusion.rootCause.statusCode, 'UNKNOWN')
  assert.equal(Object.keys(shared.facts).length, 7)
  assert.equal(Object.keys(shared.receipts).length, 7)
  assert.equal(report.items.length, 7)
  assert.ok(report.items.some(item => item.execution_status === 'failed'))
  const artifacts = workflow.artifacts(report)
  assert.deepEqual(artifacts.map(a => a.id), ['report', 'details'])
  const html = artifacts[0].body
  for (const label of ['首屏结论', '根因尚未确认', '部分失败与未覆盖', 'NO_RECORD']) assert.ok(html.includes(label), label)
  const details = JSON.parse(artifacts[1].body)
  assert.equal(details.unified_conclusion.partialFailures.failed.length, 1)
  assert.notEqual(details.unified_conclusion.stopStatusCode, 'CONFIRMED_END')
})
