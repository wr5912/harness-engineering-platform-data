// 按“操作名”解析组内工具，不依赖 server id / mcp__ 前缀。
// 契约：operation 名（如 preview_disposition）稳定；server id 是部署配置。

const toolNameCache = new WeakMap()

export async function resolveToolName(client, operation, bindings = {}) {
  const bound = bindings?.[operation]
  if (typeof bound === 'string' && bound.trim()) return bound.trim()
  let names = toolNameCache.get(client)
  if (!names) {
    if (typeof client?.listTools !== 'function') {
      throw new Error(`无法发现工具 ${operation}：客户端不支持 listTools`)
    }
    const listed = await client.listTools()
    names = (listed?.tools || []).map(item => item?.name).filter(Boolean)
    toolNameCache.set(client, names)
  }
  const matches = names.filter(name => name === operation || name.endsWith(`__${operation}`))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    throw new Error(`工具 ${operation} 存在多个候选：${matches.join(', ')}；请配置 toolBindings`)
  }
  throw new Error(`当前组未暴露工具 ${operation}`)
}

export function clearToolNameCache(client) {
  toolNameCache.delete(client)
}
