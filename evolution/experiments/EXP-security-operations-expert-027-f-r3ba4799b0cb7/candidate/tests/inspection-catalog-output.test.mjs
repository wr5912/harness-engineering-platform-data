import assert from 'node:assert/strict'
import test from 'node:test'
import { apply as inspection } from '../dsh/managed/inspection-preparation-runtime.mjs'
import { apply as diagnosis } from '../dsh/managed/diagnosis-runtime.mjs'

for (const [label, source, raw, apply] of [
  ['巡检', 'inspection-compositions', 'get_composition_run', inspection],
  ['诊断', 'troubleshooting', 'list_troubleshooting_playbooks', diagnosis],
]) test(`${label}目录保留上游回执及字段类型，包装器不得改写返回值合同`, async () => {
  const body = { code: '200', msg: 'ok', data: [{ taskId: 'task-real' }] }
  const receipt = { structuredContent: body, content: [{ type: 'text', text: JSON.stringify(body) }] }
  const outputSchema = { type: 'object', properties: { code: { type: 'string' } } }
  const original = { name: `mcp__${source}__${raw}`, description: '巡检目录',
    parameters: { type: 'object', properties: {}, required: [] }, outputSchema,
    execute: async () => receipt }
  const handlers = {}, registered = []
  const agent = { id: 'catalog-session', session: { header: { delegationDepth: 0 } },
    ctx: { tools: { register: tool => { registered.push(tool); return () => {} } } } }
  apply({ mcpSessionManager: { resolveTool: (_source, name) => `mcp__${source}__${name}` },
    tools: { get: name => name === original.name ? original : undefined },
    on: (name, handler) => { handlers[name] = handler }, effect: () => {} })
  await handlers['agent/pre-step']({ agent }, async () => {})
  assert.equal(registered.length, 1)
  assert.equal(registered[0].outputSchema, outputSchema)
  assert.equal(await registered[0].execute({}, { agent }), receipt)
  assert.equal(typeof receipt.structuredContent.code, 'string')
})
