// 仅模拟原生注册目录、restriction 与会话身份，不执行真实 Host、MCP 或设备动作。
import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, createSecurityOperationsGuard, TOOL_ROUTES, visibleToolsForDepth } from '../dsh/managed/security-operations-guard.mjs'
import { setEmergencyConfirmationTurn } from '../dsh/managed/emergency-action-guard.mjs'
import { setPolicyConfirmationTurn } from '../dsh/managed/policy-configuration-guard.mjs'

const mockTools = ['mcp__xx-device-mock__lookup_host', 'mcp__xx-device-mock__send_command']
const policyGroupTools = ['mcp__policy-configuration__lookup_host', 'mcp__policy-configuration__send_command']
const newGroupTools = ['mcp__new-device-group__a', 'mcp__new-device-group__b']
const agentAt = depth => ({ session: { header: { delegationDepth: depth }, snapshotEvents: () => [] } })
function nativeFixture(names, manager = { resolveTool: () => undefined, sourceStatus: () => ({ configured: false }) }) {
  const registered = new Set(names), handlers = new Map(), masks = new WeakMap(), restrictions = []
  let decide
  const get = (name, agent) => {
    const mask = agent && masks.get(agent)
    return registered.has(name) && (!mask?.allow || mask.allow.includes(name)) && !mask?.deny?.includes(name) ? {} : undefined
  }
  apply({ mcpSessionManager: manager, on(name, handler) { handlers.set(name, handler) },
    tools: { get, guard(handler) { decide = handler } }, logger: { warn() {} } })
  const createAgent = depth => {
    const agent = agentAt(depth)
    agent.ctx = { tools: { restrict(mask) {
      assert.ok(mask.allow !== undefined || mask.deny !== undefined)
      for (const name of [...(mask.allow ?? []), ...(mask.deny ?? [])]) assert.ok(registered.has(name))
      masks.set(agent, mask)
      restrictions.push({ agent, ...mask })
    } } }
    return agent
  }
  return { registered, handlers, restrictions, createAgent, decide: exec => decide(exec),
    visible: agent => [...registered].filter(name => get(name, agent) !== undefined) }
}

test('原生目录：新group任意a/b和policy组两工具不经固定routes即可见可调用，后注册无需改源码', async () => {
  const names = [...newGroupTools, ...policyGroupTools]
  for (const name of names) assert.ok(!Object.values(TOOL_ROUTES).flat().includes(name))
  const f = nativeFixture([...names, 'skill', 'ask_user_question'])
  const agent = f.createAgent(0)
  await f.handlers.get('agent/created')({ agent })
  assert.equal(f.restrictions.length, 0, '无旧禁止项时不调用空deny，也不以allow冻结根目录')
  f.registered.add('mcp__future-group__new_name')
  for (const name of [...names, 'mcp__future-group__new_name', 'ask_user_question']) {
    assert.ok(f.visible(agent).includes(name))
    assert.equal(f.decide({ agent, name, arguments: {} }), undefined)
  }
})

test('原生目录：根只deny实际注册的旧禁止和子专用工具，新增MCP不被已安装限制截断', async () => {
  const forbidden = ['bash', 'mcp__emergency-action__submit_emergency_action', 'analyze_threat_incident', 'mcp__sec-ops__get_event_by_id']
  const f = nativeFixture([...forbidden, ...policyGroupTools, 'skill'])
  const agent = f.createAgent(0)
  await f.handlers.get('agent/created')({ agent })
  assert.equal(f.restrictions.length, 1)
  assert.equal(f.restrictions[0].allow, undefined)
  assert.deepEqual(new Set(f.restrictions[0].deny), new Set(forbidden))
  for (const name of forbidden) {
    assert.ok(!f.visible(agent).includes(name))
    assert.notEqual(f.decide({ agent, name, arguments: {} }), undefined)
  }
  f.registered.add('mcp__later-group__new_command')
  for (const name of [...policyGroupTools, 'mcp__later-group__new_command']) {
    assert.ok(f.visible(agent).includes(name))
    assert.equal(f.decide({ agent, name, arguments: {} }), undefined)
  }
  f.registered.delete(policyGroupTools[0])
  assert.notEqual(f.decide({ agent, name: policyGroupTools[0], arguments: {} }), undefined)
})

test('原生目录：纯函数默认不认领注册，新旧未知和已废接口在未注册时仍拒绝', () => {
  const guard = createSecurityOperationsGuard(), agent = agentAt(0)
  for (const name of [...mockTools, ...policyGroupTools, ...newGroupTools,
    'mcp__inspection__get_inspection_scope', 'mcp__inspection__prepare_inspection',
    'mcp__troubleshooting__prepare_diagnosis', 'mcp__inspection__inspection_capabilities_list']) {
    assert.match(guard.decide({ agent, name, arguments: {} }), /未列入当前角色/)
  }
  const f = nativeFixture(policyGroupTools)
  assert.notEqual(f.decide({ agent, name: 'mcp__unknown__write', arguments: {} }), undefined)
})

test('原生目录：旧Mock直连也只走注册目录，不依赖旧HTTP来源特判', async () => {
  const f = nativeFixture(mockTools), agent = f.createAgent(0)
  await f.handlers.get('agent/created')({ agent })
  for (const name of mockTools) {
    assert.ok(f.visible(agent).includes(name))
    assert.equal(f.decide({ agent, name, arguments: {} }), undefined)
  }
})

test('来源共存：既有业务Skill不额外互斥普通已注册MCP和原生提问', () => {
  for (const skill of ['policy-configuration', 'emergency-action']) {
    const registered = new Set([...mockTools, ...policyGroupTools, ...newGroupTools])
    const guard = createSecurityOperationsGuard({ registeredMcp: exec => registered.has(exec.name) })
    const agent = agentAt(0)
    guard.beginTurn(agent, '处理既有SOC业务')
    assert.equal(guard.decide({ agent, name: 'skill', arguments: { name: skill } }), undefined)
    for (const name of [...registered, 'ask_user_question']) assert.equal(guard.decide({ agent, name, arguments: {} }), undefined)
  }
})

test('旧SOC保护：注册目录不能绕过旧Skill、签名运行时与永久禁用条件', () => {
  const guard = createSecurityOperationsGuard({ registeredMcp: () => true }), agent = agentAt(0)
  assert.match(guard.decide({ agent, name: 'mcp__policy-configuration__prepare_policy_configuration', arguments: {} }), /必须先加载/)
  assert.match(guard.decide({ agent, name: 'mcp__inspection__start_inspection', arguments: {} }), /运行插件校验/)
  for (const name of ['mcp__sec-ops__prepare_policy_configuration', 'mcp__sec-ops__select_policy_configuration_candidate',
    'mcp__policy-configuration__confirm_policy_configuration', 'mcp__policy-configuration__decide_policy_configuration',
    'mcp__emergency-action__confirm_emergency_action', 'mcp__emergency-action__submit_emergency_action', 'bash', 'run_code']) {
    assert.match(guard.decide({ agent, name, arguments: {} }), /永久禁用/)
  }
})

test('旧SOC保护：manager真实别名先canonical化，不能作为普通新MCP绕过confirm/submit禁用', async () => {
  const canonical = ['mcp__policy-configuration__confirm_policy_configuration', 'mcp__policy-configuration__decide_policy_configuration',
    'mcp__emergency-action__confirm_emergency_action', 'mcp__emergency-action__submit_emergency_action',
    'mcp__sec-ops__prepare_policy_configuration', 'mcp__sec-ops__select_policy_configuration_candidate']
  const aliases = canonical.map((_, i) => `mcp__renamed-source__action_${i}`)
  const f = nativeFixture(aliases, { sourceStatus: () => ({ configured: false }),
    resolveTool: (source, raw) => aliases[canonical.indexOf(`mcp__${source}__${raw}`)] })
  const agent = f.createAgent(0)
  for (const name of aliases) assert.match(f.decide({ agent, name, arguments: {} }), /永久禁用/)
  await f.handlers.get('agent/created')({ agent })
  assert.deepEqual(new Set(f.restrictions[0].deny), new Set(aliases))
  assert.deepEqual(f.visible(agent), [])
})

test('旧SOC保护：策略与应急受信确认轮仍拒绝普通已注册新MCP及原生提问', () => {
  const guard = createSecurityOperationsGuard({ registeredMcp: () => true }), agent = agentAt(0)
  setPolicyConfirmationTurn(agent, true)
  try {
    for (const name of [...policyGroupTools, ...newGroupTools, 'ask_user_question']) assert.match(guard.decide({ agent, name, arguments: {} }), /策略确认轮次/)
  } finally { setPolicyConfirmationTurn(agent, false) }
  setEmergencyConfirmationTurn(agent, true, `op_${'a'.repeat(32)}`)
  try {
    for (const name of [...policyGroupTools, ...newGroupTools, 'ask_user_question']) assert.match(guard.decide({ agent, name, arguments: {} }), /只能查询当前操作结果/)
  } finally { setEmergencyConfirmationTurn(agent, false) }
})

test('子角色：原allow和深层空allow保留，不因根目录或注册回调扩大MCP职责', async () => {
  const childTools = ['list_mcp_resources', 'analyze_threat_incident', 'mcp__sec-ops__get_event_by_id']
  for (const depth of [1, 2]) {
    const f = nativeFixture([...childTools, ...mockTools, ...policyGroupTools, ...newGroupTools, 'ask_user_question'])
    const agent = f.createAgent(depth)
    await f.handlers.get('agent/created')({ agent })
    const expected = depth === 1 ? childTools : []
    assert.deepEqual(new Set(f.visible(agent)), new Set(expected))
    assert.deepEqual(new Set(f.restrictions[0].allow), new Set(expected))
    assert.equal(f.restrictions[0].deny, undefined)
    for (const name of [...mockTools, ...policyGroupTools, ...newGroupTools]) {
      assert.ok(!visibleToolsForDepth(depth).includes(name))
      assert.notEqual(f.decide({ agent, name, arguments: {} }), undefined)
      assert.notEqual(createSecurityOperationsGuard({ registeredMcp: () => true }).decide({ agent, name, arguments: {} }), undefined)
    }
    assert.match(f.decide({ agent, name: 'ask_user_question', arguments: {} }), /只允许主 Agent/)
  }
})
