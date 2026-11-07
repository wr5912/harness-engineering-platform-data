/** 将本轮实际注册的直连 MCP 工具名映射回稳定来源 ID 与原始能力。未知名称拒绝。 */
export function canonicalToolName(manager, name, sources) {
  if (typeof name !== 'string' || !name.startsWith('mcp__')) return name
  for (const [sourceId, rawNames] of Object.entries(sources)) {
    for (const rawName of rawNames) {
      if (manager?.resolveTool(sourceId, rawName) === name) return `mcp__${sourceId}__${rawName}`
    }
  }
  return '__unbound_mcp_tool__'
}

export function canonicalToolEvents(events, normalize) {
  return events.map(event => event.type !== 'tool/call' ? event : {
    ...event, data: { ...event.data, name: normalize(event.data?.name) },
  })
}
