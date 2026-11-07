import assert from 'node:assert/strict'
import test from 'node:test'
import { delegationReceipt } from '../dsh/managed/security-operations-ui/delegation.js'
import { deliveryMarkdown } from '../dsh/managed/threat-analysis.mjs'

const content = [{ type: 'text', text: 'started subagent test-child-session' }]
const args = JSON.stringify({ description: '研判威胁事件 INC-20261026-000022' })
const events = [
  { type: 'tool/call', data: { name: 'delegate_threat_analysis', callId: 'call-1', arguments: args } },
  { type: 'tool/result', data: { turn: 1, message: { role: 'tool', toolCallId: 'call-1', content, isError: false } } },
]

test('启动回执提供中文角色与任务，聊天正文不暴露内部会话编号', () => {
  for (const [tool, role] of [
    ['delegate_threat_analysis', '威胁研判子智能体'],
    ['delegate_fault_analysis', '故障分析子智能体'],
    ['delegate_response_planning', '响应规划子智能体'],
  ]) {
    const receipt = delegationReceipt(tool, content, args)
    assert.equal(receipt.title, `已启动${role}`)
    assert.equal(receipt.subagentId, 'test-child-session')
    assert.match(receipt.markdown, /INC-20261026-000022/)
    assert.match(receipt.markdown, /结果将在任务结束后返回/)
    assert.doesNotMatch(receipt.markdown, /test-child-session|started subagent|已完成/)
  }
  assert.equal(deliveryMarkdown(events, 1), delegationReceipt('delegate_threat_analysis', content, args).markdown)
})

test('缺少参数不丢启动状态，其他结果和失败不会误报启动', () => {
  assert.equal(delegationReceipt('delegate_threat_analysis', content, '{')?.task, undefined)
  assert.equal(delegationReceipt('another_tool', content, args), undefined)
  assert.equal(delegationReceipt('delegate_threat_analysis', [{ type: 'text', text: 'execution failed' }], args), undefined)
  assert.equal(deliveryMarkdown(events, 2), undefined)
  const failed = structuredClone(events)
  failed[1].data.message.isError = true
  assert.equal(deliveryMarkdown(failed, 1), undefined)
  const direct = structuredClone(events)
  direct[1].data.meta = { threat_analysis: { delivery: { markdown: '实际研判结果' } } }
  assert.equal(deliveryMarkdown(direct, 1), '实际研判结果')
})
