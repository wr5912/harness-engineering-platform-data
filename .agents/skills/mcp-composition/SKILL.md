---
name: mcp-composition
description: 通过平台 MCP 配置管理连接、组合草稿与固定发布版本，执行指定的只读检查、发布或调用，并核对实际运行结果。
---

# MCP 工具组合

使用 `platform_mcp`。先判断用户要查看运行、dry 检查、编辑、发布还是实际调用，选择对应路径；后一步不因前一步失败而自动获得授权。写入和实际调用由 DSH 原生访问策略处理，按回执继续，不另等平台提案确认。业务操作与成功码以已启用扩展的真实描述为准。

连接及分组公开配置由数据根 `config/mcp-manager.json` 维护，分组 Token 和出站凭据位于本地忽略文件 `.local/credentials/mcp-manager.json`；草稿与发布快照由数据根 `config/mcp-compositions.json` 维护。页面与本技能使用同一配置读取和保存服务；本技能只提交非敏感配置修改，凭据通过 MCP 管理页面维护。修改前读取 `configuration` 回执中的 `revision`，保存冲突时重新读取并核对差异，不覆盖并行修改。不另存连接、凭据或编排副本。

## 选择操作

| 当前目标 | 先读取 | 下一步及完成条件 |
|---|---|---|
| 查看已有运行 | `compositionRun {run_id}` | 必要时 `compositionArtifact {run_id,artifactId}`；报告实际阶段、业务校验、保存状态，不重新发现连接 |
| 仅做 dry | `list` 的 revision、组合定义和 ID | `dryRunComposition {revision,compositionId,version,input}`；version 取 draft 或 published，检查不产生上游请求 |
| 编辑组合 | `list`，确需接入新工具再读 `configuration` 和资源结构 | `saveCompositionDraft {revision,compositionId?,draft}`，保存成功后回读、再 dry |
| 发布 | 所选草稿、当前 revision 与 dry 结果 | `publishComposition` 使用同一选择且 version 为 draft；执行成功后回读固定发布版本 |
| 实际调用 | 已发布工具与实际输入 | `callPublishedComposition {toolName,input}` 执行所选固定发布版本；执行后回读每步和业务结果 |

draft 直接复用 list.compositions 中的实际 draft 或 published 扁平字段，再修改所需部分。不要加 config/graph 包装；graphs 是只读视图，不是可保存草稿。字段名保持 revision、compositionId、version、input，不改为 catalogRevision、versionId、arguments。不创造执行器不支持的步骤。

## 连接与依赖

- 仅确需发现或测试连接时，使用 `configuration` 返回的真实服务 `id` 作为请求的 `serverId`；`sources/list` 同样需要 `serverId`。它不是组合 ID 或工具名。
- `server not found` 先核对 serverId。`specLoaded:false`、`toolCallSucceeded:false` 只说明尚未观测到成功，不直接证明服务不可用。HTTP、资源发现和业务调用分别判断。
- 父组合引用子组合的具体已发布版本。先发布子组合再选择父依赖；子组合重新发布不自动升级父组合。
- 已发布工具出现在派生的“工具组合编排”服务，调用方保存分组后重新发现；草稿不对外暴露。本平台 v2 分组向下游公开 `mcp__<group.id>__<tool>`，中间段是稳定分组 ID，不是服务显示名；实际调用名称仍从发现结果取得，不自行拼接。直连或 v1 按各自实际合同核对。界面统一在“全部编排”展示状态，不另找样例按钮。

## 失败与结果

摘要冲突重新 list，合并所需变化后重做预览，不覆盖他人修改。dry 失败只修检查参数或说明缺口，不改为 executeComposition、callPublishedComposition、callTool、保存或发布来排障。dry 和发布都不证明上游业务成功。

实际执行中断或回执未知时查已有 Run/操作 ID，不重发可能产生副作用的步骤；已完成阶段读取原结果，不重复采样。completed 不代表业务校验或外部保存通过。远端保存回执不证明本机有副本，也不证明下载已核实；只给真实返回的入口，不搜索文件系统替代产物。

安全运营扩展的业务配置与阶段规则由 `security-operations-composition` 维护；启用且发现该技能时按需读取一次，已加载则继续，不在两个技能之间循环加载。未发现扩展或对应工具时报告能力缺口。样例初始化仅在用户需要且能力可用时调用既有 seed 入口。

工具实现缺陷保留动作、对象和错误，交给平台研发；不进入程序根构建、重启或直接执行内部实现。普通编排不改变业务 Agent Harness；模型结束也不代替调用验收。
