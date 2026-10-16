---
name: harness-evolution
description: 通过平台工具创建、修改和审查 DSH Harness Experiment，固定 Baseline 与继承来源，保存假设、观察和真实 Decision；用于业务 Harness 的受控演进。
---

# Harness 研究演进

读取目标 `detail`，按需调用 `research/read-reference {topic:"controlled-improvement"}` 或 `inheritance-and-fusion`。仅修改已明确的业务对象；资料整理不因此创建新 Experiment。目录与记录合同见[仓库演进不变量](references/repository-invariants.md)。

## 固定来源并创建

1. 确认实际问题、不能回归的能力和可证伪假设。`list/detail` 盘点当前工作区同 Agent 版本与必要 Run，保留仍有效的主线和并行能力；工具盘点不代表远端分支已同步，未核对远端时明确来源范围。
2. 已有版本使用 `detail.derivation.parent_ref` 和 `assets/read-fixed {agent_id,experiment_id,ref}` 核对所选完整 Candidate。`baseline_ref` 是比较祖先，不能代替当前父版；`repo_commit` 或更大编号不证明完整来源。固定引用缺失时说明待固定对象，不猜 SHA、不自动提交，也不退到旧版。
3. 单一来源用 `create {agent_id,parent_experiment_id,parent_ref,research_question,catalog_sha256?}`；多来源使用融合技能。首次 Agent 用 `new` 创建首次 Experiment。来源与 ID 以真实回执为准，新编号由工具生成。
4. 通过 `edit/read` 取得摘要，在 `hypothesis.md` 记录假设、停止条件和来源取舍；用 `edit/preview`、`edit/apply` 按现有确认写入。目标 `candidate/` 保存实际 Harness 修改，不复制 Runtime HOME、Session 或缓存。

## 评测与决定

以 `research-eval` 固定 Case 和比较环境，用真实新 Run 检查修改与必要回归。检查配置到目标制品再到实际加载的整条路径；来自旧来源的测试不能证明目标集成成功。Decision 前重新盘点工作区新增并行来源，说明保留、替代或舍弃原因；需要跨来源能力时使用 `harness-experiment-fusion`。

调用 `research/validate {experiment_id}` 检查确定性合同。它不能证明业务语义正确，也不执行任意资产脚本。验证失败先修正目标资料或说明阻塞，不通过安装依赖、执行程序内部脚本绕过。

保存观察用 `edit/read` 后提交 `evaluation/observations.md` 的确认编辑。保存研究结论先读取 `detail.decision.sha256` 与顶层 `detail.change_sha256`，再调用 `decision/update {experiment_id,content,expected_sha256,status:"completed",outcome,expected_change_sha256}`。`outcome` 为 `adopt`、`continue`、`reject` 或 `inconclusive`，正文写依据、反例、回归、限制和下一步。仅维护说明时不强制改变状态。回读结构化结论与正文，不能仅保存“adopt”文案就声称已完成状态更新。

当前管理平台只支持固定 Git 来源的实际派生路径，没有 Research Release 创建、发布或 `release:<id>` 运行入口。值得长期保留的版本可提出复现需求，不能虚构发布成功。`adopt` 也不等于实例切换或生产发布。
