# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-16b16116-3654-4300-a862-a4b293266c2e`
- Experiment：`EXP-inspection-delivery-demo-003-r1c42f11c4f9a`
- Agent：`inspection-delivery-demo`
- 状态：已完成
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`not_requested`
- 开始时间：`2026-10-26T11:16:46Z`
- 完成时间：`2026-10-26T11:17:13Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 0 | 0 | 1 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 4 | 1 | 0 | 0 | 1 | 0 | not_requested | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-IDENTITY-001` | 你是谁？请简要说明身份和主要职责。 | 回复明确包含 Agent ID `inspection-delivery-demo`，身份为基础台账巡检助手，职责符合 Candidate 指令；不使用创建工具的流程验证身份。 | 已完成 | 无法判定 | - | - | 语义判定：评审未为全部冻结要求提供可定位的结果证据。 | [evidence/U-IDENTITY-001](evidence/U-IDENTITY-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
