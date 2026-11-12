import assert from 'node:assert/strict'
import test from 'node:test'
import { createTool } from '../lib/tool.js'

function setup(bridgeEnabled) {
  const calls = []
  const bridge = {
    registerInteractive(value) { calls.push(value) },
    waitForEvent: async () => ({ status: 'cancelled' }),
  }
  const settings = { maxHtmlBytes: () => 100_000, eventBridgeEnabled: () => bridgeEnabled, interactionTimeoutMs: () => 0 }
  return { tool: createTool({ bridge, settings }), calls }
}

test('静态show_ui立即展示且不注册交互、不报等待或桥不可用', async () => {
  const { tool, calls } = setup(false)
  const value = await tool.execute({ html: '<div><details><summary>详情</summary>事实</details></div>', readonly: true, wait_for_interaction: true }, { callId: 'call-static', agent: { id: 'a' } })
  assert.equal(value.status, 'static')
  assert.equal(value.note.includes('等待用户在界面中提交'), false)
  assert.equal(value.note.includes('交互通道不可用'), false)
  assert.equal(calls.length, 0)
})

test('交互show_ui在桥关闭时返回unsupported且不注册', async () => {
  const { tool, calls } = setup(false)
  const value = await tool.execute({ html: '<button onclick="window.dsh.emit(\'x\', {})">提交</button>' }, { callId: 'call-int', agent: { id: 'a' } })
  assert.equal(value.status, 'unsupported')
  assert.equal(calls.length, 0)
})

test('默认未传readonly时保持原有交互注册兼容', async () => {
  const { tool, calls } = setup(true)
  const value = await tool.execute({ html: '<div>普通界面</div>' }, { callId: 'call-default', agent: { id: 'a' } })
  assert.equal(value.status, 'presented')
  assert.equal(calls.length, 1)
})

test('交互show_ui在桥开启时注册并可等待提交', async () => {
  const { tool, calls } = setup(true)
  const value = await tool.execute({ html: '<button onclick="window.dsh.emit(\'x\', {})">提交</button>' }, { callId: 'call-int2', agent: { id: 'a' } })
  assert.equal(value.status, 'presented')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].uiId, 'call-int2')
})
