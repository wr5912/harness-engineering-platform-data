# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-7e794337-04a5-4170-a0f1-4d34b0008fb2`
- Experiment：`EXP-migration-langgraph-demo-001-rac1e3af8bc94`
- Agent：`migration-langgraph-demo`
- 状态：失败
- 有效结论：无法判定
- 机器结论：通过
- 证据复核：`failed`
- 开始时间：`2026-10-30T08:16:56Z`
- 完成时间：`2026-10-30T08:21:45Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 3 | 0 | 0 | 3 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 5 | 3 | 3 | 0 | 0 | 0 | failed | 0/0/0 |

- 未分组：证据复核失败（session）：analysis-tools-invalid

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

证据复核失败（session）：analysis-tools-invalid

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-GRAPH-BULK` | 数量 10，单价 12，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=10, unit_price=12），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 bulk（route=bulk，quantity>=10 命中九折分支），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=108（10×12×0.9）、tax=10.8（108×10% 两位舍入）、shipping=0（subtotal>=100 免运费）、total=118.8（join 汇合后两位舍入）。回复需解释命中 bulk 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 通过 | - | - | 语义判定：被测 Session 中存在真实 quote_graph 工具调用，回执 is_error=false 且 result.status=completed、complete=true；trace 显示 bulk 判定后 calc_shipping 与 calc_tax 均执行完成、join 在其后汇合；回执金额 subtotal=108、tax=10.8、shipping=0、total=118.8 与 quantity=10、unit_price=12 的九折、10% 税费、免运费规则一致，且回复解释与回执完全对应，四项要求均满足。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-BULK](evidence/U-GRAPH-BULK) |
| `U-GRAPH-REGULAR` | 数量 2，单价 20，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=2, unit_price=20），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 regular（route=regular，quantity<10 不打折），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=40（2×20）、tax=4（40×10%）、shipping=5（subtotal<100 收运费 5）、total=49（join 汇合后）。回复需解释命中 regular 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 通过 | - | - | 语义判定：工具回执显示 quote_graph 真实执行：graph_execution.status=completed 且 complete=true，route=regular，trace 依次为 regular → calc_shipping/calc_tax（并行）→ join，各节点均 completed；回执金额 subtotal=40、tax=4、shipping=5、total=49 与预期公式完全一致；被测回复解释了 regular 命中原因及各项金额，且与回执数据一致。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-REGULAR](evidence/U-GRAPH-REGULAR) |
| `U-GRAPH-MISSING` | 请帮我报价。 | 缺少数量与单价时必须先向用户补问 quantity 与 unit_price，不得猜测或虚构输入，不得在参数不全时调用 quote_graph 图；本轮不给出任何报价数字。 | 已完成 | 通过 | - | - | 语义判定：被测回答在缺少 quantity 与 unit_price 时明确向用户补问了两项必要参数，未猜测或虚构输入，也未在参数不全时调用 quote_graph；回答中仅说明了分支规则与流程，未给出任何报价数字（折扣比例描述属于规则说明而非报价数值）。逐项核对全部要求均满足。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-MISSING](evidence/U-GRAPH-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
