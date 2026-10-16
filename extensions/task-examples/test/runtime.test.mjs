import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { apply, runTrainingProcess } from '../src/runtime.ts'

function write(root, file, text) { const path = join(root, file); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); return path }
function temporary(t) { const root = mkdtempSync(join(tmpdir(), 'task-example-runtime-')); t.after(() => rmSync(root, { recursive: true, force: true })); return root }
function environment(t, values) {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  Object.assign(process.env, values)
  t.after(() => { for (const [key, value] of Object.entries(before)) if (value === undefined) delete process.env[key]; else process.env[key] = value })
}
function toolContext(config) {
  let tool, fetchHandler, guard, preStep
  apply({ tools: { register(value) { tool = value }, guard(value) { guard = value } }, on(event, handler) { if (event === 'agent/pre-step') preStep = handler },
    connection: { fetch: { register(value) { fetchHandler = value.fetch } } } }, config)
  const execute = (args, session = 'session-1', signal = new AbortController().signal) => tool.execute(args, { agent: { session: { header: { id: session, agentPreset: config.kind === 'training' ? 'autonomous-training-researcher' : config.kind === 'inspection' ? 'daily-inspection-assistant' : 'multi-step-research-analyst' } } }, signal })
  return { get tool() { return tool }, execute, download: url => fetchHandler(new Request('http://localhost' + url)), guard, preStep }
}
async function http(t, reply) {
  const server = createServer(reply)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  return `http://127.0.0.1:${server.address().port}`
}

test('工具提交合法JSON Schema，原生只读限制仅作用于业务Preset，Judge保持独立', () => {
  const ctx = toolContext({ kind: 'inspection' })
  assert.deepEqual(ctx.tool.parameters.required, ['action'])
  assert.equal(ctx.tool.parameters.properties.action.required, undefined)
  let allow
  const subject = { session: { header: { agentPreset: 'daily-inspection-assistant' } }, ctx: { tools: { restrict(value) { allow = value.allow } } } }
  ctx.preStep({ agent: subject }, () => undefined)
  assert.deepEqual(allow, ['task_inspection'])
  assert.match(ctx.guard({ name: 'write', agent: subject }), /只允许/)
  assert.equal(ctx.guard({ name: 'task_inspection', agent: subject }), undefined)
  const judge = { session: { header: { agentPreset: 'harness-eval-judge' } }, ctx: { tools: { restrict() { throw new Error('Judge不应被限制') } } } }
  ctx.preStep({ agent: judge }, () => undefined)
  assert.equal(ctx.guard({ name: 'write', agent: judge }), undefined)
})

test('巡检经实际HTTP读资产，并行分页完整保留；未读完拒交付、报告可回读、其他Session不可改任务', async t => {
  const root = temporary(t); environment(t, { DSH_HOME: root })
  const rows = Array.from({ length: 5 }, (_, index) => ({ asset_id: `asset-000${index + 1}`, hostname: `设备${index + 1}`, asset_type: '基本台账', risk_score: index }))
  const url = await http(t, (_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(rows)) })
  const ctx = toolContext({ kind: 'inspection', assetUrl: url }), started = await ctx.execute({ action: 'start' })
  await assert.rejects(ctx.execute({ action: 'report', run_id: started.run_id }), /尚未读取全部设备/)
  await Promise.all([0, 2, 4].map(cursor => ctx.execute({ action: 'page', run_id: started.run_id, cursor })))
  const report = await ctx.execute({ action: 'report', run_id: started.run_id })
  assert.equal(report.source_kind, 'basic_mock'); assert.equal(report.device_count, 5); assert.match(report.markdown, /未连接或检测真实设备/)
  assert.equal((await ctx.download(report.download_url)).status, 200)
  assert.equal(await (await ctx.download(report.download_url)).text(), report.markdown)
  assert.equal(await (await ctx.download(report.csv_url)).text(), report.csv)
  await assert.rejects(ctx.execute({ action: 'status', run_id: started.run_id }, 'other-session'), /另一 Session/)
  assert.equal((await ctx.download(`/assistant/api/task-examples/artifact?run_id=${started.run_id}&file=..%2Fstate.json`)).status, 400)
})

test('巡检上游缺失设备时拒绝造全量报告', async t => {
  environment(t, { DSH_HOME: temporary(t) })
  const url = await http(t, (_req, res) => res.end('[]'))
  await assert.rejects(toolContext({ kind: 'inspection', assetUrl: url }).execute({ action: 'start' }), /范围不完整/)
})

test('资料研究固定首次读取正文，缺少来源时拒交付', async t => {
  environment(t, { DSH_HOME: temporary(t) }); let requests = 0
  const url = await http(t, (_req, res) => { requests++; res.end('实际HTTP资料正文：只讨论任务机制。') })
  const ctx = toolContext({ kind: 'research', sourceUrls: [url + '/one', url + '/two'] }), start = await ctx.execute({ action: 'start' })
  await ctx.execute({ action: 'collect', run_id: start.run_id, source: url + '/one' })
  assert.equal((await ctx.execute({ action: 'collect', run_id: start.run_id, source: url + '/one' })).reused_snapshot, true)
  assert.equal(requests, 1)
  await assert.rejects(ctx.execute({ action: 'report', run_id: start.run_id }), /还有资料未读取/)
  await ctx.execute({ action: 'collect', run_id: start.run_id, source: url + '/two' })
  const report = await ctx.execute({ action: 'report', run_id: start.run_id, summaries: { [url + '/one']: '资料一说明任务机制。', [url + '/two']: '资料二说明任务机制。' } })
  assert.equal(report.source_count, 2); assert.match(report.markdown, /读取时间/)
})

function trainingFixture(t) {
  const root = temporary(t), home = join(root, 'home'), dsh = join(root, 'dsh'), bin = join(root, 'bin')
  environment(t, { HOME: home, DSH_HOME: dsh, PATH: `${bin}:${process.env.PATH}` })
  for (const file of ['prepare.py', 'pyproject.toml', 'uv.lock']) write(dsh, 'autoresearch/' + file, '固定测试输入\n')
  write(dsh, 'autoresearch/train.py', '# fixture metric: 1.5\n'); write(dsh, 'autoresearch/upstream-train.fixture', '# fixture metric: 1.5\n')
  for (const file of ['tokenizer/tokenizer.pkl', 'tokenizer/token_bytes.pt', 'data/shard_00000.parquet', 'data/shard_06542.parquet']) write(home, '.cache/autoresearch/' + file, '基本测试夹具\n')
  const runner = '#!' + process.execPath + '\n' + `// 仅模拟外部训练命令边界，不表示真实GPU训练。\nconst fs=require('fs'),path=require('path');const action=path.basename(process.argv[1]),args=process.argv.slice(2);\n` +
    `if(action==='nvidia-smi')console.log('TEST-FIXTURE-GPU');\n` +
    `else if(action==='git'){if(args[0]==='rev-parse')console.log('228791fb499afffb54b46200aca536f79142f117');else if(args[0]==='show')process.stdout.write(fs.readFileSync('upstream-train.fixture'));}\n` +
    `else if(args[0]==='--version')console.log('uv-test-fixture');\n` +
    `else if(args.includes('train.py')){const text=fs.readFileSync('train.py','utf8');if(text.includes('change-fixed'))fs.appendFileSync('prepare.py','夹具变更');if(text.includes('fail')){console.log('partial fixture output');console.error('token=fixture-placeholder');process.exitCode=1}else console.log('val_bpb: '+(/metric: ([0-9.]+)/.exec(text)||[])[1]);}\n`
  for (const command of ['nvidia-smi', 'git', 'uv']) chmodSync(write(root, 'bin/' + command, runner), 0o700)
  return { root, home, dsh, ctx: toolContext({ kind: 'training' }) }
}

test('没有GPU和依赖时真实预检明确拒绝，不能返回训练指标', async t => {
  const root = temporary(t); mkdirSync(join(root, 'empty-bin'))
  environment(t, { DSH_HOME: join(root, 'dsh'), HOME: join(root, 'home'), PATH: join(root, 'empty-bin') })
  const result = await toolContext({ kind: 'training' }).execute({ action: 'baseline' })
  assert.equal(result.ready, false); assert.equal(result.checks.nvidia_gpu, false); assert.equal(result.status, 'training-resource-unavailable')
  assert.equal(result.val_bpb, undefined); assert.equal(result.best, undefined)
})

test('训练真实runtime在外部命令夹具下验证一次基线、三个候选、失败回退和日志；不能重开基线绕预算', async t => {
  const { ctx, dsh } = trainingFixture(t), baseline = await ctx.execute({ action: 'baseline' })
  assert.equal(baseline.attempt.status, 'keep')
  await assert.rejects(ctx.execute({ action: 'baseline' }), /已使用一次基线/)
  const first = await ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture metric: 1.2\n' })
  assert.equal(first.attempt.status, 'keep')
  const second = await ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture metric: 1.7\n' })
  assert.equal(second.attempt.status, 'discard'); assert.match(readFileSync(join(dsh, 'autoresearch/train.py'), 'utf8'), /metric: 1.2/)
  const failed = await ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture fail\n' })
  assert.equal(failed.attempt.status, 'failed'); assert.equal(failed.candidates_used, 3)
  assert.match(readFileSync(join(dsh, 'autoresearch/train.py'), 'utf8'), /metric: 1.2/)
  assert.match(readFileSync(join(dsh, 'task-example-artifacts', baseline.run_id, 'attempt-3/stdout.log'), 'utf8'), /partial fixture output/)
  assert.doesNotMatch(readFileSync(join(dsh, 'task-example-artifacts', baseline.run_id, 'attempt-3/stderr.log'), 'utf8'), /fixture-placeholder/)
  await assert.rejects(ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture metric: 0.1\n' }), /最多三次/)
  await assert.rejects(ctx.execute({ action: 'baseline' }), /已使用一次基线/)
})

test('跨attempt数据与固定评估不能重新取摘要放宽；候选篡改固定输入不接受指标', async t => {
  const { ctx, home, dsh } = trainingFixture(t), baseline = await ctx.execute({ action: 'baseline' })
  const file = join(home, '.cache/autoresearch/tokenizer/tokenizer.pkl'), original = readFileSync(file)
  writeFileSync(file, '已改变的夹具')
  await assert.rejects(ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture metric: 1.0\n' }), /与基线不一致/)
  writeFileSync(file, original)
  const result = await ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture change-fixed metric: 1.0\n' })
  assert.equal(result.attempt.status, 'failed'); assert.equal(result.attempt.val_bpb, undefined); assert.equal(result.fixed_inputs_changed, true)
  assert.match(readFileSync(join(dsh, 'autoresearch/train.py'), 'utf8'), /metric: 1.5/)
  await assert.rejects(ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture metric: 0.5\n' }), /状态未确认/)
})

test('训练总时限持续生效，不能在剩余不足时重置', async t => {
  const { ctx, dsh } = trainingFixture(t), baseline = await ctx.execute({ action: 'baseline' })
  const path = join(dsh, 'task-example-artifacts', baseline.run_id, 'state.json'), value = JSON.parse(readFileSync(path, 'utf8'))
  value.created_at = new Date(Date.now() - 60 * 60_000 - 1).toISOString(); writeFileSync(path, JSON.stringify(value))
  await assert.rejects(ctx.execute({ action: 'candidate', run_id: baseline.run_id, train_py: '# fixture metric: 1.0\n' }), /总时限已到/)
})

test('训练执行器timeout与cancel清理子进程组并保留部分输出', async t => {
  const root = temporary(t)
  const code = `const {spawn}=require('child_process'),fs=require('fs');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});fs.writeFileSync(process.argv[1],String(child.pid));console.log('started');setInterval(()=>{},1000)`
  for (const cancel of [false, true]) {
    const pidPath = join(root, cancel ? 'cancel.pid' : 'timeout.pid'), controller = new AbortController()
    const timer = cancel ? setTimeout(() => controller.abort(), 300) : undefined
    await assert.rejects(runTrainingProcess(process.execPath, ['-e', code, pidPath], { timeout: cancel ? 5000 : 300, signal: controller.signal }), error => error.code === (cancel ? 'cancelled' : 'timeout') && error.stdout.includes('started'))
    if (timer) clearTimeout(timer)
    const pid = Number(readFileSync(pidPath, 'utf8')); await delay(100)
    let live = false
    try { live = readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] !== 'Z' } catch {}
    assert.equal(live, false, `留下子进程 ${pid}`)
  }
})

test('中断恢复保留已消耗候选次数，恢复最佳代码而不重复发起训练', async t => {
  const { ctx, dsh } = trainingFixture(t), baseline = await ctx.execute({ action: 'baseline' })
  const base = join(dsh, 'task-example-artifacts'), path = join(base, baseline.run_id, 'state.json'), value = JSON.parse(readFileSync(path, 'utf8'))
  value.candidates_used = 1
  value.attempts.push({ index: 1, kind: 'candidate', status: 'running', owner_pid: 2147483000, process_id: 2147483000, script_sha256: 'unknown-interrupted-code' })
  writeFileSync(path, JSON.stringify(value)); writeFileSync(join(dsh, 'autoresearch/train.py'), '# interrupted fixture code\n')
  write(base, 'training.lock', JSON.stringify({ run_id: baseline.run_id, owner_pid: 2147483000 }))
  const status = await ctx.execute({ action: 'status', run_id: baseline.run_id })
  assert.equal(status.candidates_used, 1); assert.equal(status.attempts[1].status, 'interrupted'); assert.equal(status.attempts[1].rollback, 'restored')
  assert.match(readFileSync(join(dsh, 'autoresearch/train.py'), 'utf8'), /metric: 1.5/)
  assert.equal(existsSync(join(base, 'training.lock')), false)
  assert.match(readFileSync(join(base, baseline.run_id, 'results.tsv'), 'utf8'), /interrupted/)
  await assert.rejects(ctx.execute({ action: 'baseline' }), /已使用一次基线/)
})

test('共享训练目录的独占锁避免两个Session同时覆盖train.py', async t => {
  const { ctx, dsh } = trainingFixture(t), lock = write(dsh, 'task-example-artifacts/training.lock', JSON.stringify({ run_id: 'other-task', owner_pid: process.pid }))
  await assert.rejects(ctx.execute({ action: 'baseline' }), /工作区已占用/)
  assert.equal(JSON.parse(readFileSync(lock, 'utf8')).run_id, 'other-task')
  assert.match(readFileSync(join(dsh, 'autoresearch/train.py'), 'utf8'), /metric: 1.5/)
})


test('调研显式固定资料快照仅只读本地文件并核对摘要，不进行在线回退', async t => {
  const previousCwd = process.cwd(), root = temporary(t)
  environment(t, { DSH_HOME: join(root, 'dsh') }); process.chdir(root); t.after(() => process.chdir(previousCwd))
  const texts = ['固定提交一：自主训练研究，MIT。', '固定提交二：多步骤任务，非商业许可。']
  const documents = texts.map((text, index) => ({ url: `https://example.invalid/fixed-commit-${index}/README.md`, path: `references/source-${index}.md`, sha256: createHash('sha256').update(text).digest('hex') }))
  documents.forEach((document, index) => write(root, document.path, texts[index]))
  const originalFetch = globalThis.fetch; let requests = 0
  globalThis.fetch = async () => { requests++; throw new Error('快照模式不应联网') }; t.after(() => { globalThis.fetch = originalFetch })
  const ctx = toolContext({ kind: 'research', sourceDocuments: documents }), start = await ctx.execute({ action: 'start' })
  assert.equal(start.source_kind, 'fixed_public_document_snapshot')
  for (const document of documents) {
    const result = await ctx.execute({ action: 'collect', run_id: start.run_id, source: document.url })
    assert.equal(result.source_kind, 'fixed_public_document_snapshot'); assert.equal(result.sha256, document.sha256)
  }
  const report = await ctx.execute({ action: 'report', run_id: start.run_id, summaries: Object.fromEntries(documents.map((document, index) => [document.url, texts[index]])) })
  assert.match(report.markdown, /没有实时访问网站/); assert.equal(report.source_kind, 'fixed_public_document_snapshot'); assert.equal(requests, 0)
  const started = await ctx.execute({ action: 'start' }); write(root, documents[0].path, '已变化正文')
  await assert.rejects(ctx.execute({ action: 'collect', run_id: started.run_id, source: documents[0].url }), /摘要不匹配/)
  assert.equal(requests, 0)
  await assert.rejects(ctx.execute({ action: 'report', run_id: started.run_id, summaries: {} }), /还有资料未读取/)
})

test('资料来源配置不得混用在线与快照，也不允许越出references目录', async t => {
  environment(t, { DSH_HOME: temporary(t) })
  const document = { url: 'https://example.invalid/fixed/README.md', path: 'references/source.md', sha256: '0'.repeat(64) }
  await assert.rejects(toolContext({ kind: 'research', sourceUrls: [document.url], sourceDocuments: [document] }).execute({ action: 'start' }), /不能与在线来源同时配置/)
  await assert.rejects(toolContext({ kind: 'research', sourceDocuments: [{ ...document, path: '../outside.md' }] }).execute({ action: 'start' }), /配置无效/)
})
