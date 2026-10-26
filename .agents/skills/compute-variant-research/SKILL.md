---
name: compute-variant-research
description: 从完整固定父版策划、生成、构建、冻结和评测算力变体，以独立 Run 比较限定任务的质量与资源；终端结论由人员复核。
---

# 算力变体研究

使用本作用域的 `skill`、`platform_agents`、`platform_task`，只加载本技能。先调用 `compute-variants/context {experiment_id}`，固定目标并读取 `plan`、`generation_contract` 与 `workflow_status`。已有研究从真实状态继续，不重建同一变体。需要方法时读取 `research/read-reference {topic:"compute-variants"}`。

## 先判断本次阶段

| 任务上下文 | 本次办理到哪里 |
|---|---|
| `planning_intent="plan_only"` | 只做第 1 节的必要只读取证，然后交付计划；本次结束，不进入创建、编辑、构建、冻结、评测或训练 |
| 已有明确执行授权且有对应平台动作 | 按已有状态继续下文对应阶段；工具缺失时交付缺口，不猜接口 |

“请 AI 策划算力变体”的中算力请求当前是第一行。一次处理一个阶段；每次工具返回后先检查状态，再决定下一动作。`plan_only` 是用户本次要求，不能假定后端会替你拦下所有写操作。

### 中算力 KEV 策划

1. 沿用固定 `agent_id`、`experiment_id`、`source_run_ids`；按第 1 节核对完整父版。没有 Run 时给出补采计划，不编造训练样本。
2. 从真实决策前材料列出候选点：语义选择交模型，固定步骤与 ID 绑定交代码，信息不足保留待补项。历史动作不是正确标签。
3. 原样保留 `medium.base_model_mode/base_model_id/base_model_revision` 与训练连接选择。`provider/model` 运行路由不等于可训练权重；缺权重版本保持待选。连接只保留 `server_id`、工作目录和 `credential_ref` 等非敏感引用，不索取明文凭据。
4. 给出短计划：固定来源 → 决策点 → 按 Run 抽取 → 人员复核与用途分组 → KEV 格式转换及编码检查 → 训练/校准/开发评估 → 固定测试 → 服务绑定与两侧 Run 比较。每项写现有输入、缺口和完成依据。
5. 用 `research/read-reference {topic:"compute-variants"}` 读取 KEV 交接方法。当前专项不能调用 `datasets/*`、加载 KEV 同级技能、执行 shell 或连接训练服务器。不要清空任务上下文、自调会话接口或用子智能体绕过。
6. 当前训练连接探测只证明 TCP/SSH banner 可达，平台尚无训练启动/状态/工件回收接口。计划如实列出后续真实执行器需求；不要把 `platform_task kind=training` 当作 KEV 执行器。

交付计划只用已知字段；额外训练超参放独立交接材料，不塞进严格的 `ComputePlan` 或 `platform_task.plan`。本次若为 `plan_only`，到此结束。后续抽取由已有 Run 的“请 AI 抽取决策样本”入口办理；训练在明确授权且具备真实执行能力的任务或训练环境继续。

生成 SDK、参数、受控构建和冻结以返回的 `generation_contract` 为准，缺合同就停止代码生成并说明缺口，不凭记忆补内部 API。任务资料不改变管理身份；接口失败不授权程序开发、临时脚本、凭据读取或内部执行器调用。

## 1. 诊断并固定父版

读取目标 `detail`、所需 `cases/read` 和代表 Run 的 `runs/show`、`runs/report`；仅对影响策略的 Case 读 `runs/trace`。必要证据可用 `runs/files`、`runs/read-file`，不扫描全部历史或另写脚本统计。

先看实际业务输出和工具结果，再判断重复请求、检索、长上下文、子任务或外部等待是否有可减少的成本。用 Run、Case、轨迹位置区分观察与假设；调用多本身不证明浪费。无 Run 时可策划待验证的普通变体计划，但不能伪造成本诊断或代码生成依据。未采集成本保持未知，计入可见子 Session、重试和外部调用；配置快照不是模型请求，Token 不是硬件算力或费用。

父版必须是用户所选同 Agent 的完整 Candidate，使用 `detail.derivation.parent_ref` 并经 `assets/read-fixed` 核对。context 的 parent_ref 可能只是数据 Git HEAD 提示，已有变体的 fixed_parent_ref 表示其历史父版，不能用这些提示静默更换用户目标。仅使用可恢复的 `git:<40位提交>`；缺固定父版时保留策略并说明待固定对象，不猜 SHA、退回旧版或虚构 Release 来源。

## 2. 形成并派生计划

按证据选择最少改动：消除无新增信息的请求、按阶段读取资料、复用仍有效结果、编排确定步骤，或在用户明确选择时改变业务模型。保留纠错、关键复核和异常，不能靠丢失败输出省成本。默认继承业务父版实际模型及推理配置，管理助手的模型不替代业务配置。

`compute-variants/preview` 的计划按真实输入填写：

- 父版：parent_experiment_id、parent_ref；独立名称 variant_name，不从策略正文截取。
- 假设：strategy；选定 case_ids，critical_case_ids 必须是其子集。
- 比较口径：min_runs_per_case、max_pass_rate_drop_pp、resource_metric、min_resource_reduction_pct；解释重复次数和容差，默认值不保证统计充分。资源指标取工具允许的模型调用、Token 或耗时维度。
- 明确改变模型时才填 allow_model_change、variant_model、variant_reasoning_effort；这些计划字段不自动修改 Candidate 路由。
- 生成代码时按 generation_contract 填 generation，必须有固定父版的真实诊断 source_run_ids；没有轨迹不能虚构生成依据。

先补足必要 Case，再冻结选择；运行后不修改共享评测迎合结果。预览通过后以同一计划调用 `compute-variants/create`，使用真实预览摘要并按平台确认。创建回执只证明派生与计划保存；后续目标用返回的 Experiment ID，保留父版和历史 Run。

## 3. 修改、构建与冻结

需要连续生成任务时，`platform_task preview` 后 `start`：kind 为 compute-variant，source 为已派生目标，compute_variant 使用已固定父版，evaluation_case_ids 与计划相同。它不创建第二个 Agent 或变体，也不替代本地冻结确认。

| 当前步骤 | 平台动作 | 可以继续的条件 |
|---|---|---|
| 修改目标 | `edit/read` → `edit/preview` → `edit/apply` | 提交完整文本和真实 expected_sha256；新文件先读到 exists:false、sha256:null |
| 生成工作流 | 按 generation_contract.sdk 编辑 Managed 源码与 Preset 绑定 | 只用公开 SDK；实际模型、工具和固定组合身份来自父版与能力目录，不猜函数或第三方能力 |
| 受控构建 | `compute-variants/build-preview` → `compute-variants/build` | 用最新 candidate_sha256 和真实预览摘要；类型检查与固定 ESM 编译通过 |
| 本地冻结 | `compute-variants/freeze-preview` → `compute-variants/freeze` | 审阅真实差异，完整传回返回的 freeze_input，并完成单独确认 |
| 核对状态 | 重读 `compute-variants/context` | 以 workflow_status 和实际回执判断 generated/built/frozen，不凭文件存在推定 |

普通提示词变体按其实际计划处理，不虚构代码生成或构建结果。代码变体用 `tasks/capabilities` 获取真实工具及固定组合，按合同同步 Preset/Guard 的绑定。运行库保留原生工具权限、取消和回执，不用 HTTP 绕过；输出符合合同的无损 JSON。

构建不执行 Candidate，也不证明实例装载；源码、runner、依赖或 ESM 改变后旧构建失效。冻结只在本地提交约定资产与评测差异，不推送，不覆盖用户并行变更。冻结前提或摘要不满足时重新读取，不能执行任意 Git 代替接口。两侧新 Run 的提交必须包含同一冻结计划，父侧 Candidate 仍与固定父版一致。

## 4. 执行独立比较

分别对父版和变体 `eval/preview`，核对冻结 Case、实际来源、模型、执行方式和环境，再 `eval/start`。双方使用相同约定口径，各 Case 达到计划的独立次数。诊断旧 Run、复制 Session 或同一 Run 重复选中不算新比较。

用 `eval/status {job_id}` 有界查询，保留真实 job_id/run_id；需要取消时 `eval/cancel` 后核对收尾。未知外部写入先查状态，不重复发起。计划或环境需改变时说明影响并重新准备比较，不追认旧 Run。

代码变体核对新 Session 的真实图回执与当前源码、构建及固定组合身份一致，检查 complete、status 和业务输出。构建通过或模型退回原子工具后答对都不能代替工作流装载成功。

## 5. 比较与结束

调用 `compute-variants/compare {experiment_id,parent_run_ids,variant_run_ids}`，分别判断质量、来源可比性和资源证据。关键任务退步、两侧都失败、重复不足、输入变化、成本未知或收益不足均不能认定等效，保留失败与缺口，不改口径让结果通过。

连续任务用 `platform_task deliver` 提交本任务实际启动的两组 Run；服务端核对构建、冻结、装载与比较。completed 只表示该任务完成，不自动成为 end。

`eligible_for_end` 仅适用于冻结任务，不能外推总体统计非劣性或所有硬件费用。向用户说明效果、资源变化和限制，并提供实际查看入口；end 必须由用户在变体界面复核。助手不提交 human_confirmed 或改结论字段绕过，人员确认后再回读状态。end 仍不代表发布、实例切换或主线升级。

参数错误按回执修正，摘要冲突先重读；内部错误保留动作、目标和错误码，停止依赖步骤，不循环调用同一失败动作。
