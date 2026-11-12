// 仅静态核对候选装配：asset-management组的server引用必须存在，防止再次出现catalog无效。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const seed = readFileSync('dsh/managed/web-profile.seed.patch.yml', 'utf8')
const actions = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const templates = [
  'http://172.16.138.232:18087/soc/discovery/tasks/{taskId}',
  'http://172.16.138.232:18087/soc/discovery/tasks/{taskId}/scope',
  'http://172.16.138.232:18087/soc/asset/{assetId}',
  'http://172.16.138.232:18087/soc/asset/list{?pageNum,pageSize,ip,hostname,keyword,source,layerId,excludeLayerId,online,assetType,vendor,status,techStatus,deptId,sortField,sortOrder,collectionStatus,collectAnomaly,modelIds,includeUnits,assetView,rootOnly,hostAssetId,bizIds,bizAssociation}',
]

test('asset-management组引用的ai-soc-master server存在，动作与资源模板保持原绑定', () => {
  assert.match(seed, /- id: ai-soc-master\n\s+serverName: ai-soc-master/)
  assert.match(seed, /specUrl: http:\/\/172\.16\.138\.232:18087\/v3\/api-docs\/mcp/)
  assert.match(seed, /- id: asset-management/)
  assert.match(seed, /- serverId: ai-soc-master/)
  for (const name of actions) assert.ok(seed.includes(`- ${name}`), name)
  for (const uri of templates) assert.ok(seed.includes(uri), uri)
  // 组内成员server必须同时出现在servers段，否则运行期catalog无法解析。
  const servers = [...seed.matchAll(/^ {6}- id: ([\w-]+)$/gm)].map(match => match[1])
  const members = [...seed.matchAll(/^ {8}- serverId: ([\w-]+)$/gm)].map(match => match[1])
  for (const member of new Set(members)) assert.ok(servers.includes(member), `missing server for group member ${member}`)
})


test('Skill输出规则：show_ui成功时正文简洁，Markdown仅降级', () => {
  const skill = readFileSync('dsh/workspace/.agents/skills/asset-onboarding/SKILL.md', 'utf8')
  assert.match(skill, /status=presented/)
  assert.match(skill, /title` 固定“资产纳管”/)
  assert.match(skill, /省略 `description` 与 `interaction_hint`/)
  assert.match(skill, /请在下方核对并补全资产信息/)
  assert.match(skill, /不得重复卡片已有的数量、统计、状态/)
  assert.match(skill, /不可用或调用失败时，才回退完整 Markdown/)
  assert.match(skill, /可输入下拉/)
  assert.equal(skill.includes('不设“自定义…”菜单或弹窗'), true)
})
