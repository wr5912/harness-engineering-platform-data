---
name: agent-maintenance
description: 整理智能体版本用途和特性，维护已授权目标的说明、资产、用例及实例；从已有版本改变业务行为时转入 Harness 演进，不将日常维护变成新研究。
---

# 智能体维护

从固定任务上下文取得目标，调用 `platform_agents` 的 `detail {agent_id,experiment_id}` 读取真实版本；缺少对象时才查询 `context` 或 `list`。编号最大不表示当前运行。读取业务角色指令不改变管理身份。

当前状态与历史观察分别判断。必要时沿后续证据引用核对当前实例；历史待办不证明现在仍未完成。隔离工作区的验收记录可支持其说明的事实，但不能证明正式实例已装载同一资产。需要方法时按需读取 `research/read-reference` 的 controlled-improvement 或 inheritance-and-fusion。

## 整理用途和特性

`workflow=features` 仅使用本技能与 `platform_agents`，目标 Experiment 固定。取得足以说明特性的来源即可，不遍历全部文件和历史 Run。

1. **读来源。** `detail` 后用 `features/read-source {experiment_id}` 获取 `files` 列表，选择其中的真实路径作为 `ref` 读取必要说明。`ref` 支持所属 Experiment 或数据根相对路径，不是 Git 引用；单文件回执的 `ref` 与 `path` 已归一为数据根相对路径。可读取同 Agent 的其他版本观察。当前 Candidate 用 `edit/read`，必要时用 `assets/diff {experiment_id,against:"baseline"}`；固定资产另用 `assets/read-fixed`。
2. **核对证据。** 用 `runs/index {agent_id}` 选择有关记录，再用 `runs/show`、`runs/report` 读取。当前资产、配置或差异支持“已实现”；匹配来源的 Run 才支持装载、效果与回归结论。保留有效已有特性；计划不能写成已实现，缺证据写明尚未验证。
3. **提交完整清单。** `features/preview {experiment_id,features:[{id,title,description,source_refs,evidence_refs,change?}]}`。引用使用实际读到的数据根相对路径，缺评测证据时 `evidence_refs` 为空。平台校验当前快照后自动保存，无需人工确认；不直接重复调用 `features/apply`。
4. **回读。** 仅当回执 `action=features/apply`、`state=completed`、`result.ok=true` 才视为已保存，再读 `detail` 核对目标清单。校验或摘要冲突先重读、修正；失败时不宣布已保存，不修改 Candidate 迎合文案。

## 日常操作

按所需操作选择一条，不依次执行整张表。写入由 DSH 原生访问策略处理，待批准、取消或失败不视为已执行；成功后按实际返回 ID 回读，不另等平台提案确认。

核对“是否已交付”时读取已有产物入口、相关 Run 与实例状态；没有可读记录就说明尚未核实，不推断未交付。日常状态查看和启停只核对现有记录，不新开业务 Session 或重新执行业务验收。用户要求同一实例停止再启动时，先核实其约定前提，停止操作取得完成回执后，再启动同名实例并回读状态、来源与入口，不重新创建或操作其他实例。

| 操作 | 读取与执行 | 完成条件 |
|---|---|---|
| 新建智能体 | `new {agent_id,name,description,role}`，ID 为小写 kebab-case，先明确职责与最低业务验证输入 | 回读 Agent、首次 Experiment、角色与用例；创建不包含启动或业务验收 |
| 查看实例 | `platform_instances` 的 `list`、`detail`；排障再按需 `logs`、`url` | 核对实际状态、来源与真实入口，不通过 shell 操作 Docker |
| 实例变更 | 直接调用 `run {name,operation,source?,port?}`，批量用 `batch`；平台内部预览并核对来源及访问设置，按原生访问策略执行。用户仅要求查看影响时使用 `preview` 或 `batch-preview`，到此结束 | 执行完成后回读每项状态和来源，部分失败分别说明；重新执行业务验收须属于用户明确要求 |
| 编辑资产 | 先确定是非语义整理或已授权独立 Candidate 的续作；改变已有版本业务行为先按 `harness-evolution` 派生。目标确定后 `edit/read` 得到内容和摘要，`edit/preview` 后 `edit/apply`，每项为 `{path,content,expected_sha256}` | 提交完整文本并回读；新文件须先 `edit/read` 确认不存在，再使用 `expected_sha256:null` |
| 修改用例 | `cases/read` 后 `cases/update {experiment_id,case_id,title,inputs,expected_behavior,fast,expected_sha256}` | 回读该 Case，比较期间不改口径 |
| 新增用例 | `cases/create-context` 取模板，必要时 `cases/from-run {experiment_id,run_id,case_id}` 取冻结输入，再 `cases/create-preview` 与 `cases/create` | 回读新增 Case；预期由需求确定，不将失败输出改成标准答案 |

目录、二进制、截断内容及不支持的删除或重命名不能用空文件冒充完成。回执未知先查询实际状态，摘要冲突重新读取；无法完整处理时停在具体缺口。

## 进入研究改进

修改已有业务语义使用 `harness-evolution`；多来源集成使用 `harness-experiment-fusion`；独立评测使用 `research-eval`；算力变体使用 `compute-variant-research`；需要装配、修复和实例交付使用 `task-builder`。仅咨询、整理特性或已有证据不因此创建 Experiment。已加载对应技能则从当前步骤继续，不重新启动相同流程。

涉及 MCP/API 时先按 `mcp-composition` 办理实际连接与编排。工具成功、Mock 成功、研究结论和生产使用分别说明；本技能不提供程序开发、任意 Git、Research Release 或长期自主调度入口。
