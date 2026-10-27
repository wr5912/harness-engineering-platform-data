---
name: task-builder
description: 根据用户任务复用能力、装配 DSH 智能体，通过固定业务测试、最多三轮修复和真实实例产物完成交付。
---

# 构建并交付任务型智能体

按“明确任务 → 确认计划 → 装配 → 初测 → 必要修复 → 交付”推进。`platform_task start` 确认前只读取必要资料、形成计划，不写资产、启动评测或启停实例；确认成功后在同一任务内连续执行。已有任务先查实际状态，不重新创建。保持管理身份，配置名称、文件存在、模型自评不能代替真实调用与业务结果。

## 1. 明确目标和能力

固定上下文中的 `experiment_id` 是用户所选的起点版本，`reference_sources` 只是复用来源。用户要求从已有版本建立独立版本时，所选版本是父版，须在任务确认后派生；不能把它直接作为写入目标，也不能用编号、baseline_ref 或原创建方式代替本次意图。只有用户明确指定继续修改的独立 Candidate，才直接作为本次目标。先用 `detail` 读取所选版本，再用 `tasks/capabilities {agent_id}` 或 `{source:"experiment:<实际ID>"}` 查所需能力；确需跨 Agent 发现时才用空 input。不因其他版本更新而换来源，不遍历全部历史。仅询问改变目标、输入、验收或外部权限的缺口。

需要新增或适配业务插件时，按需使用 `dsh-business-plugin-development` 判断复用方式、目标版本和执行能力；计划确认前只做设计与查证。进入实现后沿用本任务目标、授权和预算，完成后回到装配、初测与交付；缺少目标构建或装载入口时说明缺口，不在管理 Profile 安装后冒称交付。

用真实业务输入和可核对产物定义成功，保留必要回归。巡检固定设备集合及实际必须调用的工具；不能靠少报设备、只测身份或修改预期使任务通过。

## 2. 预览并确认计划

`platform_task preview` 通过后，以相同计划调用 `start`。原生确认成功后在授权内连续执行；预检失败先修计划。参数以工具当前 schema 为准，下列是选择依据，不是整段可复制请求：

| 条件 | 计划内容 |
|---|---|
| 所有任务 | `goal`、`agent_id`、`kind`（inspection/business/training）、`deliverables`、`instance_name`、`evaluation_case_ids` |
| 新建 Agent | `new_agent:{name,description,role,evaluation_cases}`，不再传 source；只定义新增业务 Case，最多 30 条且 ID 唯一 |
| 已有独立 Candidate | `source:"experiment:<实际ID>"`，直接以其为目标 |
| 从已有版本建立独立版本 | source 指向所选父版，授权 `agents/create`；服务端核对 `derivation.parent_ref` 后派生，不覆盖原版本 |
| 巡检 | `inspection.expected_device_ids`、真实 `required_tool_names`；需要产物时固定 `artifact_paths`，不以评测报告代替业务报告 |
| 预算 | 最多 3 轮修复；普通任务模型调用上限 60 次，包含已观测的助手、评测与交付探针，按回执说明未观测部分；普通任务最长 30 分钟、训练最长 60 分钟，可按实际需求收紧 |

`allowed_actions` 只选必要动作：新建选 agents/new，派生选 agents/create，装配选 agents/tasks/assembly-apply，修改选 agents/edit/apply，评测选 agents/eval/start 与 agents/eval/cancel，实例交付选 instances/run。按工具要求组织 domain/action，不一次授权全部动作。算力任务由 `compute-variant-research` 办理。

新 Case 的标题单行，预期正文不增加 Markdown 标题。平台自动创建 `U-IDENTITY-001`、`U-ROLE-001`，不重复定义；需要这两项回归时将其 ID 加入 `evaluation_case_ids`。目标创建后由服务端一次绑定并冻结 Case；修复期间不改用例。

初测不算修复轮。助手规划调用计入总额，已观测的外部评测与交付探针也计入同一额度，不另有一份业务调用预算。未观测调用、外部请求是否硬封顶及费用、Token 均按实际回执说明，不宣称未知消耗已受总额限制。

## 3. 装配目标

进入装配前核对 `platform_task start` 已确认成功；仍待确认、失败或取消就停止。新建使用 `platform_agents new`，派生使用 `create`；取得创建回执的真实目标 ID 后，才读取目标摘要并装配，不向原父版提交装配预览或写入。服务端从已确认新建计划取角色和 Case。

从 `tasks/capabilities` 选择资产，`assets/read-fixed` 读取固定源文件，`edit/read` 读取目标。装配使用 `tasks/assembly-preview`，通过后以同一 input 调 `tasks/assembly-apply`：

| 字段 | 值从哪里来 |
|---|---|
| `target_source` | 已绑定的目标 Experiment |
| `expected_candidate_sha256` | 目标 detail 或 tasks/capabilities 的内容摘要 |
| `files[].source/path` | 已读取的固定复用来源和真实路径 |
| `files[].expected_source_sha256` | assets/read-fixed.selected.sha256 |
| `files[].expected_target_sha256` | edit/read 的摘要；确认不存在才用 null |
| `configuration_edits[]` | 同批绑定需要的 `{path,content,expected_target_sha256}`，path 相对 Candidate，content 为完整文本 |

`assets/read-fixed.candidate_digest` 是 Git 对象摘要，不能代替目标内容摘要。`features/read-source.ref` 是说明文件路径，不是提交。缺少完整文本、来源或摘要时先补读取；截断预览和二进制元数据不能当完整文件装配。复制能力文件及 Preset/Plugin 绑定一并预检，只有角色描述不算能力就绪。MCP 接入按 `mcp-composition`，凭据留在原生配置。

## 4. 初测与修复

1. `eval/preview` 核对目标和冻结 Case，再 `eval/start`。使用约定 mode/executor/review；一般业务初测为 fast/api/none。需要报告时显式传 `artifact_export:{format:"markdown",filename:"inspection-report.md"}`。导出优先采用同一业务 Session 实际工具回执正文并核对 report_sha256，没有正式正文才取最后实际回复，不要求模型重复报告全文。
2. 用 `eval/status {job_id}` 查询；服务端有界等待，不频繁新开模型轮询。保存返回的 job_id/run_id，未完成先保留运行状态，不重复启动。检查全部约定 Case、真实工具与 `artifacts/<case_id>/inspection-report.md`。
3. 出现失败先读取冻结输入、轨迹和结果，定位共同原因。需要改资产时先 `platform_task begin-repair` 预留一轮，再读文件摘要、编辑、复测失败项及约定回归。失败轮也计数；额度耗尽则保留失败并停止，不扩大预算、改 Case 或抹去原 Run。
4. 发生回归且起点有固定 Git 来源时可 `platform_task rollback`；它仅恢复本任务修改且当前摘要仍匹配的文件，并行变更冲突就停止覆盖。首次新建无固定父版时保留未交付 Candidate，不影响既有版本。

暂停、恢复、取消通过任务卡；重启后先读状态再显式恢复，额度不重置。未知写入结果先查实际 Job、Run 或实例，不重发；没有有效状态则说明待核对对象。

## 5. 交付与结束

使用约定来源启动目标实例，再 `platform_task deliver {run_id,artifacts}`，artifacts 为实际产物路径。服务端核对本任务 Run、冻结 Case、当前资产、真实实例和产物；有指定业务工具时还在交付实例新 Session 执行代表输入。探针最长 120 秒且受任务截止时间约束，失败与消耗保留。

评测容器与交付实例 HOME 不同，产物 ID 可不同；使用真实返回入口，不拼临时下载 URL。全部约定 Case 须通过；业务探针对应业务产物，身份或用户数据摘要 Case 不强制额外查服务。仅返回 completed 后宣布交付。

收尾依据本次实际回执中的 Case 集合、实例操作和产物组织结果，不用设备数或交付项数代替用例数，也不否认回执已证实的实例创建和启动。需要说明消耗时，标明是读取该回执时的已观测值；后续收尾调用仍可能计入，不将快照值写成最终总额，也不为更新数字循环查询。

检查失败继续本任务，改资产先预留修复轮，不再 preview/start 索取整体授权。向用户提供结果、实例和产物入口，以及影响使用的限制。Mock 或缺真实算力的部分单独标明，不能替代真实业务验收。
