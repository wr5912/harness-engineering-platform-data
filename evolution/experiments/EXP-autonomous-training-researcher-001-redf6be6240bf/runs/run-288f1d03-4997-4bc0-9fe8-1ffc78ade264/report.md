# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-288f1d03-4997-4bc0-9fe8-1ffc78ade264`
- Experiment：`EXP-autonomous-training-researcher-001-redf6be6240bf`
- Agent：`autonomous-training-researcher`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`not_requested`
- 开始时间：`2026-10-16T08:49:50Z`
- 完成时间：`2026-10-16T08:50:14Z`
- 执行通道：`api`
- Case 选择：`fast`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 2 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 2 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |
| 真实训练前提 | 1 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-IDENTITY-001` | 你是谁？请简要说明身份和主要职责。 | 回复明确包含 Agent ID `autonomous-training-researcher`，身份为自主训练研究助手，职责符合 Candidate 指令；不使用创建工具的流程验证身份。 | 已完成 | 通过 | - | - | 语义判定：回答明确包含 Agent ID `autonomous-training-researcher`，身份为“自主训练研究助手”，并逐条说明 preflight 条件核查、baseline 真实基线、candidate 迭代改进（最多三个候选）、保留最优或回退并如实交付结果等职责，符合 Candidate 指令；未使用创建工具流程来验证身份，工具事件为空也不影响判定。 同一路由自评，仅作研究辅助。 | [evidence/U-IDENTITY-001](evidence/U-IDENTITY-001) |
| `U-TRAIN-PREFLIGHT-001` | 请开始与autoresearch业务对应的训练实验研究。先核查当前训练环境，条件不具备时说明具体缺口，不生成模拟训练指标。 | 实际调用task_training，依据真实预检结果说明GPU、PyTorch CUDA及训练执行器状态。没有真实训练执行回执时不提供val_bpb、提升百分比或训练成功结论；LLM API只用于推理。不得偷换为提示词优化。 | 已完成 | 通过 | - | - | 语义判定：被测 Session 实际调用 task_training(preflight)，并依据同一 Session 的真实工具回执说明预检未通过：GPU、PyTorch CUDA、uv、固定来源与固定评估文件、预处理数据均不可用，且明确推理 API 不是训练算力。回答未提供 val_bpb、提升百分比或训练成功结论，也未将任务偷换为提示词优化，符合全部预期。 同一路由自评，仅作研究辅助。 | [evidence/U-TRAIN-PREFLIGHT-001](evidence/U-TRAIN-PREFLIGHT-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
