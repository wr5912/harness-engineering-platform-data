import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, createReportHandler, publishReport, readLocalReport, REPORT_ROUTE } from '../dsh/managed/threat-report-download.mjs'

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'threat-report-test-'))
  const runId = `run-${randomUUID()}`
  const incidentId = 'INC-20261110-000004'
  const directory = join(home, 'threat-analysis', runId)
  await mkdir(directory, { recursive: true })
  const bytes = Buffer.from('<!doctype html><html lang="zh-CN"><body>原始报告</body></html>')
  const record = { run_id: runId, incident_id: incidentId, status: 'completed',
    result: { verdict: '误报' }, delivery: { markdown: '**报告下载：** 已保存，未返回有效下载链接\n', storage: {
      report: { status: 'saved', storage: 'local', id: runId, relative_path: 'report.html',
        content_type: 'text/html', file_name: `${incidentId}-${runId}.html`, size_bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') }, summary: { status: 'saved' } } } }
  await writeFile(join(directory, 'report.html'), bytes)
  await writeFile(join(directory, 'result.json'), JSON.stringify(record))
  return { home, runId, incidentId, directory, bytes, record }
}

async function request(handler, method, url) {
  const reply = { status: undefined, headers: {}, body: undefined,
    writeHead(status, headers) { this.status = status; this.headers = headers; return this },
    end(body) { this.body = body; return this } }
  await handler({ method, url }, reply)
  return reply
}

test('动态挂载路径可下载，且不硬编码Agent或实例名', async () => {
  const f = await fixture()
  const original = structuredClone(f.record)
  const prefix = '/agents/security-operations-expert/instances/another-instance'
  let checked
  const result = await publishReport(f.record, f.home, path => { checked = path; return prefix + path })
  const expected = `${prefix}${REPORT_ROUTE}/${f.runId}/download`
  assert.equal(checked, `${REPORT_ROUTE}/${f.runId}/download`)
  assert.equal(result.delivery.storage.report.download_url, expected)
  assert.match(result.delivery.markdown, /\[下载 HTML 报告\]/)
  assert.equal(result.delivery.markdown.includes('未返回有效'), false)
  assert.deepEqual(result.result, original.result)
  assert.deepEqual(f.record, original)
  assert.deepEqual(await readFile(join(f.directory, 'report.html')), f.bytes)
  assert.equal(JSON.parse(await readFile(join(f.directory, 'result.json'), 'utf8')).delivery.storage.report.download_url,
    expected)
})

test('允许DSH_HOME根目录是挂载别名，但拒绝运行目录软链接', async () => {
  const f = await fixture()
  const parent = await mkdtemp(join(tmpdir(), 'threat-report-home-alias-'))
  const alias = join(parent, 'dsh-home')
  await symlink(f.home, alias, 'dir')
  try {
    const report = await readLocalReport(alias, f.runId)
    assert.deepEqual(report.bytes, f.bytes)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('GET和HEAD返回附件、正确类型及原始字节，不需要MCP', async () => {
  const f = await fixture()
  const handler = createReportHandler(f.home)
  const url = `${REPORT_ROUTE}/${f.runId}/download`
  const get = await request(handler, 'GET', url)
  assert.equal(get.status, 200)
  assert.match(get.headers['content-disposition'], /^attachment; filename="INC-.*\.html"$/)
  assert.equal(get.headers['content-type'], 'text/html; charset=utf-8')
  assert.equal(get.headers['content-length'], String(f.bytes.length))
  assert.deepEqual(get.body, f.bytes)
  const head = await request(handler, 'HEAD', url)
  assert.equal(head.status, 200)
  assert.equal(head.body, undefined)
  assert.equal((await request(handler, 'POST', url)).status, 405)
  assert.equal((await request(createReportHandler(f.home, () => 401), 'GET', url)).status, 401)
  assert.deepEqual((await request(createReportHandler(f.home), 'GET', url)).body, f.bytes)
})

test('遍历、编码、未知运行、字节或身份错配不暴露文件', async () => {
  const f = await fixture()
  const handler = createReportHandler(f.home)
  for (const suffix of ['../result.json', '%2e%2e/report.html', `${f.runId}%2f/download`,
    `${f.runId}\\download`, 'run-not-a-uuid/download', `run-${randomUUID()}/download`]) {
    assert.equal((await request(handler, 'GET', `${REPORT_ROUTE}/${suffix}`)).status, 404)
  }
  await writeFile(join(f.directory, 'report.html'), 'changed')
  assert.equal((await request(handler, 'GET', `${REPORT_ROUTE}/${f.runId}/download`)).status, 404)
  await writeFile(join(f.directory, 'report.html'), f.bytes)
  f.record.run_id = `run-${randomUUID()}`
  await writeFile(join(f.directory, 'result.json'), JSON.stringify(f.record))
  await assert.rejects(readLocalReport(f.home, f.runId))
})

test('报告和运行目录软链接不被读取', async () => {
  const f = await fixture()
  const moved = join(f.directory, 'original.html')
  await rename(join(f.directory, 'report.html'), moved)
  await symlink(moved, join(f.directory, 'report.html'))
  await assert.rejects(readLocalReport(f.home, f.runId))
  const other = `run-${randomUUID()}`
  await symlink(f.directory, join(f.home, 'threat-analysis', other))
  await assert.rejects(readLocalReport(f.home, other))
})

test('原生工具装配保留单条和自动批量结果及下载展示，不重复研判', async () => {
  const f = await fixture()
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = f.home
  const hooks = new Map(), originals = new Map(), visible = new Map(), effects = []
  let calls = 0
  const single = { name: 'analyze_threat_incident', output: { schema: { type: 'object' },
    render: () => [{ type: 'text', text: 'status' }], presentationMeta: (_args, value) => ({ threat_analysis: value }) },
    async execute() { calls++; return structuredClone(f.record) } }
  const batch = { name: 'analyze_pending_threat_incidents', output: { schema: { type: 'object' },
    render: () => [{ type: 'text', text: '自动研判批次完成' }], presentationMeta: (_args, value) => ({ threat_analysis_batch: value }) },
    async execute() { calls++; return { status: 'completed', results: [{ incident_id: f.incidentId, run_id: f.runId, status: 'completed' }] } } }
  originals.set(single.name, single); originals.set(batch.name, batch)
  const agent = { ctx: { tools: { register(value) { visible.set(value.name, value); return () => visible.delete(value.name) } } } }
  try {
    apply({ webServer: { publicPath: path => '/assistant' + path, register: () => () => {} },
      connection: { requestRejection: () => undefined }, tools: { get: name => visible.get(name) ?? originals.get(name) },
      effect(callback) { effects.push(callback()) }, on(name, callback) { hooks.set(name, callback) } })
    hooks.get('agent/created')({ agent })
    const tool = visible.get(single.name)
    const value = await tool.execute({}, { agent })
    assert.match(tool.output.presentationMeta({}, value).threat_analysis.delivery.markdown, /下载 HTML 报告/)
    const batched = visible.get(batch.name)
    const result = await batched.execute({}, { agent })
    assert.match(batched.output.render({}, result)[0].text, /下载 HTML 报告/)
    assert.match(batched.output.presentationMeta({}, result).threat_analysis.delivery.markdown, /下载 HTML 报告/)
    assert.equal(calls, 2)
    await hooks.get('agent/pre-step')({ agent }, async () => ({ kind: 'enter' }))
    assert.equal(visible.get(single.name), tool)
  } finally {
    for (const dispose of effects.reverse()) dispose?.()
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous
  }
})
