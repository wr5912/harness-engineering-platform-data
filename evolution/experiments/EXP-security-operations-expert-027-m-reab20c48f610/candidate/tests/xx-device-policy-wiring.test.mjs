import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const text = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const skill = text('../dsh/workspace/.agents/skills/xx-device-policy/SKILL.md')
const currentSkill = text('../dsh/workspace/.agents/skills/xx-policy-template/SKILL.md')
const seed = text('../dsh/managed/web-profile.seed.patch.yml')
const instructions = text('../dsh/workspace/AGENTS.md')
const preset = text('../dsh/presets/security-operations-expert/agent.cordis.yml')

test('策略接线：XX模板使用独立组合，保留AISOC策略并停止未配置真实连接', () => {
  assert.ok(instructions.includes('`xx.policy`→`xx-policy-template`'))
  assert.ok(instructions.includes('`xx_device_policy`'))
  for (const phrase of ['routeKey = xx.policy', 'sourceVerified = true', '`stop=preview`', '`stop=apply`', '不回退Mock']) assert.ok(currentSkill.includes(phrase))
  assert.ok(seed.includes('serverName: xx-device-acceptance'))
  for (const content of [preset, seed]) for (const disabled of ['serverName: xx-policy-mock', '/opt/dsh-managed/xx-device-policy-mock.mjs']) assert.ok(!content.includes(disabled))
})

test('保留的离线Mock基础流程：读取、修改草案、原生确认后只传五字段，不实现后台处理', () => {
  for (const field of ['hostid', 'hostip', '设备控制', 'login', 'net']) assert.ok(skill.includes(`\`${field}\``))
  for (const phrase of ['本次读取的字符串', '其余Map为 `{}`', '确认之前不能调用写工具', '本次草案五字段原样', '模拟下发成功', 'osuer、proctocol', '不猜每个编号的业务含义或时间单位']) assert.ok(skill.includes(phrase))
  assert.ok(!skill.includes('`map1`'))
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
