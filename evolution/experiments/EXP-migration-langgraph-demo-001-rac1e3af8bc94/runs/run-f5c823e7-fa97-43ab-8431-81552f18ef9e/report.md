# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-f5c823e7-fa97-43ab-8431-81552f18ef9e`
- Experiment：`EXP-migration-langgraph-demo-001-rac1e3af8bc94`
- Agent：`migration-langgraph-demo`
- 状态：失败
- 有效结论：无法判定
- 机器结论：失败
- 证据复核：`failed`
- 开始时间：`2026-10-30T07:46:21Z`
- 完成时间：`2026-10-30T07:54:02Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 3 | 0 | 0 | 1 | 2 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 5 | 3 | 1 | 2 | 0 | 0 | failed | 0/0/0 |

- 未分组：证据复核失败（session）：case-hard-timeout

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

证据复核失败（session）：case-hard-timeout

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-GRAPH-BULK` | 数量 10，单价 12，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=10, unit_price=12），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 bulk（route=bulk，quantity>=10 命中九折分支），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=108（10×12×0.9）、tax=10.8（108×10% 两位舍入）、shipping=0（subtotal>=100 免运费）、total=118.8（join 汇合后两位舍入）。回复需解释命中 bulk 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 失败 | - | - | 语义判定：被测确实在同一 Session 中真实调用了 quote_graph（quantity=10、unit_price=12，call_id=call_d55b41fed8d041a995b64f49），满足“不得心算或用原子工具替代”的要求；但工具回执原生状态为 ok=false、graph_execution.status=failed、trace 为空、无 result，明确与“status=completed 且 complete=true”（虽 complete=true 但 status=failed）、路由命中 bulk、tax/shipping 并行执行与 join 汇合、subtotal=108/tax=10.8/shipping=0/total=118.8 等金额要求不符；回复也未给出任何报价解释，而是如实说明失败，未满足第四项“解释命中 bulk 分支及各金额”的要求。多条明确要求不满足，判定 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-BULK](evidence/U-GRAPH-BULK) |
| `U-GRAPH-REGULAR` | 数量 2，单价 20，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=2, unit_price=20），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 regular（route=regular，quantity<10 不打折），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=40（2×20）、tax=4（40×10%）、shipping=5（subtotal<100 收运费 5）、total=49（join 汇合后）。回复需解释命中 regular 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 失败 | - | - | 语义判定：被测确实真实调用了 quote_graph（quantity=2、unit_price=20），但同一被测 Session 的 tool/result 回执显示 ok=false、graph_execution.status=failed，工作流执行失败，未产生 completed 状态，也没有 route=regular、tax/shipping/join 节点执行记录及 subtotal=40、tax=4、shipping=5、total=49 等任何金额数据。被测回复也如实说明失败、拒绝给出报价数字并请求重试，因此全部核心预期（完成状态、regular 路由、并行节点与 join、金额一致性、解释报价）均未满足，判定为 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-REGULAR](evidence/U-GRAPH-REGULAR) |
| `U-GRAPH-MISSING` | 请帮我报价。 | 缺少数量与单价时必须先向用户补问 quantity 与 unit_price，不得猜测或虚构输入，不得在参数不全时调用 quote_graph 图；本轮不给出任何报价数字。 | 已完成 | 通过 | - | - | 语义判定：被测回答在缺少 quantity 与 unit_price 时明确向用户补问这两项必要信息，未猜测或虚构任何输入，也未在参数不全时调用 quote_graph 图；同时本轮未给出任何报价数字，仅说明了未来的分支逻辑与计费构成（无具体数值），全部要求均满足。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-MISSING](evidence/U-GRAPH-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
