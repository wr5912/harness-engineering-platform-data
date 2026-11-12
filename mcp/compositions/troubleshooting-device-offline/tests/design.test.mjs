import test from 'node:test'
import assert from 'node:assert/strict'
import { create } from '../src/index.ts'

globalThis.fetch = () => { throw new Error('设备离线回归禁止网络') }
const config = { connections: { master: 'mock-master', ingest: 'mock-ingest', detect: 'mock-detect', graph: 'mock-graph' } }

function fixture() {
  const calls = [], progress = []
  const soc = async (connection, operation, args) => {
    calls.push({ connection, operation, args })
    if (operation === 'list_soc_asset') return { code: 200, rows: [{ assetId: 7, ip: '192.0.2.7', assetType: 'linux' }], total: 1 }
    if (operation === 'get_soc_asset_by_asset_id') return { code: 200, data: { assetId: 7, ip: '192.0.2.7', online: false, stateEvidence: { signals: [{ source: 'soc-heartbeat', observedAt: '2026-11-09T10:00:00Z', validity: 'VALID', supportsOnline: false }] } } }
    throw new Error(`设备离线fixture禁止未声明操作：${operation}`)
  }
  soc.fingerprint = id => `fixture:${id}`
  const workflow = create(soc)
  const shared = workflow.prepare({ asset: { ip: '192.0.2.7', assetId: 7, assetType: 'linux', physicalVirtual: 'physical', managementObject: 'cmdb-7' } }, config)
  const signal = new AbortController().signal
  const context = nodeId => ({ runId: 'run-device-offline-design', nodeId, signal, shared, progress(value) { progress.push(value) }, call: fn => fn() })
  return { workflow, shared, calls, progress, context, config }
}

test('离线场景允许未知故障起点并冻结物理形态与管理对象', async () => {
  const state = fixture()
  assert.equal(state.shared.scope.time.fault_started_at, null)
  assert.equal(state.shared.scope.time.query_window, null)
  const resolved = await state.workflow.components.resolve({}, state.config, state.context('resolve'))
  assert.equal(resolved.branch, 'ready')
  assert.equal(state.shared.scope.asset.physicalVirtual, 'physical')
  assert.equal(state.shared.scope.asset.managementObject, 'cmdb-7')
  const status = await state.workflow.components.status({}, state.config, state.context('status'))
  assert.equal(status.status, 'unknown')
  const candidate = state.shared.causes.find(item => item.id === 'device-offline')
  assert.equal(candidate.status, 'supported')
  assert.notEqual(candidate.status, 'confirmed')
})

test('无管理原子不伪造电源结论，且请求记录保持零响应区分', async () => {
  const state = fixture()
  await state.workflow.components.resolve({}, state.config, state.context('resolve'))
  const management = state.workflow.components.management({}, state.config, state.context('management'))
  assert.equal(management.response_verified, false)
  const fact = Object.values(state.shared.facts).find(item => item.check === 'management-observation')
  assert.equal(fact.status, 'unavailable')
  assert.equal(fact.executed, false)
  assert.equal(fact.execution_status, 'not_executed')
  assert.match(fact.gaps.join(' '), /管理侧电源/)
  assert.equal(state.calls.some(call => call.operation.includes('power') || call.operation.includes('management')), false)
})
