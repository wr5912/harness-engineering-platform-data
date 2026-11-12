import test from 'node:test'
import assert from 'node:assert/strict'
import { create } from '../src/index.ts'
globalThis.fetch = () => { throw new Error('零上游fixture') }
const config = { connections: { master: 'fixture', detect: 'fixture', graph: 'fixture' }, options: { fixedDependencies: [{ compositionId: 'troubleshooting-device-offline', versionId: 'fixed' }] } }
const input = { source: { ip: '192.0.2.10', assetId: 10 }, target: { ip: '192.0.2.20', assetId: 20 }, protocol: 'tcp', port: 80 }
const atom = (objectId, value = false) => ({ id: 'child-a1', object_id: objectId, predicate: 'soc-online', value, observed_at: '2026-11-10T00:00:00Z', applicability: 'applicable', result: 'observed', provenance_verified: true })
test('固定可用性：仅同目标可核原子并入父候选，子原因不自动确认为访问根因', async () => {
  const workflow = create(async () => { throw new Error('该fixture不访问SOC') })
  const shared = workflow.prepare(input, config, new AbortController().signal)
  shared.assets = { source: { assetId: 10 }, target: { assetId: 20 } }
  shared.causes = [{ id: 'target-offline', status: 'supported' }, { id: 'source-abnormal', status: 'unknown' }]
  shared.diagnostic_loop.round = 1
  const calls = []
  const context = { runId: 'run-parent', nodeId: 'root/execute', shared, signal: new AbortController().signal, progress() {}, call: fn => fn(),
    composition: async (selection, childInput) => { calls.push({ selection, childInput }); return { run_id: 'run-child', gaps: [],
      items: [{ atoms: [atom('asset:20'), atom('asset:10', true), { ...atom('asset:20'), provenance_verified: false }, { ...atom('asset:20'), observed_at: null }] }] } } }
  const fact = await workflow.components.availability({}, config, context)
  assert.deepEqual(calls[0].selection, config.options.fixedDependencies[0])
  assert.equal(calls[0].childInput.asset.ip, input.target.ip)
  assert.equal(fact.atoms.length, 1)
  assert.equal(fact.atoms[0].predicate, 'target-online')
  assert.equal(fact.atoms[0].cause_id, 'target-offline')
  assert.equal(fact.atoms[0].child_run_id, 'run-child')
  assert.equal(shared.diagnostic_loop.offline_reuse.child_run_id, 'run-child')
  assert.equal(shared.diagnostic_loop.offline_reuse.mapped_atoms, 1)
  assert.equal(shared.diagnostic_loop.offline_reuse.discarded_atoms, 3)
  // 子结果只有支持原子而无复合确认判据：父候选保持 supported，不成为 confirmed。
  assert.equal(shared.causes.find(cause => cause.id === 'target-offline').status, 'supported')
  assert.equal(shared.causes.find(cause => cause.id === 'source-abnormal').status, 'unknown')
  assert.equal(shared.causes.some(cause => cause.status === 'confirmed'), false)
})
test('固定可用性：未声明依赖或无公开执行合同时保留缺口，不构造子调用', async () => {
  const workflow = create(async () => { throw new Error('该fixture不访问SOC') })
  const shared = workflow.prepare(input, { connections: config.connections }, new AbortController().signal)
  shared.assets = { source: { assetId: 10 }, target: { assetId: 20 } }
  const fact = await workflow.components.availability({}, { connections: config.connections }, { runId: 'run-parent', nodeId: 'root/execute', shared, signal: new AbortController().signal, progress() {}, call: fn => fn() })
  assert.equal(fact.status, 'unavailable')
  assert.match(fact.gaps.join(''), /未声明固定可用性依赖/)
  assert.equal(fact.atoms.length, 0)
})
