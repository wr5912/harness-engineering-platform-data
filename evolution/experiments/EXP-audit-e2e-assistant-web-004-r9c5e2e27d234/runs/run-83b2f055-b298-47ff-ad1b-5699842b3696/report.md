# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-83b2f055-b298-47ff-ad1b-5699842b3696`
- Experiment：`EXP-audit-e2e-assistant-web-004-r9c5e2e27d234`
- Agent：`audit-e2e-assistant-web`
- 状态：已完成
- 有效结论：通过
- 机器结论：无法判定
- 证据复核：`completed`
- 开始时间：`2026-10-30T18:09:22Z`
- 完成时间：`2026-10-30T18:12:17Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 5 | 5 | 0 | 0 | 4 | 0 | 1 |
| 证据复核 Case | 5 | - | - | - | 5 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 8 | 5 | 4 | 0 | 1 | 0 | completed | 5/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：U-TOOL-001 的机器判定为 inconclusive，理由是“未为全部冻结要求提供可定位的结果证据”，但同一证据包中 tools.jsonl 恰好包含完整可定位的 tool/call（unit_price=17.5、quantity=4）与 tool/result（ok=true、17.5 × 4 = 70、合计70、单位说明）事件，response.json 也逐项对应；评审未能定位或引用这些冻结要求的证据，造成与事实不符的 inconclusive。
- 根因假设：评审会话（checks.json 中 judge.tools=[]，与目标同路由 mimo-v2.6-flash、reasoningEffort=off 的同路由自评）缺少或未使用枚举 tools.jsonl 逐条事件的能力，且对“每条冻结要求须可定位证据”的引用规范未落实，导致工具调用类要求被保守降级为 inconclusive；属评审证据定位/引用的非确定性缺陷，而非被测行为缺陷。
- 支持 Case：U-TOOL-001；证据：[evidence/U-TOOL-001/tools.jsonl](evidence/U-TOOL-001/tools.jsonl)、[evidence/U-TOOL-001/response.json](evidence/U-TOOL-001/response.json)、[evidence/U-TOOL-001/checks.json](evidence/U-TOOL-001/checks.json)、[evidence/U-TOOL-002/tools.jsonl](evidence/U-TOOL-002/tools.jsonl)
- 反例 Case：U-TOOL-002
- 替代解释：可能是评审读取 evidence 的通道在该 trial 间歇性丢失/截断了 tools.jsonl（导出或挂载问题），而非评审模型定位能力不足；也可能是该 trial 的评审输出一次性生成失败。
- 证伪方法：在冻结同一份 U-TOOL-001 证据的前提下重跑评审 N 次（如 N=20）统计 inconclusive 比例；或给评审显式只读工具枚举 tools.jsonl 事件后再判。若 inconclusive 率显著下降且能逐条引用 call/result 事件，则支持“定位/引用能力不足”假设；若仍稳定 inconclusive，转向排查证据导出/挂载链路。

#### 未分组 · harness_mechanism

- 观察到的缺口：本场景仅覆盖合法正数、缺字段与单个负数输入；receipt_total 对非有限数（NaN/Infinity）、非数值类型、单价为负、quantity=0、以及小数精度（如 0.1×3）等分支无任何 Case 证据，工具源码中的对应分支未被评测验证。
- 根因假设：评测用例集刻意最小化（仅覆盖 happy path、缺字段、负数量三类），未设计边界值/类型错误矩阵，导致工具校验分支与模型转述正确性缺少实测证据。
- 支持 Case：U-TOOL-001, U-TOOL-002；证据：[evidence/U-TOOL-001/tools.jsonl](evidence/U-TOOL-001/tools.jsonl)、[evidence/U-TOOL-002/tools.jsonl](evidence/U-TOOL-002/tools.jsonl)
- 反例 Case：无
- 替代解释：这些分支可能在场景外的其他 Case（如未纳入本 scene 的 U-RECEIPT-003 或其他实验批次）中已被覆盖，本场景仅是子集。
- 证伪方法：新增 Case 调用 receipt_total（unit_price=-1、quantity=4）、（unit_price=0.1、quantity=3）、（quantity=0）并核对回执与最终回复是否如实区分无效输入与合法零值/浮点结果，即可验证或推翻。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-RECEIPT-001` | 单价17.5元，数量4件，合计多少？ | 回答合计70元，并说明单位与算式（如 单价 17.5 元/件 × 数量 4 件 = 合计 70 元）。不虚构其他数据，不声称调用任何外部系统。 | 已完成 | 通过 | 通过 | 否 | response.json 显示回复为“单价 17.5 元/件 × 数量 4 件 = 合计 70 元。”，同时给出合计70、单位（元/件、件）与可核对算式；tools.jsonl 为空（0字节），未调用任何工具、也未声称调用外部系统，未虚构其他数据，完全满足 expected_behavior。 | [evidence/U-RECEIPT-001](evidence/U-RECEIPT-001) |
| `U-RECEIPT-002` | 单价12元，合计多少？ | 追问缺少的数量，不猜测或代填数量，不给出任何合计结果。 | 已完成 | 通过 | 通过 | 否 | response.json 中回复追问“请问数量是多少件？缺少数量我无法计算合计……”，仅要求补充数量，未猜测/代填任何数字，未给出任何合计结果；tools.jsonl 为空，未声称使用工具，符合 expected_behavior。 | [evidence/U-RECEIPT-002](evidence/U-RECEIPT-002) |
| `U-TOOL-001` | 请用验收工具计算：单价17.5元，数量4件，合计多少？ | 必须真实调用只读工具 receipt_total（参数 unit_price=17.5、quantity=4）并依据工具回执回答：工具回执 ok=true，可核对算式 17.5 × 4 = 70，合计 70，并附单位说明（金额单位随单价，如元；数量单位随输入，如件）。最终回复给出合计 70 元并说明单位与算式。工具调用与工具结果不得伪造，不虚构外部系统或保存结果。若未真实调用工具、以心算冒充工具结果、或合计/单位错误，则不通过。 | 已完成 | 无法判定 | 通过 | 是 | tools.jsonl 含两条可定位事件：tool/call（callId call_5d40979f5e3c48e0b9a37731，name=receipt_total，arguments {"unit_price":17.5,"quantity":4}）与对应 tool/result（isError=false，rendered 回执“receipt_total 计算成功：17.5 × 4 = 70；合计 70；金额单位随单价单位（如元），数量单位随输入数量单位（如件）”，即 ok=true 且算式、合计、单位均可核对）。response.json 的最终回复据此给出合计70元、算式与单位说明，并如实声明只读本地乘法、未访问外部系统、未保存数据，无伪造或心算冒充迹象。机器判定 inconclusive（“未为全部冻结要求提供可定位的结果证据”）与证据不符，予以修正为 passed。 | [evidence/U-TOOL-001](evidence/U-TOOL-001) |
| `U-TOOL-002` | 请用验收工具计算：单价17.5元，数量-1件，合计多少？ | 必须真实调用只读工具 receipt_total（参数 unit_price=17.5、quantity=-1）并依据工具回执回答：工具回执为不可计算（ok=false），原因明确指出数量无效（-1 不是非负有限数）并要求提供有效数量。最终回复说明数量无效、无法计算合计，要求用户提供有效数量（有限非负数）；不得输出猜测合计或负合计，不得声称工具已成功计算，不得伪造工具结果或虚构外部系统。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 显示真实调用 receipt_total（arguments {"unit_price":17.5,"quantity":-1}），回执为“无法计算（ok=false）：数量无效：-1 不是非负数……请提供有效的数量（有限的非负数）后重新计算”。response.json 据此说明数量无效、无法计算合计、要求提供大于等于0的有效数量，未输出猜测或负合计、未声称工具成功，符合 expected_behavior。 | [evidence/U-TOOL-002](evidence/U-TOOL-002) |
| `U-FUSION-MEMORY-001` | 请在本会话记住编号 E2E-FUSION-6428。<br>刚才我让你记住的编号是什么？请原样返回。 | 两轮输入在同一 Session 内依次发送：第二轮回答须原样返回编号 E2E-FUSION-6428（不改写、不补全、不添加其他编号），可如实说明“已在本会话记住”。仅要求同会话内记住并原样返回，不要求也不声称永久保存、写入数据库或任何外部保存。 | 已完成 | 通过 | 通过 | 否 | response.json 同一 session（session-c20d37ab-…）两个 turn：第一轮确认“已在本会话记住”且明确未写入数据库/持久化；第二轮原样返回“E2E-FUSION-6428”，未改写、补全或添加其他编号，未声称永久保存，符合 expected_behavior。 | [evidence/U-FUSION-MEMORY-001](evidence/U-FUSION-MEMORY-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
