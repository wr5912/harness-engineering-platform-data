// 仅纯会话事件和模拟提交；不访问网络、SOC或业务持久化目录。
import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
const { GROUP_ID, TOOL_NAME, mainIdentity, priorPreview } = await import(process.env.ASSET_TEST_BUILT === '1' ? '../dsh/managed/asset-onboarding-runtime.mjs' : '../dsh/managed/asset-onboarding-runtime.ts')
const sessionId = 'mock-confirmation-session'
const user = (id, text, kind = 'user') => ({ type: 'user/message', data: { id, source: { kind }, content: [{ type: 'text', text }] } })
const assistant = text => ({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } })
const result = (value, id = 'preview') => [
  { type: 'tool/call', data: { name: TOOL_NAME, callId: id } },
  { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: id }, content: [{ type: 'tool-result', toolCallId: id, content: [{ type: 'text', text: JSON.stringify(value) }] }] } } },
]
function fixture(display = text => text) {
  const assets = [{ ip: '192.0.2.30', hostname: 'mock-03', assetType: 'host' }, { ip: '192.0.2.31', hostname: 'mock-04', assetType: 'host' }]
  const source = { kind: 'excel', attachment_id: 'mock-attachment' }
  const digest = createHash('sha256').update(JSON.stringify([GROUP_ID, sessionId, 'preview-user', assets, source, 'manual', null])).digest('hex')
  const markdown = `待导入设备 2 条 · 批次 ${digest.slice(0, 12)}\n|序号|IP|主机名|资产类型|\n|---|---|---|---|\n|1|192.0.2.30|mock-03|host|\n|2|192.0.2.31|mock-04|host|`
  const preview = { schema_version: 'asset-onboarding/v1', kind: 'preview', session_id: sessionId, group_id: GROUP_ID, preview_user_message_id: 'preview-user', preview_digest: digest, assets, source, route: 'manual', taskId: null, markdown }
  const events = [{ type: 'turn/start' }, user('preview-user', '预览'), ...result(preview), assistant(display(markdown)), { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-1', '确认导入')]
  const exec = { agent: { id: sessionId, session: { id: sessionId, header: { version: 4, id: sessionId, createdAt: 0, isSeeded: false, delegationDepth: 0 }, snapshotEvents: () => events }, inbox: { nextTurn: [], nextStep: [] } } }
  return { preview, events, exec, check: () => priorPreview(mainIdentity(exec), digest) }
}
test('完整展示后独立确认导入或确认纳管成功', () => {
  for (const text of ['确认导入', '确认纳管']) { const f = fixture(); f.events.at(-1).data.content[0].text = text; assert.deepEqual(f.check(), f.preview) }
})
test('复现原始整段匹配拒绝空白行，新校验仅容忍空白行和换行编码', () => {
  const f = fixture(text => text.replace('\n', '\n\n \t\n').replaceAll('\n', '\r\n'))
  assert.equal(f.events[4].data.message.content[0].text.includes(f.preview.markdown), false)
  assert.deepEqual(f.check(), f.preview)
})
test('时间上下文与助手补充不改变真实确认身份', () => {
  const f = fixture(); f.events.push(user('time-context', '运行时时间上下文', 'runtime'), assistant('尚未写入SOC'))
  assert.deepEqual(f.check(), f.preview)
})
test('守卫拒绝后补充完整清单，再次独立确认同批次成功', () => {
  const f = fixture(() => '尚未展示'); assert.throws(f.check, /尚未.*完整呈现/)
  f.events.push(assistant(f.preview.markdown.replace('\n', '\n\n')), { type: 'turn/end' }, { type: 'turn/start' }, user('confirm-2', '确认纳管'))
  assert.deepEqual(f.check(), f.preview)
})
test('修改取消或其他真实用户消息使旧确认失效', () => {
  for (const text of ['改主机名', '取消', '解释一下']) {
    const f = fixture(); f.events.push({ type: 'turn/end' }, { type: 'turn/start' }, user('change', text), user('confirm-2', '确认导入'))
    assert.throws(f.check, /其他新消息/)
  }
})
test('缺行改值改顺序改批次或插入非空行均拒绝', () => {
  for (const display of [text => text.split('\n').slice(0, -1).join('\n'), text => text.replace('mock-04', 'changed'), text => { const lines = text.split('\n'); return [...lines.slice(0, 3), lines[4], lines[3]].join('\n') }, text => text.replace('批次 ', '批次 changed'), text => text.replace('\n|2|', '\n额外非空行\n|2|')]) assert.throws(fixture(display).check, /尚未.*完整呈现/)
})
test('只有确认之后才展示不能追认原确认', () => {
  const f = fixture(() => ''); f.events.push(assistant(f.preview.markdown)); assert.throws(f.check, /尚未.*完整呈现/)
})
test('取消记录、旧摘要、不匹配摘要、跨会话与冻结字段篡改均拒绝', () => {
  const cancelled = fixture(); cancelled.events.splice(5, 0, ...result({ schema_version: 'asset-onboarding/v1', kind: 'cancelled' }, 'cancel')); assert.throws(cancelled.check, /已取消/)
  const f = fixture(); assert.throws(() => priorPreview(mainIdentity(f.exec), 'a'.repeat(64)), /本会话最新/)
  const newer = { ...f.preview, preview_digest: 'b'.repeat(64) }; f.events.splice(5, 0, ...result(newer, 'newer')); assert.throws(f.check, /本会话最新/)
  const foreign = fixture(); foreign.exec.agent.session.header.id = 'other'; assert.throws(foreign.check)
  const altered = fixture(); const payload = altered.events[3].data.message.content[0].content[0]; const value = JSON.parse(payload.text); value.assets[0].hostname = 'changed'; payload.text = JSON.stringify(value); assert.throws(altered.check, /冻结字段不符/)
})

test('完整关键列允许空格inline code及末尾来源列，错表头拒绝', () => {
 const f = fixture()
 const canonical = `待导入设备 2 条 · 批次 ${f.preview.preview_digest.slice(0,12)}
|序号|IP|主机名|资产类型|型号ID|部署形态|宿主ID|
|---|---|---|---|---|---|---|
|1|192.0.2.30|mock-03|host|未提供|未提供|未提供|
|2|192.0.2.31|mock-04|host|未提供|未提供|未提供|`
 f.preview.markdown = canonical
 f.events[3].data.message.content[0].content[0].text = JSON.stringify(f.preview)
 const rendered = canonical.replace(f.preview.preview_digest.slice(0,12), '`' + f.preview.preview_digest.slice(0,12) + '`:').split('\n').map(line => line.startsWith('|') ? line.replaceAll('|', '| ') + '来源行 |' : line).join('\n')
 f.events[4].data.message.content[0].text = rendered
 assert.deepEqual(f.check(), f.preview)
 f.events[4].data.message.content[0].text = rendered.replace('主机名', '错误列')
 assert.throws(f.check, /完整呈现/)
})

function splitHeadingFixture(change = value => value) {
  const f = fixture()
  const ips = [35,36,37,41,42,43,44,47,167,182,197,202,207,210,211,213,223,226,228,229,230,233,234,240,253,3,7]
  const names = ['Linux-主机-138-35','Linux-主机-138-36','Linux-主机-138-37','Linux-主机-138-41','Linux-主机-138-42','Linux-主机-138-43','Linux-主机-138-44','VMware-ESXi-138-47','Web-服务器-138-167','Linux-主机-138-182','Linux-主机-138-197','Linux-主机-138-202','Linux-主机-138-207','Linux-主机-138-210','DESKTOP-P68J36Q','SMB-文件共享-138-213','Linux-主机-138-223','VMware-ESXi-138-226','CMP-AIFX','Linux-主机-138-229','Linux-主机-138-230','Web-服务器-138-233','Linux-主机-138-234','Web-服务器-138-240','Web-服务器-138-253','Web-服务器-138-3','SKRSKR']
  const servers = new Set([47,167,226,233,240,253,3,7])
  const assets = ips.map((ip,i) => ({ ip: `172.16.138.${ip}`, hostname: names[i], assetType: servers.has(ip) ? 'server' : 'host', findingId: String(1000+i) }))
  const source = { kind: 'discovery', evidence_id: '45ea7a0825c6ba933e25354cb96133d9f99a4e905c08ed411892ab63390a7558' }, taskId = '2120100732104658945'
  const digest = createHash('sha256').update(JSON.stringify([GROUP_ID,sessionId,'preview-user',assets,source,'adopt',taskId])).digest('hex')
  const table = ['| 序号 | IP | 主机名 | 资产类型 | 型号ID | 部署形态 | 宿主ID |','|---|---|---|---|---|---|---|',...assets.map((a,i) => `|${i+1}|${a.ip}|${a.hostname}|${a.assetType}|未提供|未提供|未提供|`)].join('\n')
  Object.assign(f.preview,{ assets, source, taskId, route:'adopt', preview_digest:digest, markdown:`待导入设备 27 条 · 批次 ${digest.slice(0,12)}\n${table}\n确认前SOC基线逐行原文` })
  f.events[3].data.message.content[0].content[0].text = JSON.stringify(f.preview)
  f.events[4].data.message.content[0].text = change(`已重新生成所选 27 条的最新纳管预览（未写入）。\n## 最新纳管预览（批次 \`${digest.slice(0,12)}\`）\n- \`preview_digest\`：\`${digest}\`\n- 来源：kind=discovery，evidence_id=${source.evidence_id}；taskId=${taskId}\n${table}\n当前 SOC 基线：全部 total=0、rows=[]；尚未写入。`)
  f.events.at(-1).data.content[0].text = '确认纳管'
  return { ...f, check: () => priorPreview(mainIdentity(f.exec),digest) }
}
test('实际176布局：数量intro与批次标题分行，27冻结行一致允许确认', () => { const f = splitHeadingFixture(); assert.deepEqual(f.check(),f.preview) })
test('拆行展示缺数量错批次缺行改值仍拒绝', () => {
 for (const change of [s => s.replace('所选 27 条','所选设备'),s => s.replaceAll(/批次 `[^`]+`|`[a-f0-9]{64}`/gu,'错误批次'),s => s.split('\n').filter(line => !line.startsWith('|27|')).join('\n'),s => s.replace('|SKRSKR|','|changed|')]) assert.throws(splitHeadingFixture(change).check,/完整呈现/)
})
