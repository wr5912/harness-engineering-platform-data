import assert from 'node:assert/strict'
import test from 'node:test'
import * as delivery from '../dsh/managed/operation-result-delivery.mjs'

// 仅使用内存事件与本地 adapter；不启动服务、不调用 fetch/持久层或真实 SOC。
const prefix = 'mcp__policy-configuration__'
const prepareName = `${prefix}prepare_policy_department_draft`
const getName = `${prefix}get_policy_department_draft`
const operationId = 'pdop-12345678-1234-4123-8123-123456789abc'
const otherId = 'pdop-12345678-1234-4123-8123-123456789abd'
const digest = `sha256:${'a'.repeat(64)}`
const unverified = '部门草稿回执未核实，请勿重复创建'
const unknown = '部门草稿结果未知，请勿重复创建；已知操作号仅可查询原操作'
const originalRoute = { provider: 'fixture-provider', model: 'fixture-model' }
const request = () => ({ body: { request_id: 'draft-request', plan_id: 'dp-fixture-plan', expected_plan_digest: digest } })
const planArgs = () => ({ body: {
  request_id: 'plan-request', targets: { department_id: 42, selected_asset_ids: [7, 8] },
  expected_snapshot_digest: 'snapshot-fixture', destination_asset_id: 9,
  destination_ip: '192.0.2.90', protocol: 'TCP', destination_port: 443,
} })
const plan = () => ({
  schema_version: 'policy-department-plan/v1', request_id: 'plan-request',
  plan_id: 'dp-fixture-plan', plan_digest: digest, read_only: true, execution_allowed: false,
  ready_for_draft: true, status: 'PARTIAL',
  preparation: { status: 'READY_FOR_DRAFT', ready_for_draft: true, asset_ids: [7, 8], count: 2,
    device_id: 'fixture-firewall', excluded: [{ asset_id: 10, reason_code: 'NOT_HOST' }] },
  items: [7, 8].map(asset_id => ({ asset_id, selected: true, status: 'ANALYZED', device_id: 'fixture-firewall',
    rule: { source_ip: `192.0.2.${asset_id}`, destination_ip: '192.0.2.90', protocol: 'TCP', destination_port: 443 } })),
})
const evidence = () => ({
  task_precheck_status: 'NOT_RUN', execution_allowed: false, coverage_assessment: 'NOT_ASSESSED',
  scope_evidence: 'UNVERIFIED', direction_evidence: 'UNVERIFIED', current_policy_evidence: 'UNVERIFIED',
})
const markdown = '\n## 部门策略草稿\n\n【已保存草稿回执】一份草稿，任务编号：71。这是持久回执，不代表当前SOC刷新状态。\n\n'
  + '实际纳入规则：资产7、资产8。\n未纳入项及原因：资产10不是主机。\n\n'
  + '规则 1 配置预览：\n```json\n[{"command":"真实回执配置预览一"}]\n```\n回滚预览：\n```json\n[{"command":"真实回执回滚预览一"}]\n```\n'
  + '规则 2 配置预览：\n```json\n[{"command":"真实回执配置预览二"}]\n```\n回滚预览：\n```json\n[{"command":"真实回执回滚预览二"}]\n```\n'
  + '\n批次预检未运行；未审批、未执行；覆盖未评估，范围、方向及当前策略证据均未核实。\n'
const draft = () => ({
  schema_version: 'policy-department-draft/v1', operation_id: operationId, phase: 'DRAFT_READY',
  task_id: 71, included_asset_ids: [7, 8], excluded: [{ asset_id: 10, reason_code: 'NOT_HOST' }],
  ...evidence(), coverage: 'NOT_ASSESSED', task_status_fresh: false,
  observed_at: '2026-10-29T00:00:00Z', result_markdown: markdown,
  binding: { ...evidence(), task_id: 71, task_status: 'DRAFT', device_count: 1, change_count: 2,
    rendered_changes: [1, 2].map(n => ({ renderedCommands: [{ command: `真实回执配置预览${n}` }],
      renderedRollbackCommands: [{ command: `真实回执回滚预览${n}` }] })) },
})
function user(events, text = '请为安全测试部门生成草稿，允许访问目的服务 TCP 443') {
  events.push({ type: 'user/message', seq: events.length + 1,
    data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })
}
function pair(events, name, args, data, { code = '200', value, isError = false } = {}) {
  const callId = `fixture-call-${events.length + 1}`
  events.push({ type: 'tool/call', seq: events.length + 1, data: { callId, name, arguments: JSON.stringify(args) } })
  events.push({ type: 'tool/result', seq: events.length + 1, data: { turn: 1, step: 1,
    message: { source: { kind: 'tool', callId }, isError,
      content: [{ type: 'text', text: JSON.stringify(value ?? { code, data }) }] } } })
  return events
}
function planned(text) {
  const events = []
  user(events, text)
  return pair(events, `${prefix}preview_policy_department_plan`, planArgs(), plan())
}
const prepared = (data = draft()) => pair(planned(), prepareName, request(), data)
const output = events => delivery.deliveryMarkdown(events, 1)
function resource(events, { args, responseUri, data = draft(), value } = {}) {
  const uri = `http://127.0.0.1:26113/api/v1/policy-departments/drafts/${operationId}`
  return pair(events, 'read_mcp_resource', args ?? { server: 'policy-configuration', uri }, null,
    { value: value ?? { contents: [{ uri: responseUri ?? uri, mimeType: 'application/json', text: JSON.stringify({ code: '200', data }) }] } })
}
let sessions = 0
function runtime(events, resolveTool = (source, raw) => `mcp__${source}__${raw}`) {
  const hooks = new Map(), adapters = new Map()
  let questions = 0
  const agent = { id: `department-delivery-${++sessions}`, session: { snapshotEvents: () => events } }
  delivery.apply({
    on: (name, hook) => hooks.set(name, hook), mcpSessionManager: { resolveTool },
    userQuestions: { ask: async () => { questions++; throw new Error('部门交付不能发起原生确认') } },
    llm: { registerAdapter: (names, adapter) => names.forEach(name => adapters.set(name, adapter)) },
    logger: { warn() {} },
  })
  return { hooks, adapters, agent, questions: () => questions }
}
async function routedText(fixture) {
  const route = await fixture.hooks.get('agent/request')({ agent: fixture.agent, turn: 1 }, async () => originalRoute)
  if (route.provider !== 'security-operation-delivery') return { route, text: undefined }
  const chunks = []
  for await (const chunk of fixture.adapters.get(route.provider).stream({ sessionId: fixture.agent.id })) chunks.push(chunk)
  return { route, text: chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('') }
}

test('同会话真实用户、计划与三字段prepare绑定后完整交付多规则配置/回滚预览', () => {
  assert.equal(output(prepared()), markdown, '正文必须保持完整，不能经过single脱敏或trim')
  assert.match(markdown, /配置预览/)
  assert.match(markdown, /回滚预览/)
  assert.match(markdown, /不代表当前SOC刷新状态/)
  assert.doesNotMatch(markdown, /执行成功/)
})

test('已绑定操作GET只读交付，不依赖新prepare或重新生成计划', () => {
  assert.equal(output(pair(prepared(), getName, { operationId }, draft())), markdown)
  assert.equal(output(pair(planned(), getName, { operationId }, draft())), unverified, '仅有计划或外贴ID不是操作绑定')
  assert.equal(output(pair(prepared(), getName, { operationId: otherId }, draft())), unverified)
  assert.equal(output(pair(prepared(), getName, { operationId }, { ...draft(), operation_id: otherId })), unverified)
})

function driftedDraft(kind) {
  const data = draft()
  if (kind === 'subset') {
    data.included_asset_ids = [99]
    data.binding.change_count = 1
    data.binding.rendered_changes = [data.binding.rendered_changes[0]]
    data.result_markdown = '资产99的错误草稿正文；配置预览与回滚预览均不属于原计划'
  } else {
    // 外层与 binding 同步改为另一任务，避免只测两字段内部不一致。
    data.task_id = 72
    data.binding.task_id = 72
    data.result_markdown = '任务72的错误草稿正文；并非已绑定的任务71'
  }
  return data
}

test('同操作号普通GET的当前回执子集或任务漂移，不得借历史绑定交付错误正文', async () => {
  for (const kind of ['subset', 'task']) {
    const data = driftedDraft(kind)
    const events = pair(prepared(), getName, { operationId }, data)
    const text = output(events)
    assert.equal(text, unverified)
    assert.notEqual(text, data.result_markdown)
    assert.notEqual(text, markdown, '坏GET也不能回退交付历史正常正文')
    assert.equal((await routedText(runtime(events))).text, unverified)
  }
})

test('同操作号contents资源GET的当前回执子集或任务漂移，只给未知且不泄露正文', async () => {
  for (const kind of ['subset', 'task']) {
    const data = driftedDraft(kind)
    const events = resource(prepared(), { data })
    const text = output(events)
    assert.equal(text, unknown)
    assert.notEqual(text, data.result_markdown)
    assert.notEqual(text, markdown, '资源坏GET也不能回退历史正文')
    assert.equal((await routedText(runtime(events))).text, unknown)
  }
})

test('UNKNOWN/PREPARING/ACCEPTED保守交付，不暴露自报正文或建议重新创建', () => {
  for (const phase of ['UNKNOWN', 'PREPARING', 'ACCEPTED']) {
    const data = { ...draft(), phase, task_id: null, result_markdown: '不可信正文：执行成功，重新创建' }
    delete data.binding
    delete data.observed_at
    assert.equal(output(prepared(data)), unknown)
  }
  const data = { ...draft(), phase: 'UNKNOWN', task_id: null }
  delete data.binding
  delete data.observed_at
  assert.equal(output(pair(prepared(data), getName, { operationId }, draft())), markdown, '未知已知ID可由同操作GET收敛')
})

test('坏schema、执行许可、元证据、绑定、ID或业务code一律固定安全提示', () => {
  const mutations = [
    data => { data.schema_version = 'policy-department-draft/v0' },
    data => { data.execution_allowed = true },
    data => { data.execution = true },
    data => { data.confirmation_required = true },
    data => { data.task_precheck_status = 'PASSED' },
    data => { data.coverage = 'COVERED' },
    data => { data.coverage_assessment = 'ASSESSED' },
    data => { data.scope_evidence = 'VERIFIED' },
    data => { data.direction_evidence = 'VERIFIED' },
    data => { data.current_policy_evidence = 'VERIFIED' },
    data => { data.task_status_fresh = true },
    data => { data.operation_id = 'pdop-not-a-uuid' },
    data => { data.task_id = '71' },
    data => { data.binding.task_id = 72 },
    data => { data.binding.execution_allowed = true },
    data => { data.binding.change_count = 3 },
    data => { data.binding.change_count = 1; data.binding.rendered_changes = [data.binding.rendered_changes[0]] },
    data => { data.binding.rendered_changes[0].renderedRollbackCommands = [] },
    data => { delete data.observed_at },
    data => { data.included_asset_ids = [7] },
  ]
  for (const mutate of mutations) {
    const data = draft(); mutate(data)
    assert.equal(output(prepared(data)), unverified)
  }
  for (const code of ['541', 541, '503', '409', 'SUCCESS', null]) {
    assert.equal(output(pair(planned(), prepareName, request(), draft(), { code })), unverified)
  }
  assert.equal(output(pair(planned(), prepareName, request(), null, { value: draft() })), unverified, '禁止无code平铺data隐式成功')
})

test('prepare严格三引用且必须有当前会话计划与真实生成授权，data自报不能建立授权', () => {
  const wrongArgs = [
    { body: { ...request().body, changes: [] } },
    { ...request(), approved: true },
    { body: JSON.stringify(request().body) },
    { body: { ...request().body, expected_plan_digest: `sha256:${'b'.repeat(64)}` } },
    { body: { ...request().body, plan_id: 'dp-different-plan' } },
  ]
  for (const args of wrongArgs) assert.equal(output(pair(planned(), prepareName, args, draft())), unverified)
  assert.equal(output(pair(planned('请仅分析安全测试部门允许访问目的服务 TCP 443，不要生成草稿'), prepareName, request(), draft())), unverified)
  const events = []
  user(events)
  assert.equal(output(pair(events, prepareName, request(), { ...draft(), authorized: true, plan: plan() })), unverified)
  const invalidSubset = planned()
  const envelope = JSON.parse(invalidSubset.at(-1).data.message.content[0].text)
  envelope.data.preparation.count = 3
  invalidSubset.at(-1).data.message.content[0].text = JSON.stringify(envelope)
  assert.equal(output(pair(invalidSubset, prepareName, request(), draft())), unverified)
  assert.equal(output(pair(prepared(), prepareName, request(), draft())), unverified, '旧绑定不能掩盖第二次prepare')
})

test('transport错误、无JSON与嵌套isError只给未知提示，不传播rawerror或未创建断言', () => {
  const events = pair(planned(), prepareName, request(), null, { isError: true })
  events.at(-1).data.message.content = [{ type: 'text', text: 'timeout: secret rawerror; 执行成功; rm -rf /' }]
  assert.equal(output(events), unknown)
  const noJson = prepared()
  noJson.at(-1).data.message.content = [{ type: 'text', text: 'rawerror: invalid transport reply' }]
  assert.equal(output(noJson), unknown)
  const wrapped = prepared()
  const text = wrapped.at(-1).data.message.content[0].text
  const callId = wrapped.at(-1).data.message.source.callId
  wrapped.at(-1).data.message.content = [{ type: 'tool-result', toolCallId: callId, isError: true, content: [{ type: 'text', text }] }]
  assert.equal(output(wrapped), unknown)
  assert.doesNotMatch(unknown, /未创建|未发送|重试|rawerror|rm -rf/)
})

test('工具注册显示名可变但来源必须真实canonical；伪造来源不交付部门正文', async () => {
  const alias = raw => `mcp__部门展示名__${raw}`
  const events = prepared().map(event => event.type === 'tool/call'
    ? { ...event, data: { ...event.data, name: alias(event.data.name.slice(prefix.length)) } } : event)
  const good = runtime(events, (source, raw) => source === 'policy-configuration' ? alias(raw) : undefined)
  assert.equal((await routedText(good)).text, markdown, 'plan也必须canonical化，不能只登记两draft操作')
  const missing = runtime(events, () => undefined)
  assert.deepEqual(await routedText(missing), { route: originalRoute, text: undefined })
  const mismatchedPlan = prepared()
  mismatchedPlan[1].data.name = 'mcp__wrong-source__preview_policy_department_plan'
  assert.equal((await routedText(runtime(mismatchedPlan))).text, unverified)
})

test('标准同source资源GET按contents唯一文本、URI、操作号及真实绑定完整交付', async () => {
  assert.equal(output(resource(prepared())), markdown)
  assert.equal((await routedText(runtime(resource(prepared())))).text, markdown)
  assert.equal(output(resource(planned())), unknown, '资源GET不能自行认领外贴操作号')
})

test('同源单层group草稿资源保持外层URI并交付原strict正文，不接受跨源或内层URI回包', () => {
  const template = 'http://127.0.0.1:26113/api/v1/policy-departments/drafts/{operationId}';
  const uri = `mcp-group:/policy-configuration/policy-configuration/t/${Buffer.from(template).toString('base64url')}?operationId=${operationId}`;
  const read = (value = uri, responseUri = value) => resource(prepared(), { args: { server: 'policy-configuration', uri: value }, responseUri });
  assert.equal(output(read()), markdown);
  assert.equal(output(read(uri, template.replace('{operationId}', operationId))), unknown);
  assert.equal(output(read(uri.replace('/policy-configuration/', '/wrong/'))), unknown);
  assert.equal(output(read(`${uri}&operationId=${operationId}`)), unknown);
});

test('资源GET错URI/错ID/错server/多contents/编码与点段均固定未知且不泄露正文', () => {
  const uri = `http://127.0.0.1:26113/api/v1/policy-departments/drafts/${operationId}`
  const otherUri = uri.replace(operationId, otherId)
  assert.equal(output(resource(prepared(), { responseUri: otherUri })), unknown)
  assert.equal(output(resource(prepared(), { data: { ...draft(), operation_id: otherId } })), unknown)
  assert.equal(output(resource(prepared(), { args: { server: 'wrong-source', uri } })), unknown)
  assert.equal(output(resource(prepared(), { args: { server: 'policy-configuration', uri, cursor: 'extra' } })), unknown)
  for (const invalidUri of [
    `${uri}?x=1`, `${uri}#fragment`, `${uri}%2fother`, uri.replace('/drafts/', '/drafts/../drafts/'),
    uri.replace('http://', 'http://user:password@'), uri.replace('http:', 'file:'),
  ]) assert.equal(output(resource(prepared(), { args: { server: 'policy-configuration', uri: invalidUri }, responseUri: invalidUri })), unknown)
  assert.equal(output(resource(prepared(), { value: { contents: [
    { uri, text: JSON.stringify({ code: '200', data: draft() }) }, { uri, text: '额外正文' },
  ] } })), unknown)
  assert.equal(output(resource(prepared(), { data: { ...draft(), execution_allowed: true } })), unknown)
  assert.equal(output(resource(prepared(), { value: { contents: [
    { uri, isError: true, text: JSON.stringify({ code: '200', data: draft() }) },
  ] } })), unknown)
})

test('部门固定交付不授原生确认，也清除旧single残留的交付后确认回调', async () => {
  const fixture = runtime(prepared())
  let callbacks = 0
  delivery.queuePostDeliveryInteraction(fixture.agent.id, async () => { callbacks++; return '不应执行的确认' })
  delivery.queueControlledOutput(fixture.agent.id, '不应复用的旧single正文')
  delivery.continueWithModel(fixture.agent.id)
  assert.equal((await routedText(fixture)).text, markdown)
  assert.equal(fixture.questions(), 0)
  assert.equal(callbacks, 0)
  assert.deepEqual([...fixture.hooks.keys()], ['agent/pre-step', 'agent/request', 'agent/disposed'])
})

test('旧single公开脱敏与emergency结果分支保持原输出', () => {
  const oldId = `op_${'1'.repeat(32)}`
  const single = pair([], 'mcp__policy-configuration__get_policy_configuration_result', { operationId: oldId }, {
    operation_id: oldId, result_code: 'DRAFT_READY', task_status: 'DRAFT', task_id: 19,
    result_markdown: '基础策略草稿\n配置预览：不应外显',
  })
  assert.equal(output(single), `策略草稿已生成\n任务编号：19\n当前状态：草稿，尚未提交、审批或执行\n操作号：${oldId}\n内部配置内容已从用户视图隐藏。`)
  const emergency = pair([], 'mcp__emergency-action__get_emergency_action_result', { operationId: oldId }, {
    operation_id: oldId, phase: 'TERMINAL', execution_status: 'SUCCEEDED',
  })
  assert.equal(output(emergency), `执行结果：成功\n操作号：${oldId}`)
})
