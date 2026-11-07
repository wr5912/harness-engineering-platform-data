const DELEGATE_ROLES = {
  delegate_threat_analysis: "\u5A01\u80C1\u7814\u5224\u5B50\u667A\u80FD\u4F53",
  delegate_fault_analysis: "\u6545\u969C\u5206\u6790\u5B50\u667A\u80FD\u4F53",
  delegate_response_planning: "\u54CD\u5E94\u89C4\u5212\u5B50\u667A\u80FD\u4F53"
};
function delegationReceipt(toolName, content, argsRaw) {
  const role = DELEGATE_ROLES[toolName];
  if (!role || !Array.isArray(content) || content.length !== 1 || content[0]?.type !== "text") return void 0;
  const match = /^started subagent (\S+)$/.exec(content[0].text);
  if (!match) return void 0;
  let task;
  try {
    const args = JSON.parse(argsRaw ?? "{}");
    if (typeof args?.description === "string") task = args.description.trim() || void 0;
  } catch {
  }
  const title = `\u5DF2\u542F\u52A8${role}`;
  return {
    title,
    task,
    subagentId: match[1],
    markdown: `${title}\u3002${task ? `

\u4EFB\u52A1\uFF1A${task}` : ""}

\u7ED3\u679C\u5C06\u5728\u4EFB\u52A1\u7ED3\u675F\u540E\u8FD4\u56DE\u3002`
  };
}
export {
  DELEGATE_ROLES,
  delegationReceipt
};
