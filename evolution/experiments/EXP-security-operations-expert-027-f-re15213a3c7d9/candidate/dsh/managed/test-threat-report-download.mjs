import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, inject, REPORT_ROUTE } from './threat-report-download.mjs'

test('独立部署的单次与批量研判使用完整 HTTP 下载地址', async t => {
  const home = await mkdtemp(join(tmpdir(), 'threat-report-download-'))
  const previous = { DSH_HOME: process.env.DSH_HOME, HARNESS_PUBLIC_ORIGIN: process.env.HARNESS_PUBLIC_ORIGIN }
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(home, { recursive: true, force: true })
  })
  process.env.DSH_HOME = home
  delete process.env.HARNESS_PUBLIC_ORIGIN

  const runId = 'run-dd00cf59-c4a5-48fc-8b22-1e4d4522ebc7'
  const incidentId = 'INC-20261020-000179'
  const bytes = Buffer.from('<!doctype html><title>报告</title>')
  const record = {
    run_id: runId, incident_id: incidentId, status: 'completed',
    delivery: {
      markdown: '**报告下载：** 尚未提供\n',
      storage: { report: {
        status: 'saved', storage: 'local', id: runId, relative_path: 'report.html',
        file_name: `${incidentId}-${runId}.html`, content_type: 'text/html',
        size_bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      } },
    },
  }
  const directory = join(home, 'threat-analysis', runId)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'report.html'), bytes)
  await writeFile(join(directory, 'result.json'), JSON.stringify(record))

  const output = { render: () => [{ type: 'text', text: '研判完成' }] }
  const tools = new Map([
    ['analyze_threat_incident', { name: 'analyze_threat_incident', output, execute: async () => structuredClone(record) }],
    ['analyze_pending_threat_incidents', { name: 'analyze_pending_threat_incidents', output, execute: async () => ({ results: [
      { run_id: runId, incident_id: incidentId, status: 'completed' },
    ] }) }],
  ])
  const listeners = new Map()
  const ctx = {
    webServer: {
      publicPath: path => `/assistant${path}`,
      register: route => { assert.equal(route.path, REPORT_ROUTE); return () => {} },
    },
    webStartup: { publicUrl: 'http://192.0.2.10:28032/assistant/' },
    connection: { requestRejection: () => undefined },
    tools: { get: name => tools.get(name) },
    effect: callback => callback(),
    on: (name, callback) => listeners.set(name, callback),
  }
  const agent = { ctx: { tools: { register: wrapper => {
    tools.set(wrapper.name, wrapper)
    return () => {}
  } } } }
  assert.ok(inject.includes('webStartup'))
  apply(ctx)
  listeners.get('agent/created')({ agent })

  const url = `http://192.0.2.10:28032/assistant${REPORT_ROUTE}/${runId}/download`
  const single = await tools.get('analyze_threat_incident').execute({})
  assert.equal(single.delivery.storage.report.download_url, url)
  assert.ok(single.delivery.markdown.includes(`](<${url}>)`))
  const batch = await tools.get('analyze_pending_threat_incidents').execute({})
  assert.equal(batch.results[0].download_url, url)
  assert.ok(batch.report_delivery_markdown.includes(`](<${url}>)`))
  const saved = JSON.parse(await readFile(join(directory, 'result.json'), 'utf8'))
  assert.equal(saved.delivery.storage.report.download_url, url)
  assert.ok((await readFile(join(directory, 'summary.md'), 'utf8')).includes(`](<${url}>)`))
  assert.deepEqual(await readFile(join(directory, 'report.html')), bytes)
})
