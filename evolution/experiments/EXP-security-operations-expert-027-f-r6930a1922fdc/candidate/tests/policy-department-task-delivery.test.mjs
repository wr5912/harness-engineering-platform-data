// 独立纯事件/内存 adapter 测试；不访问网络、文件存储、SDK 或真实 SOC。由父任务统一运行。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as delivery from '../dsh/managed/operation-result-delivery.mjs'
import { isDepartmentTaskResultBound } from '../dsh/managed/policy-department-task-guard.mjs'
import { latestDraft, draftFromExecution, blocksTaskDomainDraft } from '../dsh/managed/policy-confirmation-runtime.mjs'

const dept = op => `mcp__policy-configuration__${op}`
const PREPARE = dept('prepare_policy_department_task'), GET = dept('get_policy_department_task')
const PLAN = dept('preview_policy_department_plan')
const digest = `sha256:${'a'.repeat(64)}`, taskId = `pgt-${'b'.repeat(60)}`
const unknown = '本地部门策略任务结果待核实；尚无可交付的可信保存回执。'
const route = { provider: 'fixture-provider', model: 'fixture-model' }
const stable = o => Array.isArray(o) ? `[${o.map(stable).join(',')}]` : o && typeof o === 'object'
  ? `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}` : JSON.stringify(o)
const intent = id => ({ schema_version: 'workbench-policy-intent/v1', policy_kind: 'NETWORK_ACCESS', operation: 'ADD', action: 'ALLOW',
  source: { selector_type: 'IP', value: `10.0.0.${id}` }, destination: { selector_type: 'IP', value: '172.16.2.100' },
  protocol: 'TCP', destination_port: 443, target_external_id: null, validity: null, change_reason: '部门分组策略任务；尚未创建SOC草稿' })
const intentsDigest = `sha256:${createHash('sha256').update(stable([intent(7), intent(8)])).digest('hex')}`
const markdown = `\n## 本地部门策略任务\n任务ID：${taskId}\n原意图：允许部门真实主机访问172.16.2.100 TCP443。\n`
  + '资产7：10.0.0.7，权威证据暂不可用；资产8：10.0.0.8，权威证据暂不可用。\n'
  + '两个完整真实意图已持久保存，外部阻塞；不是SOC草稿，未审批、未执行，预检未运行。\n\n'
const planArgs = () => ({ body: { request_id: 'preview-1', targets: { department_id: 31 }, expected_snapshot_digest: digest,
  destination_asset_id: 20, protocol: 'TCP', destination_port: 443 } })
const prepareArgs = () => ({ body: { request_id: 'write-1', plan_id: 'plan-1', expected_plan_digest: digest } })
function plan() {
  return { schema_version: 'policy-department-plan/v1', plan_id: 'plan-1', plan_digest: digest, request_id: 'preview-1',
    read_only: true, execution_allowed: false, snapshot_digest: digest, ready_for_draft: false,
    preparation: { ready_for_draft: false, status: 'NO_CONFIGURABLE_ITEMS', asset_ids: [], count: 0, excluded: [] },
    task_preparation: { ready_for_task: true, asset_ids: [7, 8], intent_count: 2, intents_digest: intentsDigest, ready_count: 0, blocked_count: 2 },
    protocol: 'TCP', destination_port: 443,
    destination: { asset_id: 20, status: 'READY', selected_ip: '172.16.2.100', addresses: [{ ip: '172.16.2.100', supported: true }] },
    targets: { members: [7, 8].map(asset_id => ({ asset_id, selected: true, status: 'READY', asset_type: 'host',
      deploy_form: 'physical', nesting_kind: 0, selected_ip: `10.0.0.${asset_id}`, addresses: [{ ip: `10.0.0.${asset_id}`, supported: true }] })) },
    items: [7, 8].map(asset_id => ({ asset_id, selected: true, source_status: 'READY', source_ip: `10.0.0.${asset_id}`,
      status: 'BLOCKED', reason_code: 'AUTHORITY_UNAVAILABLE', summary: 'SOC权威证据暂不可用' })) }
}
function task() {
  return { schema_version: 'policy-department-task/v1', task_id: taskId, task_status: 'EXTERNAL_BLOCKED', storage_phase: 'ACCEPTED',
    request_id: 'write-1', plan_id: 'plan-1', plan_digest: digest, intents_digest: intentsDigest, included_asset_ids: [7, 8],
    intent_count: 2, ready_count: 0, blocked_count: 2, excluded: [], persisted: true, execution_allowed: false,
    task_precheck_status: 'NOT_RUN', soc_task_id: null, result_markdown: markdown,
    items: [7, 8].map(asset_id => ({ asset_id, source_ip: `10.0.0.${asset_id}`, intent: intent(asset_id),
      analysis_status: 'BLOCKED', ready_for_soc: false, block_reason: 'AUTHORITY_UNAVAILABLE' })) }
}
function user(events, text) {
  events.push({ type: 'user/message', seq: events.length + 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } })
}
function pair(events, name, args, data, value) {
  const callId = `call-${events.length + 1}`
  events.push({ type: 'tool/call', seq: events.length + 1, data: { callId, name, arguments: JSON.stringify(args) } })
  events.push({ type: 'tool/result', seq: events.length + 1, data: { turn: 1, step: 1, message: { source: { kind: 'tool', callId },
    content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: JSON.stringify(value ?? { code: '200', data }) }] }] } } })
  return events
}
function planned(text = '请允许某真实部门全部主机访问172.16.2.100 TCP443，并生成本地任务') {
  const events = []; user(events, text)
  return pair(events, PLAN, planArgs(), plan())
}
const saved = (data = task()) => pair(planned(), PREPARE, prepareArgs(), data)
const output = events => delivery.deliveryMarkdown(events, 1)
let sessions = 0
function runtime(events, resolveTool = (source, raw) => `mcp__${source}__${raw}`) {
  const hooks = new Map(), adapters = new Map()
  const agent = { id: `task-delivery-${++sessions}`, session: { snapshotEvents: () => events } }
  delivery.apply({ on: (name, hook) => hooks.set(name, hook), mcpSessionManager: { resolveTool },
    llm: { registerAdapter: (names, adapter) => names.forEach(name => adapters.set(name, adapter)) }, logger: { warn() {} } })
  return { hooks, adapters, agent }
}
async function routedText(f) {
  const messages = f.agent.session.snapshotEvents().filter(event => event.type === 'tool/result').map(event => event.data.message)
  const decision = await f.hooks.get('agent/pre-step')({ agent: f.agent }, async () => ({ kind: 'enter', messages, startsRequestSeries: true }))
  assert.equal(decision.startsRequestSeries, true)
  const actual = await f.hooks.get('agent/request')({ agent: f.agent, turn: 1 }, async () => route)
  assert.deepEqual(actual, route, 'Task必须保留原模型路由，不切自定义fixed provider/model')
  const last = decision.messages.at(-1)
  const blocks = last?.content?.flatMap(block => block.type === 'tool-result' ? block.content ?? [] : [block]) ?? []
  let projected
  try { projected = JSON.parse(blocks.find(block => block.type === 'text')?.text) } catch { return undefined }
  return projected?.schema_version === 'policy-department-task-delivery/v1' ? projected.result_markdown : undefined
}

test('两条真实intent即使EXTERNAL_BLOCKED仍严格绑定并供原模型解释，不切provider或冒SOC DRAFT', async () => {
  const events = saved()
  assert.equal(isDepartmentTaskResultBound(events, events.at(-1)), true)
  assert.equal(output(events), markdown)
  assert.equal(await routedText(runtime(events)), markdown)
  assert.equal(output(pair(saved(), GET, { taskId }, task())), markdown)
  assert.doesNotMatch(markdown, /配置预览|renderedCommands|执行成功/)
})

test('Task保留原模型路由并清除旧正文、模型接续和postDelivery确认回调', async () => {
  const f = runtime(saved()); let callbacks = 0
  delivery.queueControlledOutput(f.agent.id, '旧single正文')
  delivery.continueWithModel(f.agent.id)
  delivery.queuePostDeliveryInteraction(f.agent.id, async () => { callbacks++; return '旧确认' })
  assert.equal(await routedText(f), markdown)
  assert.equal(await delivery.runPostDeliveryInteraction(f.agent.id), undefined)
  assert.equal(callbacks, 0)
})

test('假schema、错ID、digest、counts及执行/SOC/预检伪成功均保守拒绝', async () => {
  const mutations = [t => { t.schema_version = 'policy-department-draft/v1' }, t => { t.task_id = 71 },
    t => { t.task_id = `pgt-${'b'.repeat(59)}` }, t => { t.plan_digest = `sha256:${'c'.repeat(64)}` },
    t => { t.intents_digest = digest }, t => { t.items[0].intent.destination_port = 8443 }, t => { t.included_asset_ids = [7] },
    t => { t.persisted = false }, t => { t.storage_phase = 'UNKNOWN' }, t => { t.execution_allowed = true },
    t => { t.execution = true }, t => { t.confirmation_required = true }, t => { t.soc_task_id = 71 },
    t => { t.task_precheck_status = 'PASSED' }, t => { t.task_status = 'DRAFT' }, t => { t.ready_count = 2 },
    t => { t.result_markdown = 'Success only' }]
  for (const mutate of mutations) {
    const t = task(); mutate(t)
    assert.equal(output(saved(t)), unknown)
    const events = pair(saved(), GET, { taskId }, t)
    assert.equal(output(events), unknown, '不得借历史成功绑定交付当前坏GET或回退历史正文')
    assert.equal(await routedText(runtime(events)), unknown)
  }
  assert.equal(output(pair(planned(), PREPARE, prepareArgs(), null, { code: '541', data: task() })), unknown)
  assert.equal(output(pair(planned(), PREPARE, prepareArgs(), null, task())), unknown)
  assert.doesNotMatch(unknown, /重新创建|重复创建|重试|未创建|DRAFT|执行成功/)
})

test('当前event必须真实配对且最新；复制event、改callId、旧turn或历史GET不能替代', () => {
  const events = saved()
  assert.equal(isDepartmentTaskResultBound(events, structuredClone(events.at(-1))), false)
  const wrong = saved(); wrong.at(-1).data.message.source.callId = 'other'
  assert.equal(output(wrong), undefined)
  const wrapped = saved(); wrapped.at(-1).data.message.content[0].toolCallId = 'other'
  assert.equal(output(wrapped), unknown)
  const oldTurn = saved(); oldTurn.at(-1).data.turn = 0
  assert.equal(output(oldTurn), undefined)
  assert.equal(output(pair(planned(), GET, { taskId }, task())), unknown)
  assert.equal(output(pair(saved(), GET, { taskId: `pgt-${'c'.repeat(60)}` }, task())), unknown)
  assert.equal(output(pair(saved(), PREPARE, prepareArgs(), task())), unknown)
  assert.equal(output(pair(planned('只分析某真实部门允许访问172.16.2.100 TCP443，不保存任务'), PREPARE, prepareArgs(), task())), unknown)
})

test('Task资源只按真实原URI与本会话prepare绑定交付；伪URI和漂移正文不借旧成功', async () => {
  const uri = `http://127.0.0.1:26113/api/v1/policy-departments/tasks/${taskId}`
  const resource = (events, responseUri = uri, data = task()) => pair(events, 'read_mcp_resource', { server: 'policy-configuration', uri }, null,
    { contents: [{ uri: responseUri, text: JSON.stringify({ code: '200', data }) }] })
  assert.equal(output(resource(saved())), markdown)
  assert.equal(await routedText(runtime(resource(saved()))), markdown)
  assert.equal(output(resource(planned())), unknown)
  assert.equal(output(resource(saved(), `${uri}-wrong`)), unknown)
  assert.equal(output(resource(saved(), uri, { ...task(), intents_digest: digest })), unknown)
})

test('Task单层group资源仍续用原模型，坏外层URI不能借已保存任务交付', async () => {
  const template = 'http://127.0.0.1:26113/api/v1/policy-departments/tasks/{taskId}';
  const uri = `mcp-group:/policy-configuration/policy-configuration/t/${Buffer.from(template).toString('base64url')}?taskId=${taskId}`;
  const read = (value = uri, responseUri = value) => pair(saved(), 'read_mcp_resource', { server: 'policy-configuration', uri: value }, null,
    { contents: [{ uri: responseUri, text: JSON.stringify({ code: '200', data: task() }) }] });
  assert.equal(output(read()), markdown);
  assert.equal(await routedText(runtime(read())), markdown);
  assert.equal(output(read(uri, template.replace('{taskId}', taskId))), unknown);
  assert.equal(output(read(uri.replace('/policy-configuration/', '/wrong/'))), unknown);
});

test('真实注册别名须连同plan一起canonical化，不能只识别两个Task操作', async () => {
  const alias = raw => `mcp__部门展示名__${raw}`
  const events = saved().map(event => event.type === 'tool/call'
    ? { ...event, data: { ...event.data, name: alias(event.data.name.split('__').at(-1)) } } : event)
  assert.equal(await routedText(runtime(events, (source, raw) => source === 'policy-configuration' ? alias(raw) : undefined)), markdown)
  assert.equal(await routedText(runtime(events, () => undefined)), undefined)
})

const oldId = `op_${'1'.repeat(32)}`
const oldData = () => ({ operation_id: oldId, result_code: 'DRAFT_READY', task_status: 'DRAFT', task_id: 19,
  candidate_digest: digest, version: 1, confirmation_required: true, confirmation_expires_at: '2099-01-01T00:00:00Z', result_markdown: '原single草稿' })
const RESULT = 'mcp__policy-configuration__get_policy_configuration_result'
test('Task不进入旧确认链，且Task调用屏障阻止旧single结果回读复活', () => {
  const old = pair([], RESULT, { operationId: oldId }, oldData())
  assert.equal(latestDraft(old)?.operationId, oldId)
  assert.ok(draftFromExecution({ name: RESULT, arguments: { operationId: oldId } }, { value: { code: '200', data: oldData() } }))
  for (const name of [PREPARE, GET]) {
    const events = pair(old.slice(), name, name === GET ? { taskId } : prepareArgs(), task())
    pair(events, RESULT, { operationId: oldId }, oldData())
    assert.equal(blocksTaskDomainDraft(events, oldId), true)
    assert.equal(latestDraft(events), null)
  }
  const fake = { ...oldData(), schema_version: 'policy-department-task/v1', task_id: taskId }
  assert.equal(draftFromExecution({ name: RESULT, arguments: { operationId: oldId } }, { value: { code: '200', data: fake } }), null)
  assert.equal(latestDraft(pair([], RESULT, { operationId: oldId }, fake)), null)
  assert.equal(draftFromExecution({ name: PREPARE, arguments: prepareArgs() }, { value: { code: '200', data: task() } }), null)
})

test('admitted消息投影移除当前坏正文和历史成功证明，但不修改原始Session事件', async () => {
  const t = task(); t.intents_digest = digest; t.result_markdown = '错误成功正文，不得被当前admitted投影保留'
  const events = pair(saved(), GET, { taskId }, t)
  const before = JSON.stringify(events)
  const messages = events.filter(event => event.type === 'tool/result').map(event => event.data.message)
  const projected = delivery.projectDepartmentTaskMessages(messages, events)
  assert.doesNotMatch(JSON.stringify(projected), /错误成功正文|两个完整真实意图已持久保存/)
  assert.match(JSON.stringify(projected), /trusted_current_result.*false/)
  assert.equal(JSON.stringify(events), before)
  assert.equal(await routedText(runtime(events)), unknown)
  const wrongCall = saved(); wrongCall.at(-1).data.message.source.callId = 'unpaired'
  assert.equal(await routedText(runtime(wrongCall)), unknown)
})

test('原生高层Task工具保留Runtime权威成功/失败内容，不套MCP三引用或切provider', async () => {
  for (const value of [{ task: task(), result_markdown: markdown }, { result_markdown: '真实Runtime校验失败；结果待核实。' }]) {
    const events = pair([], 'create_department_policy_task', {}, null, value)
    const messages = [events.at(-1).data.message]
    assert.equal(delivery.projectDepartmentTaskMessages(messages, events), messages)
    const f = runtime(events)
    delivery.queueControlledOutput(f.agent.id, '旧single正文')
    delivery.continueWithModel(f.agent.id)
    delivery.queuePostDeliveryInteraction(f.agent.id, async () => '旧确认')
    const actual = await f.hooks.get('agent/request')({ agent: f.agent, turn: 1 }, async () => route)
    assert.deepEqual(actual, route)
    assert.equal(await delivery.runPostDeliveryInteraction(f.agent.id), undefined)
    assert.equal(blocksTaskDomainDraft(events, oldId), true)
    assert.equal(latestDraft(pair(events, RESULT, { operationId: oldId }, oldData())), null)
    assert.equal(draftFromExecution({ name: 'create_department_policy_task', arguments: {} }, { value }), null)
  }
})

test('原strict部门draft多changes与配置回滚正文保持逐字交付，Task不放宽草稿门槛', () => {
  const events = []; user(events, '请为某真实部门生成草稿，允许访问目的服务 TCP 443')
  const p = { schema_version: 'policy-department-plan/v1', request_id: 'preview-1', plan_id: 'plan-1', plan_digest: digest,
    read_only: true, execution_allowed: false, ready_for_draft: true, status: 'PARTIAL',
    preparation: { status: 'READY_FOR_DRAFT', ready_for_draft: true, asset_ids: [7, 8], count: 2, device_id: 'fixture-firewall', excluded: [] },
    items: [7, 8].map(asset_id => ({ asset_id, selected: true, status: 'ANALYZED', device_id: 'fixture-firewall',
      rule: { source_ip: `10.0.0.${asset_id}`, destination_ip: '172.16.2.100', protocol: 'TCP', destination_port: 443 } })) }
  pair(events, PLAN, planArgs(), p)
  const evidence = { task_precheck_status: 'NOT_RUN', execution_allowed: false, coverage_assessment: 'NOT_ASSESSED',
    scope_evidence: 'UNVERIFIED', direction_evidence: 'UNVERIFIED', current_policy_evidence: 'UNVERIFIED' }
  const body = '\n## 部门策略草稿\n真实配置预览与回滚预览；已保存，未审批、未执行。\n'
  const draft = { schema_version: 'policy-department-draft/v1', operation_id: 'pdop-12345678-1234-4123-8123-123456789abc',
    phase: 'DRAFT_READY', task_id: 71, included_asset_ids: [7, 8], excluded: [], ...evidence,
    coverage: 'NOT_ASSESSED', task_status_fresh: false, observed_at: '2026-10-29T00:00:00Z', result_markdown: body,
    binding: { ...evidence, task_id: 71, task_status: 'DRAFT', device_count: 1, change_count: 2,
      rendered_changes: [7, 8].map(id => ({ renderedCommands: [{ command: `服务端真实配置${id}` }],
        renderedRollbackCommands: [{ command: `服务端真实回滚${id}` }] })) } }
  pair(events, dept('prepare_policy_department_draft'), prepareArgs(), draft)
  assert.equal(output(events), body)
  const blocked = planned()
  pair(blocked, dept('prepare_policy_department_draft'), prepareArgs(), draft)
  assert.notEqual(output(blocked), body, '只有task_preparation就绪不能放行strict部门草稿')
})

test('Task首次失败后被拒跨域查询仍保留原模型，不切错误应急fixed摘要', async () => {
  const events = planned()
  pair(events, PREPARE, prepareArgs(), null, { error: '本地门禁拒绝，未保存' })
  events.at(-2).data.turn = 1
  events.at(-1).data.message.isError = true
  pair(events, 'mcp__emergency-action__list_emergency_actions', {}, null, { error: '部门路线禁止应急查询' })
  events.at(-2).data.turn = 1
  events.at(-1).data.message.isError = true
  const f = runtime(events)
  delivery.queueControlledOutput(f.agent.id, '错误应急服务摘要')
  const config = await f.hooks.get('agent/request')({ agent: f.agent, turn: 1 }, async () => route)
  assert.deepEqual(config, route)
})

test('旧Task轮不污染新用户轮次的正常应急交付', async () => {
  const events = saved()
  events.at(-2).data.turn = 1
  user(events, '查询另一项应急操作的结果')
  pair(events, 'mcp__emergency-action__get_emergency_action_result', { operationId: oldId },
    { operation_id: oldId, phase: 'TERMINAL', execution_status: 'SUCCEEDED' })
  events.at(-2).data.turn = 2
  events.at(-1).data.turn = 2
  const f = runtime(events)
  const config = await f.hooks.get('agent/request')({ agent: f.agent, turn: 2 }, async () => route)
  assert.equal(config.provider, 'security-operation-delivery')
})

test('原single脱敏和应急终态交付不变', () => {
  const single = pair([], RESULT, { operationId: oldId }, { ...oldData(), result_markdown: '基础策略草稿\n配置预览：不应外显' })
  assert.equal(output(single), `策略草稿已生成\n任务编号：19\n当前状态：草稿，尚未提交、审批或执行\n操作号：${oldId}\n内部配置内容已从用户视图隐藏。`)
  const emergency = pair([], 'mcp__emergency-action__get_emergency_action_result', { operationId: oldId },
    { operation_id: oldId, phase: 'TERMINAL', execution_status: 'SUCCEEDED' })
  assert.equal(output(emergency), `执行结果：成功\n操作号：${oldId}`)
})
