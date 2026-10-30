# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-7ed22769-5691-4f11-a581-5b0015b78645`
- Experiment：`EXP-migration-langgraph-demo-001-rac1e3af8bc94`
- Agent：`migration-langgraph-demo`
- 状态：失败
- 有效结论：无法判定
- 机器结论：失败
- 证据复核：`failed`
- 开始时间：`2026-10-30T07:18:11Z`
- 完成时间：`2026-10-30T07:25:58Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`changed`

`source-changed`：evaluation_implementation 与初始锁定来源不一致或无法读取。原始 Case 结果保留，本 Run 不能用于证明锁定来源通过；请固定来源后重新运行。

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
| `U-GRAPH-BULK` | 数量 10，单价 12，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=10, unit_price=12），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 bulk（route=bulk，quantity>=10 命中九折分支），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=108（10×12×0.9）、tax=10.8（108×10% 两位舍入）、shipping=0（subtotal>=100 免运费）、total=118.8（join 汇合后两位舍入）。回复需解释命中 bulk 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 失败 | - | - | 语义判定：被测回复确实发起了对 quote_graph 的真实调用（quantity=10, unit_price=12），但工具回执为错误（is_error=true，内容为 Error: cannot get property "llm" without inject），不存在 status=completed 且 complete=true 的执行回执，也无 route=bulk 路由、tax/shipping 并行节点执行、join 汇合等图执行事实。被测回复明确表示无法给出 subtotal/tax/shipping/total，仅凭参数预期说明会命中 bulk 分支，未提供任何与图回执一致的金额与解释。因此四项要求均未满足，整体判定 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-BULK](evidence/U-GRAPH-BULK) |
| `U-GRAPH-REGULAR` | 数量 2，单价 20，请给我报价。 | 必须真实调用报价图工具 quote_graph（quantity=2, unit_price=20），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 regular（route=regular，quantity<10 不打折），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=40（2×20）、tax=4（40×10%）、shipping=5（subtotal<100 收运费 5）、total=49（join 汇合后）。回复需解释命中 regular 分支及小计、税费、运费、总额，且与图回执一致。 | 已完成 | 失败 | - | - | 语义判定：被测回答确实真实调用了 quote_graph 工具（quantity=2、unit_price=20，两次调用），但两次工具回执均为原生 is_error=true，内容为 `Error: cannot get property "llm" without inject`，不存在 status=completed、complete=true、route=regular、tax/shipping/join 节点执行的任何图回执数据，也不存在 subtotal=40、tax=4、shipping=5、total=49 的来源数据。被测回答自身也明确承认未获得回执、无法给出报价，因此「图执行完成、路由命中 regular、金额一致、回复解释命中分支与各项金额」等要求均未满足。工具环境故障只能解释失败，不能改变冻结的预期要求，故判定 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-REGULAR](evidence/U-GRAPH-REGULAR) |
| `U-GRAPH-MISSING` | 请帮我报价。 | 缺少数量与单价时必须先向用户补问 quantity 与 unit_price，不得猜测或虚构输入，不得在参数不全时调用 quote_graph 图；本轮不给出任何报价数字。 | 已完成 | 通过 | - | - | 语义判定：被测回答在缺少 quantity 与 unit_price 的情况下，仅向用户明确补问这两个必需参数，未猜测或虚构任何输入，也未在参数不全时调用 quote_graph 图（索引证据中无任何工具调用或回执）。回答中仅说明了批量分支与折扣规则，未基于任何输入计算或给出针对本次订单的报价金额，符合本轮不出报价数字的约束。 同一路由自评，仅作研究辅助。 | [evidence/U-GRAPH-MISSING](evidence/U-GRAPH-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
