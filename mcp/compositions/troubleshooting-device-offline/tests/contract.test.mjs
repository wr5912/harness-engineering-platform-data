import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// 仅编译本包TS并直接检查组件合同；不构造/模拟LFX，不装依赖，不发真实SOC请求。
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const programRoot = process.env.HARNESS_PROGRAM_ROOT
assert.ok(programRoot && isAbsolute(programRoot), 'HARNESS_PROGRAM_ROOT须为研发实际程序根绝对路径')
const require = createRequire(join(programRoot, 'platform/plugin/package.json'))
const { build } = require('esbuild')
const built = await build({ entryPoints: [join(root, 'src/index.ts')], bundle: true, format: 'esm', platform: 'node', write: false, metafile: true, logLevel: 'silent' })
const { create, inputSchema } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const flow = JSON.parse(await readFile(join(root, 'flow.json'), 'utf8'))
const source = await readFile(join(root, 'src/index.ts'), 'utf8')
const config = { connections: { master: 'master', detect: 'detect', ingest: 'ingest', graph: 'graph' } }
const originalInput = () => ({ asset: { ip: '10.0.0.2', assetId: 2 }, from: '2026-11-07T00:00:00Z', to: '2026-11-07T03:00:00Z' })
function context(shared, nodeId = 'root/offline-batch[1]/alerts', events = [], progress) {
  return { shared, runId: 'contract-run', nodeId, signal: new AbortController().signal, call: fn => fn(),
    progress: value => { events.push(structuredClone(value)); progress?.(value) } }
}
const snapshot = (overrides = {}) => ({ groups: [{ groupKey: 'g' }], totalGroups: 1, totalAlerts: 2, snapshotId: 's', truncated: false, ...overrides })
const normalPages = () => [
  { members: [{ alertId: 'a' }], total: 2, groupKey: 'g', snapshotId: 's', nextCursor: 'next' },
  { members: [{ alertId: 'b' }], total: 2, groupKey: 'g', snapshotId: 's', nextCursor: null },
]
function alertsFixture({ groupPages = [snapshot()], memberPages = normalPages(), memberReply, fail, onProgress } = {}) {
  const calls = [], events = []
  const soc = async (_server, operation, args) => {
    calls.push({ operation, args: structuredClone(args) })
    if (fail) return fail(operation, args)
    let result
    if (operation === 'list_detect_alert') result = groupPages[args.req.pageNum - 1]
    else if (operation === 'get_detect_alert_group_members') result = memberReply ? memberReply(args.req) : memberPages[args.req.pageNum - 1]
    else throw new Error(`合同Mock没有该外部SOC操作：${operation}`)
    assert.notEqual(result, undefined, '意外续页不能用空页或重复最后一页掩盖')
    return { code: 200, data: structuredClone(result) }
  }
  const workflow = create(soc), shared = workflow.prepare(originalInput(), config)
  shared.scope.asset = { assetId: 2, ip: '10.0.0.2' }
  return { workflow, shared, calls, events, ctx: context(shared, undefined, events, onProgress) }
}
async function readAlerts(options) {
  const fixture = alertsFixture(options)
  const result = await fixture.workflow.components.alerts({}, config, fixture.ctx)
  return { ...fixture, result }
}

test('原生启动先返回accepted，详细事实留在Run，避免大回执裁剪后丢失来源', () => {
  assert.notEqual(create(async () => { throw new Error('启动合同不调用SOC') }).responseMode, 'complete')
})

test('用户重复alertId跨页复现：保留两条及两原页，但绝不能complete', async () => {
  const { result, calls, events } = await readAlerts({ memberPages: [
    { members: [{ alertId: 'duplicate' }], total: 2, nextCursor: 'next' },
    { members: [{ alertId: 'duplicate' }], total: 2, nextCursor: null },
  ] })
  assert.equal(result.complete, false)
  assert.equal(result.status, 'unknown')
  assert.match(result.error, /alertId\/稳定ID.*重复/)
  assert.equal(result.message, result.error)
  assert.equal(result.members.length, 2)
  assert.equal(result.raw_pages.members.length, 2)
  assert.equal(result.raw_pages.members[1].response.members[0].alertId, 'duplicate')
  assert.equal(calls.length, 3)
  assert.equal(events.at(-1).result.items[0].complete, false)
  assert.equal(events.at(-1).result.raw_receipts.length, 3)
})

test('仅cursor成员页也不得越过固定快照总数继续续读', async () => {
  const { result, calls } = await readAlerts({ memberReply: () => ({ members: [{ alertId: 'a' }, { alertId: 'b' }, { alertId: 'c' }], nextCursor: 'would-continue' }) })
  assert.equal(result.complete, false)
  assert.equal(result.status, 'unknown')
  assert.equal(result.error, '告警成员累计超过固定快照总数，未继续续页')
  assert.equal(result.message, result.error)
  assert.equal(result.members.length, 3)
  assert.equal(result.raw_pages.members.length, 1)
  assert.equal(calls.length, 2, '已超过已知快照总数，不应再请求下一个cursor')
})

const invalidPages = [
  ['稳定id跨页重复', [{ members: [{ id: 4 }], total: 2, nextCursor: 'x' }, { members: [{ id: 4 }], total: 2, nextCursor: null }], /稳定ID.*重复/],
  ['total跨页变化', [{ members: [{ alertId: 'a' }], total: 2, nextCursor: 'x' }, { members: [{ alertId: 'b' }], total: 3, nextCursor: null }], /总数在分页中变化/],
  ['同页总数字段冲突', [{ members: [{ alertId: 'a' }], total: 2, totalMembers: 3, nextCursor: 'x' }], /总数字段冲突/],
  ['响应错组', [{ members: [{ alertId: 'a' }], groupKey: 'other', total: 1, nextCursor: null }], /groupKey与请求不一致/],
  ['响应错snapshot', [{ members: [{ alertId: 'a' }], snapshotId: 'other', total: 1, nextCursor: null }], /snapshotId与请求不一致/],
  ['响应null snapshot不是省略', [{ members: [{ alertId: 'a' }], snapshotId: null, total: 1, nextCursor: null }], /snapshotId与请求不一致/],
  ['members和alerts数组歧义', [{ members: [{ alertId: 'a' }], alerts: [], total: 1, nextCursor: null }], /多个数组字段歧义/],
  ['members和rows数组歧义', [{ members: [], rows: [], total: 0, nextCursor: null }], /多个数组字段歧义/],
  ['重复cursor', [{ members: [{ alertId: 'a' }], total: 3, nextCursor: 'x' }, { members: [{ alertId: 'b' }], total: 3, nextCursor: 'x' }], /游标重复或无进展/],
  ['非字符串cursor', [{ members: [{ alertId: 'a' }], total: 2, nextCursor: 1 }], /游标必须为非空字符串/],
  ['undefined不是显式终点', [{ members: [{ alertId: 'a' }], total: 2, nextCursor: undefined }], /游标必须为非空字符串/],
  ['显式游标过早终点', [{ members: [{ alertId: 'a' }], total: 2, nextCursor: null }], /显式游标终点矛盾/],
  ['total已达终点却还有cursor', [{ members: [{ alertId: 'a' }, { alertId: 'b' }], total: 2, nextCursor: 'x' }], /总数终点与续页游标矛盾/],
  ['游标模式丢失显式终点', [{ members: [{ alertId: 'a' }], total: 2, nextCursor: 'x' }, { members: [{ alertId: 'b' }], total: 2 }], /缺少显式终点/],
  ['零成员页不猜空', [{ members: [], total: 2, nextCursor: null }], /零页或无进展/],
  ['缺稳定ID不声称完整', [{ members: [{ title: 'unknown' }], total: 1, nextCursor: null }], /缺少可核实稳定ID/],
]
for (const [name, memberPages, pattern] of invalidPages) test(name, async () => {
  const { result } = await readAlerts({ memberPages })
  assert.equal(result.complete, false)
  assert.equal(result.status, 'unknown')
  assert.match(result.error, pattern)
  assert.equal(result.message, result.error)
  assert.ok(result.raw_pages.members.length > 0)
  assert.ok(result.raw_receipt_refs.length > 1)
})
for (const total of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2', null]) test(`非安全整数total拒绝：${String(total)}`, async () => {
  const { result } = await readAlerts({ memberPages: [{ members: [{ alertId: 'a' }], total, nextCursor: null }] })
  assert.equal(result.complete, false)
  assert.match(result.error, /非负安全整数/)
})
for (const field of ['totalAlerts', 'totalMembers']) test(`${field}也必须跨页稳定`, async () => {
  const { result } = await readAlerts({ memberPages: [
    { members: [{ alertId: 'a' }], [field]: 2, nextCursor: 'x' },
    { members: [{ alertId: 'b' }], [field]: 3, nextCursor: null },
  ] })
  assert.equal(result.complete, false)
  assert.match(result.error, /总数在分页中变化/)
})

test('重复分组、零组页和全快照数量不符均不完整；原页不截断', async () => {
  const repeated = await readAlerts({ groupPages: [snapshot({ totalGroups: 2 }), snapshot({ totalGroups: 2 })] })
  assert.equal(repeated.result.complete, false)
  assert.match(repeated.result.error, /groupKey缺失或重复/)
  assert.equal(repeated.result.groups.length, 2)
  assert.equal(repeated.result.raw_pages.groups.length, 2)
  assert.equal(repeated.calls.filter(call => call.operation === 'get_detect_alert_group_members').length, 0)
  const zero = await readAlerts({ groupPages: [snapshot({ groups: [], totalGroups: 1 })] })
  assert.equal(zero.result.complete, false)
  assert.match(zero.result.error, /零页或无进展/)
  const mismatched = await readAlerts({ groupPages: [snapshot({ totalAlerts: 3 })] })
  assert.equal(mismatched.result.complete, false)
  assert.match(mismatched.result.error, /成员数与固定快照总数不一致/)
  const changed = await readAlerts({ groupPages: [snapshot({ totalGroups: 2 }), snapshot({ groups: [{ groupKey: 'g2' }], totalGroups: 3 })] })
  assert.equal(changed.result.complete, false)
  assert.match(changed.result.error, /快照或总数在分页中变化/)
})

test('正常显式cursor、仅cursor、仅稳定total页码、全部组页与零组', async () => {
  const normal = await readAlerts()
  assert.equal(normal.result.complete, true)
  assert.equal(normal.calls[2].args.req.cursor, 'next')
  assert.deepEqual(normal.result.members.map(member => member.alertId), ['a', 'b'])
  const cursorOnly = await readAlerts({ memberPages: [
    { items: [{ alertId: 'a' }], nextCursor: 'x' }, { items: [{ alertId: 'b' }], nextCursor: '' },
  ] })
  assert.equal(cursorOnly.result.complete, true)
  const totalOnly = await readAlerts({ memberPages: [
    { records: [{ alertId: 'a' }], totalMembers: 2 }, { records: [{ alertId: 'b' }], totalMembers: 2 },
  ] })
  assert.equal(totalOnly.result.complete, true)
  assert.equal(totalOnly.calls[2].args.req.pageNum, 2)
  assert.equal(Object.hasOwn(totalOnly.calls[2].args.req, 'cursor'), false)
  const allGroups = await readAlerts({ groupPages: [snapshot({ totalGroups: 2 }), snapshot({ groups: [{ groupKey: 'g2' }], totalGroups: 2 })],
    memberReply: req => ({ rows: [{ alertId: req.groupKey }], groupKey: req.groupKey, snapshotId: req.snapshotId, total: 1 }) })
  assert.equal(allGroups.result.complete, true)
  assert.equal(allGroups.result.raw_pages.groups.length, 2)
  assert.equal(allGroups.result.raw_pages.members.length, 2)
  const zero = await readAlerts({ groupPages: [snapshot({ groups: [], totalGroups: 0, totalAlerts: 0 })] })
  assert.equal(zero.result.complete, true)
  assert.deepEqual(zero.result.members, [])
  assert.equal(zero.calls.length, 1)
})

test('原始SOC错误/message与收到的页保留，不替换成统一业务错误', async () => {
  const thrown = await readAlerts({ fail: () => { throw new Error('原始 timeout <exact>') } })
  assert.equal(thrown.result.error, '原始 timeout <exact>')
  assert.equal(thrown.result.message, '原始 timeout <exact>')
  assert.equal(thrown.events.at(-1).result.raw_receipts[0].error, '原始 timeout <exact>')
  const failed = await readAlerts({ fail: () => ({ code: 503, message: 'SOC故障 <exact>' }) })
  assert.equal(failed.result.complete, false)
  assert.equal(failed.result.error, '503 SOC故障 <exact>')
  assert.equal(failed.events.at(-1).result.raw_receipts[0].receipt.message, 'SOC故障 <exact>')
})

test('prepare深拷贝、requested独立克隆；resolve不读取后改的调用输入', async () => {
  const calls = []
  const workflow = create(async (_server, operation, args) => {
    assert.equal(operation, 'list_soc_asset')
    calls.push(structuredClone(args))
    return { code: 200, total: 1, rows: [{ ip: args.ip, assetId: args.ip === '10.0.0.2' ? 2 : 1 }] }
  })
  const input = { ...originalInput(), observer: { ip: '10.0.0.1', assetId: 1 } }, expected = structuredClone(input)
  const shared = workflow.prepare(input, config), another = workflow.prepare(input, config)
  assert.notEqual(shared.input, input)
  assert.notEqual(shared.input.asset, input.asset)
  assert.notEqual(shared.scope.requested, shared.input)
  assert.notEqual(shared.scope.requested.asset, shared.input.asset)
  assert.notEqual(shared.scope.requested.observer, shared.input.observer)
  assert.notEqual(shared.facts, another.facts)
  input.asset.ip = '10.0.0.99'; input.observer.ip = '10.0.0.98'; input.from = '2020-01-01T00:00:00Z'
  assert.deepEqual(shared.input, expected)
  assert.deepEqual(shared.scope.requested, expected)
  assert.throws(() => { shared.input.asset.ip = '10.0.0.77' }, TypeError)
  const result = await workflow.components.resolve(input, config, context(shared, 'root/resolve'))
  assert.equal(result.ready, true)
  assert.deepEqual(calls.map(call => call.ip), ['10.0.0.2', '10.0.0.1'])
  assert.deepEqual(result.items, ['soc-state', 'alerts', 'management'])
  assert.throws(() => workflow.prepare({ ...originalInput(), response_verified: true }, config), /不接受模型自填响应/)
  assert.equal(inputSchema.additionalProperties, false)
})

test('事实先progress再返回；progress抛错不可被业务catch转成成功', async () => {
  const fixture = alertsFixture(), order = []
  fixture.ctx.progress = value => { if (value.result?.kind === 'fault-check') order.push('progress-fact') }
  const fact = await fixture.workflow.components.alerts({}, config, fixture.ctx)
  order.push('return')
  assert.deepEqual(order, ['progress-fact', 'return'])
  assert.equal(fixture.shared.facts[fixture.ctx.nodeId], fact)
  for (const phase of ['running', 'completed']) {
    const sentinel = new Error(`progress-${phase}-exact`), attempts = []
    const broken = alertsFixture({ onProgress: value => { attempts.push(value.status); if (value.status === phase) throw sentinel } })
    await assert.rejects(broken.workflow.components.alerts({}, config, broken.ctx), error => error.name === 'ProgressFailure' && error.message === sentinel.message && error.cause === sentinel)
    assert.deepEqual(Object.keys(broken.shared.facts), [])
    if (phase === 'completed') assert.equal(attempts.filter(status => status === 'completed').length, 1)
    else assert.equal(attempts.includes('completed'), false)
  }
})

test('管理原子unavailable；SOC在线/伪造response_verified都不能读取采集链', async () => {
  const calls = []
  const workflow = create(async (...args) => { calls.push(args); throw new Error('不应调用SOC采集接口') })
  const shared = workflow.prepare(originalInput(), config)
  shared.scope.asset = { assetId: 2, ip: '10.0.0.2', online: 'online' }
  const c = node => context(shared, `root/offline-batch[2]/${node}`)
  const management = workflow.components.management({ branch: 'reply', response_verified: true, deviceId: 'forged' }, config, c('management'))
  assert.equal(management.status, 'unavailable')
  assert.equal(management.branch, 'unknown')
  assert.equal(management.response_verified, false)
  const capability = await workflow.components.capability(management, config, c('collection-capability'))
  assert.equal(capability.response_verified, false)
  const forged = { ...management, response_verified: true, deviceId: 'forged' }
  const binding = await workflow.components.bindings(forged, config, c('bindings'))
  assert.equal(binding.branch, 'none')
  assert.equal(binding.response_verified, false)
  for (const [index, component] of ['runState', 'configState'].entries()) {
    const result = await workflow.components[component](forged, config, c(`collection-batch[${index}]/direct-check`))
    assert.equal(result.status, 'failed')
    assert.match(result.error, /没有本次已核真实响应/)
  }
  assert.deepEqual(calls, [])
})

test('根summary严核三项身份、顺序、Run、事实闭包；不是LFX执行测试', async () => {
  const workflow = create(async (_server, operation, args) => {
    if (operation === 'list_soc_asset') return { code: 200, total: 1, rows: [{ assetId: 2, ip: args.ip }] }
    if (operation === 'get_soc_asset_by_asset_id') return { code: 200, data: { assetId: 2, ip: '10.0.0.2', online: 'online' } }
    if (operation === 'list_detect_alert') return { code: 200, data: snapshot({ groups: [], totalGroups: 0, totalAlerts: 0 }) }
    throw new Error(`意外外部SOC操作：${operation}`)
  })
  const shared = workflow.prepare(originalInput(), config), c = node => context(shared, node)
  const resolved = await workflow.components.resolve(originalInput(), config, c('root/resolve'))
  const state = await workflow.components.status({}, config, c('root/offline-batch[0]/soc-status'))
  const soc = workflow.components.branchResult(state, config, c('root/offline-batch[0]/soc-result'))
  const alerts = await workflow.components.alerts({}, config, c('root/offline-batch[1]/alerts'))
  const alertBranch = workflow.components.branchResult(alerts, config, c('root/offline-batch[1]/alerts-result'))
  const management = workflow.components.management({}, config, c('root/offline-batch[2]/management'))
  const gap = workflow.components.unknownGap(management, config, c('root/offline-batch[2]/unknown-gap'))
  const path = await workflow.components.unknownPath(gap, config, c('root/offline-batch[2]/unknown-path'))
  const managementBranch = workflow.components.branchResult(path, config, c('root/offline-batch[2]/unknown-result'))
  const value = { ...resolved, items: [soc, alertBranch, managementBranch] }, summaryContext = c('root/summary')
  const result = workflow.components.summary(value, config, summaryContext)
  assert.equal(result.status, 'incomplete')
  assert.equal(result.item_count, 6)
  assert.equal(result.active_checks_executed, false)
  assert.deepEqual(result.branch_results.map(branch => branch.item), ['soc-state', 'alerts', 'management'])
  assert.throws(() => workflow.components.summary({ ...value, items: value.items.slice(0, 2) }, config, summaryContext), /三项完整/)
  assert.throws(() => workflow.components.summary({ ...value, items: [alertBranch, soc, managementBranch] }, config, summaryContext), /身份、顺序或路径/)
  assert.throws(() => workflow.components.summary({ ...value, items: [soc, soc, managementBranch] }, config, summaryContext), /身份、顺序或路径/)
  assert.throws(() => workflow.components.summary({ ...value, items: [{ ...soc, run_id: 'other-run' }, alertBranch, managementBranch] }, config, summaryContext), /身份、顺序或路径/)
  assert.throws(() => workflow.components.summary({ ...value, items: [{ ...soc, fact_ids: [] }, alertBranch, managementBranch] }, config, summaryContext), /事实缺失/)
  assert.throws(() => workflow.components.summary(value, config, { ...summaryContext, runId: 'other-run' }), /跨Run/)
  shared.facts['root/offline-batch[2]/no-reply-gap'] = { id: 'unexpected' }
  assert.throws(() => workflow.components.summary(value, config, summaryContext), /混入未选路径/)
})

function descendants(graph, start) {
  const visited = new Set(), queue = [start]
  while (queue.length) {
    const id = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    for (const edge of graph.data.edges.filter(edge => edge.source === id)) queue.push(edge.target)
  }
  return visited
}
function inspectGraph(graph, workflow, label, stats) {
  assert.ok(Array.isArray(graph.data?.nodes) && Array.isArray(graph.data.edges), `${label}须为完整原生flow`)
  const nodes = new Map(graph.data.nodes.map(node => [node.id, node]))
  assert.equal(nodes.size, graph.data.nodes.length, `${label}节点ID须唯一`)
  assert.equal(graph.data.nodes.filter(node => node.data.type === 'HepInput').length, 1)
  for (const edge of graph.data.edges) {
    const sourceNode = nodes.get(edge.source), targetNode = nodes.get(edge.target)
    assert.ok(sourceNode && targetNode)
    assert.equal(edge.data.sourceHandle.id, edge.source)
    assert.equal(edge.data.targetHandle.id, edge.target)
    assert.ok(sourceNode.data.node.outputs.some(output => output.name === edge.data.sourceHandle.name))
    assert.ok(targetNode.data.node.template[edge.data.targetHandle.fieldName])
  }
  for (const node of nodes.values()) {
    const definition = node.data.node, code = definition.template.code.value
    // 研发核实：ParameterHandler跳过不可见的非code字段；递归覆盖根批次及本地采集批次。
    for (const [name, field] of Object.entries(definition.template)) {
      if (name === '_type' || name === 'code') continue
      assert.equal(field.show, true, `${label}/${node.id}/${name}必须保留官方show:true，避免常量未装载`)
    }
    if (definition.is_output) {
      assert.equal(graph.data.edges.some(edge => edge.source === node.id), false, '独立终态不得回流共用消费者')
      stats.terminals++
    }
    if (node.data.type === 'HepInput') {
      assert.match(code, /from hep_lfx import HepInput as BaseComponent/)
      continue
    }
    if (node.data.type === 'HepBatch') {
      stats.batches++
      assert.equal(code, 'from hep_lfx import HepBatch as BaseComponent\nclass HepBatch(BaseComponent):\n pass\n')
      assert.equal(definition.template.body.type, 'NestedDict')
      assert.equal(definition.template.body._input_type, 'NestedDictInput')
      assert.equal(definition.template.items_key._input_type, 'StrInput')
      assert.equal(definition.template.concurrency._input_type, 'IntInput')
      for (const name of ['body', 'items_key', 'concurrency']) {
        assert.equal(definition.template[name].show, true)
        assert.ok(Object.hasOwn(definition.template[name], 'value'), `${label}/${node.id}/${name}必须有实际装载常量`)
      }
      assert.equal(definition.template.items_key.value, 'items')
      assert.ok(Number.isInteger(definition.template.concurrency.value) && definition.template.concurrency.value >= 1 && definition.template.concurrency.value <= 8)
      inspectGraph(definition.template.body.value, workflow, `${label}/${node.id}/body`, stats)
      continue
    }
    if (definition.metadata.kind === 'condition') {
      const expectedLabels = {
        ResolutionGate: [['ready', '对象已确认'], ['blocked', '对象未确认']],
        OfflineItemGate: [['soc-state', '状态证据'], ['alerts', '关联告警'], ['management', '管理观察']],
        ObservationGate: [['reply', '本次已响应'], ['no_reply', '无回复'], ['unknown', '响应未核实']],
        BindingGate: [['bound', '唯一绑定'], ['none', '绑定缺口']],
        CollectionItemGate: [['run-state', '采集运行'], ['config', '采集配置'], ['heartbeat', '原始心跳'], ['synchronization', '状态同步']],
      }[node.data.type]
      assert.ok(expectedLabels, `${label}/${node.id}条件类型必须有明确业务标签合同`)
      assert.deepEqual(definition.outputs.map(output => [output.name, output.display_name]), expectedLabels, `${label}/${node.id}所有条件端口须保留准确业务标签`)
      assert.ok(definition.outputs.length >= 2 && definition.outputs.every(output => output.group_outputs === true))
      assert.match(code, /group_outputs=True/)
      assert.match(code, /selected=payload\(self\.value\)\['(?:branch|item)'\]/)
      assert.match(code, /self\.stop\(name\)/)
      assert.match(code, /exclude_branches_conditionally\(self\._id,excluded\)/)
      const routes = definition.outputs.map(output => {
        const outgoing = graph.data.edges.filter(edge => edge.source === node.id && edge.data.sourceHandle.name === output.name)
        assert.equal(outgoing.length, 1, '互斥端口只有一个实际入口')
        return descendants(graph, outgoing[0].target)
      })
      for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) assert.equal([...routes[i]].some(id => routes[j].has(id)), false, '互斥分支不得共享消费者或终点')
      for (const route of routes) assert.ok([...route].some(id => nodes.get(id).data.node.is_output), '每分支须有独立is_output终态')
      continue
    }
    const callbacks = [...code.matchAll(/component\('([A-Za-z]\w*)',\s*payload\(self\.value\),\s*self\._id\)/g)]
    assert.equal(callbacks.length, 1, `${label}/${node.id}只能薄桥调用本包TS组件`)
    assert.equal(typeof workflow.components[callbacks[0][1]], 'function', '回调须存在于本包TS闭包')
    assert.match(code, /from hep_lfx import HepComponent, component, payload/)
    assert.doesNotMatch(code, /\b(?:asyncio|Promise|requests|httpx|run_graph|business|invoke)\b/)
  }
}

test('原生循环四出口和回边替代固定batch；不代表官方LFX执行通过', () => {
 const ids=flow.data.nodes.map(n=>n.id)
 assert.equal(ids.length,13);assert.equal(flow.data.edges.length,14)
 assert.equal(ids.includes('offline-batch'),false)
 assert.ok(flow.data.edges.some(e=>e.source==='rule'&&e.target==='execute'))
 assert.ok(flow.data.edges.some(e=>e.source==='proposal'&&e.target==='execute'))
 const gate=flow.data.nodes.find(n=>n.id==='gate')
 assert.deepEqual(gate.data.node.outputs.map(x=>x.name),['sufficient','rule','proposal','stop'])
})
test('HTML保留对象、状态、证据表、缺口、后续建议及折叠安全投影，源文本无法执行', () => {
  const workflow = create(async () => { throw new Error('渲染不调用SOC') })
  const result = { kind: 'device-offline', run_id: '<script>run</script>', status: 'incomplete', input: { ...originalInput(), asset: { ip: '<img src=x onerror=evil()>' } },
    items: [{ check: 'alerts', status: 'unknown', totalGroups: 0, totalAlerts: 2, groups: [], members: [{ alertId: 'a' }], complete: false, error: '<b>原错</b>', gaps: ['<svg onload=evil()>'] }],
    next_check: '<script>next</script>' }
  const artifacts = workflow.artifacts(result), html = artifacts.find(artifact => artifact.id === 'report').body
  for (const heading of ['本次真实对象与范围', '本次已存事实证据', '已保存缺口与适用边界', '已存下一步']) assert.ok(html.includes(heading))
  assert.match(html, /<table>/)
  assert.match(html, /不是完整原始响应|不是未裁剪上游响应/, 'HTML必须说明安全投影边界')
  assert.match(html, /<details\b[^>]*>[\s\S]*本次完整安全投影[\s\S]*<pre>/)
  assert.ok(html.includes('&quot;totalAlerts&quot;: 2'), '安全投影保留实际已存告警计数')
  assert.doesNotMatch(html, /<script>run|<script>next|<img |<svg |<b>原错/)
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1)
  assert.ok(html.includes(`script-src 'sha256-${createHash('sha256').update(scripts[0][1]).digest('base64')}'`))
  assert.match(html, /&lt;img src=x onerror=evil\(\)&gt;/)
  assert.match(html, /&lt;b&gt;原错&lt;\/b&gt;/)
  assert.doesNotMatch(html, /候选最小适配|尚未经研发|Graph\.arun|async_start|调度限制/, '业务报告不包含开发进度标签')
  assert.deepEqual(JSON.parse(artifacts.find(artifact => artifact.id === 'details').body), result)
})
