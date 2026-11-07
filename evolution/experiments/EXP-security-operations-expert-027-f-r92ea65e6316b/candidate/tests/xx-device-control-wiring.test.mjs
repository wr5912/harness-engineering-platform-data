import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const text = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const skill = text('../dsh/workspace/.agents/skills/xx-device-control/SKILL.md')
const instructions = text('../dsh/workspace/AGENTS.md')
const preset = text('../dsh/presets/security-operations-expert/agent.cordis.yml')

test('草案接线：按已选来源复用共同流程，不额外设互斥业务或IP服务选路', () => {
  assert.ok(instructions.includes('只有本会话已明确选定XX设备Mock服务时'))
  assert.ok(instructions.includes('本期不实现新旧服务选择逻辑'))
  assert.ok(instructions.includes('先使用 `xx-device-control` Skill'))
  assert.ok(instructions.includes('共同流程'))
  assert.ok(instructions.includes('不把XX与SOC来源设为额外互斥业务'))
  assert.ok(instructions.includes('这些不是通用流程必调的XX接口'))
})

test('草案规则：三个字段来自映射与查询，展示设备及动作且不编造操作号', () => {
  for (const field of ['hostid', 'hostip', 'commandid']) assert.ok(skill.includes(`\`${field}\``))
  assert.ok(skill.includes('三个小写字段且全部为字符串'))
  assert.ok(skill.includes('支持UUID样式，不转数字、不改变大小写或补零'))
  for (const phrase of ['目标设备：名称（IP）', '指令动作：中文名称', '开发模拟，未下发', '不编造上游未返回的操作号', '确认之前不能调用写工具']) assert.ok(skill.includes(phrase))
  assert.ok(skill.includes('不维护另一份表、不引入内部动作键、不猜测ID'))
})

test('确认接线：只装官方原生提问，不新增确认控制器', () => {
  assert.match(preset, /- id: tool-ask-user\s+name: \/opt\/dsh\/packages\/interaction\/tool-ask-user\/lib\/index\.js/)
  assert.ok(skill.includes('DSH原生提问工具'))
  assert.ok(skill.includes('确认执行'))
  assert.ok(skill.includes('取消执行'))
  assert.ok(skill.includes('取消、跳过、关闭或自由输入均不授权写入'))
  assert.ok(skill.includes('不实现替代面板或消息/执行循环'))
})

test('MCP接线：官方stdio配置指向本Candidate的Mock服务', () => {
  assert.match(preset, /name: \/opt\/dsh\/packages\/mcp\/mcp-client\/lib\/index\.js/)
  assert.match(preset, /serverName: xx-device-mock\s+transport: stdio\s+command: node/)
  assert.ok(preset.includes('/opt/dsh-managed/xx-device-control-mock.mjs'))
  assert.ok(preset.includes('failOnStartupError: true'))
})

test('旧业务装配声明：原有应急、策略、诊断插件声明保持存在，不等于全业务回归', () => {
  for (const plugin of ['security-operations-guard', 'policy-confirmation-runtime', 'emergency-confirmation-runtime', 'operation-result-delivery', 'security-operations-diagnosis-runtime']) {
    assert.ok(preset.includes(`- id: ${plugin}\n`))
  }
  assert.ok(instructions.includes('### 应急指令'))
  assert.ok(instructions.includes('使用 `emergency-action` Skill'))
})
