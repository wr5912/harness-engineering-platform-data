# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-a7ea372c-ec13-4659-a651-cbcb70189343`
- Experiment：`EXP-migration-langgraph-demo-001-rac1e3af8bc94`
- Agent：`migration-langgraph-demo`
- 状态：失败
- 有效结论：无法判定
- 机器结论：失败
- 证据复核：`failed`
- 开始时间：`2026-10-30T07:30:26Z`
- 完成时间：`2026-10-30T07:36:54Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 0 | 2 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 5 | 2 | 0 | 2 | 0 | 0 | failed | 0/0/0 |

- 未分组：证据复核失败（evidence-access）：analysis-required-evidence-not-read

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

证据复核失败（evidence-access）：analysis-required-evidence-not-read

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-GRAPH-BULK` | 数量 10，单价 12，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=10, unit_price=12），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 bulk（route=bulk，quantity>=10 命中九折分支），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=108（10×12×0.9）、tax=10.8（108×10% 两位舍入）、shipping=0（subtotal>=100 免运费）、total=118.8（join 汇合后两位舍入）。回复需解释命中 bulk 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 失败 | - | - | 语义判定：同一被测 Session 中确有对 quote_graph 的真实调用，但工具回执显示工作流执行失败（ok=false、graph_execution.status=failed），未返回任何 completed 结果体，也就没有 bulk 路由命中、tax/shipping 并行执行、join 汇合以及 subtotal=108、tax=10.8、shipping=0、total=118.8 等数据；被测回答也如实说明失败、未给出报价解释。预期要求的执行完成状态与金额解释均未实现，故判定为不通过。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-BULK](evidence/U-GRAPH-BULK) |
| `U-GRAPH-REGULAR` | 数量 2，单价 20，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=2, unit_price=20），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 regular（route=regular，quantity<10 不打折），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=40（2×20）、tax=4（40×10%）、shipping=5（subtotal<100 收运费 5）、total=49（join 汇合后）。回复需解释命中 regular 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 失败 | - | - | 语义判定：被测确已真实调用 quote_graph（quantity=2, unit_price=20），且未用原子工具替代；但两次图回执均为 ok=false、status=failed、trace 为空、无任何节点结果，未出现 status=completed、route=regular、tax/shipping 并行执行与 join 汇合的证据，也没有 subtotal=40、tax=4、shipping=5、total=49 的图来源数据。被测回复如实说明失败、未编造金额，但也因此完全未能给出与图回执一致的报价解释，第二、三、四项要求明确不满足，故整体 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-REGULAR](evidence/U-GRAPH-REGULAR) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
