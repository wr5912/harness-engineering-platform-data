import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveToolName } from '../dsh/managed/disposition-runtime/tool-resolver.mjs'

const client = names => ({ listTools: async () => ({ tools: names.map(name => ({ name })) }) })

test('按操作名解析旧的两个 server 前缀', async () => {
  const c = client([
    'mcp__emergency-action__prepare_emergency_action',
    'mcp__disposition-preview__preview_disposition',
  ])
  assert.equal(await resolveToolName(c, 'prepare_emergency_action'),
    'mcp__emergency-action__prepare_emergency_action')
  assert.equal(await resolveToolName(c, 'preview_disposition'),
    'mcp__disposition-preview__preview_disposition')
})

test('按操作名解析新的聚合 server 前缀', async () => {
  const c = client([
    'mcp__platform-emergency__prepare_emergency_action',
    'mcp__platform-emergency__preview_disposition',
  ])
  assert.equal(await resolveToolName(c, 'prepare_emergency_action'),
    'mcp__platform-emergency__prepare_emergency_action')
  assert.equal(await resolveToolName(c, 'preview_disposition'),
    'mcp__platform-emergency__preview_disposition')
})

test('显式绑定优先，换 server 不改代码', async () => {
  const c = client(['mcp__any-server__prepare_emergency_action'])
  assert.equal(await resolveToolName(c, 'prepare_emergency_action', {
    prepare_emergency_action: 'mcp__bound__prepare_emergency_action',
  }), 'mcp__bound__prepare_emergency_action')
})

test('多个候选必须报错，不能静默选一个', async () => {
  const c = client([
    'mcp__a__preview_disposition',
    'mcp__b__preview_disposition',
  ])
  await assert.rejects(() => resolveToolName(c, 'preview_disposition'), /多个候选/)
})

test('组内没有该工具时报错', async () => {
  await assert.rejects(() => resolveToolName(client([]), 'preview_disposition'), /未暴露/)
})
