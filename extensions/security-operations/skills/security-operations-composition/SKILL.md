---
name: security-operations-composition
description: 为已启用的安全运营业务扩展配置、发布和验证资产告警及威胁分析组合，复用平台原生 MCP 连接和固定算法来源。
---

# 安全运营工具组合

本技能来自当前工作区声明启用的安全运营扩展，供平台管理助手办理业务。通用保存、dry、发布和错误处理沿用 [mcp-composition](../../../../.agents/skills/mcp-composition/SKILL.md)，尚未加载时读一次，已加载则继续，不互相循环。先区分查看运行、只读/dry、编辑发布和实际调用，仅读结果直接进入回读步骤。

Mock service 只提供基本、良性的模拟业务数据。配置样例、测试输入和验证建议不得生成或要求恶意代码、病毒、渗透相关的数据或命令，也不以补齐覆盖为由建议这些 Mock 场景。验证分支只使用普通资产、状态、告警元数据或缺失字段等无害样例，未覆盖的业务效果如实保留为限制。

原生服务连接由 MCP 配置管理维护，编排定义、草稿和发布版本只在数据根 `config/mcp-compositions.json` 维护。通过 `platform_mcp` 读取、预览，沿 DSH 原生访问策略保存并回读，不另等平台确认，不直接编辑配置或另存凭据。执行回执与冻结产物保存在数据根 `.local/artifacts/security-operations/`，不回流业务 Candidate。

## 威胁分析组合

1. 仅在配置或接入时读取 `configuration` 与 `list` 核对连接和扩展；查看运行不重新发现全部连接。SOC 使用原生 OpenAPI 服务，规范须覆盖完整研判操作，只有资产/告警两个 GET 不够；报告 MCP 须有 `save_persistence_result`。缺少能力就停止依赖配置，地址、鉴权与模型凭据沿用原生配置，不回显或复制。
2. 确需创建样例且 `list.extension.seed` 为 true 时，通过 `seedThreatCompositions {revision,bindings:{socConnectionId,reportConnectionId,model?}}` 创建四个阶段和一个总组合草稿，按原生权限与执行回执继续；revision 和连接 ID 来自实际读取结果。已有组合优先读取和维护，不重复创建。页面在“全部编排”中展示草稿和发布状态，没有单独的“威胁分析样例”按钮。
3. 分别保存、dry 校验并发布四个子组合，再为总组合选择具体已发布版本。保留输入映射与分支条件；父组合固定这些版本，子组合再次发布不自动改变父组合。完整研判阶段可选择平台默认模型或用户指定的原生 Provider、模型和推理强度，不自行改变用户选择。
4. 仅在用户要求实际研判时，对总组合传入已核对的 `incident_id`；格式为 `INC-YYYYMMDD-NNNNNN`。只读或 dry 请求不得升级为实际执行来排障。独立测试后续阶段时输入同一 `run_id`，不重新发起取证，已完成阶段读取原结果，不重复 infer 重新采样。

| 默认工具 | 输入 | 核对的业务结果 |
|---|---|---|
| `threat_collect` | `incident_id` | 事件认领、名单快判或五源富化，以及固定的 Run |
| `threat_infer` | `run_id` | 五源分支的实际模型响应及独立校验结果；快判不调用模型 |
| `threat_writeback` | `run_id` | 同一研判身份的 SOC 回写结果 |
| `threat_report` | `run_id` | 已有报告的保存结果、真实存储 ID 与下载地址 |

总组合 `analyze_threat_incident` 保留 `always → five_source → claimed → completed` 条件及 `$input.incident_id`、`$steps.collect.run_id` 映射。子组合单独调用仅执行该阶段，不自动补跑前序阶段。后续阶段沿用取证时固定的 SOC、报告连接；首次 infer 固定实际模型，设置变化不改写既有 Run。

执行后或查看已有结果时，用返回的 `run_id` 调 `compositionRun`，需要产物再 `compositionArtifact {run_id,artifactId}`。先看校验是否通过，再看 SOC 回写和报告保存各自结果。JSON 可解析但校验失败仍可能 `status=completed`，此时明确需要人员复核，不能解释为可靠研判。未知回写先查原 Run，不重跑；没有真实下载地址不编造链接。

## 资产关联告警查询

通用两步只读组合使用 `get_asset → list_alerts`；SOC 流程 `soc-asset-alerts` 使用 `get_soc_asset_by_asset_id` 和 `list_detect_alert`。只需查询时调用已发现的发布工具，传入 `asset` 和可选 `limit`（1–20，默认5）。

SOC 流程要求正整数资产 ID。资产服务配置在 `connectionId`，告警服务在 `alertsConnectionId`。第一步转换为整数 `assetId`，核对业务码 `code === 200` 且 `data.assetId` 匹配；第二步使用 `req: { assetId: String(data.assetId), pageNum: 1, pageSize: limit, windowSeconds: 2592000 }`。对象查询参数由现有 OpenAPI 适配器处理，不自行拼成 `req=[object Object]`。

第二步检查业务码并读取 `data.groups`。`alerts` 是首页告警分组，`alertSummary` 保留近30天查询范围、总分组数与总告警数；不能将首页结果冒称全部告警明细。首步失败时停止后续查询，HTTP 200、空列表与业务失败分别判断。

## 发布、验证与失败处理

保存、dry 和发布携带最新目录摘要及所选编排、版本，发生并发变化先回读，不覆盖他人修改。dry 只检查输入、图与连接登记，零上游请求、零节点执行；发布也不证明上游业务可用。已发布工具出现在原生“工具组合编排”服务，选择分组并保存后调用方重新发现；草稿不对外提供。

真实执行后核对操作 ID、固定版本、参数映射、各步结果及产物。中断或回执未知先读取已有 Run，不自动重试可能回写的步骤。业务目录变更回读即可生效，不要求重启平台；模型结束和发布回执不能替代实际调用验收。

若工具缺失、实现报错或能力不受支持，保存必要动作、对象和错误，说明受阻业务及可行下一步。管理助手不进入平台源码开发，不运行构建、测试、依赖安装、平台重启或内部执行器调用来绕过接口。运行器和工具实现的研发资料由[平台架构合同](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/02_系统架构与部署设计.md#threat-stage-composition)及[扩展开发说明](../../README.md)维护，需要修复时交由相应研发任务处理。
