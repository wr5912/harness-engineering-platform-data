import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const text = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const skill = text('../dsh/workspace/.agents/skills/xx-device-control/SKILL.md')
const currentSkill = text('../dsh/workspace/.agents/skills/xx-device-command/SKILL.md')
const seed = text('../dsh/managed/web-profile.seed.patch.yml')
const instructions = text('../dsh/workspace/AGENTS.md')
const preset = text('../dsh/presets/security-operations-expert/agent.cordis.yml')

test('当前接线：来源已验证后交给XX固定指令组合，不回退离线Mock', () => {
  assert.ok(instructions.includes('`xx.command`→`xx-device-command`'))
  assert.ok(instructions.includes('`xx_device_command`'))
  for (const phrase of ['sourceVerified = true', '`stop=preview`', '`stop=apply`', '真实连接未配置时组合明确停止']) assert.ok(currentSkill.includes(phrase))
})

test('保留的离线Mock规则：三个字段来自映射与查询，展示设备及动作且不编造操作号', () => {
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

test('MCP接线：绑定XX组合验收来源，Preset不启用本地Mock', () => {
  assert.match(seed, /id: xx-device-acceptance\s+serverName: xx-device-acceptance/)
  for (const content of [preset, seed]) for (const disabled of ['serverName: xx-device-mock', '/opt/dsh-managed/xx-device-control-mock.mjs']) assert.ok(!content.includes(disabled))
})

test('当前装配保留原生问答与巡检，不恢复旧确认器和执行包装', () => {
  for (const plugin of ['security-operations-guard', 'inspection-preparation-runtime', 'asset-onboarding-runtime', 'security-report-runtime']) assert.ok(preset.includes(`- id: ${plugin}\n`))
  for (const plugin of ['policy-confirmation-runtime', 'emergency-confirmation-runtime', 'operation-result-delivery']) assert.ok(!preset.includes(`- id: ${plugin}\n`))
  assert.ok(currentSkill.includes('原生 `ask_user_question`'))
  assert.ok(instructions.includes('### 应急指令'))
  assert.ok(instructions.includes('使用 `emergency-action` Skill'))
})
