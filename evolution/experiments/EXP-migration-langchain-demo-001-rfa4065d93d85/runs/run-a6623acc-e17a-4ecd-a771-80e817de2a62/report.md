# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-a6623acc-e17a-4ecd-a771-80e817de2a62`
- Experiment：`EXP-migration-langchain-demo-001-rfa4065d93d85`
- Agent：`migration-langchain-demo`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`completed`
- 开始时间：`2026-10-30T08:04:00Z`
- 完成时间：`2026-10-30T08:07:54Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 3 | 0 | 0 | 3 | 0 | 0 |
| 证据复核 Case | 3 | - | - | - | 3 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 5 | 3 | 3 | 0 | 0 | 0 | completed | 3/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：三个 Case 的机器判定均由同路由评审完成：checks.json 中 judge.same_route_as_target=true、route 与被测相同（mimo-v2.6-flash/xiaomi-token-plan-cn），且 judge.tools 为空，results.jsonl 的观察也自述“同一路由自评，仅作研究辅助”。passed 结论依赖同一模型路线的自评，而非独立评审。
- 根因假设：评审 preset（evaluation-judge）复用被测路由且不带工具，属于评测设计选择，可能在边界 Case 上引入自评偏置（例如模型倾向认可自己的输出格式）。
- 支持 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M, U-LENGTH-MISSING；证据：[evidence/U-LENGTH-M-TO-CM/checks.json](evidence/U-LENGTH-M-TO-CM/checks.json)、[evidence/U-LENGTH-CM-TO-M/checks.json](evidence/U-LENGTH-CM-TO-M/checks.json)、[evidence/U-LENGTH-MISSING/checks.json](evidence/U-LENGTH-MISSING/checks.json)
- 反例 Case：无
- 替代解释：本次三个 Case 的判定可被原始 tools.jsonl 独立复核（工具参数、回执、isError 均可直接查验），因此当前结论正确性不依赖自评，仅评审独立性受限；response.json 中的 tool_names 实为工具清单而非调用记录，易被误读为调用证据，但判定实际引用的是 tools.jsonl。
- 证伪方法：用不同模型路由、带 tools.jsonl 读取能力的独立评审重跑三个 Case，比较 verdict 与观察是否一致；若一致则自评偏置假设被推翻。

#### 未分组 · evaluation_method

- 观察到的缺口：分支覆盖不完整：场景仅覆盖两个 happy-path 换算与一个缺单位澄清分支；AGENTS.md 行为规则第 3 条（出现米/厘米以外单位时明确说明不支持、不换算）以及工具对负值/非法枚举的拒绝语义在本场景没有任何 Case 触达，该能力为观察空白而非已验证通过。
- 根因假设：Case 目录只挑选了确定性可通过的路径（数值换算 ×2、澄清 ×1），未设计对抗性/边界输入，导致场景级评估无法证明 agent 在不支持单位输入下的行为符合声明。
- 支持 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M, U-LENGTH-MISSING；证据：[evidence/U-LENGTH-M-TO-CM/response.json](evidence/U-LENGTH-M-TO-CM/response.json)、[evidence/U-LENGTH-CM-TO-M/response.json](evidence/U-LENGTH-CM-TO-M/response.json)、[evidence/U-LENGTH-MISSING/response.json](evidence/U-LENGTH-MISSING/response.json)
- 反例 Case：U-LENGTH-MISSING
- 替代解释：也可能外部仅关心核心换算与澄清两条路径，未覆盖分支不构成缺陷，只是能力未知。
- 证伪方法：新增输入如“把 3 英尺换算成米”或“把 -2 米换算成厘米”的 Case，检查是否既不调用工具凭空换算、又给出中文不支持/错误说明且不输出成功 JSON；若行为正确则覆盖缺口补齐，若输出编造 JSON 则确认能力缺口。

#### 未分组 · harness_mechanism

- 观察到的缺口：convert-length 插件内置的最终输出强制校验 guard（agent/turn-stopping 纠正 steer、最多 2 次、纠正回合 tools.guard 禁止重放 convert_length）在本场景全部观测证据中从未触发：两个换算 Case 都是单 turn 首次即输出合法 JSON，澄清 Case 不进入成功分支校验路径。guard 的纠正与耗尽报错路径未被任何证据证实有效。
- 根因假设：被测模型在 happy path 上首过合规，guard 恒为无操作；guard 机制本身是否可用（事件订阅、steer 注入、重放拦截）在本场景属于未验证假设。
- 支持 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M, U-LENGTH-MISSING；证据：[evidence/U-LENGTH-M-TO-CM/tools.jsonl](evidence/U-LENGTH-M-TO-CM/tools.jsonl)、[evidence/U-LENGTH-M-TO-CM/response.json](evidence/U-LENGTH-M-TO-CM/response.json)、[evidence/U-LENGTH-CM-TO-M/tools.jsonl](evidence/U-LENGTH-CM-TO-M/tools.jsonl)、[evidence/U-LENGTH-MISSING/tools.jsonl](evidence/U-LENGTH-MISSING/tools.jsonl)
- 反例 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M
- 替代解释：可能 guard 确实工作，只是无需介入；也可能 guard 存在 bug 但因首过合规而从未暴露——两种解释在现有证据下不可区分。
- 证伪方法：构造模型在工具成功后输出非 JSON 或缺 explanation 的 Case（或注入模拟 session/event），检查 tools.jsonl/会话日志中是否出现 migration-output-validation 纠正消息、重放拦截与最终报错；出现则 guard 有效，无则 guard 机制失效。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-LENGTH-M-TO-CM` | 把 2.5 米换算成厘米。 | 必须实际调用 convert_length 工具（value=2.5, from='m', to='cm'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=250，unit="cm"，explanation 为非空说明。不接受心算或未调用工具的回答。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 显示确实发生了 convert_length 调用（call_5c18d3f0e0db47c68b824cbd，arguments 为 {"value":2.5,"from":"m","to":"cm"}），回执 isError=false 且返回 {"value":250,"unit":"cm"}；response.json 的最终答复是仅含合法 JSON 的单条消息，value=250、unit="cm"、explanation 非空，且与工具回执一致，未见心算替代痕迹，满足 expected_behavior 全部要求。 | [evidence/U-LENGTH-M-TO-CM](evidence/U-LENGTH-M-TO-CM) |
| `U-LENGTH-CM-TO-M` | 把 125 厘米换算成米。 | 必须实际调用 convert_length 工具（value=125, from='cm', to='m'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=1.25，unit="m"，explanation 为非空说明。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 显示调用参数为 {"value":125,"from":"cm","to":"m"}（call_19a98d9a50d44c23877d0da4），回执 isError=false 返回 {"value":1.25,"unit":"m"}；response.json 最终答复为纯合法 JSON，value=1.25、unit="m"、explanation 非空，与回执一致，满足 expected_behavior。 | [evidence/U-LENGTH-CM-TO-M](evidence/U-LENGTH-CM-TO-M) |
| `U-LENGTH-MISSING` | 把 2.5 换算一下。 | 输入只有数值 2.5、未给出任何单位：先给出原生澄清答复，用中文问句补问缺失单位（2.5 是米还是厘米，以及换算目标单位），待用户补充后再换算；本回合不调用 convert_length 凭空换算，不输出成功 JSON，不编造 value/unit/explanation。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 为 0 字节空文件（共 0 条事件），本回合确无任何工具调用；response.json 显示答复为纯中文澄清问句，同时补问了源单位（米或厘米）与目标单位，未输出任何 value/unit/explanation 成功 JSON、无编造数据，符合澄清分支预期。 | [evidence/U-LENGTH-MISSING](evidence/U-LENGTH-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
