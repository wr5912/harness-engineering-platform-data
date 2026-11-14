import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const packagePath = resolve(root, 'package.json')
const clientPath = resolve(root, 'lib/client.js')
const baselinePath = resolve(root, '..', '..', 'workspace', 'references', 'ui-baseline', '方案文档生成工具-静态验收原型.html')
const provenancePath = resolve(root, 'PROVENANCE.md')
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
const client = readFileSync(clientPath, 'utf8')
const baseline = readFileSync(baselinePath)
const digest = createHash('sha256').update(baseline).digest('hex')
const checks = [
  ['package.name', pkg.name === '@business/ai-proposal-workbench'],
  ['package.exports.client', pkg.exports?.['./client'] === './lib/client.js'],
  ['module-loader-id', client.includes(`id: '${pkg.name}'`)],
  ['shell.overlay-slot', client.includes("ctx.slots.inject('shell.overlay'")],
  ['native-client-component', client.includes('NativeWorkbench') && client.includes('proposal-workbench-native')],
  ['baseline-data-testid', client.includes('data-testid')],
  ['baseline-data-view', client.includes('data-view')],
  ['event-bridge', ['view.change', 'evidence.select', 'review.submit', 'download.request'].every(name => client.includes(name))],
  ['no-iframe', !client.toLowerCase().includes('<iframe')],
  ['no-external-resource', !client.includes('http://') && !client.includes('https://')],
  ['scoped-css', client.includes('.proposal-workbench-native')],
  ['baseline-digest-recorded', readFileSync(provenancePath, 'utf8').includes(digest)],
]
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
if (checks.some(([, ok]) => !ok)) process.exitCode = 1
console.log(JSON.stringify({ package: pkg.name, baselineSha256: digest, clientBytes: Buffer.byteLength(client), checks: Object.fromEntries(checks) }, null, 2))
