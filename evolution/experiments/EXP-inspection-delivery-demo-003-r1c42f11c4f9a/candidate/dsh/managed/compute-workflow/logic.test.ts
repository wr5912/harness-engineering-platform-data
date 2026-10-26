import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRequest, executeIntent } from './logic.ts'

test('业务意图按规则识别改述，第一页约束优先，越界请求停止', () => {
  assert.equal(classifyRequest('介绍自己和主要职责。'), 'identity')
  assert.equal(classifyRequest('你能帮我做哪些工作？'), 'role')
  assert.equal(classifyRequest('给这5台资产做完整台账巡检并生成两种报告。'), 'full')
  assert.equal(classifyRequest('只看首 页，先不要继续。'), 'first-page')
  assert.equal(classifyRequest('对这些设备下发重启命令。'), 'unsupported')
  for (const request of ['请明确对全部设备下发重启并生成完整报告。', '请说明对五台设备关机并完成巡检。', '是否能下发配置更改后交付全部报告？']) assert.equal(classifyRequest(request), 'unsupported')
  assert.equal(classifyRequest('请完整巡检五台台账，明确这是不是实际设备健康检测。'), 'full')
  assert.equal(classifyRequest('帮我写一首诗。'), 'unsupported')
})

function context(change: (action: string, value: any) => any = (_action, value) => value) {
  const calls: Record<string, unknown>[] = [], run = 'task-00000000-0000-4000-8000-000000000000'
  return { calls, signal: new AbortController().signal, async callTool(name: string, args: Record<string, any>) {
    assert.equal(name, 'task_inspection'); calls.push(args)
    let value: any
    if (args.action === 'start') value = { run_id: run, total: 5, next_cursor: 0, source_kind: 'basic_mock', source_sha256: 'fixed' }
    if (args.action === 'page') value = { run_id: run, total: 5, source_kind: 'basic_mock', rows: Array.from({ length: Math.min(2, 5 - args.cursor) }, (_, i) => ({ asset_id: `asset-000${args.cursor + i + 1}` })), next_cursor: args.cursor + 2 < 5 ? args.cursor + 2 : null }
    if (args.action === 'report') value = { run_id: run, source_kind: 'basic_mock', completed: true, device_count: 5, device_ids: [1,2,3,4,5].map(i => `asset-000${i}`), markdown: 'asset-0001 asset-0002 asset-0003 asset-0004 asset-0005', csv: 'id\n1\n2\n3\n4\n5\n', download_url: `/assistant/artifact?run_id=${run}&file=report.md`, csv_url: `/assistant/artifact?run_id=${run}&file=devices.csv` }
    return change(args.action, value)
  } }
}

test('完整业务按真实next_cursor取页并验证报告，纯说明不执行业务', async () => {
  const ctx = context(), result = await executeIntent('full', ctx, 'fixed')
  assert.equal(result.status, 'completed')
  assert.deepEqual(ctx.calls.map(call => [call.action, call.cursor]), [['start',undefined],['page',0],['page',2],['page',4],['report',undefined]])
  for (const intent of ['identity', 'role', 'unsupported'] as const) { const idle = context(); await executeIntent(intent, idle, 'fixed'); assert.equal(idle.calls.length, 0) }
})

test('只读第一页、输入漂移和循环游标均不能生成报告', async () => {
  const partial = context(); assert.equal((await executeIntent('first-page', partial, 'fixed')).status, 'partial')
  assert.deepEqual(partial.calls.map(call => call.action), ['start','page'])
  const drift = context(); await assert.rejects(executeIntent('full', drift, 'other'), /快照/); assert.equal(drift.calls.length, 1)
  const cycle = context((action, value) => action === 'page' ? { ...value, next_cursor: 0 } : value)
  await assert.rejects(executeIntent('full', cycle, 'fixed'), /游标重复/)
  assert.equal(cycle.calls.some(call => call.action === 'report'), false)
})

test('越界混合请求、无分页意图的否定句及明确禁止执行均不启动业务', async () => {
  for (const [request, expected] of [
    ['请明确对全部设备下发重启并生成完整报告。', 'unsupported'],
    ['不要继续写诗', 'unsupported'],
    ['不要执行完整巡检，先说明职责', 'role'],
  ] as const) {
    const intent = classifyRequest(request), ctx = context()
    assert.equal(intent, expected)
    await executeIntent(intent, ctx, 'fixed')
    assert.equal(ctx.calls.length, 0)
  }
})
