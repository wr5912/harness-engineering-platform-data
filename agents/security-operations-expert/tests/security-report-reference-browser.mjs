// 离线生产模板的真实 Chrome 技术验证；不是业务 Run，不执行用户参考附件。
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
assert.equal(ROOT, '/home/cmp/harness-engineering-platform-data', '仅允许固定数据工作区')
const OUTPUT = path.join(ROOT, 'agents/security-operations-expert/docs/report-format-reference-20261107')
const RUNTIME = path.join(OUTPUT, '.browser-runtime')
const REVIEWED_REPLACEMENT = process.argv.includes('--replace-reviewed')
const FIXTURES = path.join(ROOT, 'agents/security-operations-expert/tests/security-report-reference-fixtures.mjs')
const SOURCES = ['common.ts', 'inspection.ts', 'troubleshooting.ts'].map(name => path.join(ROOT, 'mcp/src/reports', name))
const PLAYWRIGHT = path.join(ROOT, 'evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/dsh-voice-hub/node_modules/playwright-core/index.mjs')
const checks = [], runtimeErrors = [], blockedRequests = [], httpRequests = [], requestFailures = []
const result = {
  schema_version: 1, kind: 'synthetic-offline-browser-checks', agent_id: 'security-operations-expert',
  experiment_context: 'EXP-security-operations-expert-027-f-r3ba4799b0cb7',
  started_at: new Date().toISOString(), completed_at: null, status: 'running',
  boundary: '仅用固定合成 fixtures 调用当前生产纯 render 接口，真实 Chrome 打开新生成本地 HTML；不是业务 Run，不证明实例装载、SOC 状态、诊断正确、修复或恢复。未打开用户附件或平台页面。',
  source_sha256: {}, checks, runtime_errors: runtimeErrors, blocked_requests: blockedRequests,
  http_requests: httpRequests, request_failures: requestFailures, artifacts: [],
  browser: { executable: '/usr/bin/google-chrome', viewports: [{ width: 1440, height: 1000 }, { width: 390, height: 844 }], bypass_csp: false, screenshots: { desktop: 'full-page', mobile: 'viewport-390x844' } },
}
const short = error => String(error?.stack || error?.message || error).slice(0, 2000)
const sha = text => createHash('sha256').update(text).digest('hex')
async function exists(file) { try { await access(file); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
function outputPath(name) {
  assert.equal(path.basename(name), name, '产物名禁止带目录或穿越路径')
  const target = path.resolve(OUTPUT, name)
  assert.equal(path.dirname(target), OUTPUT, '仅写入授权的 Agent 文档目录')
  return target
}
async function saveText(name, text) {
  const target = outputPath(name)
  let previous
  try { previous = await readFile(target, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (previous !== text) {
    if (previous !== undefined && !REVIEWED_REPLACEMENT) throw new Error(`产物已有不同内容，须先原生 read 回读后以 --replace-reviewed 重跑：${name}`)
    await writeFile(target, text, 'utf8')
  }
  if (!result.artifacts.includes(name)) result.artifacts.push(name)
  return target
}
async function step(report, viewport, name, action) {
  const started = Date.now()
  try {
    const detail = await action()
    checks.push({ report, viewport, name, status: 'passed', elapsed_ms: Date.now() - started, ...(detail === undefined ? {} : { detail }) })
  } catch (error) {
    checks.push({ report, viewport, name, status: 'failed', elapsed_ms: Date.now() - started, error: short(error) })
    console.error(`失败 ${report}/${viewport}/${name}: ${error.message}`)
  }
}
async function noPageOverflow(page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  assert.ok(size.document <= size.viewport + 1 && size.body <= size.viewport + 1, `整页横向溢出：${JSON.stringify(size)}`)
  return size
}
async function selectedTab(page, index) {
  const tabs = page.locator('[data-tab]')
  const tab = tabs.nth(index), id = await tab.getAttribute('data-tab')
  assert.equal(await tab.getAttribute('aria-selected'), 'true')
  assert.equal(await tab.getAttribute('tabindex'), '0')
  assert.equal(await page.locator('[data-tab][aria-selected="true"]').count(), 1)
  assert.equal(await page.locator('[data-view]:visible').count(), 1)
  assert.equal(await page.locator('[data-view]:visible').getAttribute('data-view'), id)
}
async function selectedCause(page, index) {
  const cause = page.locator('[data-cause-select]').nth(index)
  const id = await cause.getAttribute('data-cause-select')
  assert.equal(await cause.getAttribute('aria-selected'), 'true')
  assert.equal(await cause.getAttribute('tabindex'), '0')
  assert.equal(await page.locator('[data-cause-select][aria-selected="true"]').count(), 1)
  assert.equal(await page.locator('[data-cause-panel]:visible').getAttribute('data-cause-panel'), id)
}
async function inspectionInteractions(page, report, viewport) {
  const search = page.locator('#report-search'), rows = page.locator('tr[data-record]')
  await step(report, viewport, '巡检KPI、基线原值与组合筛选', async () => {
    const summaryStates = await page.getByRole('heading', { name: '30 秒速读', exact: true }).locator('..').locator('dt').evaluateAll(nodes => Object.fromEntries(nodes.map(node => [node.textContent.trim(), node.nextElementSibling?.textContent.trim()])))
    assert.equal(summaryStates['执行状态（外层 Run）'], '未提供外层执行回执')
    assert.equal(summaryStates['源检查结果状态（非外层执行）'], '部分完成')
    assert.ok(Object.hasOwn(summaryStates, '结果完整性（展示核对）') && Object.hasOwn(summaryStates, '业务结论（已有事实）'))
    const vulnerabilityMetric = page.locator('article.metric').filter({ has: page.getByRole('heading', { name: '漏洞观测记录', exact: true }) })
    const vulnerabilityValue = (await vulnerabilityMetric.locator('strong').innerText()).trim()
    assert.match(vulnerabilityValue, /^1\s*条观测$/)
    assert.doesNotMatch(await vulnerabilityMetric.innerText(), /未返回观测/)
    const coverageRows = page.getByRole('heading', { name: '基线模板与覆盖依据', exact: true }).locator('..').locator('tbody tr')
    const passFlags = {}
    for (const [ip, expected] of [['192.0.2.10', '1'], ['192.0.2.20', '0']]) {
      const row = coverageRows.filter({ hasText: ip })
      assert.equal(await row.count(), 1)
      assert.ok(await row.isVisible())
      const actual = (await row.innerText()).match(/通过标志（原值）：\s*([01])(?:\s|$)/u)?.[1]
      assert.equal(actual, expected, `基线通过原值必须来自真实report.run结构：${ip}`)
      passFlags[ip] = actual
    }
    assert.ok(await rows.count() >= 2)
    await page.locator('[data-filter="设备"]').click()
    await search.fill('192.0.2.20')
    const deviceRows = await page.locator('tr[data-record]:visible').evaluateAll(nodes => nodes.map(node => ({ category: node.dataset.category, text: node.textContent })))
    assert.ok(deviceRows.length > 0)
    assert.ok(deviceRows.every(row => row.category === '设备' && row.text.includes('192.0.2.20')))
    await page.locator('[data-filter="基线"]').click()
    const baselineRows = await page.locator('tr[data-record]:visible').evaluateAll(nodes => nodes.map(node => ({ category: node.dataset.category, text: node.textContent })))
    assert.ok(baselineRows.length > 0)
    assert.ok(baselineRows.every(row => row.category === '基线' && row.text.includes('192.0.2.20')))
    assert.equal(await page.locator('[data-filter][aria-pressed="true"]').count(), 1)
    return { outer_run_execution: summaryStates['执行状态（外层 Run）'], source_check_result: summaryStates['源检查结果状态（非外层执行）'], vulnerability_metric: vulnerabilityValue, baseline_pass_flags: passFlags, device_matches: deviceRows.length, baseline_matches: baselineRows.length }
  })
  await step(report, viewport, '巡检零匹配不当作通过', async () => {
    await search.fill('NO-MATCH-SYNTHETIC-87219')
    assert.equal(await page.locator('tr[data-record]:visible').count(), 0)
    assert.equal(await page.locator('[data-evidence-panel]:visible').count(), 0)
    assert.ok(await page.locator('#no-matches').isVisible())
    assert.match(await page.locator('#no-matches').innerText(), /不代表巡检已通过/)
  })
  await step(report, viewport, '巡检Enter与空格聚焦对应证据', async () => {
    await search.fill('')
    await page.locator('[data-filter="全部"]').click()
    const visible = page.locator('tr[data-record]:visible')
    for (const [index, key] of [[0, 'Enter'], [1, 'Space']]) {
      const row = visible.nth(index), id = await row.getAttribute('data-record')
      await row.focus()
      await row.press(key)
      const actual = await page.evaluate(() => ({ panel: document.activeElement?.closest('[data-evidence-panel]')?.getAttribute('data-evidence-panel'), tag: document.activeElement?.tagName }))
      assert.deepEqual(actual, { panel: id, tag: 'H3' })
      assert.equal(await page.locator('[data-evidence-panel]:visible').count(), 1)
    }
  })
}
async function faultInteractions(page, report, viewport, fixture) {
  const tabs = page.locator('[data-tab]')
  await step(report, viewport, '故障四页签点击与ARIA', async () => {
    assert.equal(await tabs.count(), 4)
    for (let index = 0; index < 4; index++) { await tabs.nth(index).click(); await selectedTab(page, index) }
    await tabs.nth(0).click()
  })
  await step(report, viewport, '故障页签左右与HomeEnd', async () => {
    await tabs.nth(0).focus()
    for (const [key, index] of [['ArrowRight', 1], ['ArrowLeft', 0], ['End', 3], ['Home', 0]]) {
      await page.keyboard.press(key)
      await selectedTab(page, index)
      assert.ok(await tabs.nth(index).evaluate(node => node === document.activeElement))
    }
  })
  await step(report, viewport, '原因选择上下与HomeEnd或真实缺失空态', async () => {
    const causes = page.locator('[data-cause-select]')
    const expected = fixture.causes?.length || 0
    assert.equal(await causes.count(), expected)
    if (!expected) {
      assert.match(await page.locator('[data-view="symptoms"]').innerText(), /未保存真实结构化 causes/)
      return { causes: 0, boundary: '没有结构化原因，不伪造原因选择器' }
    }
    assert.equal(expected, 2)
    await causes.nth(0).focus()
    for (const [key, index] of [['ArrowDown', 1], ['ArrowUp', 0], ['End', 1], ['Home', 0]]) {
      await page.keyboard.press(key)
      await selectedCause(page, index)
      assert.ok(await causes.nth(index).evaluate(node => node === document.activeElement))
    }
    return { causes: expected }
  })
  await step(report, viewport, '证据dialog精确记录与关闭恢复焦点', async () => {
    await tabs.nth(0).click()
    const button = page.locator('[data-view="symptoms"] [data-show-evidence]').first()
    const id = await button.getAttribute('data-show-evidence')
    await button.click()
    const dialog = page.locator('#evidence-dialog')
    assert.ok(await dialog.isVisible())
    assert.equal(await dialog.locator('.evidence-record').count(), 1)
    const expectedRef = fixture.items[0].raw_receipt_refs[0].receipt_id
    assert.ok((await page.locator('#evidence-dialog-body').innerText()).includes(expectedRef))
    await page.locator('[data-close-dialog]').click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-show-evidence')), id)
    await button.click()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-show-evidence')), id)
  })
  await step(report, viewport, '过程证据入口与焦点恢复', async () => {
    await tabs.nth(2).click()
    const button = page.locator('[data-view="process"] [data-show-evidence]').first()
    await button.click()
    assert.ok(await page.locator('#evidence-dialog').isVisible())
    assert.ok((await page.locator('#evidence-dialog-body').innerText()).includes(fixture.items[0].raw_receipt_refs[0].receipt_id))
    await page.locator('[data-close-dialog]').click()
    await page.locator('#evidence-dialog').waitFor({ state: 'hidden' })
    assert.ok(await button.evaluate(node => node === document.activeElement))
    await tabs.nth(0).click()
  })
}
async function checkPrint(page, report, viewport, fixture, decodedHtml) {
  await step(report, viewport, '独立打印全量展开与opener隔离', async () => {
    if (report === 'inspection') {
      await page.locator('#report-search').fill('NO-MATCH-SYNTHETIC-PRINT')
      assert.equal(await page.locator('tr[data-record]:visible').count(), 0)
    } else {
      await page.locator('[data-tab="closure"]').click()
      await selectedTab(page, 3)
    }
    const popupPromise = page.waitForEvent('popup', { timeout: 6000 })
    await page.locator('#open-print').click()
    const popup = await popupPromise
    try {
      await popup.waitForURL(url => url.protocol === 'blob:', { timeout: 6000 })
      await popup.waitForLoadState('domcontentloaded')
      assert.equal(await popup.evaluate(() => window.opener === null), true)
      assert.equal(await popup.locator('[hidden],details,template').count(), 0)
      assert.equal(await popup.locator('script').count(), 0)
      assert.equal(await popup.evaluate(() => document.documentElement.outerHTML.includes('Content-Security-Policy')), true)
      const popupBody = await popup.locator('body').innerText()
      assert.match(popupBody, /全量打印版/)
      assert.match(popupBody, /离线格式测试样例/)
      assert.equal(await popup.locator('main h1').count(), 1)
      assert.match(decodedHtml, /全部安全内容，不受页签或筛选影响/)
      if (report === 'inspection') {
        const printedRows = popup.locator('h2').filter({ hasText: '全量检查明细' }).locator('..').locator('tbody tr')
        const entries = Object.values(fixture.checks).flatMap(check => check.items)
        assert.ok(await printedRows.count() >= entries.length)
        for (const entry of entries) assert.ok(await printedRows.filter({ hasText: entry.message }).count() > 0, `打印缺少明细：${entry.message}`)
        assert.equal(await page.locator('tr[data-record]:visible').count(), 0)
        return { source_entries: entries.length, printed_rows: await printedRows.count(), opener_null: true, retained_zero_match_filter: true }
      }
      const chapters = popup.locator('.print-chapter')
      assert.equal(await chapters.count(), 8)
      const headings = await chapters.locator(':scope > h2').allTextContents()
      assert.deepEqual(headings, ['1. 现象', '2. 链路', '3. 过程', '4. 处置恢复', '5. 完整判断依据', '6. 完整安全证据', '7. 缺口边界', '8. 安全来源附录'])
      const fullEvidence = chapters.nth(5)
      assert.equal(await fullEvidence.locator('.evidence-record').count(), fixture.items.length)
      for (const entry of fixture.items) assert.ok((await fullEvidence.innerText()).includes(entry.raw_receipt_refs[0].receipt_id))
      for (const cause of fixture.causes || []) assert.ok((await chapters.nth(4).innerText()).includes(cause.title))
      await selectedTab(page, 3)
      return { chapters: headings, evidence_entries: fixture.items.length, causes: fixture.causes?.length || 0, opener_null: true, retained_closure_tab: true }
    } finally { await popup.close() }
  })
}

let browser
try {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, '需要现有 Node24 原生 TypeScript 支持')
  await mkdir(OUTPUT, { recursive: true })
  await mkdir(RUNTIME, { recursive: true })
  // Unix socket 路径上限约108字节；短别名仍指向同一个获授权的实际目录。
  process.chdir(OUTPUT)
  const tempAlias = `/proc/${process.pid}/cwd/.browser-runtime`
  process.env.TMPDIR = tempAlias
  process.env.TMP = tempAlias
  process.env.TEMP = tempAlias
  const tracked = [...SOURCES, FIXTURES, fileURLToPath(import.meta.url)]
  for (const file of tracked) result.source_sha256[path.relative(ROOT, file)] = sha(await readFile(file))
  const [{ renderInspectionReport }, { renderTroubleshootingReport }, fixtures, { chromium }] = await Promise.all([
    import(pathToFileURL(SOURCES[1]).href), import(pathToFileURL(SOURCES[2]).href), import(pathToFileURL(FIXTURES).href), import(pathToFileURL(PLAYWRIGHT).href),
  ])
  const reports = [
    { name: 'inspection', fixture: fixtures.inspectionFixture(), render: renderInspectionReport, html: 'inspection-format-preview.html', print: 'inspection-print-preview.html' },
    { name: 'fault', fixture: fixtures.faultFixture(), render: renderTroubleshootingReport, html: 'troubleshooting-format-preview.html', print: 'troubleshooting-print-preview.html' },
    { name: 'device-offline', fixture: fixtures.offlineFixture(), render: renderTroubleshootingReport, html: 'device-offline-format-preview.html', print: 'device-offline-print-preview.html' },
  ]
  for (const report of reports) {
    const inputBefore = JSON.stringify(report.fixture)
    report.content = report.render(report.fixture)
    assert.equal(JSON.stringify(report.fixture), inputBefore, '纯 renderer 不得改写 fixture')
    const payload = report.content.match(/<script\b[^>]*\bid="report-print-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/)
    assert.ok(payload, `${report.name} 未提供完整打印载荷`)
    report.decoded = Buffer.from(payload[1].trim(), 'base64').toString('utf8')
    report.file = await saveText(report.html, report.content)
    await saveText(report.print, report.decoded)
    result[`${report.name}_provenance`] = { input_sha256: sha(inputBefore), html_sha256: sha(report.content), print_sha256: sha(report.decoded), offline_note_present: report.content.includes(fixtures.DEMO_NOTE) }
  }
  await saveText('technical-boundaries.md', `# 报告版式技术验证边界\n\n这些 HTML、截图和检查结果仅来自合成离线 fixtures，未查询 SOC、未执行业务 Run，不代表真实巡检、诊断、修复或恢复结论。\n\n- 调用数据根 mcp/src/reports 的生产纯 render 接口，不修改 Candidate、平台配置、发布、绑定或实例。\n- 仅使用已有 Node24、Playwright Core 和系统 Chrome；没有安装依赖。浏览器使用新隔离临时资料目录，不读取已有浏览器资料或凭据。\n- 只导航本目录本次生成的三类本地 HTML 及其内嵌 blob 打印版；禁止 HTTP(S)、其他协议及外部 file 请求。不打开用户参考附件，不执行附件脚本，不访问平台或 53105。\n- 不关闭 CSP、不注入绕过脚本、不修改模板来使测试通过。CSP、JS、网络及交互失败均记录在 browser-checks.json；非零退出如实保留。\n- browser-checks.json 记录合成输入和生产源码摘要、真实 Chrome 检查及技术限制。是否装载到业务实例、真实运行效果和安全语义业务通过均不在此测试范围。\n- 浏览器临时文件仅位于本目录 .browser-runtime；它们不是交付证据，不读取其中状态。\n`)
  const allowedFiles = new Set(reports.map(report => path.resolve(report.file)))
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome', headless: true, downloadsPath: RUNTIME, tracesDir: RUNTIME,
    env: { PATH: '/usr/bin:/bin', HOME: RUNTIME, TMPDIR: tempAlias, TMP: tempAlias, TEMP: tempAlias, XDG_CONFIG_HOME: RUNTIME, XDG_CACHE_HOME: RUNTIME, LANG: 'C.UTF-8' },
    args: ['--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--disable-domain-reliability', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--use-mock-keychain', '--disable-extensions'],
  })
  result.browser.version = browser.version()
  for (const viewport of result.browser.viewports) {
    const label = viewport.width === 1440 ? 'desktop' : 'mobile'
    const context = await browser.newContext({ viewport, locale: 'zh-CN', serviceWorkers: 'block', acceptDownloads: false, bypassCSP: false })
    await context.route('**/*', async route => {
      const request = route.request(), raw = request.url()
      let url
      try { url = new URL(raw) } catch { url = null }
      const protocol = url?.protocol
      let permitted = ['blob:', 'data:', 'about:'].includes(protocol)
      if (protocol === 'file:') {
        try { permitted = allowedFiles.has(path.resolve(fileURLToPath(url))) } catch { permitted = false }
      }
      if (protocol === 'http:' || protocol === 'https:') httpRequests.push({ viewport: label, url: raw.slice(0, 300) })
      if (!permitted) {
        blockedRequests.push({ viewport: label, url: raw.slice(0, 300), method: request.method(), resource_type: request.resourceType() })
        await route.abort('blockedbyclient')
      } else await route.continue()
    })
    const attach = page => {
      page.setDefaultTimeout(2500)
      page.on('pageerror', error => runtimeErrors.push({ viewport: label, page: page.url().slice(0, 200), type: 'pageerror', error: short(error) }))
      page.on('console', message => { if (message.type() === 'error') runtimeErrors.push({ viewport: label, page: page.url().slice(0, 200), type: 'console.error', error: message.text().slice(0, 1600) }) })
      page.on('requestfailed', request => requestFailures.push({ viewport: label, url: request.url().slice(0, 250), failure: request.failure()?.errorText }))
    }
    context.on('page', attach)
    try {
      for (const report of reports) {
        const page = await context.newPage()
        try {
          await page.goto(pathToFileURL(report.file).href, { waitUntil: 'load', timeout: 10000 })
          await step(report.name, label, '初始视口无整页横向溢出', () => noPageOverflow(page))
          await step(report.name, label, '生产CSP、离线合成标识与单一标题', async () => {
            const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
            assert.match(csp, /script-src 'sha256-/)
            assert.ok(!csp.includes('unsafe-eval'))
            assert.ok(await page.locator('#report-print-payload').count() === 1)
            assert.match(await page.locator('main').innerText(), /离线格式测试样例/)
            assert.equal(await page.locator('main h1').count(), 1)
            return { synthetic_disclaimer_visible: true, h1_count: 1, csp_not_bypassed: true }
          })
          if (report.name === 'inspection') await inspectionInteractions(page, report.name, label)
          else await faultInteractions(page, report.name, label, report.fixture)
          await step(report.name, label, '交互后无整页横向溢出', () => noPageOverflow(page))
          await checkPrint(page, report.name, label, report.fixture, report.decoded)
          if (report.name === 'inspection') { await page.locator('#report-search').fill(''); await page.locator('[data-filter="全部"]').click() }
          else await page.locator('[data-tab="symptoms"]').click()
          await page.evaluate(() => window.scrollTo(0, 0))
          if (report.name !== 'device-offline') {
            const name = `${report.name === 'inspection' ? 'inspection' : 'fault'}-${label}.png`
            const target = outputPath(name)
            if (await exists(target) && !REVIEWED_REPLACEMENT) throw new Error(`截图已存在，须先原生 read_image 回读后以 --replace-reviewed 重跑：${name}`)
            // 手机保留真实视口；完整报告由HTML交付，避免超过读图工具的长图上限。
            await page.screenshot({ path: target, fullPage: label === 'desktop', animations: 'disabled' })
            result.artifacts.push(name)
          }
        } catch (error) {
          checks.push({ report: report.name, viewport: label, name: '页面测试基础执行', status: 'failed', error: short(error) })
        } finally { await page.close() }
      }
    } finally { await context.close() }
  }
  await step('all', 'all', '无HTTP外链或越界file请求', async () => {
    assert.equal(httpRequests.length, 0, JSON.stringify(httpRequests))
    assert.equal(blockedRequests.length, 0, JSON.stringify(blockedRequests))
    assert.equal(requestFailures.length, 0, JSON.stringify(requestFailures))
  })
  await step('all', 'all', '无JS或CSP错误', async () => assert.equal(runtimeErrors.length, 0, JSON.stringify(runtimeErrors)))
  await step('all', 'all', '测试期间生产源码与fixtures未漂移', async () => {
    for (const file of tracked) assert.equal(sha(await readFile(file)), result.source_sha256[path.relative(ROOT, file)], `测试期间文件变化：${path.relative(ROOT, file)}`)
  })
} catch (error) {
  result.fatal_error = short(error)
  console.error(`基础执行失败：${error.message}`)
} finally {
  if (browser) await browser.close()
  result.completed_at = new Date().toISOString()
  const failed = checks.filter(check => check.status === 'failed')
  result.summary = { passed: checks.filter(check => check.status === 'passed').length, failed: failed.length, runtime_errors: runtimeErrors.length, blocked_requests: blockedRequests.length, http_requests: httpRequests.length, request_failures: requestFailures.length }
  result.status = result.fatal_error || failed.length ? 'failed' : 'passed'
  result.technical_only = true
  try { await saveText('browser-checks.json', JSON.stringify(result, null, 2) + '\n') } catch (error) { console.error(`结果保存失败：${error.message}`); result.status = 'failed' }
  console.log(JSON.stringify({ status: result.status, summary: result.summary, output: path.relative(ROOT, OUTPUT), technical_only: true }, null, 2))
  process.exitCode = result.status === 'passed' ? 0 : 1
}
