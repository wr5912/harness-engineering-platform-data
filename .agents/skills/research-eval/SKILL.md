---
name: research-eval
description: 为 DSH Harness 设计有区分力的比较，通过平台评测与 Run 证据检查效果、回归和限制，保存可复核的研究 Decision。
---

# Harness 研究评估

评估回答当前假设。需要方法时调用 `research/read-reference {topic:"evaluation-and-evidence"}`；记录格式见[研究评估合同](references/experiment-contract.md)。本技能供管理助手办理研究，不作为目标业务智能体或自动归因实例的角色指令。

## 固定输入和真实执行

1. 读取目标 `detail`、`cases/list/read` 和相关历史 Run，确认研究假设、Baseline、Candidate 变化及预期。业务 Case 在 Agent 的 `evaluation.md` 单处维护，通过 `cases/update` 或 `cases/create-context/create-preview/create` 编辑；使用 `cases/from-run` 的冻结输入时不能把失败输出直接当答案。
2. 按假设选择有区分力的正常、边界和回归 Case，不固定数量。动态事实根据本轮实际工具结果核对，不强制某次示例值、措辞或排版。要求工具的任务必须检查真实调用、完整结果和产物。
3. 调用 `research/validate {experiment_id}`；静态检查不代替业务证据。随后 `eval/preview {source:"experiment:<ID>",cases:["实际ID"],mode:"fast",executor:"api",review:"none"}` 核对来源、选择、执行方式和缺少环境，再 `eval/start` 等待现有确认。仅使用实际存在的 Case；需要不同档位或复核时明确选择并在比较双方保持一致。
4. `eval/status {job_id}` 有限查询，记录真实 run_id；必要时 `eval/cancel` 并核对收尾。状态未知先查询，不自动重复启动。新的执行用新的 Run；复用旧结果时说明来源，不能包装成这轮已经运行。

## 读证据与判断

读取 `runs/show/report`，按需用 `runs/trace/files/read-file` 核对原始输入、回答、工具及制品。先看未选、未执行、失败和不可判定范围，再看通过项。区分执行状态与业务判定；Run 封存为 completed 不表示所有 Case passed。自动评审与归因只是证据的一部分，需检查直接支持、成功反例、替代解释和下一次可证伪检查。

存在 Baseline Run 时用 `runs/compare {left,right}` 检查共同 Case、来源、模型、运行模式及外部条件。环境或输入不同的结果只支持描述性观察，不把差值归因为 Harness。没有真实对照时说明尚不能证明改进；未知费用、资源和采集缺口保持未知。

将实际观察通过受控编辑写入目标 `evaluation/observations.md`；按 `harness-evolution` 的 `decision/update` 保存结论及结构化状态，回读确认。`adopt`、`continue`、`reject`、`inconclusive` 都是合法研究结果；计划改变后重跑受影响比较，不改写历史 Run 或降低口径掩盖失败。

页面 UI 验证、工具链校验、实际装载、业务效果分别说明。Mock 的范围、实际模型和外部依赖限制需要随结论保留。当前没有 Research Release 创建或发布入口，不以 Git 标签、文件存在或通过校验宣称发布完成。
