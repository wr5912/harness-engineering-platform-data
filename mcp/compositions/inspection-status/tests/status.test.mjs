import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { classifyStatus } from '../../../src/inspection/status.ts'
import { classifyStatus as routineStatus } from '../../inspection-routine/src/index.ts'
import { create } from '../src/index.ts'

globalThis.fetch = () => { throw new Error('在线专项离线测试禁止网络') }
const online = { assetId: 1, ip: '10.0.0.1', online: 'online', stateEvidence: { online: 'online', timeBasis: 'UTC', evaluatedAt: '2026-11-09T00:00:00Z', signals: [{ validity: 'CURRENT', supportsOnline: true, observedAt: '2026-11-08T23:59:00Z' }] } }
const context = { runId: 'run-status-offline', shared: { scope: { requested: { assetIds: [1] }, frozen_at: '2026-11-09T00:00:00Z', count: 1, assetIds: [1] }, assets: [online] } }

test('在线状态分类公共实现与常规兼容导出一致', () => {
  assert.equal(routineStatus, classifyStatus)
  assert.equal(classifyStatus(online).status, 'normal')
  assert.equal(classifyStatus({ ...online, online: 'offline', stateEvidence: { ...online.stateEvidence, online: 'offline', signals: [{ validity: 'EXPIRED', supportsOnline: false, observedAt: '2026-11-08T23:00:00Z' }] } }).status, 'abnormal')
  assert.equal(classifyStatus({ ...online, stateEvidence: { ...online.stateEvidence, signals: [] } }).status, 'normal')
  assert.equal(classifyStatus({ online: 'offline', lastSeenAt: null, stateEvidence: { online: 'online', evaluatedAt: 'bad-time' } }).message, '离线')
  assert.equal(classifyStatus({ online: 'unknown' }).message, 'SOC未采集到状态数据')
})

test('独立在线专项只汇总冻结资产，不读取规则或主动探测', async () => {
  const workflow = create(async () => { throw new Error('在线专项不得调用SOC') })
  const result = workflow.components.status({}, {}, context)
  assert.equal(result.kind, 'status')
  assert.equal(result.scope.count, 1)
  assert.equal(result.items[0].status, 'normal')
  assert.equal(result.status, 'completed')
  const summary = workflow.components.summary({ status: result })
  assert.equal(summary, result)
})

test('在线专项原生流程保留三节点、两条输入输出边且不引用兄弟组合', async () => {
  const flow = JSON.parse(await readFile(new URL('../flow.json', import.meta.url), 'utf8'))
  assert.deepEqual(flow.data.nodes.map(node => node.id), ['input', 'status', 'summary'])
  assert.equal(flow.data.edges.length, 2)
  assert.ok(flow.data.edges.every(edge => edge.source === 'input' || edge.target === 'summary'))
  assert.equal(flow.data.nodes.some(node => JSON.stringify(node).includes('composition_id')), false)
})
