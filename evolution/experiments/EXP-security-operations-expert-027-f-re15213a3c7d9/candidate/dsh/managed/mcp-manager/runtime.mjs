import { createRequire } from 'node:module'

export function runtimeRequire() {
  if (process.env.DSH_MCP_CLIENT_ANCHOR) return createRequire(process.env.DSH_MCP_CLIENT_ANCHOR)
  const local = createRequire(import.meta.url)
  try { local.resolve('@deepseek-ai/dsh-mcp-client'); return local }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    // 原生 DSH 镜像为外置 managed 插件提供依赖；宿主开发使用仓库锁定依赖。
    return createRequire('/opt/dsh/packages/mcp/mcp-client/package.json')
  }
}
