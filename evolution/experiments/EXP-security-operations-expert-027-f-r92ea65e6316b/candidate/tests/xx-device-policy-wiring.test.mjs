import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const text = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const skill = text('../dsh/workspace/.agents/skills/xx-device-policy/SKILL.md')
const instructions = text('../dsh/workspace/AGENTS.md')
const preset = text('../dsh/presets/security-operations-expert/agent.cordis.yml')

test('策略接线：另两个模板工具，固定指令及旧SOC路线保留', () => {
  assert.ok(instructions.includes('使用 `xx-device-policy` Skill'))
  for (const name of ['read_policy_template', 'write_policy_template']) assert.ok(skill.includes(name))
  assert.ok(skill.includes('不调用指令系列的lookup_host、send_command'))
  assert.ok(preset.includes('serverName: xx-policy-mock'))
  assert.ok(preset.includes('/opt/dsh-managed/xx-device-policy-mock.mjs'))
  assert.ok(preset.includes('serverName: xx-device-mock'))
})

test('基础流程：读取、修改草案、原生确认后只传五字段，不实现后台处理', () => {
  for (const field of ['hostid', 'hostip', 'map1', 'map2', 'map3']) assert.ok(skill.includes(`\`${field}\``))
  for (const phrase of ['本次读取的字符串', '其余map为 `{}`', '确认之前不能调用写工具', '本次草案五字段原样', '模拟下发成功']) assert.ok(skill.includes(phrase))
  assert.ok(skill.includes('不处理并发、模板版本、后台新建模板或应用设备'))
})

test('复用原生问答及目录接入，不增加确认控制器或固定工具名守卫', () => {
  assert.equal((preset.match(/- id: tool-ask-user\n/g) ?? []).length, 1)
  assert.ok(skill.includes('selected恰好为单项“确认执行”'))
  assert.ok(skill.includes('取消、跳过、关闭、自由输入均不写入'))
  const guard = text('../dsh/managed/security-operations-guard.mjs')
  assert.ok(!guard.includes('xx-policy-mock'))
  assert.ok(guard.includes('registeredMcp'))
})
