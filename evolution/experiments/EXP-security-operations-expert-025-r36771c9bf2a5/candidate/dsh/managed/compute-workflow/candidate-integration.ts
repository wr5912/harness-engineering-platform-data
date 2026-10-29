import { DECISION_SITES } from './decision-questions.ts'
import { CONTEXT_TOOL, WORKFLOW_TOOL, decisionToolName } from './security-ops-context.ts'
import { invariant, sha256 } from './language-understanding.ts'
import type { MediumPluginConfig } from './index.ts'

export const PARENT_PATCH_FILES = [
  'dsh/managed/security-operations-guard.mjs',
  'dsh/managed/role-tool-matrix.yaml',
  'dsh/presets/security-operations-expert/agent.cordis.yml',
  'dsh/managed/security-operations-expert.patch.yml',
] as const
export interface EditableFile { path: string; content: string; sha256: string }
/** 返回完整正文供18120 edit/preview→edit/apply审阅；本函数不读写资产或调用服务。 */
export function candidateIntegrationEdits(files: EditableFile[], config: MediumPluginConfig) {
  const inputs = new Map(files.map(file => [file.path, file]))
  invariant(inputs.size === files.length && PARENT_PATCH_FILES.every(path => inputs.has(path)), 'ACTUAL_CANDIDATE_FILES_REQUIRED')
  const tools = [WORKFLOW_TOOL, CONTEXT_TOOL, ...DECISION_SITES.map(decisionToolName)]
  function replace(text: string, anchor: string, replacement: string) {
    invariant(text.split(anchor).length === 2, 'PARENT_INTEGRATION_ANCHOR_CHANGED')
    return text.replace(anchor, replacement)
  }
  return PARENT_PATCH_FILES.map(path => {
    const file = inputs.get(path)!
    invariant(file.sha256 === sha256(file.content), 'EDIT_CONTENT_OR_REDACTION_MISMATCH')
    let content = file.content
    if (path.endsWith('security-operations-guard.mjs')) {
      content = replace(content, 'export const TOOL_ROUTES = Object.freeze({\n', `export const TOOL_ROUTES = Object.freeze({\n  mediumWorkflow: Object.freeze(${JSON.stringify(tools)}),\n`)
      content = replace(content, 'const ROOT_VISIBLE_TOOLS = Object.freeze([\n', 'const ROOT_VISIBLE_TOOLS = Object.freeze([\n  ...TOOL_ROUTES.mediumWorkflow,\n')
      content = replace(content, '    if (WORKSPACE_TOOLS.has(tool)) {', `    if (TOOL_ROUTES.mediumWorkflow.includes(tool)) {\n      if (depth !== 0) return '中算力工作流只能在主Agent当前作用域运行'\n      return undefined\n    }\n\n    if (WORKSPACE_TOOLS.has(tool)) {`)
    } else if (path.endsWith('role-tool-matrix.yaml')) {
      content = replace(content, '  local_tools:\n', `  local_tools:\n${tools.map(tool => `    - ${tool}\n`).join('')}`)
      content = replace(content, '  local_model_routes:\n', '  local_model_routes:\n    - provider: harness-workflow\n      model: hybrid-v1\n')
    } else if (path.includes('/presets/')) {
      invariant(!content.includes('id: security-ops-medium-workflow'), 'MEDIUM_PLUGIN_ALREADY_PRESENT')
      content += `\n- id: security-ops-medium-workflow\n  name: /opt/dsh-managed/compute-workflow/index.mjs\n  disabled: false\n  config: ${JSON.stringify(config)}\n`
    } else {
      content = replace(content, '- id: agent-default-model\n  config:\n    provider: local-qwen\n    model: Qwen3.8-27B\n',
        `- id: agent-default-model\n  config:\n    provider: ${JSON.stringify(config.qwen.provider)}\n    model: ${JSON.stringify(config.qwen.model)}\n    reasoningEffort: off\n`)
      for (const id of ['session-title-llm', 'compaction-basic', 'command-compact']) {
        invariant(!content.includes(`- id: ${id}\n`), 'AUXILIARY_MODEL_CONFIG_ALREADY_PRESENT')
        content += `\n- id: ${id}\n  disabled: true\n`
      }
    }
    return { path, expected_sha256: file.sha256, content }
  })
}
