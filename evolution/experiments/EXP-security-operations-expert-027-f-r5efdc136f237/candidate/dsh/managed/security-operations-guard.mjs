/**
 * security-operations-expert 的 DSH 原生单调 Guard。
 *
 * 本插件只会拒绝调用或阻断不合格的响应规划结果，绝不授予权限。
 * 业务状态和接口校验由原服务负责；无需登录的实例沿用平台原生放行规则。
 */

import { createHash } from 'node:crypto'
import { isAbsolute, resolve, sep } from 'node:path'
import { canonicalToolName } from './mcp-tool-identity.mjs'

export const name = 'security-operations-guard'
export const inject = ['tools', 'mcpSessionManager']

const WORKSPACE_ROOT = '/work/harness/workspace'
export const TOOL_ROUTES = Object.freeze({
  workspace: Object.freeze([
    'read',
    'write',
    'edit',
    'glob',
    'grep',
    'skill',
  ]),
  attachment: Object.freeze(['read_attachment_table']),
  policyResponse: Object.freeze([
    'mcp__policy-response-acceptance__policy_change',
    'mcp__policy-response-acceptance__emergency_action',
    'mcp__policy-response__preview_admin_dispatch_task',
    'mcp__policy-response__create_admin_dispatch_task',
    'mcp__policy-response__precheck_admin_dispatch_task',
    'mcp__policy-response__submit_admin_dispatch_task',
    'mcp__policy-response__execute_admin_dispatch_task',
    'mcp__policy-response__rollback_admin_dispatch_task',
    'mcp__policy-response__execute_resp_agent_actions',
    'mcp__policy-response__search_graph_assets',
    'mcp__policy-response__get_graph_resolve_ip_host',
    'mcp__policy-response__get_correlate_incident',
    'mcp__policy-response__get_resp_action_defs',
    'mcp__policy-response__get_admin_dispatch_task',
    'mcp__policy-response__get_ingest_dispatch_dispatchable_devices',
    'mcp__policy-response__get_admin_dispatch_task_by_id',
    'mcp__policy-response__get_admin_dispatch_task_tracking',
    'mcp__policy-response__dry_run_admin_dispatch_task',
    'mcp__policy-response__get_admin_dispatch_task_policy_configs',
    'mcp__policy-response__get_admin_dispatch_task_input_fields',
    'mcp__policy-response__get_dispatch_task_by_workflow_tracking',
    'mcp__policy-response__get_resp_action_defs_by_action_key',
    'mcp__policy-response__get_resp_agent_actions_executions',
    'mcp__policy-response__get_resp_actions_target_candidates',
    'mcp__policy-response__get_resp_actions_recommend',
    'mcp__policy-response__get_resp_actions_executions',
    'mcp__policy-response__get_resp_actions_executions_by_id',
    'mcp__policy-response__get_resp_actions_device_agents',
    'mcp__policy-response__get_resp_actions_by_workflow_tracking',
  ]),
  resources: Object.freeze([
    'list_mcp_resources',
    'list_mcp_resource_templates',
    'read_mcp_resource',
  ]),
  schedule: Object.freeze([
    'schedule_create',
    'schedule_list',
    'schedule_update',
    'schedule_delete',
  ]),
  inspection: Object.freeze([
    'mcp__inspection__list_executable_inspections',
    'mcp__inspection__start_inspection',
    'mcp__inspection__get_inspection_result',
    'mcp__inspection__get_inspection_report_details',
  ]),
  diagnosis: Object.freeze([
    'mcp__troubleshooting__list_troubleshooting_playbooks',
    'mcp__troubleshooting__start_diagnosis',
    'mcp__troubleshooting__get_diagnosis_result',
  ]),
  faultAnalysis: Object.freeze([
    'mcp__sec-ops__search_graph_assets',
    'mcp__sec-ops__get_graph_resolve_ip_host',
    'mcp__sec-ops__get_soc_asset_by_asset_id',
    'mcp__sec-ops__list_soc_asset',
    'mcp__sec-ops__get_soc_asset_biz_systems',
    'mcp__sec-ops__get_soc_asset_vulnerabilities',
    'mcp__sec-ops__get_ingest_devices_by_asset_by_asset_id',
    'mcp__sec-ops__get_graph_node_detail',
    'mcp__sec-ops__get_graph_path_query',
    'mcp__sec-ops__get_reachability_path_by_ip',
    'mcp__sec-ops__get_graph_flow_host_pair_ports',
    'mcp__sec-ops__get_reachability_cross_signal',
    'mcp__sec-ops__get_graph_compliance_violations',
    'mcp__sec-ops__get_graph_coverage',
    'mcp__sec-ops__get_event_by_id',
  ]),
  threatAnalysis: Object.freeze(['analyze_threat_incident']),
  threatAutomation: Object.freeze(['analyze_pending_threat_incidents']),
  delegates: Object.freeze([
    'delegate_threat_analysis',
    'delegate_fault_analysis',
    'delegate_response_planning',
  ]),
  denied: Object.freeze([
    'mcp__sec-ops__select_policy_configuration_candidate',
    'mcp__sec-ops__decide_policy_configuration',
  ]),
})

const DELEGATE_TOOLS = new Set(TOOL_ROUTES.delegates)
const POLICY_RESPONSE_TOOLS = new Set(TOOL_ROUTES.policyResponse)
const SCHEDULE_TOOLS = new Set(TOOL_ROUTES.schedule)
const INSPECTION_TOOLS = new Set(TOOL_ROUTES.inspection)
const DIAGNOSIS_TOOLS = new Set(TOOL_ROUTES.diagnosis)
const FAULT_TOOLS = new Set(TOOL_ROUTES.faultAnalysis)
const WORKSPACE_TOOLS = new Set(TOOL_ROUTES.workspace.filter(tool => tool !== 'skill'))
const ATTACHMENT_TOOLS = new Set(TOOL_ROUTES.attachment)
const ROOT_VISIBLE_TOOLS = Object.freeze([
  ...TOOL_ROUTES.resources,
  ...TOOL_ROUTES.workspace,
  ...TOOL_ROUTES.attachment,
  ...TOOL_ROUTES.policyResponse,
  ...TOOL_ROUTES.schedule,
  ...TOOL_ROUTES.inspection,
  ...TOOL_ROUTES.diagnosis,
  ...TOOL_ROUTES.threatAutomation,
  ...TOOL_ROUTES.delegates,
])
const CHILD_VISIBLE_TOOLS = Object.freeze([
  ...TOOL_ROUTES.resources,
  ...TOOL_ROUTES.threatAnalysis,
  ...TOOL_ROUTES.faultAnalysis,
])
const NO_VISIBLE_TOOLS = Object.freeze([])
const PERMANENTLY_DENIED = new Set([
  'bash',
  'pwsh',
  'run_code',
  'web_search',
  'web_fetch',
  'subagent',
  'subagent_fork',
  'send_message',
  'interrupt_agent',
  'list_agents',
  'mcp__sec-ops__prepare_policy_configuration',
  'mcp__sec-ops__get_policy_configuration_status',
  'mcp__sec-ops__get_policy_configuration_result',
  'mcp__policy-configuration__confirm_policy_configuration',
  'mcp__policy-configuration__decide_policy_configuration',
  'mcp__emergency-action__confirm_emergency_action',
  'mcp__emergency-action__submit_emergency_action',
  ...TOOL_ROUTES.denied,
])

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value, keys) {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function nonEmptyString(value, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum
}

function uniqueArray(value, maximum, validator) {
  if (!Array.isArray(value) || value.length > maximum || !value.every(validator)) return false
  return new Set(value.map(item => JSON.stringify(item))).size === value.length
}

function parameter(value) {
  return exactKeys(value, ['name', 'value']) && nonEmptyString(value.name, 128)
}

export function validateResponsePlanInput(value) {
  if (!exactKeys(value, [
    'schema_version', 'request_id', 'incident_summary', 'confirmed_evidence', 'constraints', 'requested_output',
  ])) return '响应规划输入的顶层字段不符合 response-plan-input/v1'
  if (value.schema_version !== 'response-plan-input/v1'
    || value.requested_output !== 'response-plan-output/v1'
    || !nonEmptyString(value.request_id, 128)
    || !nonEmptyString(value.incident_summary, 4000)) return '响应规划输入身份或摘要无效'
  if (!uniqueArray(value.confirmed_evidence, 256, item => isRecord(item)
    && Object.keys(item).every(key => ['evidence_ref', 'statement', 'source'].includes(key))
    && Object.prototype.hasOwnProperty.call(item, 'evidence_ref')
    && Object.prototype.hasOwnProperty.call(item, 'statement')
    && nonEmptyString(item.evidence_ref, 256)
    && nonEmptyString(item.statement, 2000)
    && (item.source === undefined || item.source === null || nonEmptyString(item.source, 512)))) {
    return '响应规划证据集合无效'
  }
  const constraints = value.constraints
  if (!exactKeys(constraints, [
    'mode', 'eligible_published_candidates', 'eligible_temporary_actions', 'success_criteria',
  ])) return '响应规划约束字段无效'
  if (!['published_semantic_selection', 'temporary_action_composition'].includes(constraints.mode)) {
    return '响应规划模式无效'
  }
  if (!uniqueArray(constraints.eligible_published_candidates, 256, item => exactKeys(item, ['playbook_id', 'summary'])
    && nonEmptyString(item.playbook_id, 256) && nonEmptyString(item.summary, 2000))) {
    return '已发布候选集合无效'
  }
  if (!uniqueArray(constraints.eligible_temporary_actions, 256, item => exactKeys(item, ['action_key', 'target', 'parameters'])
    && nonEmptyString(item.action_key, 256) && nonEmptyString(item.target, 512)
    && uniqueArray(item.parameters, 256, parameter))) return '临时动作候选集合无效'
  if (!uniqueArray(constraints.success_criteria, 256, item => nonEmptyString(item, 1000))) {
    return '成功标准集合无效'
  }
  return undefined
}

function validatePlanStep(step, input) {
  if (!exactKeys(step, ['action_key', 'target', 'parameters', 'reason'])
    || !nonEmptyString(step.action_key, 256)
    || !nonEmptyString(step.target, 512)
    || !nonEmptyString(step.reason, 500)
    || !uniqueArray(step.parameters, 256, parameter)) return false
  return input.constraints.eligible_temporary_actions.some(candidate =>
    candidate.action_key === step.action_key
    && candidate.target === step.target
    && JSON.stringify(candidate.parameters) === JSON.stringify(step.parameters))
}

export function validateResponsePlanOutput(value, input) {
  if (!exactKeys(value, ['schema_version', 'request_id', 'plan', 'assumptions', 'risks', 'evidence_refs'])) {
    return '响应规划输出的顶层字段不符合 response-plan-output/v1'
  }
  if (value.schema_version !== 'response-plan-output/v1' || value.request_id !== input.request_id) {
    return '响应规划输出身份未与冻结输入绑定'
  }
  if (!uniqueArray(value.assumptions, 256, item => nonEmptyString(item, 1000))
    || !uniqueArray(value.risks, 256, item => nonEmptyString(item, 1000))
    || !uniqueArray(value.evidence_refs, 256, item => nonEmptyString(item, 256))) {
    return '响应规划输出的假设、风险或证据引用无效'
  }
  const plan = value.plan
  if (!exactKeys(plan, ['resolution', 'decision_reason', 'selected_playbook_id', 'steps'])
    || !['published_reuse', 'temporary', 'needs_human_review'].includes(plan.resolution)
    || !nonEmptyString(plan.decision_reason, 500)
    || !Array.isArray(plan.steps)
    || plan.steps.length > 256) return '响应规划 plan 无效'
  if (plan.resolution === 'published_reuse') {
    if (!nonEmptyString(plan.selected_playbook_id, 256) || plan.steps.length !== 0) {
      return '复用已发布剧本时选择或步骤无效'
    }
    if (!input.constraints.eligible_published_candidates.some(candidate =>
      candidate.playbook_id === plan.selected_playbook_id)) return '输出选择了冻结集合之外的剧本'
  } else if (plan.resolution === 'temporary') {
    if (plan.selected_playbook_id !== null || plan.steps.length < 1
      || !plan.steps.every(step => validatePlanStep(step, input))) {
      return '临时响应计划包含冻结候选集合之外的动作'
    }
  } else if (plan.selected_playbook_id !== null || plan.steps.length !== 0) {
    return '人工复核输出不得携带剧本或动作'
  }
  return undefined
}

function textOutput(value) {
  if (!isRecord(value) || value.kind !== 'foreground' || !Array.isArray(value.output)) return undefined
  const blocks = value.output
  if (!blocks.every(block => isRecord(block) && block.type === 'text' && typeof block.text === 'string')) return undefined
  return blocks.map(block => block.text).join('')
}

function delegationDepth(agent) {
  const value = agent?.session?.header?.delegationDepth
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function depthOf(exec) {
  return delegationDepth(exec?.agent)
}

export function visibleToolsForDepth(depth) {
  if (depth === 0) return ROOT_VISIBLE_TOOLS
  if (depth === 1) return CHILD_VISIBLE_TOOLS
  return NO_VISIBLE_TOOLS
}

function pathArguments(args) {
  if (!isRecord(args)) return []
  return ['file_path', 'path', 'directory', 'cwd']
    .map(key => args[key])
    .filter(value => typeof value === 'string')
}

function outsideWorkspace(value) {
  const target = resolve(WORKSPACE_ROOT, value)
  return target !== WORKSPACE_ROOT && !target.startsWith(WORKSPACE_ROOT + sep)
}

function sensitivePath(value) {
  const normalized = isAbsolute(value) ? resolve(value) : resolve(WORKSPACE_ROOT, value)
  return normalized === '/var/lib/dsh'
    || normalized.startsWith('/var/lib/dsh/')
    || normalized === '/opt/dsh-managed'
    || normalized.startsWith('/opt/dsh-managed/')
    || normalized === '/opt/dsh-presets'
    || normalized.startsWith('/opt/dsh-presets/')
    || /(?:^|[/\\])\.env(?:$|[/\\.])/.test(value)
}

function responseInput(exec, environment) {
  if (environment.DSH_SEC_OPS_RESPONSE_PLANNING_ENABLED !== 'true') {
    return { error: '响应规划受信 Gate 未开启，默认拒绝' }
  }
  if (!isRecord(exec.arguments) || typeof exec.arguments.prompt !== 'string') {
    return { error: '响应规划必须使用裸 JSON prompt' }
  }
  let input
  try {
    input = JSON.parse(exec.arguments.prompt)
  } catch {
    return { error: '响应规划 prompt 不是有效 JSON' }
  }
  const validation = validateResponsePlanInput(input)
  if (validation !== undefined) return { error: validation }
  const expected = environment.DSH_SEC_OPS_RESPONSE_INPUT_SHA256
  if (!/^[0-9a-f]{64}$/i.test(expected ?? '')) return { error: '响应规划缺少受信输入摘要' }
  const actual = createHash('sha256').update(exec.arguments.prompt, 'utf8').digest('hex')
  if (actual.toLowerCase() !== expected.toLowerCase()) return { error: '响应规划输入摘要与受信绑定不一致' }
  return { input }
}

export function createSecurityOperationsGuard(options = {}) {
  const environment = options.environment ?? process.env
  const canonicalName = options.canonicalName ?? (name => name)
  const trustedRuntime = options.trustedRuntime ?? (() => false)
  const mode = environment.DSH_HARNESS_MODE === 'authoring' ? 'authoring' : 'verification'
  const responseInputs = new WeakMap()
  const beginTurn = () => {}

  const decide = (exec) => {
    const tool = canonicalName(exec?.name)
    if (typeof tool !== 'string') return '缺少有效工具身份'
    if (PERMANENTLY_DENIED.has(tool)) return '该能力在 security-operations-expert 中永久禁用'
    const agent = exec.agent
    if (!isRecord(agent)) return '模型工具调用缺少 Agent 运行身份'
    const depth = depthOf(exec)
    if (depth > 0 && DELEGATE_TOOLS.has(tool)) return '子 Agent 不得再次委派'

    if (WORKSPACE_TOOLS.has(tool)) {
      const paths = pathArguments(exec.arguments)
      if (paths.some(sensitivePath)) return '不得访问 DSH 数据、凭据或 managed/preset 平面'
      if (paths.some(outsideWorkspace)) return '文件能力仅限当前 Candidate workspace'
      if (tool === 'write' || tool === 'edit') {
        if (mode !== 'authoring') return '验证或 Release 模式中的 Harness 为只读'
        if (paths.length === 0) return '写操作缺少可验证的 workspace 路径'
      }
      return undefined
    }

    if (ATTACHMENT_TOOLS.has(tool)) {
      if (depth !== 0) return '附件读取工具只允许主 Agent 调用'
      // 只读事实提取；不切换业务域、不授予策略准备或执行权限。
      return undefined
    }

    if (tool === 'skill') {
      if (depth > 0) return '角色子 Agent 不得加载额外 Skill 扩大能力'
      return undefined
    }
    if (POLICY_RESPONSE_TOOLS.has(tool)) {
      if (depth !== 0) return '策略、应急与目标查询由主 Agent 调用'
      return undefined
    }
    if (DELEGATE_TOOLS.has(tool)) {
      if (depth !== 0) return '子 Agent 不得再次委派'
      if (tool !== 'delegate_response_planning') {
        return undefined
      }
      const result = responseInput(exec, environment)
      if (result.error !== undefined) return result.error
      responseInputs.set(exec, result.input)
      return undefined
    }
    if (SCHEDULE_TOOLS.has(tool)) {
      if (depth !== 0) return '自动化任务只允许主 Agent 调用'
      return undefined
    }
    if (TOOL_ROUTES.resources.includes(tool)) {
      if (depth > 1) return '资源工具只允许当前主 Agent 或子 Agent 调用'
      return undefined
    }
    if (INSPECTION_TOOLS.has(tool)) {
      if (depth !== 0) return '巡检工具只能由主 Agent 调用'
      if (['mcp__inspection__start_inspection', 'mcp__inspection__get_inspection_result'].includes(tool)
        && !trustedRuntime(exec, 'inspection')) return '巡检工具未通过运行插件校验，请核对当前实例的插件版本和加载状态'
      return undefined
    }
    if (DIAGNOSIS_TOOLS.has(tool)) {
      if (depth !== 0) return '平台诊断工具只能由主 Agent 调用'
      if (['mcp__troubleshooting__start_diagnosis', 'mcp__troubleshooting__get_diagnosis_result'].includes(tool)
        && !trustedRuntime(exec, 'diagnosis')) return '诊断工具未通过运行插件校验，请核对当前实例的插件版本和加载状态'
      return undefined
    }
    if (FAULT_TOOLS.has(tool)) {
      if (depth !== 1) return 'SOC 故障取证工具只能由故障分析子 Agent 调用'
      return undefined
    }
    if (TOOL_ROUTES.threatAnalysis.includes(tool)) {
      if (depth !== 1) return '威胁研判工具只能由专用子 Agent 调用'
      return undefined
    }
    if (TOOL_ROUTES.threatAutomation.includes(tool)) {
      if (depth !== 0) return '自动威胁研判只允许主 Agent 的受信 Schedule 桥调用'
      return undefined
    }

    if (tool.startsWith('mcp__')) return '未列入当前角色授权集合的 MCP 工具被拒绝'
    return '未列入 security-operations-expert 显式工具集合的能力被拒绝'
  }

  const validateResponseResult = (exec, result) => {
    if (exec.name !== 'delegate_response_planning' || result.isError) return undefined
    const input = responseInputs.get(exec)
    responseInputs.delete(exec)
    if (input === undefined) return '响应规划结果缺少冻结输入绑定'
    const text = textOutput(result.value)
    if (text === undefined) return '响应规划必须以前台纯文本返回裸 JSON'
    let output
    try {
      output = JSON.parse(text)
    } catch {
      return '响应规划输出不是裸 JSON object'
    }
    return validateResponsePlanOutput(output, input)
  }

  return { decide, validateResponseResult, beginTurn, mode }
}

export function apply(ctx) {
  const anonymous = () => ctx.get?.('businessRuntime')?.requiresAuthentication?.() === false
  if (anonymous()) return
  const known = [
    ...Object.values(TOOL_ROUTES).flat(),
    ...PERMANENTLY_DENIED,
  ].filter(name => typeof name === 'string' && name.startsWith('mcp__'))
  const sources = {}
  for (const canonical of known) {
    const split = canonical.indexOf('__', 5)
    const sourceId = canonical.slice(5, split)
    ;(sources[sourceId] ??= []).push(canonical.slice(split + 2))
  }
  const canonicalName = name => canonicalToolName(ctx.mcpSessionManager, name, sources)
  const actualName = canonical => {
    if (!canonical.startsWith('mcp__')) return canonical
    const split = canonical.indexOf('__', 5)
    return ctx.mcpSessionManager?.resolveTool?.(canonical.slice(5, split), canonical.slice(split + 2))
  }
  const guard = createSecurityOperationsGuard({ canonicalName, trustedRuntime: (exec, domain) => {
    const tool = ctx.tools.get(exec.name, exec.agent)
    return tool?.[Symbol.for(`security-operations.${domain}.runtime`)] === true
  } })
  const restrictedAgents = new WeakSet()
  const restrictionDeferred = (agent, creating = false) => {
    // 子角色不等待根策略源；延续创建即隔离，depth > 1 也不借用 depth 1 名单。
    if (creating && delegationDepth(agent) > 0) return false
    // 缺少挂载状态/身份映射时，不在根创建阶段冻结可能尚未完成的目录。
    // 保留原 pre-step 的兼容路径及逐调用门禁；此时不保证首请求已隐藏角色外工具。
    if (creating && delegationDepth(agent) === 0 &&
        (typeof ctx.mcpSessionManager?.resolveTool !== 'function' ||
         typeof ctx.mcpSessionManager?.sourceStatus !== 'function')) {
      ctx.logger?.warn?.('security guard deferred creation restriction: MCP mount APIs unavailable')
      return true
    }
    return false
  }
  const restrictAgent = agent => {
    const allow = visibleToolsForDepth(delegationDepth(agent))
      .map(actualName).filter(tool => tool && ctx.tools.get(tool, agent) !== undefined)
    try {
      // SDK restriction 仍归 agent.ctx 生命周期管理，不使用额外权限或通用 deny 兜底。
      agent.ctx.tools.restrict({ allow })
    } catch (error) {
      // 可见不等于可限制：global/祖先工具可收紧，自身层工具可能令整次 restrict 失败。
      // 失败不能标记完成，后续 step 仍须重试；逐调用拒绝门禁保持独立生效。
      ctx.logger?.warn?.(`security guard tool restriction unavailable: ${error?.message ?? error}`)
      return
    }
    restrictedAgents.add(agent)
  }
  // businessRuntime 异步装载，事件执行时再核对实际访问模式。
  ctx.on('agent/created', ({ agent }) => {
    if (anonymous()) return
    if (!restrictionDeferred(agent, true)) restrictAgent(agent)
  })
  ctx.on('agent/pre-step', async ({ agent, messages, step }, next) => {
    if (anonymous()) return next()
    if (step === 1) {
      const user = messages.filter(message => message.source?.kind === 'user').at(-1)
      const text = user?.content?.filter(item => item.type === 'text').map(item => item.text).join('') ?? ''
      guard.beginTurn(agent, text)
    }
    // 创建期未就绪或 restrict 失败时继续异步挂载/失败重试；不把失败标为完成。
    if (!restrictedAgents.has(agent) && !restrictionDeferred(agent)) restrictAgent(agent)
    return next()
  })
  ctx.tools.guard((exec) => {
    if (anonymous()) return
    const reason = guard.decide(exec)
    if (reason !== undefined) ctx.logger?.warn?.(`security guard denied tool=${exec.name} call=${String(exec.callId)} reason=${reason}`)
    return reason
  })
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (anonymous()) return next()
    const reason = guard.validateResponseResult(exec, result)
    if (reason === undefined) return next()
    return { kind: 'block', feedback: [{ type: 'text', text: reason }] }
  })
}
