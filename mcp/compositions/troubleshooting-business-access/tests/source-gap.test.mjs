import test from 'node:test'
import assert from 'node:assert/strict'
import { create } from '../src/index.ts'
globalThis.fetch = () => { throw new Error('零上游fixture') }
const config = { connections: { master: 'm', detect: 'd', graph: 'g' } }
const input = { source: { ip: '172.16.138.226' }, target: { ip: '172.16.1.160' }, protocol: 'tcp', port: 8834 }
function fixture() {
  const calls = []
  const soc = async (_c, operation, args) => {
    calls.push({ operation, args })
    if (operation === 'list_soc_asset') {
      // 223 台账旧源无匹配，目标唯一
      if (args.ip === '172.16.138.226') return { code: 200, rows: [], total: 0 }
      return { code: 200, rows: [{ assetId: 9136, ip: '172.16.1.160', hostname: 'WAF' }], total: 1 }
    }
    if (operation === 'get_soc_asset_by_asset_id') return { code: 200, data: { assetId: args.assetId, ip: '172.16.1.160', online: true } }
    if (operation === 'get_soc_asset_port_evidence') return { code: 200, data: { ip: args.ip, port: args.port, protocol: args.protocol, status: 'NO_RECORD' } }
    return { code: 200, data: { status: 'UNKNOWN', candidates: [], gaps: ['路由投影不完整'] } }
  }
  soc.fingerprint = id => `f:${id}`
  const workflow = create(soc)
  const shared = workflow.prepare(input, config, new AbortController().signal)
  const context = nodeId => ({ runId: 'run-src-gap', nodeId, signal: new AbortController().signal, shared, progress() {}, call: fn => fn() })
  return { workflow, shared, calls, context }
}
test('源台账无匹配不阻断已唯一目标的身份、状态与监听只读检查，源缺口保留 unknown', async () => {
  const { workflow, shared, calls, context } = fixture()
  const resolved = await workflow.components.resolve(input, config, context('root/resolve'))
  assert.equal(resolved.ready, true)
  assert.equal(resolved.identity.source, false)
  assert.equal(resolved.identity.target, true)
  assert.equal(shared.assets.source, undefined)
  assert.equal(shared.assets.target.assetId, 9136)
  const identity = Object.values(shared.facts).find(fact => fact.check === 'unique-endpoints')
  assert.equal(identity.status, 'partial')
  assert.ok(identity.gaps.some(gap => gap.side === 'source'))
  const first = workflow.components.loopFirst({}, config, context('root/first'))
  assert.equal(first.validated, true)
  assert.equal(first.check, 'targetState', '已唯一目标的状态检查应可独立执行')
  await workflow.components.loopExecute({}, config, context('root/execute'))
  workflow.components.loopAppend({}, config, context('root/append'))
  workflow.components.loopCandidates({}, config, context('root/candidates'))
  const state = Object.values(shared.facts).find(fact => fact.check === 'target-soc-state')
  assert.ok(state, '目标状态事实必须产生')
  assert.ok(calls.some(call => call.operation === 'get_soc_asset_by_asset_id'))
  // 源端口/监听目标检查仍可用，且不要求源身份
  const next = workflow.components.loopDecision({}, config, context('root/decision'))
  assert.ok(['rule', 'proposal', 'stop', 'sufficient'].includes(next.route))
})
test('两端都无匹配时明确停止，不伪造已解析', async () => {
  const soc = async () => ({ code: 200, rows: [], total: 0 })
  soc.fingerprint = id => `f:${id}`
  const workflow = create(soc)
  const shared = workflow.prepare(input, config, new AbortController().signal)
  const context = nodeId => ({ runId: 'run-none', nodeId, signal: new AbortController().signal, shared, progress() {}, call: fn => fn() })
  const resolved = await workflow.components.resolve(input, config, context('root/resolve'))
  assert.equal(resolved.ready, false)
  assert.deepEqual(shared.assets, {})
  const identity = Object.values(shared.facts).find(fact => fact.check === 'unique-endpoints')
  assert.equal(identity.status, 'unknown')
  const first = workflow.components.loopFirst({}, config, context('root/first'))
  assert.equal(first.check, 'identity')
  await workflow.components.loopExecute({}, config, context('root/execute'))
  workflow.components.loopAppend({}, config, context('root/append'))
  workflow.components.loopCandidates({}, config, context('root/candidates'))
  const decision = workflow.components.loopDecision({}, config, context('root/decision'))
  assert.equal(decision.route, 'stop')
  assert.match(decision.reason, /身份/)
})
