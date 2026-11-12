import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

async function client(fetch, pathname = '/') {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  let api
  const context = {
    window: { location: { href: `https://example.test${pathname}`, pathname }, __ModuleLoader__: { load({ factory }) { api = factory(() => ({ createElement() {} })) } } },
    URL, fetch,
  }
  vm.runInNewContext(source.replace('return { inject, apply, UiHtmlRow, TurnCards, SettledCard }', 'return { loadBridgeInfo, inject, apply, UiHtmlRow, TurnCards, SettledCard }'), context)
  return api
}

for (const pathname of ['/', '/hep/instances/target/']) {
  test(`status 与 event 使用同一个完整挂载路径：${pathname}`, async () => {
    const requests = []
    const api = await client(async url => {
      requests.push(String(url))
      return { ok: true, json: async () => ({ ok: true, plugin: '@eaglezlee/dsh-ui-html', bridgeEnabled: true }) }
    }, pathname)
    const bridge = await api.loadBridgeInfo()
    const eventUrl = new URL(`${bridge.prefix}/event`, `https://example.test${pathname}`)
    const statusUrl = new URL(requests[0], `https://example.test${pathname}`)
    assert.equal(eventUrl.pathname, statusUrl.pathname.replace(/\/status$/, '/event'))
    assert.equal(statusUrl.pathname, `${pathname}plugins/dsh-ui-html/status`)
  })
}

test('瞬时失败不缓存 null，后续可以重新连接', async () => {
  let available = false
  const api = await client(async () => ({ ok: available, json: async () => ({ ok: true, plugin: '@eaglezlee/dsh-ui-html' }) }))
  assert.equal(await api.loadBridgeInfo(), null)
  available = true
  assert.notEqual(await api.loadBridgeInfo(), null)
})
