import { TOOL_ROUTES } from './security-operations-guard.mjs'

export const name = 'security-operations-child-guard'
export const inject = ['tools', 'mcpSessionManager', 'businessRuntime']

const faultCapabilities = TOOL_ROUTES.faultAnalysis.map(name => name.slice('mcp__sec-ops__'.length))
const roles = new Set(['fault', 'threat', 'response'])

function allowedTools(ctx, role) {
  if (role === 'response') return new Set()
  if (role === 'threat') return new Set(TOOL_ROUTES.threatAnalysis)
  const names = new Set(TOOL_ROUTES.resources)
  for (const rawName of faultCapabilities) {
    const actual = ctx.mcpSessionManager.resolveTool('sec-ops', rawName)
    if (typeof actual === 'string' && actual) names.add(actual)
  }
  return names
}

export function apply(ctx, config) {
  if (ctx.get?.('businessRuntime')?.requiresAuthentication?.() === false) return
  if (!roles.has(config?.role)) throw new Error('invalid security-operations child role')
  const restrictions = new WeakMap()
  const anonymous = () => ctx.get?.('businessRuntime')?.requiresAuthentication?.() === false
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    restrictions.get(agent)?.()
    restrictions.delete(agent)
    if (!anonymous()) {
      const allow = [...allowedTools(ctx, config.role)].filter(name => ctx.tools.get(name, agent) !== undefined)
      try { restrictions.set(agent, agent.ctx.tools.restrict({ allow })) }
      catch (error) { ctx.logger?.warn?.(`child tool restriction unavailable role=${config.role}: ${error?.message ?? error}`) }
    }
    return next()
  })
  ctx.tools.guard(exec => anonymous() || allowedTools(ctx, config.role).has(exec.name)
    ? undefined : `当前 ${config.role} 子 Agent 未授权此工具`)
}
