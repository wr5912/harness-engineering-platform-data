import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

async function fixture(scriptOverride) {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const match = source.match(/const BRIDGE_SCRIPT = (\[[\s\S]*?\n    \])\.join\(''\)/)
  assert.ok(match, '使用实际注入脚本')
  const script = scriptOverride ?? vm.runInNewContext(match[1] + ".join('')")
  const listeners = new Map(), notifications = [], messages = []
  let throws = false
  const parent = { postMessage(message) { if (throws) throw Error('delivery failed'); messages.push(message) } }
  const window = {
    addEventListener(name, listener) { listeners.set(name, listener) },
    dispatchEvent(event) { notifications.push(event.detail); return true },
  }
  const context = { window, parent, setTimeout() {}, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail } }, document: { body: { getBoundingClientRect() { return { height: 80 } } }, documentElement: { style: { setProperty() {} } } } }
  vm.runInNewContext(script, context)
  return { api: window.dsh, notifications, messages,
    host(data, source = parent) { listeners.get('message')({ source, data: { __dshUiHost: 1, v: 1, ...data } }) },
    fail(value) { throws = value },
  }
}

test('真实注入桥在合法宿主握手前不可发送，ready只读', async () => {
  const f = await fixture()
  assert.equal(f.api.ready, false)
  assert.equal(f.api.emit('asset-table:confirm', {}), false)
  f.host({ ready: true }, {})
  assert.equal(f.api.ready, false)
  f.host({ ready: true, sending: false, settled: false, error: null })
  assert.equal(f.api.ready, true)
  assert.equal(Reflect.set(f.api, 'ready', false), false)
  assert.equal(f.api.ready, true)
})

test('emit仅排队，发送中重复操作被拒，服务端失败恢复重试', async () => {
  const f = await fixture()
  f.host({ ready: true, sending: false, error: null })
  assert.equal(f.api.emit('asset-table:edit', { value: '真实值' }), true)
  assert.equal(f.api.ready, false)
  assert.equal(f.notifications.at(-1).sending, true)
  assert.equal(f.notifications.at(-1).settled, false)
  assert.equal(f.api.emit('asset-table:confirm', {}), false)
  assert.equal(f.messages.filter(x => x.__dshUiEvent === 1).length, 1)
  f.host({ ready: true, sending: false, error: 'network' })
  assert.equal(f.api.ready, true)
  assert.equal(f.notifications.at(-1).error, 'network')
  assert.equal(f.api.emit('asset-table:cancel', {}), true)
})

test('已结束状态不可被迟到握手重新开放', async () => {
  const f = await fixture()
  f.host({ ready: true, sending: false })
  f.host({ settled: true, sending: false, ready: false, error: null })
  f.host({ settled: false, sending: false, ready: true, error: null })
  assert.equal(f.api.ready, false)
  assert.equal(f.notifications.at(-1).settled, true)
  assert.equal(f.api.emit('asset-table:confirm', {}), false)
})

test('postMessage失败如实返回false，并通知失败后允许重试', async () => {
  const f = await fixture()
  f.host({ ready: true, sending: false })
  f.fail(true)
  assert.equal(f.api.emit('asset-table:confirm', {}), false)
  assert.equal(f.api.ready, true)
  assert.equal(f.notifications.at(-1).sending, false)
  assert.ok(f.notifications.at(-1).error)
  f.fail(false)
  assert.equal(f.api.emit('asset-table:confirm', {}), true)
})


// 执行真实组件和 srcDoc 注入脚本；仅 React 调度、DOM 与 HTTP 边界为离线替身。
async function hostFixture(kind, { enabled = true, unavailable = false, statusPending = false, ended = false } = {}) {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const slots = [], effects = [], listeners = new Set(), requests = [], hostMessages = []
  let cursor = 0, dirty = true, tree, api, widget, previousDoc, response, resolveStatus
  const statusGate = new Promise(resolve => { resolveStatus = resolve })
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children } },
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], next => { const value = typeof next === 'function' ? next(slots[i]) : next; if (!Object.is(value, slots[i])) { slots[i] = value; dirty = true } }]
    },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
    useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { const old = slots[i]; slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn() }) } },
  }
  const frameWindow = { postMessage(data) { hostMessages.push(data); widget?.host(data) } }
  const frame = { contentWindow: frameWindow }
  const fetch = async (url, options) => {
    if (!options?.method) {
      if (statusPending) await statusGate
      return { ok: !unavailable, json: async () => ({ ok: true, bridgeEnabled: enabled }) }
    }
    requests.push({ url, body: JSON.parse(options.body), options })
    return new Promise((resolve, reject) => { response = { resolve, reject } })
  }
  const window = {
    location: { href: 'https://example.test/hep/instances/target/' },
    __ModuleLoader__: { load({ factory }) { api = factory(() => React) } },
    addEventListener(name, fn) { if (name === 'message') listeners.add(fn) },
    removeEventListener(name, fn) { if (name === 'message') listeners.delete(fn) },
  }
  vm.runInNewContext(source, { window, fetch, URL, document: { documentElement: {} }, getComputedStyle() { return { getPropertyValue() { return '' } } } })
  const props = kind === 'row'
    ? { phase: ended ? 'result' : 'running', callId: 'offline-call', block: ended ? { call: { argsRaw: JSON.stringify({ html: '<body>table</body>', wait_for_interaction: true }) }, meta: { status: 'interaction' } } : { argsRaw: JSON.stringify({ html: '<body>table</body>', wait_for_interaction: true }) } }
    : { uiId: 'offline-call', meta: { status: ended ? 'interaction' : 'presented', html: '<body>table</body>' } }
  const component = kind === 'row' ? api.UiHtmlRow : api.SettledCard
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flat(Infinity).flatMap(nodes)]
  async function flush() {
    for (let pass = 0; pass < 12; pass++) {
      await new Promise(resolve => setImmediate(resolve))
      if (!dirty) continue
      dirty = false; cursor = 0; tree = component(props)
      const iframe = nodes(tree).find(node => node.type === 'iframe')
      if (iframe) {
        iframe.props.ref.current = frame
        if (iframe.props.srcDoc !== previousDoc) {
          previousDoc = iframe.props.srcDoc
          const scripts = [...previousDoc.matchAll(/<script>([\s\S]*?)<\/script>/g)]
          widget = await fixture(scripts.at(-1)[1])
        }
      }
      while (effects.length) effects.shift()()
    }
  }
  const dispatch = (data, source = frameWindow) => { for (const fn of [...listeners]) fn({ source, data }) }
  await flush()
  return {
    get widget() { return widget }, requests, hostMessages, flush, dispatch,
    async handshake() { dispatch({ __dshUiReady: 1, v: 1 }); await flush() },
    async available() { resolveStatus(); await flush() },
    async emit() { const ok = widget.api.emit('asset-table:confirm', { preview_digest: 'offline-preview', session: 'offline-session' }); const data = widget.messages.at(-1); if (ok) dispatch(data); await flush(); return ok },
    async reply(body = { ok: true }, ok = true) { response.resolve({ ok, json: async () => body }); await flush() },
    async fail() { response.reject(Error('offline network failure')); await flush() },
    text() { return nodes(tree).flatMap(node => node.children).filter(x => typeof x === 'string').join('\n') },
  }
}

for (const kind of ['row', 'tail']) {
  test(`${kind} 首次呈现/回载须等宿主就绪，失败可重试，成功后永久结束`, async () => {
    const f = await hostFixture(kind, { statusPending: true })
    assert.equal(f.widget.api.ready, false)
    await f.handshake()
    assert.equal(f.widget.api.ready, false)
    await f.available()
    assert.equal(f.widget.api.ready, true)
    assert.equal(await f.emit(), true)
    assert.equal(f.widget.notifications.at(-1).sending, true)
    assert.equal(f.widget.notifications.at(-1).settled, false)
    // 绕过 SDK 连发也只能有一个 HTTP 请求，不能依赖 React 下一次渲染。
    f.dispatch({ __dshUiEvent: 1, v: 1, name: 'asset-table:cancel', payload: {} })
    assert.equal(f.requests.length, 1)
    await f.fail()
    assert.equal(f.widget.api.ready, true)
    assert.ok(f.widget.notifications.at(-1).error)
    assert.equal(await f.emit(), true)
    await f.reply()
    assert.equal(f.widget.api.ready, false)
    assert.equal(f.widget.notifications.at(-1).settled, true)
    await f.handshake()
    assert.equal(await f.emit(), false)
    assert.equal(f.requests.length, 2)
    assert.equal(f.requests[0].url, '/hep/instances/target/plugins/dsh-ui-html/event')
    assert.equal(f.requests[0].body.uiId, 'offline-call')
    assert.equal(f.requests[0].body.payload.preview_digest, 'offline-preview')
    assert.equal(f.requests[0].body.payload.session, 'offline-session')
    assert.equal(f.requests[0].options.headers['x-dsh-ui-html'], '1')
  })

  test(`${kind} 禁用/不可用宿主保留提示且拒绝伪造事件`, async () => {
    for (const options of [{ enabled: false }, { unavailable: true }]) {
      const f = await hostFixture(kind, options)
      await f.handshake()
      assert.equal(f.widget.api.ready, false)
      assert.match(f.text(), /err\.bridge(Off|Down)/)
      f.dispatch({ __dshUiEvent: 1, v: 1, name: 'asset-table:confirm' })
      await f.flush()
      assert.equal(f.requests.length, 0)
    }
  })

  test(`${kind} 服务端拒绝可重试，仅已结束回执永久锁定`, async () => {
    for (const code of ['no-agent', 'forbidden', 'too-large', 'already-settled', 'unknown-ui']) {
      const f = await hostFixture(kind)
      await f.handshake()
      assert.equal(await f.emit(), true)
      await f.reply({ ok: false, code }, false)
      const closed = ['already-settled', 'unknown-ui'].includes(code)
      assert.equal(f.widget.api.ready, !closed)
      assert.equal(f.widget.notifications.at(-1).settled, closed)
      assert.ok(f.widget.notifications.at(-1).error)
    }
  })

  test(`${kind} 已结束回载不可操作且拒绝同一轮重复投递`, async () => {
    const ended = await hostFixture(kind, { ended: true })
    await ended.handshake()
    assert.equal(ended.widget.api.ready, false)
    assert.equal(ended.widget.notifications.at(-1).settled, true)
    const f = await hostFixture(kind)
    await f.handshake()
    const data = { __dshUiEvent: 1, v: 1, name: 'asset-table:confirm', payload: {} }
    f.dispatch(data, {})
    assert.equal(f.requests.length, 0)
    f.dispatch(data); f.dispatch(data)
    assert.equal(f.requests.length, 1)
    await f.reply()
  })
}
