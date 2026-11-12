import assert from 'node:assert/strict'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const programRoot = process.env.HARNESS_PROGRAM_ROOT
assert.ok(programRoot && isAbsolute(programRoot), '请将 HARNESS_PROGRAM_ROOT 设为实际已安装程序根的绝对路径')
const require = createRequire(join(programRoot, 'platform/plugin/package.json'))
const { build } = require('esbuild')
const compiled = await build({ absWorkingDir: packageRoot, entryPoints: [join(packageRoot, 'src/index.ts')], bundle: true, format: 'esm', platform: 'node', write: false, metafile: true, logLevel: 'silent' })
const { branchItems, create } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const flow = JSON.parse(await readFile(join(packageRoot, 'flow.json'), 'utf8'))
const expectedBranches = ['source', 'target', 'path']
const config = { connections: { master: 'mock-master', detect: 'mock-detect', graph: 'mock-graph' } }
const hostname = `<img src=x onerror="alert('host')">&'host`
const message = `</td><script>alert("message")</script>&'message`
const input = (window = true) => ({ source: { ip: '192.0.2.10', assetId: 10 }, target: { ip: '192.0.2.20', assetId: 20 }, protocol: 'tcp', port: 443, ...(window ? { from: '2026-11-01T00:00:00Z', to: '2026-11-01T01:00:00Z' } : {}) })

function fixture({ failOperation, ambiguous = false, request = input(), assetPage } = {}) {
  const events = [], requests = [], signal = new AbortController().signal
  const assets = [
    { assetId: 10, ip: '192.0.2.10', hostname, online: false, stateEvidence: { signals: [{ source: 'heartbeat', observedAt: '2026-11-01T00:30:00Z', validity: 'VALID', supportsOnline: false }] } },
    { assetId: 20, ip: '192.0.2.20', hostname: 'target', online: true, stateEvidence: { signals: [{ source: 'heartbeat', observedAt: '2026-11-01T00:30:00Z', validity: 'VALID', supportsOnline: true }] } },
  ]
  let callDepth = 0
  const soc = async (connection, operation, args, requestSignal) => {
    assert.ok(callDepth > 0, '每个SOC请求必须经过context.call')
    assert.ok(requestSignal instanceof AbortSignal)
    assert.notEqual(requestSignal, signal, '请求必须另有单次timeout边界')
    requests.push({ connection, operation, args: structuredClone(args) })
    if (operation === failOperation) throw new Error(message + ' HTTP 502')
    switch (operation) {
      case 'list_soc_asset': {
        const matches = assets.filter(asset => asset.ip === args.ip)
        if (ambiguous && matches.length) matches.unshift({ ...matches[0], assetId: matches[0].assetId + 1 })
        return assetPage ? assetPage(args, matches) : { code: 200, rows: matches, total: matches.length }
      }
      case 'get_soc_asset_by_asset_id': return { code: 200, data: assets.find(asset => asset.assetId === args.assetId) }
      case 'list_detect_alert': return { code: 200, data: { groups: [], totalGroups: 0, totalAlerts: 0, truncated: false, snapshotId: `mock-${args.req.assetId}`, asOf: '2026-11-01T01:00:00Z' } }
      case 'get_graph_path_query': return { code: 200, data: { diagnosis: { sourceIp: args.srcIp, targetIp: args.dstIp, port: args.port, protocol: args.protocol, portEvaluated: true, verdict: 'UNKNOWN' } } }
      default: assert.fail(`Mock禁止未声明的接口（包括任何主动接口）：${operation}`)
    }
  }
  soc.fingerprint = connection => `mock-fingerprint:${connection}`
  const workflow = create(soc)
  const shared = workflow.prepare(request, config)
  const context = nodeId => ({ runId: 'mock-contract-run', nodeId, signal, shared,
    progress(value) { events.push({ type: 'progress', nodeId, value: structuredClone(value) }) },
    async call(call) { callDepth++; try { return await call() } finally { callDepth-- } },
  })
  const invoke = async (name, value, nodeId) => { const result = await workflow.components[name](value, config, context(nodeId)); events.push({ type: 'return', nodeId }); return result }
  return { workflow, shared, context, invoke, requests, events }
}

async function runKnown(options = {}) {
  const state = fixture(options)
  const resolved = await state.invoke('resolve', input(), 'resolve')
  assert.equal(resolved.ready, true)
  const source = await state.invoke('sourceState', {}, 'source-state')
  const target = await state.invoke('targetState', {}, 'target-state')
  const path = await state.invoke('path', {}, 'path')
  const results = []
  for (const [branch, value] of [['source', source], ['target', target], ['path', path]]) results.push(await state.invoke('branchResult', { branch, value }, `${branch}-terminal`))
  const report = await state.invoke('summary', { items: results }, 'summary')
  return { ...state, results, report }
}

test('冻结三路身份、对象和时间；历史窗口可省略', async () => {
  assert.deepEqual([...branchItems], expectedBranches)
  assert.equal(Object.isFrozen(branchItems), true)
  const state = fixture({ request: input(false) })
  const result = await state.invoke('resolve', input(false), 'resolve')
  assert.equal(result.ready, true)
  assert.equal(state.shared.scope.time.fault_started_at, null)
  assert.equal(state.shared.scope.time.query_window, null)
  assert.deepEqual(state.shared.scope.source, input(false).source)
  assert.throws(() => state.workflow.prepare({ ...input(false), from: '2026-11-01T00:00:00Z' }, config))
  assert.throws(() => state.workflow.prepare({ ...input(false), protocol: 'http' }, config))
})

test('完整分页、明确ID和候选冲突保留；同IP多资产不取首条', async () => {
  const state = fixture({ ambiguous: true, assetPage(args, matches) {
    const padding = Array.from({ length: 99 }, (_, index) => ({ ...matches[0], assetId: 1000 + index }))
    const candidates = [...padding, ...matches]
    return { code: 200, rows: candidates.slice((args.pageNum - 1) * args.pageSize, args.pageNum * args.pageSize), total: candidates.length }
  } })
  const result = await state.invoke('resolve', input(), 'resolve')
  assert.equal(result.ready, true)
  assert.deepEqual(state.shared.assets.source.assetId, 10)
  assert.deepEqual(state.shared.assets.target.assetId, 20)
  const resolveFact = Object.values(state.shared.facts).find(item => item.check === 'unique-endpoints')
  assert.equal(resolveFact.raw_receipt_refs.length, 4)
  const source = await state.invoke('sourceState', {}, 'source-state')
  assert.equal(state.shared.causes.find(item => item.id === 'source-abnormal').status, 'supported')
  assert.equal(source.status, 'unknown')
})

test('对象不唯一或上游读取失败只产生未知事实，不继续假造后继', async () => {
  const ambiguous = fixture({ ambiguous: true, request: { ...input(), source: { ip: '192.0.2.10' } } })
  const blocked = await ambiguous.invoke('resolve', ambiguous.shared.input, 'resolve')
  // 单端歧义不阻断另一端已唯一对象：ready 为部分就绪，歧义侧保留 unknown。
  assert.equal(blocked.ready, true)
  assert.equal(blocked.identity.source, false)
  const ambiguousFact = Object.values(ambiguous.shared.facts).find(item => item.check === 'unique-endpoints')
  assert.equal(ambiguousFact.status, 'partial')
  assert.equal(ambiguous.shared.assets.source, undefined)
  const failed = fixture({ failOperation: 'list_soc_asset' })
  const result = await failed.invoke('resolve', input(), 'resolve')
  const fact = Object.values(failed.shared.facts).find(item => item.check === 'unique-endpoints')
  assert.equal(result.ready, false)
  assert.equal(fact.executed, null)
  assert.equal(fact.execution_status, 'failed')
  assert.equal(fact.raw_receipt_refs.length, 0)
  assert.ok(fact.gaps.some(gap => /HTTP 502|502/.test(String(gap.reason ?? gap))))
})

test('独立状态与路径查询经context.call；不提供窗口时告警不发请求', async t => {
  let timeouts = 0
  t.mock.method(AbortSignal, 'timeout', milliseconds => { assert.equal(milliseconds, 30_000); timeouts++; return new AbortController().signal })
  const state = fixture({ request: input(false) })
  await state.invoke('resolve', input(false), 'resolve')
  await state.invoke('sourceState', {}, 'source-state')
  const alerts = await state.invoke('sourceAlerts', {}, 'source-alerts')
  assert.equal(alerts.status, 'not_checked')
  assert.equal(timeouts, 3)
  assert.equal(state.requests.filter(item => item.operation.includes('alert')).length, 0)
  const tcp = await state.invoke('sourceTcp', {}, 'source-tcp')
  assert.equal(tcp.route, 'UNKNOWN')
  assert.equal(tcp.fact.executed, false)
  assert.equal(state.requests.some(item => /tcp|probe/i.test(item.operation)), false)
})

test('候选六态和轮次报告来自原子评估，不把状态标签当根因确认', async () => {
  const state = await runKnown()
  const sourceCause = state.report.causes.find(item => item.id === 'source-abnormal')
  const targetCause = state.report.causes.find(item => item.id === 'target-offline')
  assert.equal(sourceCause.status, 'supported')
  assert.equal(targetCause.status, 'refuted')
  assert.notEqual(sourceCause.status, 'confirmed')
  assert.ok(state.report.rounds.length >= 3)
  assert.equal(state.report.conclusion, 'inconclusive')
  assert.equal(state.report.active_probes_executed, false)
})

test('汇总只接受三条唯一分支；progress失败不释放事实', async () => {
  const state = await runKnown()
  await assert.rejects(async () => state.workflow.components.summary({ items: state.results.slice(0, 2) }, config, state.context('bad-summary')))
  await assert.rejects(async () => state.workflow.components.summary({ items: [state.results[0], state.results[0], state.results[2]] }, config, state.context('bad-summary-2')))
  const broken = fixture(), context = broken.context('source-tcp')
  context.progress = () => { throw new Error('mock-persist-failed') }
  await assert.rejects(async () => broken.workflow.components.sourceTcp({}, config, context), /mock-persist-failed/)
  assert.equal(Object.hasOwn(broken.shared.facts, context.nodeId), false)
})

test('原生画布显式循环、四条件、独立终态与原子步骤接线', () => {
  const graph = flow.data, nodes = new Map(graph.nodes.map(node => [node.id, node]))
  assert.equal(nodes.size, 13)
  assert.equal(graph.edges.length, 14)
  assert.equal(nodes.has('summary'), false)
  assert.equal(nodes.has('source-gate'), false)
  assert.deepEqual(nodes.get('gate').data.node.outputs.map(output => output.name), ['sufficient', 'rule', 'proposal', 'stop'])
  for (const id of ['rule', 'proposal']) assert.ok(graph.edges.some(edge => edge.source === id && edge.target === 'execute'))
  for (const [source,target] of [['execute','append'],['append','candidates'],['candidates','decision']]) assert.ok(graph.edges.some(edge => edge.source === source && edge.target === target))
  for (const edge of graph.edges) {
    assert.ok(nodes.has(edge.source) && nodes.has(edge.target))
    assert.ok(nodes.get(edge.source).data.node.outputs.some(output => output.name === edge.data.sourceHandle.name))
    assert.ok(nodes.get(edge.target).data.node.template[edge.data.targetHandle.fieldName])
  }
  for (const id of ['execute','append','candidates','decision','gate','rule','proposal']) assert.ok(nodes.get(id).data.node.outputs.every(output => output.allows_loop === true))
})

test('入口依赖只使用包内源码和声明的公共模块', async () => {
  const canonicalRoot = await realpath(packageRoot)
  const shared = new Set(await Promise.all(['action-api.ts', 'diagnostic-context.ts', 'diagnostic-atoms.ts', 'controlled-diagnostic-proposal.ts'].map(name => realpath(join(packageRoot, '../../src', name)))))
  const reports = new Set(await Promise.all(['common.ts', 'troubleshooting.ts', 'conclusion.ts'].map(name => realpath(join(packageRoot, '../../src/reports', name)))))
  const inside = path => { const part = relative(canonicalRoot, path); return part === '' || part !== '..' && !part.startsWith('../') && !isAbsolute(part) }
  assert.equal(flow.metadata.hep.typescript, 'src/index.ts')
  for (const dependency of Object.keys(compiled.metafile.inputs)) {
    const path = await realpath(resolve(packageRoot, dependency))
    assert.ok(inside(path) || shared.has(path) || reports.has(path), `不允许未声明的包外编译依赖：${dependency}`)
  }
  async function checkLinks(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'versions' || entry.name === '.local' || entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      assert.ok(inside(await realpath(path)), `包内资源不能软链到包外：${entry.name}`)
      if (entry.isDirectory()) await checkLinks(path)
    }
  }
  await checkLinks(packageRoot)
})

test('报告和details保留候选、轮次、缺口及安全转义', async () => {
  const { workflow, report } = await runKnown({ failOperation: 'get_soc_asset_by_asset_id' })
  const artifacts = workflow.artifacts(report), html = artifacts.find(item => item.id === 'report'), details = artifacts.find(item => item.id === 'details')
  assert.match(html.contentType, /^text\/html/)
  const parsed = JSON.parse(details.body)
  assert.equal(parsed.run_id, report.run_id)
  assert.ok(Array.isArray(parsed.causes) && Array.isArray(parsed.rounds))
  assert.ok(html.body.includes('本Run逐次事实、候选与下一检查记录'))
  assert.equal(html.body.includes(hostname), false)
  assert.equal(html.body.includes(message), false)
  assert.doesNotMatch(html.body, /<img\b|<svg\b|<script>alert/i)
})
