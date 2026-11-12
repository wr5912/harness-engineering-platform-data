// 纯离线浏览器回归：合成冻结预览与模拟宿主握手，不连接或扫描真实业务。
import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'

const html = await readFile(new URL('../dsh/workspace/.agents/skills/asset-onboarding/assets/asset-table.html', import.meta.url), 'utf8')
const preview = { session: 'offline-table-test', preview_digest: 'a'.repeat(64), summary: { pending: 2, source: { kind: 'excel' } }, table: { columns: ['序号', 'IP', '名称', '设备类型', '操作系统', '部署形态', '状态'], rows: [['1', '192.0.2.10', '应用服务-02', 'server（服务器）', 'Linux', '虚拟机', '可提交'], ['2', '192.0.2.11', '空白待核对', '', '', '', '待补全']] } }
let browser, directory, ws, send, unavailable
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'asset-table-browser-'))
  browser = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  browser.stderr.on('data', chunk => { stderr += chunk })
  browser.on('error', error => { unavailable = error.message })
  const deadline = Date.now() + 15000
  let endpoint
  while (!endpoint && !unavailable && Date.now() < deadline) {
    endpoint = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)?.[1]
    if (!endpoint) await new Promise(resolve => setTimeout(resolve, 50))
  }
  if (!endpoint) { unavailable ||= 'Chrome DevTools unavailable'; return }
  ws = new WebSocket(endpoint)
  await once(ws, 'open')
  let sequence = 0
  const pending = new Map()
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id); clearTimeout(entry.timer)
    message.error ? entry.reject(Error(message.error.message)) : entry.resolve(message.result)
  })
  send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timeout`)) }, 10000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
})
after(async () => {
  ws?.close()
  if (browser && browser.exitCode === null) { browser.kill(); await once(browser, 'exit') }
  if (directory) await rm(directory, { recursive: true, force: true })
})
async function page(t, { width = 708, data = preview, ready = true, result = true } = {}) {
  if (unavailable) { t.skip(unavailable); return }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression: typeof expression === 'function' ? `(${expression})()` : expression, awaitPromise: true, returnByValue: true }, sessionId)
    if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
    return response.result.value
  }
  await send('Emulation.setDeviceMetricsOverride', { width, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId)
  const setup = `<script>window.events=[];window.dsh={ready:${ready},emit(name,payload){window.events.push({name,payload});return ${result}}};<\/script>`
  await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html.replace('__ASSET_PREVIEW_DATA__', JSON.stringify(data)).replace('<body>', '<body>' + setup)) }, sessionId)
  await evaluate('new Promise(resolve => { if(document.readyState === "complete")resolve();else addEventListener("load",resolve,{once:true}) })')
  t.after(() => send('Target.closeTarget', { targetId }))
  return { evaluate, state: value => evaluate(`window.dsh.ready=${Boolean(value.ready)};window.dispatchEvent(new CustomEvent('dsh:state',{detail:${JSON.stringify(value)}}))`) }
}

test('宿主握手前全部失活，ready后才开放编辑与取消', async t => {
  const p = await page(t, { ready: false }); if (!p) return
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('input,button')].every(el => el.disabled)), true)
  await p.state({ ready: true, settled: false, sending: false })
  assert.equal(await p.evaluate(() => document.querySelector('input').disabled), false)
  assert.equal(await p.evaluate(() => document.querySelector('#cancel').disabled), false)
})

test('唯一七列表显示新label，空字段不猜值，无重复标题和作者控件', async t => {
  const p = await page(t); if (!p) return
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('th')].map(el => el.textContent)), ['序号', 'IP 地址', '资产名称', '设备类型', '操作系统', '部署形态', '状态'])
  assert.equal(await p.evaluate(() => document.querySelectorAll('table').length), 1)
  assert.equal(await p.evaluate(() => document.querySelectorAll('h2,form,select').length), 0)
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('tbody tr')[1].querySelectorAll('input')].map(el => el.value)), ['空白待核对', '', '', ''])
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('datalist option')].map(el => el.value)), ['物理设备', '虚拟机', '容器'])
  assert.equal(await p.evaluate(() => document.querySelector('#stats').getBoundingClientRect().top >= document.querySelector('table').getBoundingClientRect().bottom), true)
})

for (const width of [640, 662, 708, 375]) test(`${width}px完整呈现七字段，按钮等尺寸且移动触达44px`, async t => {
  const p = await page(t, { width }); if (!p) return
  const layout = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, cells: [...document.querySelector('tbody tr').children].map(el => { const r = el.getBoundingClientRect(); return { visible: getComputedStyle(el).display !== 'none', left: r.left, right: r.right } }), buttons: [...document.querySelectorAll('button')].map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height, left: r.left } }) }))
  assert.equal(layout.overflow, false)
  assert.equal(layout.cells.length, 7)
  assert.ok(layout.cells.every(cell => cell.visible && cell.left >= 0 && cell.right <= width))
  assert.equal(layout.buttons[0].width, layout.buttons[1].width)
  assert.equal(layout.buttons[0].height, layout.buttons[1].height)
  assert.ok(layout.buttons[0].left < layout.buttons[1].left)
  if (width === 375) assert.ok(layout.buttons.every(button => button.height >= 44))
})

test('输入立即失效旧确认，change仅回传单次edit且等最新预览', async t => {
  const data = structuredClone(preview); data.table.rows = data.table.rows.slice(0, 1); data.summary.pending = 1
  const p = await page(t, { data }); if (!p) return
  assert.equal(await p.evaluate(() => document.querySelector('#confirm').disabled), false)
  await p.evaluate(() => { const el = document.querySelector('input'); el.value = '新名称'; el.dispatchEvent(new Event('input', { bubbles: true })) })
  assert.equal(await p.evaluate(() => document.querySelector('#confirm').disabled), true)
  await p.evaluate(() => { const el = document.querySelector('input'); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('#confirm').click() })
  const events = await p.evaluate(() => window.events)
  assert.equal(events.length, 1); assert.equal(events[0].name, 'asset-table:edit')
  assert.equal(events[0].payload.field, 'hostname'); assert.equal(events[0].payload.value, '新名称')
  assert.equal(events[0].payload.preview_digest, data.preview_digest)
  await p.state({ ready: true, settled: false, sending: false })
  assert.equal(await p.evaluate(() => document.querySelector('#confirm').disabled), true)
})

test('emit true仅排队，失败可重试，settled永久失活', async t => {
  const p = await page(t); if (!p) return
  await p.evaluate(() => document.querySelector('#cancel').click())
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('input,button')].every(el => el.disabled)), true)
  assert.match(await p.evaluate(() => document.querySelector('#hint').textContent), /等待|正在取消/)
  assert.doesNotMatch(await p.evaluate(() => document.querySelector('#hint').textContent), /已取消|取消成功/)
  await p.state({ ready: true, settled: false, sending: false, error: '模拟投递失败' })
  assert.equal(await p.evaluate(() => document.querySelector('#cancel').disabled), false)
  await p.evaluate(() => document.querySelector('#cancel').click())
  assert.equal((await p.evaluate(() => window.events)).length, 2)
  await p.state({ ready: true, settled: true, sending: false })
  await p.state({ ready: true, settled: false, sending: false })
  assert.equal(await p.evaluate(() => [...document.querySelectorAll('input,button')].every(el => el.disabled)), true)
})

test('桥未送达不伪成功且可重试，不存在postMessage fallback或结果定时器', async t => {
  assert.doesNotMatch(html, /\.postMessage\s*\(/)
  assert.doesNotMatch(html, /setTimeout\s*\(/)
  const p = await page(t, { result: false }); if (!p) return
  await p.evaluate(() => document.querySelector('#cancel').click())
  assert.equal(await p.evaluate(() => document.querySelector('#cancel').disabled), false)
  assert.match(await p.evaluate(() => document.querySelector('#hint').textContent), /未送达|不可用/)
})
