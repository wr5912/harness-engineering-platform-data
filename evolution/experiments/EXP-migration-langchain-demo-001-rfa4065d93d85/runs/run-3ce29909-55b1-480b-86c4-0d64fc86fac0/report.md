# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-3ce29909-55b1-480b-86c4-0d64fc86fac0`
- Experiment：`EXP-migration-langchain-demo-001-rfa4065d93d85`
- Agent：`migration-langchain-demo`
- 状态：已完成
- 有效结论：通过
- 机器结论：无法判定
- 证据复核：`completed`
- 开始时间：`2026-10-30T07:52:04Z`
- 完成时间：`2026-10-30T07:55:43Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 3 | 0 | 0 | 2 | 0 | 1 |
| 证据复核 Case | 3 | - | - | - | 3 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 5 | 3 | 2 | 0 | 1 | 0 | completed | 3/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：U-LENGTH-CM-TO-M 的评审会话未产出合法 JSON（judge.unavailable_reason=judge-output-not-json，results.jsonl 记录 verdict=inconclusive「评审未产生有效结论」），导致工具调用与最终答复证据完全充分的 Case 被判为 inconclusive 而需人工复核。
- 根因假设：evaluation-judge preset 对评审输出没有 JSON 结构强制（checks.json 中该 Case 的 judge 无 same_route_as_target/preset 等字段、评审 session 无输出 schema 约束），同路由模型偶发输出非 JSON 文本即丢失结论。
- 支持 Case：U-LENGTH-CM-TO-M；证据：[evidence/U-LENGTH-CM-TO-M/checks.json](evidence/U-LENGTH-CM-TO-M/checks.json)、[evidence/U-LENGTH-M-TO-CM/checks.json](evidence/U-LENGTH-M-TO-CM/checks.json)、[evidence/U-LENGTH-MISSING/checks.json](evidence/U-LENGTH-MISSING/checks.json)
- 反例 Case：U-LENGTH-M-TO-CM, U-LENGTH-MISSING
- 替代解释：评审失败可能是一次性基础设施/网络抖动而非结构性缺陷；同路由同 preset 的另两次评审均产出有效结论（checks.json 中 judge 完整、results.jsonl verdict 为 passed），说明评审链路本身可用。
- 证伪方法：对同一 Case 重跑评审会话多次，统计 judge-output-not-json 出现频率；或为评审输出加 JSON schema 强制校验后重评，若仍稳定产生合法结论则推翻结构性假设。

#### 未分组 · evaluation_method

- 观察到的缺口：评审与被测走同一模型路由（checks.json 中 judge.same_route_as_target=true，均为 mimo-v2.6-flash / xiaomi-token-plan-cn），评审结论属于同路由自评（results.jsonl 亦自注「同一路由自评，仅作研究辅助」），存在自评偏置与共同盲区风险。
- 根因假设：评测配置未隔离评审模型，evaluation-judge 与被测 Agent 复用同一 route 配置，评审可能与被测犯同样的错误而无法发现。
- 支持 Case：U-LENGTH-M-TO-CM, U-LENGTH-MISSING；证据：[evidence/U-LENGTH-M-TO-CM/checks.json](evidence/U-LENGTH-M-TO-CM/checks.json)、[evidence/U-LENGTH-MISSING/checks.json](evidence/U-LENGTH-MISSING/checks.json)
- 反例 Case：无
- 替代解释：本场景任务为确定性单位换算且评审结论可被工具回执独立复核（本复核即通过原始 tools.jsonl/response.json 得出相同结论），自评偏置在本场景未实际造成误判。
- 证伪方法：用独立模型（不同 route）重评三个 Case，若结论与原始工具证据的独立复核完全一致，则本场景的自评偏置风险可降级。

#### 未分组 · evaluation_method

- 观察到的缺口：场景用例仅覆盖 m→cm、cm→m 成功分支与缺单位澄清分支，未覆盖 AGENTS.md 规则 3（不支持单位如英寸/毫米的拒绝分支）与 convert_length 工具失败分支；机器通过不能证明这些分支能力完备。
- 根因假设：用例集（inputs.lock.json evaluation_cases 仅 3 条）刻意或疏漏地只选了核心路径，分支覆盖未纳入本轮实验设计。
- 支持 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M, U-LENGTH-MISSING；证据：[evidence/U-LENGTH-M-TO-CM/response.json](evidence/U-LENGTH-M-TO-CM/response.json)、[evidence/U-LENGTH-CM-TO-M/response.json](evidence/U-LENGTH-CM-TO-M/response.json)、[evidence/U-LENGTH-MISSING/response.json](evidence/U-LENGTH-MISSING/response.json)
- 反例 Case：无
- 替代解释：本实验目标可能只是验证迁移后工具调用与输出结构的最小闭环，分支覆盖属于后续迭代范围。
- 证伪方法：新增用例「把 2.5 英寸换算成厘米」及工具注入失败用例，检查是否按规则 3/失败分支不输出成功 JSON、不编造数值；若通过则补齐该缺口。

#### 未分组 · harness_mechanism

- 观察到的缺口：三个 Case 的 checks.json 均显示 guard.declared=null、guard.status=not-declared，而实际的最终 JSON 结构强制由 managed 插件 convert-length.mjs 的 agent/turn-stopping 钩子（最多 2 次 steer 纠正）实现；评测登记层无法区分「模型自发合规输出 JSON」与「guard 纠偏后合规」。
- 根因假设：checks.json 的 guard 字段只登记 Harness 声明式 guard，不感知插件内嵌的 turn-stopping 输出校验，导致合规来源不可归因。
- 支持 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M, U-LENGTH-MISSING；证据：[evidence/U-LENGTH-M-TO-CM/checks.json](evidence/U-LENGTH-M-TO-CM/checks.json)、[evidence/U-LENGTH-M-TO-CM/tools.jsonl](evidence/U-LENGTH-M-TO-CM/tools.jsonl)、[evidence/U-LENGTH-CM-TO-M/checks.json](evidence/U-LENGTH-CM-TO-M/checks.json)、[evidence/U-LENGTH-MISSING/checks.json](evidence/U-LENGTH-MISSING/checks.json)
- 反例 Case：U-LENGTH-M-TO-CM
- 替代解释：本场景并未触发纠偏：三个 Case 的 response.json 均只有单条 assistant 文本且 JSON 一次合规，说明合规来自模型自发行为而非 guard 纠正，登记缺失未影响本轮结论。
- 证伪方法：导出完整 session trace 检查是否存在 guard 注入的「最终答复结构纠正」steer 消息；若全部 Case 均无纠正消息，则确认本轮合规为自发、登记缺失仅为可观测性问题。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-LENGTH-M-TO-CM` | 把 2.5 米换算成厘米。 | 必须实际调用 convert_length 工具（value=2.5, from='m', to='cm'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=250，unit="cm"，explanation 为非空说明。不接受心算或未调用工具的回答。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 记录了唯一一次 tool/call（name=convert_length，arguments={"value":2.5,"from":"m","to":"cm"}）及配对 tool/result（isError=false，content 为 {"value":250,"unit":"cm"}）；response.json 的 assistant_texts 为单条合法 JSON {"value":250,"unit":"cm","explanation":非空中文}，与工具返回完全一致，无其它文字、无心算替代痕迹。机器判定 passed 与证据一致。 | [evidence/U-LENGTH-M-TO-CM](evidence/U-LENGTH-M-TO-CM) |
| `U-LENGTH-CM-TO-M` | 把 125 厘米换算成米。 | 必须实际调用 convert_length 工具（value=125, from='cm', to='m'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=1.25，unit="m"，explanation 为非空说明。 | 已完成 | 无法判定 | 通过 | 是 | 机器 inconclusive 仅因 checks.json 中 judge.unavailable_reason=judge-output-not-json（评审未产出合法 JSON），并非被测行为不达标。原始证据完整可判：tools.jsonl 记录 tool/call（value=125, from=cm, to=m）与成功 tool/result（isError=false，{"value":1.25,"unit":"m"}）；response.json 为单条合法 JSON {"value":1.25,"unit":"m","explanation":非空中文}，与工具返回一致且无其它文字。全部 expected_behavior 条款满足，故修正为 passed。 | [evidence/U-LENGTH-CM-TO-M](evidence/U-LENGTH-CM-TO-M) |
| `U-LENGTH-MISSING` | 把 2.5 换算一下。 | 输入只有数值 2.5、未给出任何单位：先给出原生澄清答复，用中文问句补问缺失单位（2.5 是米还是厘米，以及换算目标单位），待用户补充后再换算；本回合不调用 convert_length 凭空换算，不输出成功 JSON，不编造 value/unit/explanation。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 为空文件（0 字节，哈希为 e3b0c44… 空内容哈希），证明本回合未调用 convert_length；response.json 为一句中文澄清问句，同时补问来源单位（2.5 是米还是厘米）与目标单位，未输出成功 JSON、未编造 value/unit/explanation。与 expected_behavior 完全一致，机器 passed 成立。 | [evidence/U-LENGTH-MISSING](evidence/U-LENGTH-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
