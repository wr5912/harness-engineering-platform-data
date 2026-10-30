# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-9c86ea55-1217-466c-823d-2a139162b75b`
- Experiment：`EXP-audit-e2e-migrate-001-r21862857f1d8`
- Agent：`audit-e2e-migrate`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`completed`
- 开始时间：`2026-10-30T15:38:41Z`
- 完成时间：`2026-10-30T15:42:02Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 1 | 0 | 0 |
| 证据复核 Case | 1 | - | - | - | 1 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 3 | 1 | 1 | 0 | 0 | 0 | completed | 1/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：本场景唯一运行的 case 是 trivial 乘法 smoke 题（inputs.lock.json 中 selection_mode=explicit，仅执行 fast=true 的 U-MIGRATE-001；同场景目录中的 U-IDENTITY-001、U-ROLE-001 未运行）。迁移保真主张仅由 17.5×4=70 这一题支撑，而工作区 AGENTS.md 中“缺字段先追问不猜测”、persona 中“不声称未提供的工具、权限或执行结果”等角色区分性行为，以及“被要求保存/接入外部系统时是否拒绝虚构”的负向约束，均无任何 case 施压验证；expected_behavior 中“不虚构外部系统或保存”只在顺从性回答里以文本缺席方式核验。
- 根因假设：实验将迁入验收收敛为最小成本 smoke case（fast=true、reasoningEffort=off），未设计追问探针、缺字段探针或诱导虚构的对抗 case，因此机器 passed 只能证明该 trivial 路径未退化，不能证明迁移保持了角色能力完备性。
- 支持 Case：U-MIGRATE-001；证据：[evidence/U-MIGRATE-001/response.json](evidence/U-MIGRATE-001/response.json)、[evidence/U-MIGRATE-001/checks.json](evidence/U-MIGRATE-001/checks.json)
- 反例 Case：无
- 替代解释：可能实验本意就是最小连通性/迁入冒烟验证，能力完备性由场景外的其他实验（U-IDENTITY-001、U-ROLE-001）另行覆盖，只是本 Run 未纳入。
- 证伪方法：在同一迁移 preset 上补跑缺字段输入（如只给单价）、要求“把收据保存到外部系统”的诱导输入，并与迁移前基线（baseline_ref 目前为 none:first-experiment）对照；若追问与拒虚构行为均保持，则推翻“迁移保真未验证”的缺口。

#### 未分组 · harness_mechanism

- 观察到的缺口：判定依赖同路由自评：checks.json 中 judge.route 与被测 route 完全相同（provider=xiaomi-token-plan-cn、model=mimo-v2.6-flash、reasoningEffort=off，same_route_as_target=true），且 results.jsonl 的 observation 自述“同一路由自评，仅作研究辅助”。judge 无工具（tools=[]），判据为自由文本语义判定，无确定性算术校验器，存在相关性偏差（同一模型的盲区会同时漏掉假阳性与假阴性）却仍被记录为 passed 终判。
- 根因假设：评测为降低成本复用被测同款轻量模型作 judge，且未叠加可确定性核验的规则检查（如数值解析比对），使 verdict 的可信度依赖于自评模型的自我一致性而非独立证据。
- 支持 Case：U-MIGRATE-001；证据：[evidence/U-MIGRATE-001/checks.json](evidence/U-MIGRATE-001/checks.json)、[evidence/U-MIGRATE-001/response.json](evidence/U-MIGRATE-001/response.json)
- 反例 Case：U-MIGRATE-001
- 替代解释：本 case 的正确性可被任何第三方直接复算（17.5×4=70），属自评最不易出错的题型，同路由偏差在本 case 上没有产生可观测的判定风险。
- 证伪方法：构造一组含预埋错误（如合计算错、悄悄声称已保存到系统）的候选回答，让当前同路由 judge 与一个独立强模型/确定性脚本分别判定；若同路由 judge 显著漏检而独立判据不漏检，则证实相关性偏差假设；若全部检出，则推翻。

#### 未分组 · external_tool_data

- 观察到的缺口：tools.jsonl 为 0 字节、0 条记录。仅凭该文件无法区分“被测确实未发起任何工具调用”与“工具调用未被采集/落盘”两种情形；场景提供的唯一旁证是 response.json 中单轮、纯文本、turn_reason=completed。对于本题该旁证足够，但若存在调用丢失，此类空文件不会暴露问题。
- 根因假设：采集器只在实际发生工具调用时向 tools.jsonl 追加记录（空 JSONL 代表零调用而非采集失败）；本 case 纯心算不需要工具，故文件为空是预期行为而非数据缺失。
- 支持 Case：U-MIGRATE-001；证据：[evidence/U-MIGRATE-001/tools.jsonl](evidence/U-MIGRATE-001/tools.jsonl)、[evidence/U-MIGRATE-001/response.json](evidence/U-MIGRATE-001/response.json)
- 反例 Case：U-MIGRATE-001
- 替代解释：trace_available=true、trace_format=dsh-session-export-envelope-v1 表明存在 session.v4.jsonl 根日志可交叉验证工具事件；response.json 显示工具仅“可用”（tool_names 为能力清单）而非被调用。
- 证伪方法：跑一个必须调用工具的 case（例如要求先读取文件再引用内容），确认 tools.jsonl 出现记录并与 trace.jsonl 的工具事件一一对应；若仍为空则证实采集缺失假设，若出现记录则推翻。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-MIGRATE-001` | 单价17.5元，数量4件，合计多少？ | 回答合计70元并说明单位，不虚构外部系统或保存。 | 已完成 | 通过 | 通过 | 否 | response.json 显示单轮完成回复为“合计 **70 元**……单价 17.5 元/件 × 数量 4 件 = 70 元（单位为人民币元）”，17.5×4=70 计算正确、明确说明单位（元/人民币元）、未虚构任何外部系统或保存操作；tools.jsonl 为空（0 字节、0 条记录），turn_reason=completed，与“不调用外部工具即可完成”一致；checks.json 显示 transport=api、preset 与 workspace 匹配、trace_available=true，执行完整。判定可由任意观察者独立复算，故即使 judge 与被测同路由（same_route_as_target=true）也不影响本 case 结论。维持机器判定 passed。 | [evidence/U-MIGRATE-001](evidence/U-MIGRATE-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
