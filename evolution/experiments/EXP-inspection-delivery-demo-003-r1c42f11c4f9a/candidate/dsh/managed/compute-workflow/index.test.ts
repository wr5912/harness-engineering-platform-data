import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

if (!process.env.HARNESS_PROGRAM_ROOT) throw new Error('请设置 HARNESS_PROGRAM_ROOT 指向固定程序仓库')
process.env.HARNESS_DSH_ENTRY ??= join(process.env.HARNESS_PROGRAM_ROOT, 'platform/plugin/package.json')
const { workflow } = await import('./index.mjs')
const fixture = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'))
const runId = 'task-00000000-0000-4000-8000-000000000000'

function context(request: string, change: (action: string, value: any, controller: AbortController) => any = (_action, value) => value) {
  const controller = new AbortController(), calls: Record<string, any>[] = [], trace: Record<string, any>[] = []
  return {
    input: { request }, executionId: 'conditional-graph-test', signal: controller.signal, calls, trace,
    async infer() { throw new Error('纯代码图不得调用模型') },
    async callTool(name: string, args: Record<string, any>) {
      assert.equal(name, 'task_inspection'); calls.push(args)
      let value: any
      if (args.action === 'start') value = { run_id: runId, total: 5, next_cursor: 0, source_kind: 'basic_mock', source_sha256: fixture.projected_source_sha256 }
      if (args.action === 'page') value = { run_id: runId, total: 5, source_kind: 'basic_mock', rows: Array.from({ length: Math.min(2, 5 - args.cursor) }, (_, index) => ({ asset_id: `asset-000${args.cursor + index + 1}` })), next_cursor: args.cursor + 2 < 5 ? args.cursor + 2 : null }
      if (args.action === 'report') value = { run_id: runId, source_kind: 'basic_mock', completed: true, device_count: 5, device_ids: [1, 2, 3, 4, 5].map(index => `asset-000${index}`), markdown: 'asset-0001 asset-0002 asset-0003 asset-0004 asset-0005', csv: 'id\n1\n2\n3\n4\n5\n', download_url: `https://public.example/business/demo/api/artifact?run_id=${runId}&file=report.md`, csv_url: `https://public.example/business/demo/api/artifact?run_id=${runId}&file=devices.csv` }
      return change(args.action, value, controller)
    },
  }
}

test('真实构建条件图对五类输入只执行选定分支，并保留完成轨迹', async () => {
  for (const [request, branch, actions] of [
    ['介绍自己和主要职责。', 'identity', []],
    ['你能帮我做哪些工作？', 'role', []],
    ['给这5台资产做完整台账巡检并生成两种报告。', 'full-inspection', ['start', 'page', 'page', 'page', 'report']],
    ['只读取第一页，先不要继续。', 'first-page', ['start', 'page']],
    ['帮我写一首诗。', 'unsupported', []],
  ] as const) {
    const ctx = context(request), result = await workflow.run(ctx)
    assert.ok(result.reply)
    assert.deepEqual(ctx.trace.map(row => [row.node, row.status]), [['route-request', 'completed'], [branch, 'completed']])
    assert.deepEqual(ctx.calls.map(call => call.action), actions)
  }
})

test('否定请求经图条件分流后仍不启动业务', async () => {
  for (const [request, branch] of [
    ['请明确对全部设备下发重启并生成完整报告。', 'unsupported'],
    ['不要继续写诗', 'unsupported'],
    ['不要执行完整巡检，先说明职责', 'role'],
  ] as const) {
    const ctx = context(request)
    await workflow.run(ctx)
    assert.deepEqual(ctx.trace.map(row => row.node), ['route-request', branch])
    assert.equal(ctx.calls.length, 0)
  }
})

test('分支工具失败向外抛出并记录失败，不继续分页或切换分支', async () => {
  const ctx = context('请完整巡检五台台账。', () => { throw new Error('业务接口失败') })
  await assert.rejects(workflow.run(ctx), /业务接口失败/)
  assert.deepEqual(ctx.calls.map(call => call.action), ['start'])
  assert.deepEqual(ctx.trace.map(row => [row.node, row.status]), [['route-request', 'completed'], ['full-inspection', 'failed']])
})

test('分支取消向外抛出并记录取消，不生成报告', async () => {
  const ctx = context('请完整巡检五台台账。', async (_action, value, controller) => {
    controller.abort(new Error('用户取消'))
    await new Promise(resolve => setImmediate(resolve))
    return value
  })
  await assert.rejects(workflow.run(ctx))
  assert.deepEqual(ctx.calls.map(call => call.action), ['start'])
  assert.deepEqual(ctx.trace.map(row => [row.node, row.status]), [['route-request', 'completed'], ['full-inspection', 'cancelled']])
})
