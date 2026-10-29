---
name: task-builder
description: 根据用户任务复用能力、装配 DSH 智能体，通过固定业务测试、必要修复和真实实例产物完成交付。
---

# 构建并交付任务型智能体

按“明确任务 → 确定办理步骤 → 装配 → 初测 → 必要修复 → 交付”推进。沿用固定 `task_context`，通过当前作用域允许的平台工具读取和执行；不确定参数时先用 `describe` 读取当前动作合同。已获授权且必要信息齐全时连续办理，写入遵循 DSH 原生权限，不另等任务启动或平台二次确认。已有 Job、Run 或实例先查实际状态，不重复创建。保持管理身份，配置名称、文件存在、模型自评不能代替真实调用与业务结果。

## 1. 明确目标和能力

固定上下文中的 `experiment_id` 是用户所选的起点版本，`reference_sources` 只是复用来源。用户要求从已有版本建立独立版本时，所选版本是父版，先固定可恢复来源再派生；不能把它直接作为写入目标，也不能用编号、baseline_ref 或原创建方式代替本次意图。只有用户明确指定继续修改的独立 Candidate，才直接作为本次目标。先用 `detail` 读取所选版本，再用 `tasks/capabilities {agent_id}` 或 `{source:"experiment:<实际ID>"}` 查所需能力；确需跨 Agent 发现时才用空 input。不因其他版本更新而换来源，不遍历全部历史。仅询问改变目标、输入、验收或外部权限的缺口。

需要新增或适配业务插件时，按需使用 `dsh-business-plugin-development` 判断复用方式、目标版本和执行能力。进入实现后沿用本任务目标、授权及用户明确的资源限制，完成后回到装配、初测与交付；缺少目标构建或装载入口时说明缺口，不在管理 Profile 安装后冒称交付。

用真实业务输入和可核对产物定义成功，保留必要回归。巡检固定设备集合及实际必须调用的工具；不能靠少报设备、只测身份或修改预期使任务通过。

## 2. 确定办理步骤

明确目标、业务 Case、产物、必要操作和停止条件，再按当前平台动作办理；参数以 `describe` 返回的 schema 为准。下列是选择依据，不是整段可复制请求：

| 条件 | 当前动作与必要输入 |
|---|---|
| 新建 Agent | `platform_agents new {agent_id,name,description,role,evaluation_cases}`；显式提供完整角色和新增业务 Case，最多 30 条且 ID 唯一 |
| 已有独立 Candidate | `detail` 核对实际目标，后续使用 `source:"experiment:<实际ID>"` |
| 从已有版本建立独立版本 | `create {agent_id,parent_experiment_id,parent_ref,research_question}`；父版使用核对过的固定 `git:<40位提交>`，保留原版本 |
| 装配与编辑 | `tasks/assembly-preview`、`tasks/assembly-apply` 或 `edit/read`、`edit/preview`、`edit/apply`，以真实来源和摘要组织参数 |
| 评测与实例交付 | 用 `eval/preview`、`eval/start`、`eval/status` 取得独立 Run；用 `platform_instances run` 操作约定实例，按需查询状态和入口 |

只执行用户授权内完成目标所需的操作。巡检先固定设备集合、必须调用的真实工具和业务产物要求，评测及交付时逐项核对，不以评测报告代替业务报告。算力任务由 `compute-variant-research` 办理。

新 Case 的 ID 以 `U-` 开头，标题单行，预期正文不增加 Markdown 标题。平台自动创建 `U-IDENTITY-001`、`U-ROLE-001`，不重复定义。目标创建后回读实际 Case，明确本次业务测试与必要回归；`eval/preview`、`eval/start` 用 `cases` 传其真实 ID，由每次 Run 冻结选择和输入，修复期间不改口径。

遵守用户明确的修复次数、时间或资源限制；未指定时以约定结果、真实阻塞和停止条件判断是否继续，不另加默认任务额度。模型调用、费用和 Token 只报告实际采集值，未观测部分保持未知，不宣称外部消耗已被统一硬封顶。

## 3. 装配目标

新建使用 `platform_agents new`，派生使用 `create`；取得创建回执的真实目标 ID 后，才读取目标摘要并装配，不向原父版提交装配预览或写入。用户已明确续作的独立 Candidate 沿用原目标。仍待原生批准、失败或取消时，不执行依赖该写入的后续步骤。

从 `tasks/capabilities` 选择资产，`assets/read-fixed` 读取固定源文件，`edit/read` 读取目标。装配使用 `tasks/assembly-preview`，通过后以同一 input 调 `tasks/assembly-apply`：

| 字段 | 值从哪里来 |
|---|---|
| `target_source` | 已核对的目标 Experiment |
| `expected_candidate_sha256` | 目标 detail 或 tasks/capabilities 的内容摘要 |
| `files[].source/path` | 已读取的固定复用来源和真实路径 |
| `files[].expected_source_sha256` | assets/read-fixed.selected.sha256 |
| `files[].expected_target_sha256` | edit/read 的摘要；确认不存在才用 null |
| `configuration_edits[]` | 同批绑定需要的 `{path,content,expected_target_sha256}`，path 相对 Candidate，content 为完整文本 |

`assets/read-fixed.candidate_digest` 是 Git 对象摘要，不能代替目标内容摘要。`features/read-source.ref` 是说明文件路径，不是提交。缺少完整文本、来源或摘要时先补读取；截断预览和二进制元数据不能当完整文件装配。复制能力文件及 Preset/Plugin 绑定一并预检，只有角色描述不算能力就绪。MCP 接入按 `mcp-composition`，凭据留在原生配置。

## 4. 初测与修复

1. `eval/preview` 核对目标和冻结 Case，再 `eval/start`。使用约定 mode/executor/review；一般业务初测为 fast/api/none。需要报告时显式传 `artifact_export:{format:"markdown",filename:"inspection-report.md"}`。导出优先采用同一业务 Session 实际工具回执正文并核对 report_sha256，没有正式正文才取最后实际回复，不要求模型重复报告全文。
2. 用 `eval/status {job_id}` 查询；服务端有界等待，不频繁新开模型轮询。保存返回的 job_id/run_id，未完成先保留运行状态，不重复启动。检查全部约定 Case、真实工具与 `artifacts/<case_id>/inspection-report.md`。
3. 出现失败先读取冻结输入、轨迹和结果，定位共同原因。需要改资产时先读文件摘要，通过当前编辑接口修改，再复测失败项及约定回归。保留失败 Run；达到用户约定的停止条件或没有有效下一步时说明结果，不扩大授权、改 Case 或抹去原 Run。
4. 需要恢复资产时，核对固定父版、当前摘要和本次修改范围，仅通过当前支持的动作处理；并行变更冲突就停止覆盖。无法完整恢复时说明缺口；首次新建无固定父版时保留未交付 Candidate，不影响既有版本。

暂停后续作先读实际 Job、Run 或实例状态，沿用原目标和用户约定；取消评测使用 `eval/cancel {job_id}` 并核对收尾。未知写入结果先查实际状态，不重发；没有有效状态则说明待核对对象。

## 5. 交付与结束

使用 `platform_instances run` 按约定来源创建或启动目标实例，再用 `detail`、`url` 核对状态、来源与真实入口。结合本次 Run、冻结 Case、当前资产和实际产物，逐项核对约定交付结果。要求在交付实例执行业务验证时，只通过当前作用域可用且已授权的执行入口办理；缺少入口就说明验证缺口，不把实例启动当作业务通过。

评测容器与交付实例 HOME 不同，产物 ID 可不同；使用真实返回入口，不拼临时下载 URL。全部约定 Case 须通过，业务报告须对应实际工具结果；身份或用户数据摘要 Case 不强制额外查服务。只有约定结果均已取得相应证据才宣布完成交付；缺口、失败与未知状态分别说明。

收尾依据本次实际回执中的 Case 集合、实例操作和产物组织结果，不用设备数或交付项数代替用例数，也不否认回执已证实的实例创建和启动。需要说明消耗时，标明是读取该回执时的已观测值；后续收尾调用仍可能计入，不将快照值写成最终总额，也不为更新数字循环查询。

检查失败时在原授权及停止条件内修复和复测，不重新索取整体授权。向用户提供结果、实例和产物入口，以及影响使用的限制。Mock 或缺真实算力的部分单独标明，不能替代真实业务验收。
