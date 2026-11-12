# f237 独立运行包

来源：`EXP-security-operations-expert-027-f-r5efdc136f237` 的 Candidate 资产，2026-11-12 导出。

## 包含什么

```
dsh/workspace/     AGENTS.md 与 .agents/skills/（9 个 Skill）
dsh/presets/       security-operations-expert 等 preset
dsh/managed/       平台插件：guard、mcp-manager、UI、decision-engine 等
                   （已排除 dsh-voice-hub 的 node_modules 与 assets）
harness.yaml       资产清单
mcp/connection.template.yml   MCP 连接模板（已去敏）
```

体积约 6.7 MB。

## 没有包含什么

- `.local/`：会话、实例 HOME、凭据，属运行数据，不可复制
- 程序仓库 `harness-engineering-platform`：55 GB，需单独获取
- `dsh-voice-hub` 的依赖与静态资源：本智能体不使用语音能力
- MCP 凭据：模板中一律为占位符，需在部署环境填入

## 运行依赖

仅凭本包不能直接启动实例，还需要三样：

1. DSH 运行时（本机为 `dsh` 0.2.1-rc.5，路径 `/opt/nvm/versions/node/v24.21.0/bin/dsh`）
2. 平台插件运行环境（`platform/plugin/lib`，约 11 MB，随程序仓库提供）
3. MCP 服务可达：分组走 `http://172.16.138.228:18120/hep/mcp/groups/<组名>/v2`，
   平台服务走 `http://172.16.138.228:26000/mcp/<服务名>`

## MCP 连接

把 `mcp/connection.template.yml` 里的占位符替换为真实值：

- `sharedToken`：分组访问凭据，向平台管理员获取
- 各 server 的 `headers`：当前实例为空，凭据由平台侧注入；独立运行需自行补
  `Authorization: Bearer <token>`

分组与用途：

| server | 用途 |
|---|---|
| policy-response | AISOC 策略与应急原始工具、资源 |
| policy-response-acceptance | 组合入口，暴露 `policy_change`、`emergency_action` |
| xx-device-acceptance | XX 指令与三 Map 模板组合 |
| soc-readonly | 资产、来源记录等只读查询 |
| inspection / troubleshooting / report-write | 228:26000 平台服务 |

## 资产边界

- `dsh/workspace/AGENTS.md` 定义四条路由与边界，修改后需重启实例生效
- `dsh/workspace/.agents/skills/` 四个业务 Skill：`policy-configuration`、`emergency-action`、`xx-device-command`、`xx-policy-template`
- `dsh/managed/` 为平台插件，改动需与平台侧版本对齐，不建议在此目录直接改

## 已知外部阻塞

策略 ADD 与应急处置真实下发当前受阻于上游合同，详见 GitLab issue #124：

- `block-ip` 在 OPNsense 缺 `acl-rule-set` / `acl-interface-binding` / `acl-observed-order`
- `policy_change` 的 ADD 需要「插入位置 + 参考规则」，当前无接口提供候选值
- Wazuh 的 `host-block-ip` 渲染 `command` 为空，且设备 `online=false`

以上与本包无关，属 SOC 侧待修项。

## 搬运

本包生成于 `/home/cmp/harness-engineering-platform-data/deliverables/f237-standalone`。

当前主机（172.16.138.228）根分区为只读挂载，`/home/zhouyang` 不可写入，
需由有 root 权限者执行移动或解压到目标位置。
