import { createThreatRuntime } from './threat/index.ts'
import { createNativeThreatServices } from './threat-services.ts'
import { seedThreatCompositions } from './templates.ts'
import { assetAlertsFlow } from './asset-alerts.ts'
import type { CompositionExtension } from '@harness-platform/mcp/extension'
declare const __SECURITY_OPERATIONS_BUILD_DIGEST__: string

export const name = 'security-operations-compositions'
export const inject = ['platformMcp', 'llm', 'settingsController']

/** 使用原生 DSH 插件生命周期，连接和模型凭据继续由原生服务管理。 */
export function apply(ctx: any) {
  const root = process.env.HARNESS_ASSET_ROOT
  if (!root) throw new Error('未设置 HARNESS_ASSET_ROOT')
  const extension: CompositionExtension = ctx.platformMcp.compositionExtension
  if (extension.id) throw new Error('组合编排业务扩展已登记')
  const threat = createThreatRuntime(root, createNativeThreatServices(root,
    (request, signal) => ctx.platformMcp.dispatch(request, signal), ctx.llm,
    () => ctx.settingsController.describe().namespaces.find((item: any) => item.ns === 'agent-default-model')?.value,
    () => ctx.platformMcp.servers.get()))
  ctx.effect(() => {
    Object.assign(extension, { id: name, sourceDigest: __SECURITY_OPERATIONS_BUILD_DIGEST__, threat, flow: assetAlertsFlow, seed: seedThreatCompositions })
    return () => { for (const key of ['id', 'sourceDigest', 'threat', 'flow', 'seed'] as const) delete extension[key] }
  })
}
