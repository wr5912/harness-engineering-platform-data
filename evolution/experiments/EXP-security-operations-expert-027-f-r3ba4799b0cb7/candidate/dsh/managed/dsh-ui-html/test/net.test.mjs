import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { isTrustedPeer, isSameOriginHeaders, inCidr, peerAddress, isLoopbackAddress } from '../lib/protocol.js'

test('默认空列表仅 loopback；非受信 peer 伪造 forwarded 无效', () => {
  assert.equal(isTrustedPeer('127.0.0.1', []), true)
  assert.equal(isTrustedPeer('10.200.0.1', []), false)
  // 非受信 peer：即使带 x-forwarded-host，同源判断仍以真实 Host 为准
  const headers = { host: 'inner:18502', origin: 'https://public.example', 'x-forwarded-host': 'public.example' }
  assert.equal(isSameOriginHeaders(headers, false), false)
  assert.equal(isSameOriginHeaders(headers, true), true)
})
test('受信 peer 精确 /32 匹配与非法 CIDR 闭合', () => {
  assert.equal(inCidr('10.200.0.1', '10.200.0.1/32'), true)
  assert.equal(inCidr('10.200.0.2', '10.200.0.1/32'), false)
  assert.equal(inCidr('10.200.0.1', '10.200.0.0/24'), true)
  assert.equal(inCidr('10.200.1.1', '10.200.0.0/24'), false)
  assert.equal(inCidr('10.200.0.1', 'x/32'), false)
  assert.equal(inCidr('10.200.0.1', '10.200.0.1/33'), false)
  assert.equal(inCidr('10.200.0.1', '999.0.0.1/32'), false)
  assert.equal(isTrustedPeer('10.200.0.1', ['10.200.0.1/32']), true)
  assert.equal(isTrustedPeer('10.200.0.9', ['10.200.0.1/32']), false)
})
test('IPv4 映射 IPv6 归一与同源拒绝', () => {
  assert.equal(peerAddress('::ffff:10.200.0.1'), '10.200.0.1')
  assert.equal(isTrustedPeer('::ffff:10.200.0.1', ['10.200.0.1/32']), true)
  assert.equal(isSameOriginHeaders({ host: 'a.example', origin: 'https://b.example' }, false), false)
  assert.equal(isSameOriginHeaders({ host: 'a.example', origin: 'https://a.example', 'sec-fetch-site': 'cross-site' }, false), false)
  assert.equal(isSameOriginHeaders({ host: 'a.example', origin: 'https://a.example', 'sec-fetch-site': 'same-origin' }, false), true)
})
test('真实 HTTP 请求：loopback 通过，非受信来源被拒', async () => {
  const decide = (req) => {
    const trusted = isTrustedPeer(req.socket.remoteAddress, [])
    if (!isLoopbackAddress(req.socket.remoteAddress) && !trusted) return 'not-loopback'
    if (!isSameOriginHeaders(req.headers, trusted)) return 'cross-origin'
    return 'ok'
  }
  const server = http.createServer((req, res) => {
    const verdict = decide(req)
    res.writeHead(verdict === 'ok' ? 200 : 403, { 'content-type': 'text/plain' })
    res.end(verdict)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const ok = await fetch(`http://127.0.0.1:${port}/plugins/dsh-ui-html/status`, { headers: { origin: `http://127.0.0.1:${port}` } })
  assert.equal(ok.status, 200)
  const cross = await fetch(`http://127.0.0.1:${port}/plugins/dsh-ui-html/status`, { headers: { origin: 'https://evil.example' } })
  assert.equal(cross.status, 403)
  assert.equal(await cross.text(), 'cross-origin')
  await new Promise((resolve) => server.close(resolve))
})
