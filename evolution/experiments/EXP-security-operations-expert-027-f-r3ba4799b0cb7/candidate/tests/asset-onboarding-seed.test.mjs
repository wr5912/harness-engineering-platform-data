// 仅静态核对候选装配：asset-management组的server引用必须存在，防止再次出现catalog无效。
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const seed = readFileSync('dsh/managed/web-profile.seed.patch.yml', 'utf8')
const actions = ['create_soc_asset_probe', 'create_soc_discovery_identify', 'create_soc_discovery_tasks', 'start_soc_discovery_tasks', 'create_soc_discovery_tasks_adopt', 'create_soc_asset']
const templates = [
  'http://172.16.138.223:18087/soc/discovery/tasks/{taskId}',
  'http://172.16.138.223:18087/soc/discovery/tasks/{taskId}/scope',
  'http://172.16.138.223:18087/soc/asset/{assetId}',
  'http://172.16.138.223:18087/soc/asset/list{?pageNum,pageSize,ip,hostname,keyword,source,layerId,excludeLayerId,online,assetType,vendor,status,techStatus,deptId,sortField,sortOrder,collectionStatus,collectAnomaly,modelIds,includeUnits,assetView,rootOnly,hostAssetId,bizIds,bizAssociation}',
]

test('asset-management组引用的ai-soc-master server存在，动作与资源模板保持原绑定', () => {
  assert.match(seed, /- id: ai-soc-master\n\s+serverName: ai-soc-master/)
  assert.match(seed, /specUrl: http:\/\/172\.16\.138\.223:18087\/v3\/api-docs\/mcp/)
  assert.match(seed, /- id: asset-management/)
  assert.match(seed, /- serverId: ai-soc-master/)
  for (const name of actions) assert.ok(seed.includes(`- ${name}`), name)
  for (const uri of templates) assert.ok(seed.includes(uri), uri)
  // 组内成员server必须同时出现在servers段，否则运行期catalog无法解析。
  const servers = [...seed.matchAll(/^ {6}- id: ([\w-]+)$/gm)].map(match => match[1])
  const members = [...seed.matchAll(/^ {8}- serverId: ([\w-]+)$/gm)].map(match => match[1])
  for (const member of new Set(members)) assert.ok(servers.includes(member), `missing server for group member ${member}`)
})


test('Skill输出规则：原生两段H2与展开概况、唯一表格，Markdown表仅降级', () => {
  const skill = readFileSync('dsh/workspace/.agents/skills/asset-onboarding/SKILL.md', 'utf8')
  assert.match(skill, /status=presented/)
  assert.match(skill, /title` 固定“资产纳管”/)
  assert.match(skill, /省略 `description` 与 `interaction_hint`/)
  for (const text of ['display_markdown', '## 一、资产扫描概况', '默认展开', '## 二、待纳管清单', '## 二、纳管结果', '只展示一个 `show_ui` 全量表格', '不再复制 Markdown 设备表、重复概况', '不得退回“请在下方核对”一句话', 'scan_overview.managed_skipped', 'summary.already_managed', '两者不相加、不互相替代', '第二段最多3个短句', '不再要求用户重复文字确认']) assert.ok(skill.includes(text), text)
  assert.doesNotMatch(skill, /正文只保留一句|预览仍保持一句引导/)
  assert.match(skill, /原生工具结果可展开的详情/)
  assert.match(skill, /不写生的 `<details>\/<summary>` 标签/)
  assert.match(skill, /不可用或调用失败时，才回退完整 Markdown/)
  assert.match(skill, /可输入下拉/)
  assert.equal(skill.includes('不设“自定义…”菜单或弹窗'), true)
})

test('受管dsh-ui-html：内容高度测量与默认关闭的受信代理白名单', () => {
  const client = readFileSync('dsh/managed/dsh-ui-html/lib/client.js', 'utf8')
  const config = readFileSync('dsh/managed/dsh-ui-html/lib/config.js', 'utf8')
  const bridge = readFileSync('dsh/managed/dsh-ui-html/lib/bridge.js', 'utf8')
  assert.ok(client.includes('getBoundingClientRect'))
  assert.equal(client.includes('documentElement.scrollHeight'), false)
  assert.ok(config.includes('trustedProxyCidrs'))
  assert.ok(config.includes("default([])"))
  assert.ok(bridge.includes('isTrustedProxyPeer') && bridge.includes('isSameOriginHeaders'))
  assert.ok(bridge.includes('isTrustedPeer'))
  assert.ok(bridge.includes('isSameOrigin(req, trusted)'))
})
