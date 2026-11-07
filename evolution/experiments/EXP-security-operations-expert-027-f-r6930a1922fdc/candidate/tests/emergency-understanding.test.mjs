import test from 'node:test'
import assert from 'node:assert/strict'
import { emergencyUnderstandingMarkdown } from '../dsh/managed/operation-result-delivery.mjs'

const INCIDENT = 'INC-20261027-000001'
const OP = 'op_0123456789abcdef0123456789abcdef'
const SUMMARY = `### 威胁事件研判摘要\n\n建议隔离主机 web-01。\n\n#### 保存与下载\n报告下载：[下载 HTML 报告](https://soc.example/report/${INCIDENT}.html)`

const call = (callId, name, args) => ({
  type: 'tool/call',
  data: { callId, name, arguments: JSON.stringify(args) },
})
const result = (callId, text) => ({
  type: 'tool/result',
  data: {
    message: {
      source: { callId },
      content: [{ type: 'tool-result', content: [{ type: 'text', text }] }],
    },
  },
})

const events = [
  call('c1', 'delegate_threat_analysis', { incident_id: INCIDENT }),
  result('c1', SUMMARY),
  call('c2', 'disposition_prepare', { incident_id: INCIDENT }),
  result('c2', JSON.stringify({
    code: '200',
    data: {
      operation_id: OP,
      items: [{ action: '隔离主机', target: 'web-01', executable: true }],
    },
  })),
]

test('前置研判摘要、处置建议和报告下载', () => {
  const markdown = emergencyUnderstandingMarkdown(events, OP)
  assert.equal(typeof markdown, 'string')
  assert.ok(markdown.includes('研判摘要'), markdown)
  assert.ok(markdown.includes('处置建议'), markdown)
  assert.ok(markdown.includes('报告下载'), markdown)
  assert.ok(markdown.includes('隔离主机'), markdown)
})

test('事件号不一致时不前置摘要', () => {
  const other = OP.replace('0123', 'ffff')
  const markdown = emergencyUnderstandingMarkdown(events, other)
  assert.equal(markdown, undefined)
})
