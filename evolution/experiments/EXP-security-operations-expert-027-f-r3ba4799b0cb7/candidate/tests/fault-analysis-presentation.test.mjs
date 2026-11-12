import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const root = new URL('../dsh/', import.meta.url)
const skill = readFileSync(new URL('workspace/.agents/skills/fault-analysis/SKILL.md', root), 'utf8')
const client = readFileSync(new URL('managed/dsh-ui-html/lib/client.js', root), 'utf8')

test('呈现规则：首屏七项、明细折叠、show_ui 纯展示省略 wait_for_interaction', () => {
  for (const label of ['当前状态', '影响等级', '故障概况', '影响范围', '当前根因判断', '首要建议', '升级条件']) assert.ok(skill.includes(label), label)
  assert.match(skill, /unified_conclusion/)
  assert.match(skill, /省略 `wait_for_interaction`/)
  assert.match(skill, /根因尚未确认/)
  assert.doesNotMatch(skill, /把 details 全文粘贴/)
})

test('原生附件：允许宿主原生文件提及，仅在iframe内禁止绝对路径当URL', () => {
  assert.match(skill, /\/var\/lib\/dsh\/attachments/)
  assert.match(skill, /file_path/)
  assert.match(skill, /精确引用/)
  assert.match(skill, /attachment_id/)
  assert.match(skill, /iframe\/交互 HTML 内的 `a\.href`、`src`/) 
  assert.match(skill, /不把本机路径\*\*称为网站 URL|不把本机路径称为网站 URL/)
  assert.match(skill, /checkVisibility=false/)
})

test('只读展示等待文案的真实来源：meta.status，而非 wait_for_interaction', () => {
  // 已实测：省略 wait_for_interaction 仍显示“等待你的操作”，因为 awaiting 由回执 meta.status 决定。
  assert.match(client, /const awaiting = meta !== null && meta !== undefined && meta\.status === 'presented'/)
  assert.match(client, /const live = awaiting && submitted === null/)
  assert.match(client, /'row\.running': '等待你的操作'/)
  assert.match(skill, /meta\.status === 'presented'/)
  assert.match(skill, /与是否传 `wait_for_interaction` 无关/)
  assert.match(skill, /不要.*解释为.*需要用户提交/)
  assert.match(skill, /插件侧.*缺陷|属 dsh-ui-html owner/)
})
