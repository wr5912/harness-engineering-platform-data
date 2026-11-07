export const DELEGATE_ROLES: Record<string, string> = {
  delegate_threat_analysis: '威胁研判子智能体',
  delegate_fault_analysis: '故障分析子智能体',
  delegate_response_planning: '响应规划子智能体',
}

export function delegationReceipt(toolName: string, content: unknown, argsRaw?: string) {
  const role = DELEGATE_ROLES[toolName]
  if (!role || !Array.isArray(content) || content.length !== 1 || content[0]?.type !== 'text') return undefined
  const match = /^started subagent (\S+)$/.exec(content[0].text)
  if (!match) return undefined
  let task: string | undefined
  try {
    const args = JSON.parse(argsRaw ?? '{}')
    if (typeof args?.description === 'string') task = args.description.trim() || undefined
  } catch { /* 流式或缺失的参数不影响已记录的启动回执。 */ }
  const title = `已启动${role}`
  return {
    title, task, subagentId: match[1],
    markdown: `${title}。${task ? `\n\n任务：${task}` : ''}\n\n结果将在任务结束后返回。`,
  }
}
