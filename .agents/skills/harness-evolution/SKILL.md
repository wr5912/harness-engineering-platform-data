---
name: harness-evolution
description: 通过平台工具创建、修改和审查 DSH Harness Experiment，固定 Baseline 与继承来源，保存假设、观察和真实 Decision；用于业务 Harness 的受控演进。
---

# Harness 研究演进

读取目标 `detail`，按需调用 `research/read-reference {topic:"controlled-improvement"}` 或 `inheritance-and-fusion`。仅修改已明确的业务对象；资料整理不因此创建新 Experiment。目录与记录合同见[仓库演进不变量](references/repository-invariants.md)。

## 固定来源并创建

1. 确认实际问题、不能回归的能力和可证伪假设。读取目标 `detail`；确需盘点同 Agent 版本时再 `list` 并读相关详情与 Run。保留仍有效的主线和并行能力；未核对远端时不声明已覆盖远端分支。
2. 已有版本使用 `detail.derivation.parent_ref` 和 `assets/read-fixed {agent_id,experiment_id,ref}` 核对所选完整 Candidate。`baseline_ref` 是比较祖先，不能代替当前父版；`repo_commit` 或更大编号不证明完整来源。固定引用缺失时说明待固定对象，不猜 SHA、不自动提交，也不退到旧版。
3. 单一来源用 `create {agent_id,parent_experiment_id,parent_ref,research_question,catalog_sha256?}`；多来源使用融合技能。首次 Agent 用 `new` 创建首次 Experiment。来源与 ID 以真实回执为准，新编号由工具生成。
4. 以创建回执的目标 ID 继续，用 `edit/read` 取得内容与摘要，在 `hypothesis.md` 记录假设、停止条件和来源取舍，再经 `edit/preview`、`edit/apply` 写入完整文本并回读。目标 `candidate/` 保存实际 Harness 修改，不复制 Runtime HOME、Session 或缓存。摘要冲突先重读；缺完整来源或不支持的文件操作停在缺口，不提交空文件。

`assets/diff` 与其他 Experiment 的比较针对当前工作树，不能冒称固定提交。`assets/read-fixed` 的脱敏、截断预览或二进制元数据也不能当作完整正文迁移。

## 评测与决定

以 `research-eval` 固定 Case 和比较环境，用真实新 Run 检查修改与必要回归；该技能已加载就继续相应步骤，评测结束回到下述保存结论，不重新创建 Experiment。检查配置、制品与实际加载；旧来源测试不能证明目标集成。Decision 前只核对本次相关并行来源的新增变化，说明取舍；需要跨来源能力时使用 `harness-experiment-fusion`。

调用 `research/validate {experiment_id}` 检查确定性合同。它不能证明业务语义正确，也不执行任意资产脚本。验证失败先修正目标资料或说明阻塞，不通过安装依赖、执行程序内部脚本绕过。

保存观察用 `edit/read` 后提交 `evaluation/observations.md` 的确认编辑。研究结论按以下字段来源调用 `decision/update`，成功后回读 `detail`：

| 字段 | 来源与含义 |
|---|---|
| experiment_id、content | 当前目标与基于真实证据的结论正文，保留反例、回归、限制及下一步 |
| expected_sha256 | 当前 detail.decision.sha256 |
| status、outcome | 完成本轮研究时 status 为 completed，outcome 为 adopt/continue/reject/inconclusive；仅维护说明可省略 |
| expected_change_sha256 | 更新结构化状态时取 detail 顶层 change_sha256 |

摘要冲突重新读取，不猜值；仅写“adopt”正文不等于状态已更新。失败或未知状态先核对实际记录，不重复保存。

当前管理平台只支持固定 Git 来源的实际派生路径，没有 Research Release 创建、发布或 `release:<id>` 运行入口。值得长期保留的版本可提出复现需求，不能虚构发布成功。`adopt` 也不等于实例切换或生产发布。
