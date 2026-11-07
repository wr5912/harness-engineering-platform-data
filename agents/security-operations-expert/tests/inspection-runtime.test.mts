import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const program = process.env.HARNESS_PROGRAM_ROOT
assert.ok(program, '请指定配套程序仓库 HARNESS_PROGRAM_ROOT')
process.env.HARNESS_DSH_ENTRY ||= join(program, 'platform/plugin/package.json')
const require = createRequire(join(program, 'platform/plugin/package.json'))
const { formatSpillNotice } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-spill-policy/notice')).href)
const ids = [
  'EXP-security-operations-expert-024-rad80a907c628', 'EXP-security-operations-expert-025-r3f8a8b3da3f1',
  'EXP-security-operations-expert-026-ra06021c8deaf',
]
const directory = await mkdtemp(join(tmpdir(), 'inspection-contract-'))
test.after(() => rm(directory, { recursive: true, force: true }))
const candidate = (id: string) => join(root, 'evolution/experiments', id, 'candidate/dsh/managed')
const input = (selector: any = { kind: 'ALL' }) => ({ taskId: 'actual-template', definitionVersion: 'actual-v3', deviceSelector: selector, businessInputs: { baseline: 'actual-baseline' } })
const ready = (args: any, expired = false) => ({ ...args, preparationId: 'prep-actual', status: 'READY', expiresAt: new Date(Date.now() + (expired ? -1000 : 60000)).toISOString(), deviceSnapshot: [{ id: 'expanded-device' }] })
const agent = (source = 'user', content = '明确执行本次巡检') => ({ id: randomUUID(), session: { header: { delegationDepth: 0 }, snapshotEvents: () => [{ type: 'user/message', data: { id: 'user-real', source: { kind: source }, content: [{ type: 'text', text: content }] } }] } })
const execution = (target = agent()) => ({ agent: target, signal: new AbortController().signal })
const startArgs = { taskId: 'actual-template', definitionVersion: 'actual-v3', preparationId: 'prep-actual' }

const current = 'EXP-security-operations-expert-027-m-reab20c48f610'
const startSchema = { required: ['taskId', 'requestId'], properties: { taskId: {}, requestId: {}, deviceSelector: {}, businessInputs: {}, mode: {} } }

test('当前 EXP027：首次提示词组装前安装直接启动适配，恢复会话与子 Agent 作用域不串用', async () => {
  const runtime = await import(pathToFileURL(join(candidate(current), 'inspection-preparation-runtime.mjs')).href)
  const hooks = new Map<string, any>(), cleanup: any[] = [], scoped = new WeakMap<object, Map<string, any>>()
  const upstream = new Map(['list_executable_inspections', 'start_inspection', 'get_inspection_result'].map(name => [name, {
    name, parameters: name === 'start_inspection' ? structuredClone(startSchema) : { properties: { runId: {} }, required: ['runId'] },
    execute() { assert.fail('装载测试不得调用外部巡检服务') },
  }]))
  const ctx = { on(name: string, hook: any) { hooks.set(name, hook) }, effect(value: any) { cleanup.push(value()) },
    mcpSessionManager: { resolveTool: (_: string, name: string) => name },
    tools: { get(name: string, target: any) { return scoped.get(target)?.get(name) ?? upstream.get(name) } } }
  runtime.apply(ctx)
  for (const source of ['startup', 'resume']) {
    const target: any = agent(), entries = new Map<string, any>(); scoped.set(target, entries)
    target.ctx = { tools: { register(value: any) { entries.set(value.name, value); return () => entries.delete(value.name) } } }
    await hooks.get('agent/created')?.({ agent: target, source })
    const start = ctx.tools.get('start_inspection', target), firstSchema = structuredClone(start.parameters)
    assert.deepEqual(firstSchema.required, ['taskId'])
    assert.equal(Object.hasOwn(firstSchema.properties, 'requestId'), false)
    assert.ok(Object.hasOwn(firstSchema.properties, 'deviceSelector'))
    assert.deepEqual(ctx.tools.get('get_inspection_result', target).parameters.required, ['runId'])
    await hooks.get('agent/pre-step')({ agent: target }, async () => ({ kind: 'enter' }))
    assert.equal(ctx.tools.get('start_inspection', target), start)
  }
  const child: any = agent(); child.session.header.delegationDepth = 1
  await hooks.get('agent/created')?.({ agent: child, source: 'startup' })
  assert.equal(ctx.tools.get('start_inspection', child), upstream.get('start_inspection'))
  for (const dispose of cleanup) dispose()
})

test('当前 EXP027：默认范围由服务解析，未知回执仅允许原请求幂等核对，受理后不重复提交', async () => {
  const runtime = await import(pathToFileURL(join(candidate(current), 'inspection-preparation-runtime.mjs')).href)
  const state = runtime.createInspectionExecution(directory), exec = execution(), defaults = { taskId: 'actual-template' }
  const failure = { isError: true, content: [{ type: 'text', text: 'service unavailable' }] }
  let requestId: string | undefined
  await assert.rejects(state.start(defaults, exec, async (args: any) => {
    assert.equal(Object.hasOwn(args, 'deviceSelector'), false)
    requestId = args.requestId
    return failure
  }, startSchema), /受理状态未知/)
  const file = join(directory, createHash('sha256').update(exec.agent.id).digest('hex') + '.v2.json')
  const saved = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(saved.entries[0].phase, 'UNKNOWN')
  assert.deepEqual(saved.entries[0].failure, failure)
  assert.equal(saved.entries[0].receipt, undefined)
  const restored = runtime.createInspectionExecution(directory)
  await assert.rejects(restored.start({ ...defaults, mode: 'FULL' }, exec, async () => assert.fail(), startSchema), /不能更换输入/)
  const receipt = await restored.start(defaults, exec, async (args: any) => {
    assert.equal(args.requestId, requestId)
    return { acceptanceStatus: 'ACCEPTED', runId: 'run-actual' }
  }, startSchema)
  assert.equal(receipt.runId, 'run-actual')
  assert.deepEqual(await restored.start(defaults, exec, async () => assert.fail('已受理请求不得重复调用'), startSchema), receipt)
  await assert.rejects(restored.start({ ...defaults, deviceSelector: { kind: 'ANY' } }, execution(), async () => assert.fail(), startSchema), /选择器无效/)
})

test('当前 EXP027：底层异常只保存在私有账本，恢复时复用原请求编号', async () => {
  const runtime = await import(pathToFileURL(join(candidate(current), 'inspection-preparation-runtime.mjs')).href)
  const privateDirectory = join(directory, randomUUID()), state = runtime.createInspectionExecution(privateDirectory), exec = execution()
  const defaults = { taskId: 'actual-template' }
  const exception = Object.assign(new Error('upstream diagnostic fixture'), { code: 'UPSTREAM_ERROR', headers: { authorization: 'private-fixture' } })
  await assert.rejects(state.start(defaults, exec, async () => { throw exception }, startSchema), error => {
    assert.match(String(error), /受理状态未知/)
    assert.doesNotMatch(String(error), /upstream diagnostic fixture|UPSTREAM_ERROR|private-fixture/)
    return true
  })
  const file = join(privateDirectory, createHash('sha256').update(exec.agent.id).digest('hex') + '.v2.json')
  const saved = JSON.parse(await readFile(file, 'utf8')), entry = saved.entries[0]
  assert.deepEqual(entry.exception, { name: 'Error', message: 'upstream diagnostic fixture', code: 'UPSTREAM_ERROR' })
  assert.equal(entry.phase, 'UNKNOWN'); assert.equal(entry.receipt, undefined)
  assert.equal((await stat(file)).mode & 0o777, 0o600)
  assert.equal((await stat(privateDirectory)).mode & 0o777, 0o700)
  await runtime.createInspectionExecution(privateDirectory).start(defaults, exec, async (args: any) => {
    assert.equal(args.requestId, entry.requestId)
    return { acceptanceStatus: 'ACCEPTED', runId: 'run-reconciled' }
  }, startSchema)
})

for (const id of ids) {
  const runtime = await import(pathToFileURL(join(candidate(id), 'inspection-preparation-runtime.mjs')).href)
  test(`${id}：范围、过期刷新、同轮幂等与未知回执`, async () => {
    for (const kind of ['ALL', 'ASSET_IDS', 'IP', 'CIDR', 'TOPOLOGY_GROUP', 'ASSET_CLASS', 'FILTER']) {
      const state = runtime.createInspectionExecution(directory), exec = execution()
      const selector = { kind, values: ['original'], query: '原始选择', conditions: { assetClass: '终端', online: true } }
      const original = input(selector), calls: any[] = []
      await state.prepare(original, exec, async (args: any) => { calls.push(args); return ready(args, true) })
      original.deviceSelector.conditions.online = false
      const receipt = await state.start(startArgs, exec, async (args: any) => { calls.push(args); return ready(args) }, async (args: any) => { calls.push(args); return { runId: 'run-actual' } })
      assert.deepEqual(receipt, { runId: 'run-actual' })
      assert.deepEqual(calls[1].deviceSelector, selector.kind === kind ? { ...selector, conditions: { assetClass: '终端', online: true } } : null)
      assert.equal(calls[2].context.userMessageRef, 'user-real')
      assert.equal(calls[2].preparationId, 'prep-actual')
      assert.match(calls[2].requestId, /^[0-9a-f-]{36}$/)
      await state.start(startArgs, exec, async () => assert.fail('不得重复准备'), async () => assert.fail('不得重复提交'))
      assert.equal(calls.length, 3)
    }
    const exec = execution(), state = runtime.createInspectionExecution(directory)
    await assert.rejects(state.prepare({ taskId: 'actual-template' }, exec, async () => assert.fail()), /范围/)
    await state.prepare(input(), exec, async (args: any) => ready(args))
    let submissions = 0
    const attempt = () => state.start(startArgs, exec, async () => assert.fail(), async () => { submissions++; throw new Error('transport-lost') })
    const outcomes = await Promise.allSettled([attempt(), attempt()])
    assert.ok(outcomes.every(row => row.status === 'rejected')); assert.equal(submissions, 1)
    const restored = runtime.createInspectionExecution(directory)
    await assert.rejects(restored.prepare(input(), exec, async () => assert.fail()), /原 requestId.*查账/)
    await assert.rejects(restored.start(startArgs, exec, async () => assert.fail(), async () => assert.fail()), /原 requestId.*查账/)
  })
  test(`${id}：澄清、取消、损坏状态和真实消息归属`, async () => {
    const state = runtime.createInspectionExecution(directory), exec = execution()
    await state.prepare(input(), exec, async () => ({ status: 'CLARIFY', missing: ['businessInputs'] }))
    await assert.rejects(state.start(startArgs, exec, async () => assert.fail(), async () => assert.fail()), /先准备/)
    await state.prepare(input(), exec, async (args: any) => ready(args))
    const controller = new AbortController(); controller.abort()
    await assert.rejects(state.start(startArgs, { ...exec, signal: controller.signal }, async () => assert.fail(), async () => assert.fail()), /abort/i)
    let count = 0
    await state.start(startArgs, exec, async () => assert.fail(), async () => { count++; return { runId: 'run-after-cancel' } })
    assert.equal(count, 1)
    const other = execution(), path = join(directory, createHash('sha256').update(other.agent.id).digest('hex') + '.json')
    await writeFile(path, '{broken')
    await assert.rejects(state.prepare(input(), other, async () => assert.fail()), /状态无法读取/)
    const changed = execution()
    await state.prepare(input(), changed, async (args: any) => ready(args))
    changed.agent.session.snapshotEvents = () => [{ type: 'user/message', data: { id: 'new-message', source: { kind: 'user' }, content: [] } }]
    await assert.rejects(state.start(startArgs, changed, async () => assert.fail(), async () => assert.fail()), /请求已变化/)
    assert.equal(runtime.inspectionValue({ code: 503, data: { runId: 'fake' } }), undefined)
    assert.equal(runtime.reportLink('https://reports.example/prefix/file?id=actual&format=md'), 'https://reports.example/prefix/file?id=actual&format=md')
    assert.equal(runtime.reportLink('https://secret@reports.example/file'), undefined)
  })
  test(`${id}：原生 Schedule 同次到期请求标识稳定`, async () => {
    async function submit(target: any) {
      const state = runtime.createInspectionExecution(await mkdtemp(join(directory, 'schedule-'))), exec = execution(target)
      await state.prepare(input(), exec, async (args: any) => ready(args))
      let requestId
      await state.start(startArgs, exec, async () => assert.fail(), async (args: any) => { requestId = args.requestId; return { runId: 'run-schedule' } })
      return requestId
    }
    const first = agent('schedule', '提醒 sched-actual 到期 2026-11-02T10:00:00Z'), second = agent('schedule', '提醒 sched-actual 到期 2026-11-02T10:00:00Z')
    second.id = first.id
    assert.equal(await submit(first), await submit(second))
    const next = agent('schedule', '提醒 sched-actual 到期 2026-11-02T10:10:00Z'); next.id = first.id
    assert.notEqual(await submit(first), await submit(next))
  })
  test(`${id}：全文预算溢出只补读一次同次摘要并由既有交付器输出`, async () => {
    const delivery = await import(pathToFileURL(join(candidate(id), 'operation-result-delivery.mjs')).href)
    const spill = formatSpillNotice({ kind: 'exact', count: 42000 }, { locator: 'native-spill-file', retrievalHint: '由原生工具读取' })
    for (const mode of ['valid', 'wrong-run', 'wrong-link', 'summary-spilled', 'tool-error', 'full-fits', 'default-summary', 'nested-workflow', 'foreign-root']) {
      const hooks = new Map<string, any[]>(), adapters = new Map<string, any>(), queries: any[] = [], target = agent()
      const full = { runId: 'run-actual', reportMarkdown: '实际全文', reportDownloadUrl: 'https://reports.example/prefix/file?run=actual' }
      const summary = { ...full, reportSummaryMarkdown: '真实整改建议：修复基线配置。' }
      if (mode === 'wrong-run') summary.runId = 'run-other'
      if (mode === 'wrong-link') summary.reportDownloadUrl += '-other'
      const ctx = { on(name: string, handler: any) { hooks.set(name, [...(hooks.get(name) ?? []), handler]) }, effect() {},
        mcpSessionManager: { resolveTool: (_group: string, raw: string) => 'mcp__actual-inspection__' + raw },
        llm: { registerAdapter(providers: string[], value: any) { for (const key of providers) adapters.set(key, value) } },
        tools: { async execute(args: any) { queries.push(args); return { isError: mode === 'tool-error', value: summary, content: [{ type: 'text', text: mode === 'summary-spilled' ? spill : JSON.stringify(summary) }] } } } }
      delivery.apply(ctx); runtime.apply(ctx)
      const exec = { name: 'mcp__actual-inspection__get_inspection_result', arguments: { runId: full.runId, includeReport: mode !== 'default-summary' }, agent: target, rootCallId: 'root-real', ...(mode === 'nested-workflow' ? { parent: Symbol('native-parent') } : {}) }
      for (const hook of hooks.get('tools/result') ?? []) hook(exec, { value: full, content: [{ type: 'text', text: mode === 'full-fits' || mode === 'nested-workflow' ? '实际全文' : spill }] })
      if (mode === 'nested-workflow' || mode === 'foreign-root') for (const hook of hooks.get('tools/result') ?? []) hook({ name: mode === 'nested-workflow' ? 'inspection_workflow' : 'other_tool', rootCallId: exec.rootCallId, agent: target }, { content: [{ type: 'text', text: spill }] })
      async function request() {
        const handlers = hooks.get('agent/request') ?? []
        const invoke = (index: number): any => index === handlers.length ? Promise.resolve({ provider: 'original', model: 'original' }) : handlers[index]({ agent: target, signal: new AbortController().signal, turn: 1 }, () => invoke(index + 1))
        return invoke(0)
      }
      const config = await request(), expected = !['full-fits', 'default-summary', 'foreign-root'].includes(mode)
      assert.equal(queries.length, expected ? 1 : 0, mode)
      if (expected) {
        assert.deepEqual(queries[0].arguments, { runId: 'run-actual', includeReport: false })
        const chunks: any[] = []
        for await (const chunk of adapters.get(config.provider).stream({ sessionId: target.id, signal: new AbortController().signal })) chunks.push(chunk)
        const text = chunks.filter(item => item.type === 'text-delta').map(item => item.text).join('')
        assert.ok(text.includes('未内联全文'), mode); assert.ok(text.includes(full.reportDownloadUrl), mode)
        assert.equal(text.includes(summary.reportSummaryMarkdown), ['valid', 'nested-workflow'].includes(mode), mode)
      }
      await request(); assert.equal(queries.length, expected ? 1 : 0)
    }
  })
}
