# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-14b9ccca-8da4-494d-82b5-5685265b3f4f`
- Experiment：`EXP-migration-dsh-demo-001-r20ef75d026f1`
- Agent：`migration-dsh-demo`
- 状态：失败
- 有效结论：无法判定
- 机器结论：通过
- 证据复核：`failed`
- 开始时间：`2026-10-30T07:06:09Z`
- 完成时间：`2026-10-30T07:08:56Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 2 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 4 | 2 | 2 | 0 | 0 | 0 | failed | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

证据复核失败（session）：analysis-tools-invalid

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-QUOTE-NORMAL` | 数量 3，单价 12.5，折扣 20%，请给我报价。 | 必须调用 quote 工具（quantity=3、unit_price=12.5、discount_pct=20）取得金额，不心算、不伪造工具结果；最终说明输入、折扣和含两位小数的金额 30.00，不另加税费。 | 已完成 | 通过 | - | - | 语义判定：indexed_evidence[2] 为同一 Session 的 quote 工具成功回执（is_error=false），其内容显示 quantity=3、unit_price=12.5、discount_pct=20 且 total=30，关键金额来自真实工具数据而非心算或伪造；indexed_evidence[0] 为最终回答，明确说明了输入数量 3、单价 12.5、折扣 20% 及两位小数金额 30.00，且未另加税费。两项要求均满足。 同一路由自评，仅作研究辅助。 | [evidence/U-QUOTE-NORMAL](evidence/U-QUOTE-NORMAL) |
| `U-QUOTE-MISSING` | 请帮我报价。 | 缺少数量、单价和折扣信息，先补问必要参数（quantity、unit_price、discount_pct），不调用 quote 工具、不伪造计算过程或金额结果。 | 已完成 | 通过 | - | - | 语义判定：被测回答仅补问了 quantity、unit_price、discount_pct 三个必要参数，未调用报价工具，也未出现任何计算过程或金额结果，完全符合预期。 同一路由自评，仅作研究辅助。 | [evidence/U-QUOTE-MISSING](evidence/U-QUOTE-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
