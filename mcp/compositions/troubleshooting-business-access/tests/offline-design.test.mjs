import test from 'node:test'
import assert from 'node:assert/strict'
import { create } from '../src/index.ts'
import { candidateStates, diagnosticTime, validateCheckProposal } from '../../../src/diagnostic-context.ts'

globalThis.fetch = () => { throw new Error('诊断离线回归禁止网络') }
const config = { connections: { master: 'mock-master', detect: 'mock-detect', graph: 'mock-graph' } }
const input = { source: { ip: '192.0.2.10', assetId: 10 }, target: { ip: '192.0.2.20', assetId: 20 }, protocol: 'tcp', port: 443, faultStartedAt: null, from: '2026-11-01T00:00:00Z', to: '2026-11-01T01:00:00Z' }
const assets = [{ assetId: 10, ip: '192.0.2.10', hostname: 'source' }, { assetId: 20, ip: '192.0.2.20', hostname: 'target' }]
function fixture() {
  const calls = [], progress = [], soc = async (connection, operation, args) => {
    calls.push({ connection, operation, args })
    if (operation === 'list_soc_asset') return { code: 200, rows: assets.filter(asset => asset.ip === args.ip), total: 1 }
    if (operation === 'get_soc_asset_by_asset_id') return { code: 200, data: assets.find(asset => asset.assetId === args.assetId) }
    if (operation === 'get_soc_asset_port_evidence') return { code: 200, data: { ip: args.ip, port: args.port, status: 'NO_RECORD' } }
    if (operation === 'get_graph_path_query') return { code: 200, data: { diagnosis: { sourceIp: args.srcIp, targetIp: args.dstIp, port: args.port, protocol: args.protocol, portEvaluated: true, verdict: 'UNKNOWN' } } }
    throw new Error(`离线fixture禁止未声明操作：${operation}`)
  }
  soc.fingerprint = id => `fixture:${id}`
  const workflow = create(soc), signal = new AbortController().signal, shared = workflow.prepare(input, config, signal)
  const context = nodeId => ({ runId: 'run-offline-diagnostic', nodeId, signal, shared, progress(value) { progress.push(value) }, call: fn => fn() })
  return { workflow, shared, calls, progress, context }
}

test('时间分离、候选六态与真实schema提议校验保持离线边界', () => {
  const time = diagnosticTime(input)
  assert.equal(time.fault_started_at, null)
  assert.deepEqual(time.query_window, { from: input.from, to: input.to })
  assert.match(time.observation_requested_at, /Z$/)
  assert.deepEqual(candidateStates, ['confirmed', 'supported', 'refuted', 'unknown', 'conflict', 'insufficient_capability'])
  const schema = { type: 'object', required: ['assetId'], additionalProperties: false, properties: { assetId: { type: 'integer', minimum: 1 } } }
  const state = { allowed: ['read'], objects: ['asset:10'], evidenceIds: ['identity'], used: [], remaining: 1, permitted: true, capabilities: { read: { inputSchema: schema, readonly: true, permission: 'granted', binding: { object_id: 'asset:10', args: { assetId: 10 } }, scope: { object_ids: ['asset:10'] } } }, validateSchema: (actual, value) => actual === schema && value.assetId === 10 }
  assert.ok(validateCheckProposal({ id: 'p', operation: 'read', object_id: 'asset:10', purpose: '区分当前状态', discriminates: ['state'], prerequisites: ['identity'], args: { assetId: 10 } }, state).fingerprint)
})

test('对象冻结、SOC只读事实、主动探测禁止与同Run报告元数据', async () => {
  const state = fixture(), { workflow, shared, calls, progress, context } = state
  const resolved = await workflow.components.resolve(input, config, context('resolve'))
  assert.equal(resolved.ready, true)
  assert.deepEqual(shared.scope.source, input.source)
  assert.deepEqual(shared.scope.target, input.target)
  const tcp = workflow.components.sourceTcp({}, config, context('source-tcp'))
  assert.equal(tcp.route, 'UNKNOWN')
  assert.equal(calls.some(call => call.operation.includes('tcp') || call.operation.includes('probe')), false)
  const source = await workflow.components.sourceState({}, config, context('source-state'))
  const target = await workflow.components.targetState({}, config, context('target-state'))
  const path = await workflow.components.path({}, config, context('path'))
  const report = workflow.components.summary({ items: [{ branch: 'source', value: source }, { branch: 'target', value: target }, { branch: 'path', value: path }] }, config, context('summary'))
  assert.equal(report.run_id, 'run-offline-diagnostic')
  assert.equal(report.execution_status, 'unverified')
  assert.equal(report.readonly_checks_executed, true)
  assert.equal(report.active_probes_executed, false)
  assert.ok(report.rounds.length >= 1)
  assert.ok(progress.length >= 1)
  const details = JSON.parse(workflow.artifacts(report).find(item => item.id === 'details').body)
  assert.equal(details.run_id, 'run-offline-diagnostic')
  assert.match(details.generated_at, /Z$/)
  assert.match(workflow.artifacts(report).find(item => item.id === 'report').body, /run-offline-diagnostic/)
})

test('失败事实保留来源缺口与错误，不被报告渲染为正常', async () => {
  const state = fixture(), { workflow, shared, context } = state
  const broken = create(async () => { throw Object.assign(new Error('权限拒绝'), { status: 403, receipt: { error: 'forbidden' } }) })
  const brokenShared = broken.prepare(input, config, new AbortController().signal)
  const brokenContext = { ...context('failed'), shared: brokenShared }
  await broken.components.resolve(input, config, brokenContext)
  const fact = brokenShared.facts['run-offline-diagnostic:failed:3'] ?? Object.values(brokenShared.facts).at(-1)
  assert.ok(fact)
  assert.equal(fact.status, 'unknown')
  assert.ok(fact.gaps.length >= 0)
  assert.equal(Object.values(brokenShared.facts).some(item => item.status === 'normal'), false)
})


test('fixture：真实组件重复nodeId逐轮追加且NO_RECORD不判无监听', async () => {
 const {workflow,shared,calls,context}=fixture()
 let value=workflow.components.loopFirst({},config,context('first'))
 await workflow.components.loopExecute(value,config,context('execute'))
 assert.equal(Object.keys(shared.facts).length,0)
 workflow.components.loopAppend({},config,context('append'))
 workflow.components.loopCandidates({},config,context('candidates'))
 value=workflow.components.loopDecision({},config,context('decision'))
 workflow.components.loopRule(value,config,context('rule'))
 await workflow.components.loopExecute({},config,context('execute'))
 workflow.components.loopAppend({},config,context('append'))
 workflow.components.loopCandidates({},config,context('candidates'))
 assert.equal(Object.keys(shared.facts).length,2)
 assert.equal(new Set(Object.keys(shared.facts)).size,2)
 assert.equal(shared.rounds.length,2)
 workflow.components.loopRule({check:'portEvidence'},config,context('rule'))
 await workflow.components.loopExecute({},config,context('execute'))
 workflow.components.loopAppend({},config,context('append'))
 workflow.components.loopCandidates({},config,context('candidates'))
 const port=Object.values(shared.facts).find(fact=>fact.check==='portEvidence')
 assert.equal(port.status,'unknown')
 assert.equal(port.atoms.length,0)
 assert.equal(shared.causes.find(cause=>cause.id==='service-not-listening').status,'unknown')
 assert.deepEqual(calls.at(-1).args,{ip:input.target.ip,port:443,protocol:'tcp'})
 assert.equal(calls.at(-1).operation,'get_soc_asset_port_evidence')
})
