import assert from 'node:assert/strict';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setImmediate as immediate } from 'node:timers/promises';
import test, { after } from 'node:test';
import vm from 'node:vm';

// 仅技术 Mock：执行指定 Candidate 原文；不访问网络、业务工具或浏览器。
const sourceURL = new URL('../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-download/client.js', import.meta.url);
const source = await readFile(sourceURL, 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceHash = hash(source);
const TOOL = 'export_security_report';
const MIME = 'text/html; charset=utf-8';
const encode = text => new TextEncoder().encode(text);

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(child => visit(child, callback));
  callback(node);
  visit(node.props?.children, callback);
}

// 最小 hooks/render Mock：保留 hook 顺序、deps、cleanup、ref 先于 effect 的提交顺序。
// 不模拟 React 调度、StrictMode、DOM 或浏览器下载成功。
function makeRenderer(onAnchorClick) {
  const hooks = [];
  let cursor = 0;
  let dirty = true;
  let mounted = true;
  let pending = [];
  let refs = [];
  let tree;
  let component;
  let props;
  const changed = (before, next) => !before || !next || before.length !== next.length
    || next.some((value, index) => !Object.is(value, before[index]));
  const hook = type => {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { type };
    assert.equal(hooks[index].type, type, 'hook 顺序必须稳定');
    return hooks[index];
  };
  const React = {
    createElement(type, attrs, ...children) { return { type, props: { ...attrs, children } }; },
    useMemo(factory, deps) {
      const item = hook('memo');
      if (changed(item.deps, deps)) { item.value = factory(); item.deps = [...deps]; }
      return item.value;
    },
    useRef(value) {
      const item = hook('ref');
      if (!item.value) item.value = { current: value };
      return item.value;
    },
    useState(initial) {
      const item = hook('state');
      if (!Object.hasOwn(item, 'value')) item.value = typeof initial === 'function' ? initial() : initial;
      if (!item.set) item.set = update => {
        if (!mounted) return;
        const next = typeof update === 'function' ? update(item.value) : update;
        if (!Object.is(next, item.value)) { item.value = next; dirty = true; }
      };
      return [item.value, item.set];
    },
    useEffect(effect, deps) {
      const item = hook('effect');
      if (changed(item.deps, deps)) {
        item.deps = deps ? [...deps] : undefined;
        pending.push({ item, effect });
      }
    },
  };
  return {
    React,
    mount(fn, initialProps) { component = fn; props = initialProps; return this.render(); },
    render(nextProps = props) {
      assert.ok(mounted, '不能重新 render 已卸载组件');
      props = nextProps;
      let commits = 0;
      do {
        assert.ok(++commits <= 20, 'Mock render 未收敛');
        dirty = false; cursor = 0; pending = [];
        tree = component(props);
        refs.forEach(ref => { ref.current = null; });
        refs = [];
        visit(tree, node => {
          if (!node.props?.ref) return;
          assert.equal(node.type, 'a', '本 Mock 仅支持本组件的 anchor ref');
          const ref = node.props.ref;
          ref.current = { click: () => onAnchorClick({ href: node.props.href, download: node.props.download }) };
          refs.push(ref);
        });
        const effects = pending;
        effects.forEach(({ item }) => item.cleanup?.());
        effects.forEach(({ item, effect }) => { item.cleanup = effect(); });
      } while (dirty);
      return tree;
    },
    get tree() { return tree; },
    unmount() {
      if (!mounted) return;
      mounted = false;
      hooks.filter(item => item.type === 'effect').forEach(item => item.cleanup?.());
      refs.forEach(ref => { ref.current = null; });
      tree = null;
    },
  };
}

function canonicalReceipt(data, overrides = {}) {
  const sha256 = overrides.sha256 ?? hash(data);
  return {
    schema_version: 'security-report/v1', kind: 'inspection', session_id: 'test-session',
    file_path: '/workspace/reports/inspection.html', filename: 'inspection.html',
    content_type: MIME, bytes: data.byteLength, sha256, attachment_id: `sha256:${sha256}`,
    source: { fixture: 'technical-mock-only' }, ...overrides,
  };
}

function makeHarness({ data = encode('abc'), receiptPatch = {}, filePatch = {}, propsPatch = {}, blockPatch = {}, sessionPatch = {}, useWebCrypto = false, readImpl } = {}) {
  const receipt = canonicalReceipt(data, receiptPatch);
  // 明确的 Native RemoteResult 技术 fixture，并非原生 API 或业务 Case 的运行回执。
  // data 是真实 Uint8Array，且其构造函数显式注入 VM，避免跨 realm 的 instanceof 假错误。
  const nativeRemoteResultFixture = {
    ok: true,
    value: { data: new Uint8Array(data), offset: 0, eof: true, bytes: data.byteLength, absolutePath: receipt.file_path, ...filePatch },
  };
  const reads = [], blobs = [], created = [], revoked = [], clicks = [], unexpectedRemote = [], cryptoCalls = [], digests = [];
  const renderer = makeRenderer(click => clicks.push(click));
  const sandbox = {
    Uint8Array, Uint32Array, DataView, ArrayBuffer, AbortController,
    Blob: class ObservedBlob extends Blob {
      constructor(...args) { super(...args); blobs.push(this); }
    },
    // URL 与 anchor.click 均为明确技术 Mock；不证明浏览器已经下载。
    URL: {
      createObjectURL(blob) { const url = `blob:technical-mock/${created.length + 1}`; created.push({ url, blob }); return url; },
      revokeObjectURL(url) { revoked.push(url); },
    },
    window: { __ModuleLoader__: { load(module) {
      assert.equal(module.id, 'dsh-security-report-download');
      assert.equal(typeof module.factory, 'function');
      sandbox.registration = module;
    } } },
  };
  if (useWebCrypto) sandbox.crypto = { subtle: { digest(algorithm, bytes) {
    cryptoCalls.push({ algorithm, bytes });
    const promise = webcrypto.subtle.digest(algorithm, bytes);
    digests.push(promise);
    return promise;
  } } };
  const context = vm.createContext(sandbox);
  if (!useWebCrypto) assert.equal(vm.runInContext('typeof globalThis.crypto', context), 'undefined');
  // 原文全文直接执行，禁止替换源码、暴露私有函数或复制实现。
  vm.runInContext(source, context, { filename: sourceURL.pathname, timeout: 2000 });
  assert.ok(sandbox.registration, 'ModuleLoader 必须捕获真实 factory');
  const plugin = sandbox.registration.factory(name => {
    assert.equal(name, 'react', '不允许加载任何其他依赖');
    return renderer.React;
  });
  let Component;
  const pluginCleanups = [];
  const ctx = {
    effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') pluginCleanups.push(cleanup); },
    locale: { register() {} },
    slots: {
      inject(name, register) { assert.equal(name, 'tool.call.toolview'); return register(); },
      register(options, candidate) {
        assert.equal(options.name, 'tool.call.toolview'); assert.equal(options.key, TOOL);
        assert.equal(options.locale, 'securityReportDownload');
        assert.equal(typeof candidate, 'function'); Component = candidate;
      },
    },
    remote: new Proxy({ workspaceFiles: { readBytes(sessionId, path, options, signal) {
      reads.push({ sessionId, path, options, signal });
      return readImpl ? readImpl({ sessionId, path, options, signal, fixture: nativeRemoteResultFixture }) : Promise.resolve(nativeRemoteResultFixture);
    } } }, { get(target, key) {
      if (!Object.hasOwn(target, key)) { unexpectedRemote.push(String(key)); throw new Error(`禁止业务调用: ${String(key)}`); }
      return target[key];
    } }),
  };
  plugin.apply(ctx);
  assert.equal(typeof Component, 'function', '必须注册真实 SecurityReportTool');
  const snapshot = { sessionId: 'test-session', removed: false, ...sessionPatch };
  const props = {
    t: key => key, toolName: TOOL, name: TOOL, phase: 'result', callId: 'test-call', sessionId: 'test-session',
    block: { kind: 'tool-result', name: TOOL, callId: 'test-call', isError: false,
      content: [{ type: 'text', text: JSON.stringify(receipt) }], meta: receipt, ...blockPatch },
    useSession: selector => selector(snapshot),
    ...propsPatch,
  };
  renderer.mount(Component, props);
  function nodes(predicate) { const found = []; visit(renderer.tree, node => { if (predicate(node)) found.push(node); }); return found; }
  function buttons(label) { return nodes(node => node.type === 'button' && node.props.children.includes(label)); }
  return {
    receipt, props, reads, blobs, created, revoked, clicks, unexpectedRemote, cryptoCalls, renderer,
    nodes, buttons,
    clickDownload() {
      const available = buttons('download');
      assert.equal(available.length, 1, '必须由真实组件提供下载按钮');
      assert.equal(available[0].props.disabled, false, '下载按钮必须可用');
      available[0].props.onClick();
    },
    async flush() {
      await immediate();
      await Promise.all([...digests]);
      await immediate();
      renderer.render();
    },
    unmount() { renderer.unmount(); pluginCleanups.forEach(fn => fn()); },
  };
}

function assertOnlyReads(harness, count) {
  assert.equal(harness.reads.length, count);
  for (const read of harness.reads) {
    assert.equal(read.sessionId, 'test-session'); assert.equal(read.path, harness.receipt.file_path);
    assert.equal(Object.keys(read.options).length, 0);
    assert.ok(read.signal instanceof AbortSignal);
  }
  assert.deepEqual(harness.unexpectedRemote, [], '不得发起业务工具或其他 Remote 调用');
}

async function assertDownload(harness, expectedBytes) {
  harness.clickDownload();
  await harness.flush();
  assertOnlyReads(harness, 1);
  assert.equal(harness.blobs.length, 1);
  assert.equal(harness.created.length, 1);
  assert.equal(harness.clicks.length, 1);
  assert.equal(harness.blobs[0].type, MIME);
  assert.deepEqual(new Uint8Array(await harness.blobs[0].arrayBuffer()), expectedBytes);
  assert.equal(harness.clicks[0].href, harness.created[0].url);
  assert.equal(harness.clicks[0].download, harness.receipt.filename);
  await harness.flush();
  assert.equal(harness.clicks.length, 1, '重复 render 不可重复触发同 URL 下载');
}

const fallbackVectors = [
  ['abc', encode('abc')], ['中文 UTF-8', encode('安全巡检报告：中文与🙂')],
  ...[55, 56, 64, 65].map(size => [`${size} 字节填充边界`, new Uint8Array(size).fill(0x61)]),
  ...[4096, 65536, 131073].map(size => [`随机 ${size} 字节`, new Uint8Array(randomBytes(size))]),
];

test('HTTP 无 global.crypto：真实 SHA-256 回退经按钮与 Node crypto 对照', async t => {
  for (const [label, data] of fallbackVectors) await t.test(label, async t => {
    const harness = makeHarness({ data }); t.after(() => harness.unmount());
    assert.equal(harness.receipt.sha256, hash(data));
    await assertDownload(harness, data);
    assert.equal(harness.cryptoCalls.length, 0);
  });
});

test('WebCrypto 分支使用真实 Node WebCrypto SHA-256', async t => {
  const data = encode('<!doctype html><title>技术测试</title>');
  const harness = makeHarness({ data, useWebCrypto: true }); t.after(() => harness.unmount());
  await assertDownload(harness, data);
  assert.equal(harness.cryptoCalls.length, 1);
  assert.equal(harness.cryptoCalls[0].algorithm, 'SHA-256');
  assert.deepEqual(harness.cryptoCalls[0].bytes, data);
});

test('SHA、长度、eof、offset、路径不符合回执时不创建 Blob 或下载', async t => {
  const data = encode('integrity-check-payload');
  const cases = [
    ['坏 SHA', { receiptPatch: { sha256: '0'.repeat(64) } }, 'digestMismatch'],
    ['截断', { filePatch: { data: data.slice(0, -1) } }, 'incomplete'],
    ['未到 eof', { filePatch: { eof: false } }, 'incomplete'],
    ['错误 bytes', { filePatch: { bytes: data.length + 1 } }, 'incomplete'],
    ['非零 offset', { filePatch: { offset: 1 } }, 'incomplete'],
    ['错误 path', { filePatch: { absolutePath: '/workspace/reports/other.html' } }, 'wrongPath'],
  ];
  for (const [label, options, expectedError] of cases) await t.test(label, async t => {
    const harness = makeHarness({ data, ...options }); t.after(() => harness.unmount());
    harness.clickDownload(); await harness.flush();
    assertOnlyReads(harness, 1);
    assert.equal(harness.blobs.length, 0); assert.equal(harness.created.length, 0); assert.equal(harness.clicks.length, 0);
    const alerts = harness.nodes(node => node.props?.role === 'alert');
    assert.equal(alerts.length, 1); assert.ok(alerts[0].props.children.includes(expectedError));
  });
});

test('错误或不属于当前调用/会话的结果不提供下载按钮、不读文件', async t => {
  const cases = [
    ['isError', { blockPatch: { isError: true } }],
    ['error 字段', { blockPatch: { error: { message: 'technical-mock-error' } } }],
    ['跨 session 回执', { receiptPatch: { session_id: 'foreign-session' } }],
    ['props session 不同', { propsPatch: { sessionId: 'foreign-session' } }],
    ['Session 已移除', { sessionPatch: { removed: true } }],
    ['callId 不同', { blockPatch: { callId: 'foreign-call' } }],
    ['toolName 不同', { propsPatch: { toolName: 'other-tool' } }],
    ['block name 不同', { blockPatch: { name: 'other-tool' } }],
    ['非 tool-result', { blockPatch: { kind: 'text' } }],
    ['非 result 阶段', { propsPatch: { phase: 'running' } }],
    ['meta 与 text 不同', { blockPatch: { meta: canonicalReceipt(encode('different')) } }],
  ];
  for (const [label, options] of cases) await t.test(label, async t => {
    const harness = makeHarness(options); t.after(() => harness.unmount());
    await harness.flush();
    assert.equal(harness.buttons('download').length, 0); assert.equal(harness.buttons('preview').length, 0);
    assertOnlyReads(harness, 0);
    assert.equal(harness.blobs.length, 0); assert.equal(harness.clicks.length, 0);
  });
});

test('同一回执可再次下载：每次只读文件，替换旧 URL，卸载 revoke', async () => {
  const harness = makeHarness();
  try {
    await assertDownload(harness, encode('abc'));
    harness.clickDownload(); await harness.flush();
    assertOnlyReads(harness, 2);
    assert.equal(harness.blobs.length, 2); assert.equal(harness.created.length, 2); assert.equal(harness.clicks.length, 2);
    assert.deepEqual(harness.revoked, [harness.created[0].url]);
    await harness.flush(); assert.equal(harness.clicks.length, 2);
  } finally { harness.unmount(); }
  assert.deepEqual(harness.revoked, harness.created.map(item => item.url));
});

test('读取期间重复点击不并发读取；卸载 abort，晚到结果不得下载', async () => {
  let resolveRead;
  const harness = makeHarness({ readImpl: ({ fixture }) => new Promise(resolve => { resolveRead = () => resolve(fixture); }) });
  harness.clickDownload(); harness.clickDownload();
  assertOnlyReads(harness, 1);
  const signal = harness.reads[0].signal;
  assert.equal(signal.aborted, false);
  harness.unmount();
  assert.equal(signal.aborted, true);
  resolveRead(); await immediate(); await immediate();
  assert.equal(harness.blobs.length, 0); assert.equal(harness.created.length, 0); assert.equal(harness.clicks.length, 0);
});

test('回执 key 变化执行 cleanup：abort 旧读取，拒绝晚到旧结果', async t => {
  let resolveRead;
  const harness = makeHarness({ readImpl: ({ fixture }) => new Promise(resolve => { resolveRead = () => resolve(fixture); }) });
  t.after(() => harness.unmount());
  harness.clickDownload();
  const signal = harness.reads[0].signal;
  harness.renderer.render({ ...harness.props, sessionId: 'foreign-session' });
  assert.equal(signal.aborted, true);
  assert.equal(harness.buttons('download').length, 0);
  resolveRead(); await harness.flush();
  assert.equal(harness.blobs.length, 0); assert.equal(harness.clicks.length, 0);
  assertOnlyReads(harness, 1);
});

after(async () => {
  assert.equal(hash(await readFile(sourceURL, 'utf8')), sourceHash, 'client.js 不得被测试修改');
});
