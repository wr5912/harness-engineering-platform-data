---
name: research-eval
description: 为 DSH Harness 设计有区分力的比较，通过平台评测与 Run 检查效果、回归和限制，形成可复核的评测证据与结论；支持独立评测和既有 Run 比较。
---

# Harness 研究评估

评估回答当前假设。需要方法时调用 `research/read-reference {topic:"evaluation-and-evidence"}`；记录格式见[研究评估合同](references/experiment-contract.md)。本技能供管理助手办理研究，不作为目标业务智能体或自动归因实例的角色指令。

## 固定输入和真实执行

1. 读目标 `detail`，用 `cases/list` 选择后逐项 `cases/read`，仅查有关历史 Run。确认假设、Baseline、Candidate 变化及预期。业务 Case 在 Agent 的 `evaluation.md` 单处维护；确需增改时按 `agent-maintenance` 的用例操作，已加载不重读。`cases/from-run` 可提取冻结输入，失败输出不能直接当答案。
2. 按假设选择有区分力的正常、边界和回归 Case，不固定数量。动态事实根据本轮实际工具结果核对，不强制某次示例值、措辞或排版。要求工具的任务必须检查真实调用、完整结果和产物。
3. 调用 `research/validate {experiment_id}`；静态检查不代替业务证据。随后 `eval/preview {source:"experiment:<ID>",cases:["实际ID"],mode:"fast",executor:"api",review:"none"}` 核对来源、选择、执行方式和缺少环境，再调用 `eval/start`，由 DSH 原生访问策略处理执行权限，依据实际回执继续，不另等平台确认。仅使用实际存在的 Case；需要不同档位或复核时明确选择并在比较双方保持一致。
4. `eval/status {job_id}` 有界查询，保留实际 job_id/run_id；仍在运行时说明状态，不频繁发起新模型轮询，也不承诺平台重启后自动恢复。必要时 `eval/cancel` 并核对收尾。状态未知先查询，不重复启动。新的执行用新的 Run；复用旧结果明确其来源，不冒称本轮新运行。

## 读证据与判断

先 `runs/show` 与 `runs/report`，需要定位证据再选择 `runs/trace`，或经 `runs/files` 列出后 `runs/read-file` 读取。先看未选、未执行、失败和不可判定范围，再看通过项。Run 的 completed 不表示所有 Case passed。自动评审与归因只是证据之一，检查直接支持、成功反例、替代解释和下一次可证伪检查。

存在 Baseline Run 时用 `runs/compare {left,right}` 检查共同 Case、来源、模型、运行模式及外部条件。环境或输入不同的结果只支持描述性观察，不把差值归因为 Harness。没有真实对照时说明尚不能证明改进；未知费用、资源和采集缺口保持未知。

评测证据齐备后，将实际 Run、观察、反例和限制返回原研究任务。需要保存观察或 Decision 时，按[观察与 Decision 保存合同](../harness-evolution/references/decision-update.md)更新并回读，不为查询字段加载演进技能或新建 Experiment。用户只要求查询时仅报告，不额外写 Decision。口径改变需重跑受影响比较，不改写历史 Run 或降标准。

页面 UI 验证、工具链校验、实际装载、业务效果分别说明。Mock 的范围、实际模型和外部依赖限制需要随结论保留。当前没有 Research Release 创建或发布入口，不以 Git 标签、文件存在或通过校验宣称发布完成。
