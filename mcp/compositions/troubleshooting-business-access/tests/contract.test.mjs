import assert from 'node:assert/strict'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

// 仅研发执行本文件时编译；复用已安装程序的 esbuild，不安装依赖、不写编译产物。
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const programRoot = process.env.HARNESS_PROGRAM_ROOT
assert.ok(programRoot && isAbsolute(programRoot), '请将 HARNESS_PROGRAM_ROOT 设为实际已安装程序根的绝对路径')
const require = createRequire(join(programRoot, 'platform/plugin/package.json'))
const { build } = require('esbuild')
const compiled = await build({ absWorkingDir: packageRoot, entryPoints: [join(packageRoot, 'src/index.ts')], bundle: true, format: 'esm', platform: 'node', write: false, metafile: true, logLevel: 'silent' })
const { branchItems, create } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const flow = JSON.parse(await readFile(join(packageRoot, 'flow.json'), 'utf8'))
const expectedBranches = ['source-state', 'target-state', 'source-alerts', 'target-alerts', 'path', 'tcp']
const config = { connections: { master: 'mock-master', detect: 'mock-detect', graph: 'mock-graph' } }
const hostname = `<img src=x onerror="alert('host')">&'host`
const message = `</td><script>alert("message")</script>&'message`
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const input = () => ({ source: { ip: '192.0.2.10', assetId: 10 }, target: { ip: '192.0.2.20', assetId: 20 }, protocol: 'tcp', port: 443, from: '2026-11-01T00:00:00Z', to: '2026-11-01T01:00:00Z' })

function fixture({ failState = false, ambiguous = false } = {}) {
  const events = [], requests = [], signal = new AbortController().signal
  const assets = [
    { assetId: 10, ip: '192.0.2.10', hostname, online: 'online', stateEvidence: { signals: [] } },
    { assetId: 20, ip: '192.0.2.20', hostname: 'target', online: 'unknown', stateEvidence: { signals: [] } },
  ]
  let callDepth = 0
  const soc = async (connection, operation, args, requestSignal) => {
    assert.ok(callDepth > 0, '每个 SOC 请求必须经过 context.call')
    assert.ok(requestSignal instanceof AbortSignal)
    assert.notEqual(requestSignal, signal, '请求必须另有单次 timeout 边界')
    requests.push({ connection, operation, args: structuredClone(args) })
    switch (operation) {
      case 'list_soc_asset': {
        assert.equal(connection, config.connections.master)
        const matches = assets.filter(asset => asset.ip === args.ip)
        if (ambiguous && args.ip === assets[0].ip) matches.push({ ...assets[0], assetId: 11 })
        return { code: 200, rows: matches, total: matches.length }
      }
      case 'get_soc_asset_by_asset_id':
        assert.equal(connection, config.connections.master)
        if (failState && args.assetId === 10) throw new Error(message)
        return { code: 200, data: assets.find(asset => asset.assetId === args.assetId) }
      case 'list_detect_alert':
        assert.equal(connection, config.connections.detect)
        return { code: 200, data: { groups: [{ groupKey: 'mock-group' }], totalGroups: 1, totalAlerts: 1, truncated: false, snapshotId: `mock-${args.req.assetId}`, asOf: '2026-11-01T01:00:00Z' } }
      case 'get_detect_alert_group_members':
        assert.equal(connection, config.connections.detect)
        return { code: 200, data: { items: [{ alertId: `mock-${args.req.assetId}`, message }], total: 1, nextCursor: null, truncated: false, snapshotId: args.req.snapshotId, groupKey: args.req.groupKey } }
      case 'get_graph_path_query':
        assert.equal(connection, config.connections.graph)
        return { code: 200, data: { diagnosis: { sourceIp: args.srcIp, targetIp: args.dstIp, port: args.port, protocol: args.protocol, portEvaluated: true, verdict: 'UNKNOWN' } } }
      default:
        assert.fail(`Mock 禁止未声明的接口（包括任何主动接口）：${operation}`)
    }
  }
  soc.fingerprint = connection => `mock-fingerprint:${connection}`
  const workflow = create(soc)
  const shared = workflow.prepare(input(), config, signal)
  const context = nodeId => ({ runId: 'mock-contract-run', nodeId, signal, shared,
    progress(value) { events.push({ type: 'progress', nodeId, value: structuredClone(value) }) },
    async call(call) { callDepth++; try { return await call() } finally { callDepth-- } },
  })
  const invoke = async (name, value, nodeId) => {
    const result = await workflow.components[name](value, config, context(nodeId))
    events.push({ type: 'return', nodeId })
    return result
  }
  return { workflow, shared, context, invoke, requests, events }
}

async function readonlyRun(options) {
  const state = fixture(options)
  assert.equal((await state.invoke('resolve', input(), 'resolve')).ready, true)
  const components = ['sourceState', 'targetState', 'sourceAlerts', 'targetAlerts', 'path', 'sourceTcp']
  const results = []
  for (const [index, branch] of expectedBranches.entries()) {
    const value = await state.invoke(components[index], {}, `batch[${index}]/${components[index]}`)
    const terminalValue = branch === 'tcp' ? await state.invoke('unavailable', value, `batch[${index}]/unavailable`) : value
    results.push(await state.invoke('branchResult', { branch, value: terminalValue }, `batch[${index}]/terminal`))
  }
  const report = await state.invoke('summary', { items: results }, 'summary')
  return { ...state, results, report }
}

test('固定冻结六项；resolve 不接受 caller 扩大分支或资产范围', async () => {
  assert.equal(Object.isFrozen(branchItems), true)
  assert.deepEqual([...branchItems], expectedBranches)
  assert.throws(() => branchItems.push('all'), TypeError)
  const state = fixture()
  const request = { ...input(), source: { ip: '203.0.113.1', assetId: 999 }, target: { ip: '203.0.113.2', assetId: 998 }, items: [...expectedBranches, 'all'], scope: { all: true, assetIds: [999, 998] } }
  const result = await state.invoke('resolve', request, 'resolve')
  assert.deepEqual(result, { ready: true, items: expectedBranches })
  assert.notEqual(result.items, branchItems)
  assert.deepEqual(state.requests.map(request => request.args.ip), [input().source.ip, input().target.ip])
  assert.deepEqual(state.shared.scope.source, input().source)
  assert.deepEqual(state.shared.scope.target, input().target)
  result.items.push('caller-added')
  const next = fixture()
  assert.deepEqual((await next.invoke('resolve', request, 'resolve')).items, expectedBranches)
  assert.deepEqual([...branchItems], expectedBranches)
  const blocked = fixture({ ambiguous: true })
  assert.equal((await blocked.invoke('resolve', input(), 'resolve')).ready, false)
  assert.equal(blocked.requests.length, 1, '身份失败后不继续目标或其他取证')
})

test('prepare 仅校验并初始化；caller 深改及 shared.input 修改均不污染 requested', async () => {
  const state = fixture(), caller = input(), original = structuredClone(caller)
  const shared = await state.workflow.prepare(caller, config, state.context('prepare').signal)
  assert.equal(state.requests.length, 0)
  assert.deepEqual(shared.input, original)
  assert.deepEqual(shared.scope.requested, original)
  assert.notEqual(shared.input.source, caller.source)
  assert.notEqual(shared.scope.requested.source, shared.input.source)
  caller.source.ip = '203.0.113.1'; caller.target.assetId = 999; caller.port = 22
  assert.deepEqual(shared.input, original)
  assert.deepEqual(shared.scope.requested, original)
  shared.input.target.ip = '203.0.113.2'
  assert.deepEqual(shared.scope.requested, original)
  assert.deepEqual(shared.assets, {})
  assert.deepEqual(shared.facts, {})
  assert.deepEqual(shared.receipts, {})
  for (const change of [{ source: { ip: 'not-an-ip' } }, { port: 0 }, { protocol: 'http' }, { from: '2026-11-01T00:00:00' }, { to: original.from }]) {
    await assert.rejects(async () => state.workflow.prepare({ ...input(), ...change }, config))
  }
  assert.equal(state.requests.length, 0)
})

test('只读 Mock 均走 context.call 和单次30秒 timeout；事实 progress 先于返回且 batch ID 不冲突', async t => {
  let timeouts = 0
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 30_000)
    timeouts++
    return new AbortController().signal
  })
  const state = await readonlyRun()
  assert.equal(timeouts, state.requests.length)
  assert.equal(state.requests.length, 9, '两次解析、两次状态、两组告警及成员、一次路径')
  for (const fact of Object.values(state.shared.facts)) {
    const persisted = state.events.findIndex(event => event.type === 'progress' && event.nodeId === fact.id && event.value.result?.kind === 'fault-check' && event.value.result.items.some(item => item.id === fact.id))
    const returned = state.events.findIndex(event => event.type === 'return' && event.nodeId === fact.id)
    assert.ok(persisted >= 0 && returned > persisted, `事实 ${fact.id} 必须先 progress 后 return`)
  }
  const first = await state.invoke('sourceTcp', {}, 'batch[6]/same-local-id')
  const second = await state.invoke('sourceTcp', {}, 'batch[7]/same-local-id')
  assert.notEqual(first.fact.id, second.fact.id)
  assert.ok(state.shared.facts['batch[6]/same-local-id'])
  assert.ok(state.shared.facts['batch[7]/same-local-id'])
  assert.equal(state.report.active_checks_executed, false)
  assert.equal(state.report.item_count, state.report.items.length)
  assert.ok(state.report.items.length > 0)
})

test('sourceTcp 固定 UNKNOWN，零 SOC/主动调用并保存未执行事实', async () => {
  const state = fixture()
  const result = await state.invoke('sourceTcp', {}, 'batch[5]/source-tcp')
  assert.equal(result.route, 'UNKNOWN')
  assert.equal(result.fact.executed, false)
  assert.equal(result.fact.status, 'unavailable')
  assert.equal(state.requests.length, 0)
  assert.deepEqual(state.shared.facts[result.fact.id], result.fact)
})

test('事实 progress 失败时不得返回结果或提前写 shared.facts', async () => {
  const state = fixture(), context = state.context('batch[5]/persist-failed')
  context.progress = () => { throw new Error('mock-persist-failed') }
  await assert.rejects(async () => state.workflow.components.sourceTcp({}, config, context), /mock-persist-failed/)
  assert.equal(Object.hasOwn(state.shared.facts, context.nodeId), false)
  assert.equal(state.requests.length, 0)
})

test('branchResult 原样包裹各分支输出；summary 严格拒绝漏项、重复、错序', async () => {
  const state = await readonlyRun()
  for (const [index, value] of [null, 17, 'text', [1, { nested: true }], { nested: { value: 'opaque' } }, { route: 'UNKNOWN' }].entries()) {
    const nodeId = `batch[${index}]/opaque-terminal`
    assert.deepEqual(await state.invoke('branchResult', { branch: expectedBranches[index], value }, nodeId), { branch: expectedBranches[index], terminal: nodeId, value })
  }
  for (const items of [state.results.slice(0, -1), [...state.results.slice(0, -1), state.results[0]], [state.results[1], state.results[0], ...state.results.slice(2)]]) {
    await assert.rejects(async () => state.workflow.components.summary({ items }, config, state.context('bad-summary')))
  }
  assert.equal(state.report.kind, 'business-access')
  assert.equal(state.report.status, 'incomplete')
  assert.deepEqual(state.report.scope.requested, input())
  assert.deepEqual(state.report.input, input())
  assert.ok(Array.isArray(state.report.raw_receipts) && state.report.raw_receipts.length === state.requests.length)
  assert.ok(Array.isArray(state.report.gaps) && state.report.gaps.length > 0)
})

// 只检查同一原生资产的静态节点/端口/闭包，不实现调度器或执行另一套图。
const code = node => node.data.node.template.code?.value ?? ''
const outputs = node => node.data.node.outputs.map(output => output.name)
const expectedConditionLabels = {
  'identity-gate': { go: '对象已确认', blocked: '对象未确认' },
  'item-gate': { source_state: '源SOC状态', target_state: '目标SOC状态', source_alerts: '源关联告警', target_alerts: '目标关联告警', path: '配置路径', tcp: 'TCP结果' },
  'tcp-gate': { OPEN: 'TCP已连接', REFUSED: '连接被拒绝', TIMEOUT: '连接超时', UNKNOWN: '连接结果未知' },
}
const callbacks = node => [...code(node).matchAll(/\bcomponent\(['"]([^'"]+)['"]/g)].map(match => match[1])
const callbackNode = (graph, name) => {
  const matches = graph.nodes.filter(node => callbacks(node).includes(name))
  assert.equal(matches.length, 1, `${name} 应有唯一原生节点`)
  return matches[0]
}
const outgoing = (graph, id, port) => graph.edges.filter(edge => edge.source === id && (port === undefined || edge.data.sourceHandle.name === port))
const incoming = (graph, id) => graph.edges.filter(edge => edge.target === id)
function downstream(graph, id, found = new Set()) {
  if (found.has(id)) return found
  found.add(id)
  for (const edge of outgoing(graph, id)) downstream(graph, edge.target, found)
  return found
}
function nativeGraph(document) {
  assert.ok(document && !Array.isArray(document) && document.data)
  const graph = document.data
  assert.ok(Array.isArray(graph.nodes) && graph.nodes.length > 0)
  assert.ok(Array.isArray(graph.edges))
  for (const object of [document, graph]) for (const key of ['steps', 'graph', 'graphs', 'dsl', 'children']) assert.equal(Object.hasOwn(object, key), false, `不允许另一图 DSL：${key}`)
  const nodes = new Map(graph.nodes.map(node => [node.id, node]))
  assert.equal(nodes.size, graph.nodes.length, '原生节点 ID 不得重复')
  const edgeKeys = new Set()
  for (const node of graph.nodes) {
    assert.equal(node.type, 'genericNode')
    assert.equal(node.data.id, node.id)
    assert.notEqual(node.data.type, 'HepChild')
    assert.ok(code(node), `${node.id} 缺少包内原生组件代码`)
    assert.ok(node.data.node.template && Array.isArray(node.data.node.outputs))
    if (node.data.node.metadata?.kind === 'condition' || node.data.node.outputs.some(output => output.group_outputs === true)) {
      assert.ok(Object.hasOwn(expectedConditionLabels, node.id), `条件 ${node.id} 缺少准确中文标签回归`)
      assert.deepEqual(Object.fromEntries(node.data.node.outputs.map(output => [output.name, output.display_name])), expectedConditionLabels[node.id], `${node.id} 必须按真实端口映射准确中文分支标签`)
    }
    assert.equal(Object.hasOwn(node.data.node.template, 'composition_id'), false, '不通过隐藏模板引用另一组合')
    // 研发核实：ParameterHandler会跳过show缺失/false的非code字段；静态存在value不等于被装载。
    for (const [name, field] of Object.entries(node.data.node.template)) {
      if (name === '_type' || name === 'code') continue
      assert.equal(field.show, true, `${node.id}.${name}必须保留官方show:true，避免常量未装载`)
    }
    for (const match of code(node).matchAll(/^\s*(?:from\s+([.\w]+)\s+import\b|import\s+([.\w]+))/gm)) {
      assert.ok(['hep_lfx', 'lfx'].includes((match[1] ?? match[2]).split('.')[0]), 'Python 桥仅引用已声明的公开原生模块')
    }
    for (const name of callbacks(node)) assert.equal(typeof create(async () => assert.fail('静态检查不调用 SOC')).components[name], 'function', `未知 TS 回调 ${name}`)
  }
  for (const edge of graph.edges) {
    assert.ok(nodes.has(edge.source) && nodes.has(edge.target), '边必须闭合在本图节点集合内')
    assert.equal(edge.data.sourceHandle.id, edge.source)
    assert.equal(edge.data.targetHandle.id, edge.target)
    assert.ok(outputs(nodes.get(edge.source)).includes(edge.data.sourceHandle.name), '边的源输出端口必须存在')
    assert.ok(Object.hasOwn(nodes.get(edge.target).data.node.template, edge.data.targetHandle.fieldName), '边的目标输入端口必须存在')
    const key = JSON.stringify([edge.source, edge.data.sourceHandle.name, edge.target, edge.data.targetHandle.fieldName])
    assert.equal(edgeKeys.has(key), false, '不得重复连线')
    edgeKeys.add(key)
  }
  return graph
}
function condition(node, ports) {
  assert.deepEqual(outputs(node).sort(), [...ports].sort())
  assert.ok(node.data.node.outputs.every(output => output.group_outputs === true))
  assert.match(code(node), /self\.stop\(/)
  assert.match(code(node), /self\.graph\.exclude_branches_conditionally\(/)
}
const edgeSignature = edge => [edge.source, edge.data.sourceHandle.name, edge.target, edge.data.targetHandle.fieldName].join(':')
const nativeBody = () => {
  const batch = flow.data.nodes.filter(node => node.data.type === 'HepBatch')
  assert.equal(batch.length, 1, '根图必须有且仅有一个 HepBatch')
  return { batch: batch[0], body: nativeGraph(batch[0].data.node.template.body.value) }
}

test('根图只由 Input→resolve→identity gate→blocked 或 HepBatch→summary 组成；body 为原生图', () => {
  const root = nativeGraph(flow), { batch, body } = nativeBody()
  const inputs = root.nodes.filter(node => node.data.type === 'HepInput')
  assert.equal(inputs.length, 1)
  const resolveNode = callbackNode(root, 'resolve'), blocked = callbackNode(root, 'blockedResult'), summary = callbackNode(root, 'summary')
  const gates = root.nodes.filter(node => node !== inputs[0] && node !== resolveNode && node !== blocked && node !== batch && node !== summary)
  assert.equal(root.nodes.length, 6)
  assert.equal(gates.length, 1)
  assert.equal(batch.data.node.display_name, '连接证据检查')
  const gate = gates[0]
  condition(gate, ['go', 'blocked'])
  assert.match(code(gate), /selected\s*=\s*['"]go['"]\s+if\s+payload\(self\.value\)\.get\(['"]ready['"]\)\s+is\s+True\s+else\s+['"]blocked['"]/)
  assert.equal(batch.data.node.template.body.type, 'NestedDict')
  assert.equal(batch.data.node.template.body._input_type, 'NestedDictInput')
  assert.equal(batch.data.node.template.items_key._input_type, 'StrInput')
  assert.equal(batch.data.node.template.concurrency._input_type, 'IntInput')
  for (const name of ['body', 'items_key', 'concurrency']) {
    assert.equal(batch.data.node.template[name].show, true)
    assert.ok(Object.hasOwn(batch.data.node.template[name], 'value'), `${name}必须有实际装载常量`)
  }
  assert.equal(batch.data.node.template.items_key.value, 'items')
  const concurrency = batch.data.node.template.concurrency.value
  assert.ok(Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= expectedBranches.length)
  const expected = [[inputs[0], 'result', resolveNode], [resolveNode, 'result', gate], [gate, 'blocked', blocked], [gate, 'go', batch], [batch, 'result', summary]]
  assert.deepEqual(root.edges.map(edgeSignature).sort(), expected.map(([from, port, to]) => [from.id, port, to.id, 'value'].join(':')).sort())
  assert.deepEqual(root.nodes.filter(node => node.data.node.is_output).map(node => node.id).sort(), [blocked.id, summary.id].sort())
  assert.equal(downstream(root, inputs[0].id).size, root.nodes.length)
  assert.equal(body.nodes.some(node => node.data.type === 'HepBatch' || node.data.type === 'HepChild'), false)
  assert.ok(body.nodes.some(node => node.data.type === 'HepInput'))
})

test('body 六项真实条件各走独立终态；TCP 四出口有实际后继及局部两项汇合', () => {
  const { body } = nativeBody()
  const gate = body.nodes.find(node => outputs(node).length === 6)
  assert.ok(gate, '必须有六路原生条件，不能用不透明执行节点代替')
  const ports = ['source_state', 'target_state', 'source_alerts', 'target_alerts', 'path', 'tcp']
  condition(gate, ports)
  assert.match(code(gate), /item\s*=\s*payload\(self\.value\)\.get\(['"]item['"]\)/)
  assert.match(code(gate), /selected\s*=\s*ports\[item\]/)
  for (const [index, branch] of expectedBranches.entries()) assert.match(code(gate), new RegExp(`['"]${branch}['"]\\s*:\\s*['"]${ports[index]}['"]`), `条件必须将真实 item 映射到对应出口：${branch}`)
  const names = ['sourceState', 'targetState', 'sourceAlerts', 'targetAlerts', 'path', 'sourceTcp']
  const lanes = []
  for (const [index, name] of names.entries()) {
    const entry = callbackNode(body, name), edges = outgoing(body, gate.id, ports[index])
    assert.deepEqual(edges.map(edge => edge.target), [entry.id])
    const lane = downstream(body, entry.id)
    assert.ok(lanes.every(previous => [...lane].every(id => !previous.has(id))), '六个条件分支不能共享消费者或终态')
    lanes.push(lane)
    const terminals = body.nodes.filter(node => lane.has(node.id) && node.data.node.is_output)
    assert.equal(terminals.length, name === 'sourceTcp' ? 4 : 1)
    for (const terminal of terminals) {
      assert.deepEqual(callbacks(terminal), ['branchResult'])
      assert.match(code(terminal), new RegExp(`['"]branch['"]\\s*:\\s*['"]${expectedBranches[index]}['"]`))
      assert.match(code(terminal), /['"]value['"]\s*:/)
      assert.equal(outgoing(body, terminal.id).length, 0)
    }
    if (name !== 'sourceTcp') assert.deepEqual(outgoing(body, entry.id).map(edge => edge.target), [terminals[0].id])
  }
  const sourceTcp = callbackNode(body, 'sourceTcp')
  const tcpEdges = outgoing(body, sourceTcp.id)
  assert.equal(tcpEdges.length, 1)
  const tcpGate = body.nodes.find(node => node.id === tcpEdges[0].target)
  condition(tcpGate, ['OPEN', 'REFUSED', 'TIMEOUT', 'UNKNOWN'])
  assert.match(code(tcpGate), /selected\s*=\s*payload\(self\.value\)\.get\(['"]route['"]/)
  const routeSpecs = { OPEN: ['application'], REFUSED: ['listener', 'service'], TIMEOUT: ['route', 'destination'], UNKNOWN: ['unavailable'] }
  const routeLanes = []
  for (const [port, names] of Object.entries(routeSpecs)) {
    assert.ok(code(tcpGate).includes(port))
    const entryIds = names.map(name => callbackNode(body, name).id)
    assert.deepEqual(outgoing(body, tcpGate.id, port).map(edge => edge.target).sort(), entryIds.sort())
    const lane = new Set(entryIds.flatMap(id => [...downstream(body, id)]))
    assert.ok(routeLanes.every(previous => [...lane].every(id => !previous.has(id))), 'TCP 互斥后继不能共享消费者或终态')
    routeLanes.push(lane)
    assert.equal(body.nodes.filter(node => lane.has(node.id) && node.data.node.is_output).length, 1)
    if (names.length === 2) {
      const joinNode = callbackNode(body, port === 'REFUSED' ? 'refusalJoin' : 'timeoutJoin')
      assert.deepEqual(incoming(body, joinNode.id).map(edge => edge.source).sort(), entryIds)
      assert.equal(joinNode.data.node.template.value.list, true)
      assert.equal(outgoing(body, joinNode.id).length, 1)
      assert.ok(body.nodes.find(node => node.id === outgoing(body, joinNode.id)[0].target).data.node.is_output)
    }
  }
  const bodyInputs = body.nodes.filter(node => node.data.type === 'HepInput')
  assert.equal(bodyInputs.length, 1)
  assert.deepEqual(outgoing(body, bodyInputs[0].id).map(edge => edge.target), [gate.id])
  assert.equal(downstream(body, bodyInputs[0].id).size, body.nodes.length, '不得留下未接入的展示节点')
  assert.equal(body.nodes.filter(node => node.data.node.is_output).length, 9)
})

test('入口编译依赖、原生 TS 入口和包内 Markdown 引用闭包，不读取兄弟组合私有文件', async () => {
  const canonicalRoot = await realpath(packageRoot)
  const sharedApi = await realpath(join(packageRoot, '../../src/action-api.ts'))
  const inside = path => { const part = relative(canonicalRoot, path); return part === '' || part !== '..' && !part.startsWith('../') && !isAbsolute(part) }
  assert.equal(flow.metadata.hep.typescript, 'src/index.ts')
  assert.ok(inside(await realpath(join(packageRoot, flow.metadata.hep.typescript))))
  for (const dependency of Object.keys(compiled.metafile.inputs)) {
    const path = await realpath(resolve(packageRoot, dependency))
    assert.ok(inside(path) || path === sharedApi, `不允许未声明的包外编译依赖：${dependency}`)
  }
  async function checkLinks(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'versions' || entry.name === '.local' || entry.name === 'node_modules') continue
      const path = join(directory, entry.name)
      assert.ok(inside(await realpath(path)), `包内资源不能软链到包外：${entry.name}`)
      if (entry.isDirectory()) await checkLinks(path)
      else if (entry.name.endsWith('.md')) {
        const text = await readFile(path, 'utf8')
        for (const match of text.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['"][^)]*)?\s*\)/g)) {
          const target = match[1] ?? match[2]
          if (/^(?:https?:|mailto:|#)/i.test(target)) continue
          const destination = resolve(dirname(path), decodeURIComponent(target.split(/[?#]/)[0]))
          assert.ok(inside(destination) || destination === sharedApi, `文档不可引用包外私有材料：${target}`)
          const canonical = await realpath(destination)
          assert.ok(inside(canonical) || canonical === sharedApi, `引用必须存在且限于包内或已声明公共接口：${target}`)
        }
      }
    }
  }
  await checkLinks(packageRoot)
})

test('HTML 正文含对象/状态/证据/缺口/下一步；raw JSON 收在 details 且恶意源文本被转义', async () => {
  const { workflow, report } = await readonlyRun({ failState: true })
  const artifacts = workflow.artifacts(report)
  const html = artifacts.find(artifact => artifact.id === 'report')
  const details = artifacts.find(artifact => artifact.id === 'details')
  assert.match(html.contentType, /^text\/html/)
  assert.deepEqual(JSON.parse(details.body), JSON.parse(JSON.stringify(report)))
  const folds = [...html.body.matchAll(/<details\b[^>]*>[\s\S]*?<\/details>/gi)].map(match => match[0])
  assert.ok(folds.some(fold => fold.includes(escapeHtml(JSON.stringify(report, null, 2)))), '完整 raw JSON 必须放在折叠 details 中')
  const visible = html.body.replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, '')
  assert.equal(Object.hasOwn(report, 'runtime_validation'), false, '业务运行结果不能硬编码开发验证进度')
  assert.doesNotMatch(visible, /尚待研发|研发运行验证|Graph\.arun|async_start|调度限制/)
  for (const term of [/对象|资产/, /状态/, /证据/, /缺口/, /下一步|后续建议/]) assert.match(visible, term)
  assert.ok(visible.includes(input().source.ip) && visible.includes(input().target.ip))
  assert.equal(report.items.find(item => item.check === 'unique-endpoints').source.hostname, hostname)
  assert.ok(folds.some(fold => fold.includes(escapeHtml(JSON.stringify(hostname)))), '原始 hostname 必须保真并在 details 中转义')
  assert.ok(visible.includes(escapeHtml(message)), '事实 message 必须转义后在正文可见')
  assert.equal(html.body.includes(hostname), false)
  assert.equal(html.body.includes(message), false)
  assert.doesNotMatch(html.body, /<script\b|<img\b/i)
})
