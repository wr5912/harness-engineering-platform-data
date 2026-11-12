import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'

// 执行真实桥路由；仅 DSH 消息工厂与 HTTP socket/response 为离线替身。
// 不建立业务 Session，不连接 SOC，不代表实际装载或浏览器业务验收。
const gatewayOrigin = 'http://172.16.138.228:53105'
// docker inspect security-operations-expert-0cb7 的当前目标网络 Gateway。
const gatewayPeer = '10.200.9.1'
const source = (await readFile(new URL('../lib/bridge.js', import.meta.url), 'utf8'))
  .replace("import { createUserMessage } from '@deepseek-ai/dsh-llm'", 'const createUserMessage = value => value')
  .replace("'./protocol.js'", JSON.stringify(new URL('../lib/protocol.js', import.meta.url).href))
const { createBridge } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

async function fixture() {
  const patch = await readFile(new URL('../../security-operations-expert.patch.yml', import.meta.url), 'utf8')
  const block = patch.slice(patch.indexOf('    - id: ui-html'))
  const cidrs = [...(block.match(/trustedProxyCidrs:\n((?:[ \t]+- [^\n]+\n?)+)/)?.[1] ?? '').matchAll(/- ([^\n]+)/g)].map(m => m[1].trim())
  const routes = new Map()
  const bridge = createBridge({
    ctx: { webServer: { register({ path, handler }) { routes.set(path, handler); return () => routes.delete(path) } } },
    settings: { trustedProxyCidrs: () => cidrs, eventBridgeEnabled: () => true,
      maxEventBytes: () => 65536, maxHtmlBytes: () => 262144,
      interactionTimeoutMs: () => 0, allowedResourceOrigins: () => [] },
  })
  bridge.setEnabled(true)
  return async function request({ address = gatewayPeer, headers = {} } = {}) {
    const req = Readable.from([])
    req.method = 'GET'
    req.socket = { remoteAddress: address }
    // 正式网关清除来访者转发头后重建 x-forwarded-host/proto，重写 Host。
    req.headers = { host: '127.0.0.1:18505', 'x-forwarded-host': new URL(gatewayOrigin).host,
      'x-forwarded-proto': 'http', 'sec-fetch-site': 'same-origin', ...headers }
    let status, body
    await routes.get('/plugins/dsh-ui-html/status')(req, {
      writeHead(code) { status = code }, end(value) { body = JSON.parse(value) },
    })
    return { status, body }
  }
}

test('目标实际配置应接纳 0cb7 网关 peer：修复前复现 403 not-loopback', async () => {
  const request = await fixture()
  for (const headers of [{}, { origin: gatewayOrigin }]) {
    const result = await request({ headers })
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.equal(result.body.bridgeEnabled, true)
  }
})
test('非受信 peer 不因伪造合法 Origin/转发头而放行', async () => {
  const request = await fixture()
  for (const address of ['10.200.9.3', '10.200.0.1', '192.0.2.10']) {
    const result = await request({ address, headers: { origin: gatewayOrigin } })
    assert.equal(result.status, 403)
    assert.deepEqual(result.body, { ok: false, code: 'forbidden', message: 'not-loopback' })
  }
})
test('受信网关仍拒绝跨源 Origin 与跨站 Fetch Metadata', async () => {
  const request = await fixture()
  for (const headers of [{ origin: 'https://evil.example' }, { origin: 'null' },
    { origin: 'not-an-origin' }, { origin: gatewayOrigin, 'sec-fetch-site': 'cross-site' },
    { origin: gatewayOrigin, 'sec-fetch-site': 'same-site' }]) {
    const result = await request({ headers })
    assert.equal(result.status, 403)
    assert.equal(result.body.message, 'cross-origin')
  }
})
