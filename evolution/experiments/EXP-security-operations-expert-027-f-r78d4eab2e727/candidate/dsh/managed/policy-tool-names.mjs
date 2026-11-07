// 策略工具按“操作名”解析：不依赖 server id / mcp__ 前缀。
// server id 只是部署配置；操作名（resolve_policy_endpoints 等）是稳定契约。

export const POLICY_OPERATIONS = Object.freeze([
  'resolve_policy_endpoints',
  'choose_ambiguous_policy_endpoints',
  'prepare_policy_configuration',
  'get_policy_configuration_status',
  'get_policy_configuration_result',
  'select_policy_configuration_candidate',
  'confirm_policy_configuration',
  'decide_policy_configuration',
])

const OPERATIONS = new Set(POLICY_OPERATIONS)

// 允许的 server id 前缀；新配置模式可用 POLICY_MCP_SERVER_IDS 覆盖（逗号分隔）。
export const POLICY_SERVER_IDS = Object.freeze(
  (process.env.POLICY_MCP_SERVER_IDS || 'policy-configuration')
    .split(',').map(item => item.trim()).filter(Boolean),
)

export function policyOperation(name) {
  if (typeof name !== 'string') return null
  const index = name.lastIndexOf('__')
  const suffix = index >= 0 ? name.slice(index + 2) : name
  return OPERATIONS.has(suffix) ? suffix : null
}

export function isPolicyTool(name) {
  return policyOperation(name) !== null
}

export function policyToolNames(serverIds = POLICY_SERVER_IDS) {
  return serverIds.flatMap(id => POLICY_OPERATIONS.map(operation => `mcp__${id}__${operation}`))
}
