// HV-04本地Mock回归：Node原生读取TS源码，不构建/改写MJS，不发网络或写业务日记。
import test from 'node:test'
import assert from 'node:assert/strict'
const runtime = await import(process.env.ASSET_TEST_BUILT === '1'
  ? '../dsh/managed/asset-onboarding-runtime.mjs'
  : '../dsh/managed/asset-onboarding-runtime.ts')

const A = '172.16.228.1', B = '172.16.228.254'
const RANGE = `${A}-${B}`
const request = (join = '到') => `对${A}${join}${B}执行一次真实设备发现，只此授权范围，先完整候选不入库`
const STOP = 'MOCK_BINDING_STOP_BEFORE_IO'

function fixture(text, { past = [], queued = false, aborted = false } = {}) {
  let tool, lookups = 0
  const ctx = {
    mcpSessionManager: { async listGroupTools() { lookups++; throw new Error(STOP) }, async callGroupTool() { assert.fail('范围回归不得派发业务') } },
    tools: { guard() {}, register(value) { tool = value }, get() { assert.fail('不得回退本地原始工具注册') } },
  }
  runtime.apply(ctx)
  const user = (id, value) => ({ type: 'user/message', data: { id, source: { kind: 'user' }, content: [{ type: 'text', text: value }] } })
  const header = { version: 4, id: 'mock-range-session', createdAt: 0, isSeeded: false, delegationDepth: 0 }
  const events = [...past.map((value, i) => user(`old-${i}`, value)), { type: 'turn/start', data: { turn: 1 } }, user('current-user', text)]
  const exec = {
    callId: 'mock-range-call', signal: aborted ? { aborted: true } : undefined,
    agent: { id: header.id, session: { id: header.id, header, snapshotEvents: () => events },
      inbox: { nextTurn: queued ? [{ source: { kind: 'user' }, content: '取消' }] : [], nextStep: [] } },
  }
  return { run: args => tool.execute({ action: 'discover', ...args }, exec), lookups: () => lookups }
}

async function stoppedBeforeIo(text, args) {
  const f = fixture(text)
  await assert.rejects(f.run(args), error => error.message === STOP)
  assert.equal(f.lookups(), 1)
}
async function rejectedBeforeLookup(text, args, options) {
  const f = fixture(text, options)
  await assert.rejects(f.run(args), error => error.message !== STOP && /本轮|已取消|新的用户|范围|包含|排除|IPv4|CIDR|4096|IP/u.test(error.message))
  assert.equal(f.lookups(), 0)
}

for (const join of ['到', '至', '-', ' 到 ', ' 至 ', ' - ']) {
  test(`同起止表达${JSON.stringify(join)}规范为原254地址，支持当前原句授权`, async () => {
    assert.deepEqual(runtime.normalizeRange(`${A}${join}${B}`), { ranges: RANGE, count: 254 })
    await stoppedBeforeIo(request(join), { ranges: RANGE })
    await stoppedBeforeIo(request('-'), { ranges: `${A}${join}${B}` })
  })
}

test('等价起止写法先规范后去重，不改变单IP或显式CIDR合同', () => {
  assert.deepEqual(runtime.normalizeRange(`${A}到${B},${RANGE},${A}至${B}`), { ranges: RANGE, count: 254 })
  assert.deepEqual(runtime.normalizeRange(A), { ranges: A, count: 1 })
  assert.deepEqual(runtime.normalizeRange('172.16.228.0/24'), { ranges: '172.16.228.0/24', count: 256 })
})

test('不把原句两个散落IP、前缀子串或隐含CIDR变成起止授权', async () => {
  await rejectedBeforeLookup(`发现${A}和${B}这两个IP`, { ranges: RANGE })
  await rejectedBeforeLookup(request(), { ranges: '172.16.228.0/24' })
  await rejectedBeforeLookup('发现172.16.228.10', { ranges: A })
  await rejectedBeforeLookup('发现1172.16.228.1', { ranges: A })
  await rejectedBeforeLookup('发现172.16.228.0/24', { ranges: A })
})

test('改动端点、扩大到0/255或换成138网段均在接口查找前拒绝', async () => {
  for (const ranges of [`172.16.228.0-${B}`, `${A}-172.16.228.255`, `${A}-172.16.228.253`, '172.16.138.1-172.16.138.254']) {
    await rejectedBeforeLookup(request(), { ranges })
  }
})

test('用户或参数缺端点不能借完整参数或单IP补齐', async () => {
  for (const join of ['到', '至', '-']) {
    await rejectedBeforeLookup(`发现${A}${join}`, { ranges: RANGE })
    await rejectedBeforeLookup(`发现${A} ${join} `, { ranges: A })
    await rejectedBeforeLookup(`发现${join}${B}`, { ranges: B })
    await rejectedBeforeLookup(request(), { ranges: `${A}${join}` })
  }
})

test('包含和排除分别同端点等价，前置及明确后置排除保留', async () => {
  const C = '172.16.228.10', D = '172.16.228.20'
  for (const join of ['到', '至', '-']) {
    await stoppedBeforeIo(`${request(join)}，排除${C}${join}${D}`, { ranges: RANGE, excluded_ranges: `${C}-${D}` })
    await stoppedBeforeIo(`排除${C}${join}${D}，对${A}${join}${B}执行发现，不入库`, { ranges: RANGE, excluded_ranges: `${C}-${D}` })
  }
  await stoppedBeforeIo(`对${A}到${B}执行发现，${C}除外`, { ranges: RANGE, excluded_ranges: C })
})

test('排除缺失、错配、未全部传入及排除冒充包含均拒绝', async () => {
  const C = '172.16.228.10', D = '172.16.228.20'
  const text = `${request()}，排除${C}、${D}`
  await rejectedBeforeLookup(text, { ranges: RANGE })
  await rejectedBeforeLookup(text, { ranges: RANGE, excluded_ranges: C })
  await rejectedBeforeLookup(text, { ranges: RANGE, excluded_ranges: '172.16.228.30' })
  await rejectedBeforeLookup(text, { ranges: C, excluded_ranges: `${RANGE},${D}` })
  await rejectedBeforeLookup(`${request()}，排除旧主机`, { ranges: RANGE, excluded_ranges: C })
  await rejectedBeforeLookup(request(), { ranges: RANGE, excluded_ranges: A })
})

test('带空白的和/及/与排除列表不得部分匹配或冒充包含', async () => {
  const C = '172.16.228.10', D = '172.16.228.20'
  for (const separator of [' 和 ', ' 及 ', ' 与 ']) {
    for (const suffix of [false, true]) {
      const text = `${request()}，${suffix ? '' : '排除'}${C}${separator}${D}${suffix ? '除外' : ''}`
      await stoppedBeforeIo(text, { ranges: RANGE, excluded_ranges: `${C},${D}` })
      await rejectedBeforeLookup(text, { ranges: RANGE, excluded_ranges: C })
      await rejectedBeforeLookup(text, { ranges: D, excluded_ranges: C })
    }
  }
})

test('后置逗号/分号除外列表不得只认末项或把首项当包含', async () => {
  const C = '172.16.228.10', D = '172.16.228.20'
  for (const separator of [',', '，', ';', '；']) {
    const text = `${request()}，${C}${separator}${D}除外`
    await stoppedBeforeIo(text, { ranges: RANGE, excluded_ranges: `${C},${D}` })
    await rejectedBeforeLookup(text, { ranges: RANGE, excluded_ranges: D })
    await rejectedBeforeLookup(text, { ranges: C, excluded_ranges: D })
  }
})

test('不明确的排除连接词不得静默只取首项或末项', async () => {
  const C = '172.16.228.10', D = '172.16.228.20'
  for (const separator of ['或者', '以及', ' 另一个是 ']) {
    await rejectedBeforeLookup(`${request()}，排除${C}${separator}${D}`, { ranges: RANGE, excluded_ranges: C })
    await rejectedBeforeLookup(`${request()}，${C}${separator}${D}除外`, { ranges: C, excluded_ranges: D })
  }
})

test('取消、咨询、否定、排队取消、中止及旧消息不构成新范围授权', async () => {
  for (const text of [`取消对${A}到${B}的发现`, `如何发现${A}到${B}？`, `不要扫描${A}至${B}`]) {
    await rejectedBeforeLookup(text, { ranges: RANGE })
  }
  await rejectedBeforeLookup('执行设备发现', { ranges: RANGE }, { past: [request()] })
  await rejectedBeforeLookup(request(), { ranges: RANGE }, { queued: true })
  await rejectedBeforeLookup(request(), { ranges: RANGE }, { aborted: true })
})

test('不要发现同一起止范围必须在lookup前拒绝', async () => {
  for (const join of ['到', '至', '-']) {
    await rejectedBeforeLookup(`不要发现${A}${join}${B}`, { ranges: RANGE })
  }
})

test('明确否定发现和扫描的等价语句不能被规范化成执行授权', async () => {
  for (const negative of ['不要', '别', '暂不', '无需', '禁止', '请勿', '不要再', '不要 再 ', '不 再 ']) {
    for (const action of ['发现', '扫描']) {
      await rejectedBeforeLookup(`${negative}${action}${A}到${B}`, { ranges: RANGE })
    }
  }
})

test('只发现不入库及发现并明确排除仍保留授权，不新增确认', async () => {
  await stoppedBeforeIo(`只发现${A}，不入库`, { ranges: A })
  await stoppedBeforeIo(`只发现${A}，不要入库`, { ranges: A })
  await stoppedBeforeIo(`发现${A}至${B}且明确排除172.16.228.10，不入库`, { ranges: RANGE, excluded_ranges: '172.16.228.10' })
})

test('本轮138新授权可等价通过，不能借此把旧228授权替换成138', async () => {
  const start = '172.16.138.1', end = '172.16.138.254'
  await stoppedBeforeIo(`对${start}到${end}执行真实发现，先不入库`, { ranges: `${start}-${end}` })
  await rejectedBeforeLookup(`对${A}到${B}执行真实发现，先不入库`, { ranges: `${start}-${end}` })
})

test('4096上限、非法IPv4、倒置与CIDR对齐仍保持', () => {
  assert.equal(runtime.normalizeRange('10.0.0.0到10.0.15.255').count, 4096)
  for (const value of ['10.0.0.0至10.0.16.0', `${B}到${A}`, '999.16.228.1到172.16.228.254', '172.16.228.01至172.16.228.254', '172.16.228.1/24']) {
    assert.throws(() => runtime.normalizeRange(value))
  }
})


test('当前完整纯138范围可发现，无需固定授权句', async () => {
  await stoppedBeforeIo('172.16.138.1-172.16.138.254', { ranges: '172.16.138.1-172.16.138.254' })
})
test('失败或状态未知后停止约束不否定本轮明确发现', async () => {
  for (const condition of ['若状态未知立即停止，不重试', '如果任务失败时立即停止，不要重试', '若失败或状态未知立即停止，不重试']) {
    await stoppedBeforeIo(`发现172.16.138.1-172.16.138.254，${condition}`, { ranges: '172.16.138.1-172.16.138.254' })
  }
})
test('当前停止否定咨询Excel及条件句外取消仍拒绝', async () => {
  for (const prefix of ['停止发现', '不要扫描', '如何发现', '仅Excel导入，不发现', '取消发现']) {
    await rejectedBeforeLookup(`${prefix}172.16.138.1-172.16.138.254，若状态未知立即停止，不重试`, { ranges: '172.16.138.1-172.16.138.254' })
  }
})


test('两条真实完整授权原句保留条件停止及暂不导入边界', async () => {
  for (const text of [
    '我明确授权本轮对172.16.138.1-172.16.138.254执行真实设备探测和发现任务创建/启动。仅限该范围，autoAdopt=false，只发现不纳管；请记录真实SOC taskId、请求关联标识、任务状态和执行阶段。若状态未知立即停止，不重试。发现完成后只查询本次任务候选结果，暂不导入。',
    '本轮明确授权：仅对172.16.138.1-172.16.138.254执行真实发现探测，autoAdopt=false，只发现不纳管。请创建并启动发现任务，返回真实SOC taskId、请求关联标识、任务状态和执行阶段；若未受理或状态未知，立即停止且不要重试。发现完成后只查询本任务候选结果，暂不导入。',
    '只发现172.16.138.1-172.16.138.254，不导入',
    '把172.16.138.1-172.16.138.254范围的设备纳管',
  ]) await stoppedBeforeIo(text, { ranges: '172.16.138.1-172.16.138.254' })
})
test('纳管上下文不能将咨询已有查询否定Excel变成发现授权', async () => {
  for (const text of ['如何纳管这个范围172.16.138.1-172.16.138.254', '仅查询已有资产172.16.138.1-172.16.138.254', '不要发现172.16.138.1-172.16.138.254', '停止', 'Excel导入172.16.138.1-172.16.138.254', '停止发现172.16.138.1-172.16.138.254，若状态未知立即停止，不重试']) await rejectedBeforeLookup(text, { ranges: '172.16.138.1-172.16.138.254' })
})
