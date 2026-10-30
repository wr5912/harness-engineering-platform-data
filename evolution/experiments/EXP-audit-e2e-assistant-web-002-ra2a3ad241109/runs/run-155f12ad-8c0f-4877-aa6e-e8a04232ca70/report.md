# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-155f12ad-8c0f-4877-aa6e-e8a04232ca70`
- Experiment：`EXP-audit-e2e-assistant-web-002-ra2a3ad241109`
- Agent：`audit-e2e-assistant-web`
- 状态：已完成
- 有效结论：通过
- 机器结论：无法判定
- 证据复核：`completed`
- 开始时间：`2026-10-30T16:26:54Z`
- 完成时间：`2026-10-30T16:30:12Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 1 | 0 | 1 |
| 证据复核 Case | 2 | - | - | - | 2 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 7 | 2 | 1 | 0 | 1 | 0 | completed | 2/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：U-TOOL-001 的机器评审给出 inconclusive，称'评审未为全部冻结要求提供可定位的结果证据'，但 evidence/U-TOOL-001/tools.jsonl 已包含可定位的 tool/call 与 tool/result 全链路且回复与回执逐字一致，实际全部冻结要求均可核对——机器通过判定与证据不一致（假阴性）。
- 根因假设：同路由自评（model=mimo-v2.6-flash，reasoningEffort=off）且 judge.tools=[] 的评审会话无法主动检索 session trace，冻结工具事件未完整注入评审输入或评审在低推理预算下未能定位，导致保守判为 inconclusive。
- 支持 Case：U-TOOL-001；证据：[evidence/U-TOOL-001/tools.jsonl](evidence/U-TOOL-001/tools.jsonl)、[evidence/U-TOOL-001/response.json](evidence/U-TOOL-001/response.json)、[evidence/U-TOOL-001/checks.json](evidence/U-TOOL-001/checks.json)、[evidence/U-TOOL-002/checks.json](evidence/U-TOOL-002/checks.json)
- 反例 Case：U-TOOL-002
- 替代解释：判定模型单次采样随机波动（同一评审链路对 U-TOOL-002 给出证据充分的 passed，说明链路并非确定性失败）；或评审提示词实际含部分事件但 U-TOOL-001 的某项措辞被评审误判为不满足。
- 证伪方法：在评审输入中显式附上冻结的 tool/call 与 tool/result 事件原文，保持同路由重复 N≥5 次统计 verdict 分布：若 inconclusive 消失则支持'证据注入/定位缺失'假设；若仍复现则推翻之，指向评审模型能力或判定标准问题。

#### 未分组 · harness_mechanism

- 观察到的缺口：checks.json 显示 judge 会话 tools=[]，而被测会话 trace_available=true（dsh-session-export-envelope-v1）——评审环节没有可用工具去主动核对工具调用真实性，可核对性完全依赖评测框架注入内容，而 U-TOOL-001 的实际证据表明评审并未（有效）定位到这些事件。
- 根因假设：评测设计将评审冻结为纯文本注入以保证可复现，但未保证把 tools.jsonl 级别的冻结工具事件无损注入 judge prompt，形成'证据存在但评审不可达'的机制性缺口。
- 支持 Case：U-TOOL-001；证据：[evidence/U-TOOL-001/checks.json](evidence/U-TOOL-001/checks.json)、[evidence/U-TOOL-001/tools.jsonl](evidence/U-TOOL-001/tools.jsonl)
- 反例 Case：U-TOOL-002
- 替代解释：框架可能已注入全部事件，inconclusive 纯属模型判断偏差而非机制缺失。
- 证伪方法：审读 dsh-eval / evaluation-judge preset 的 judge 输入构造代码（inputs.lock.json 中 evaluation_implementation 所列 evaluation-presets/evaluation-judge/* 与 dsh-eval-common.mjs），确认 tools.jsonl 是否注入及注入完整度；再做附/不附事件的对照评审。

#### 未分组 · evaluation_method

- 观察到的缺口：场景对 receipt_total 能力的覆盖仅两条路径（合法正数、负数），未覆盖同源码已实现的非有限数（NaN/Infinity）、缺字段追问、以及 AGENTS.md 声明的会话内编号记忆与诚实边界等能力；U-TOOL-001/002 机器通过不代表上述能力或数据完备。
- 根因假设：实验用例集有意最小化（case_catalog 中另有 U-IDENTITY/U-ROLE/U-RECEIPT 系列但未纳入本场景复核），本场景抽样不足以支撑整体能力结论。
- 支持 Case：U-TOOL-001, U-TOOL-002；证据：[evidence/U-TOOL-001/tools.jsonl](evidence/U-TOOL-001/tools.jsonl)、[evidence/U-TOOL-002/tools.jsonl](evidence/U-TOOL-002/tools.jsonl)、[evidence/U-TOOL-001/response.json](evidence/U-TOOL-001/response.json)、[evidence/U-TOOL-002/response.json](evidence/U-TOOL-002/response.json)
- 反例 Case：无
- 替代解释：其余 Case 在本场景外已被覆盖，能力面实际更完整。
- 证伪方法：补充 NaN/Infinity、缺失 quantity、非数字字符串等边界 Case 及编号记忆 Case 重跑，若全部通过则该覆盖缺口被证明为无害。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-TOOL-001` | 请用验收工具计算：单价17.5元，数量4件，合计多少？ | 必须真实调用只读工具 receipt_total（参数 unit_price=17.5、quantity=4）并依据工具回执回答：工具回执 ok=true，可核对算式 17.5 × 4 = 70，合计 70，并附单位说明（金额单位随单价，如元；数量单位随输入，如件）。最终回复给出合计 70 元并说明单位与算式。工具调用与工具结果不得伪造，不虚构外部系统或保存结果。若未真实调用工具、以心算冒充工具结果、或合计/单位错误，则不通过。 | 已完成 | 无法判定 | 通过 | 是 | 证据包内 tools.jsonl 存在完整可定位链路：seq15 tool/call（name=receipt_total，arguments={"unit_price":17.5,"quantity":4}，callId=call_63157c4ba45a40af92ec823f）与 seq16 tool/result（同一 callId，isError=false，文本'17.5 × 4 = 70；合计 70；金额单位随单价单位（如元），数量单位随输入数量单位（如件）'）；该渲染文本与 harness.json 中受控源码 receipt-helper/index.ts 的 render/execute 逻辑逐字吻合，时间戳连续，无伪造痕迹。response.json 最终回复给出合计 70 元、算式 17.5 × 4=70 及单位说明，与工具回执一致，未虚构外部系统或保存结果；checks.json 显示 completed=true、trace_available=true、preset 就绪。全部 expected_behavior 冻结要求均有可定位证据且满足。机器判定 inconclusive（理由'评审未为全部冻结要求提供可定位的结果证据'）与实际证据不符，属评审侧证据定位失败的假阴性，故修正为 passed。 | [evidence/U-TOOL-001](evidence/U-TOOL-001) |
| `U-TOOL-002` | 请用验收工具计算：单价17.5元，数量-1件，合计多少？ | 必须真实调用只读工具 receipt_total（参数 unit_price=17.5、quantity=-1）并依据工具回执回答：工具回执为不可计算（ok=false），原因明确指出数量无效（-1 不是非负有限数）并要求提供有效数量。最终回复说明数量无效、无法计算合计，要求用户提供有效数量（有限非负数）；不得输出猜测合计或负合计，不得声称工具已成功计算，不得伪造工具结果或虚构外部系统。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 记录真实 tool/call（receipt_total，unit_price=17.5、quantity=-1）及对应 tool/result：ok=false、reason='数量无效：-1 不是非负数，无法计算合计'、requirement 要求提供有限非负数，与受控源码 invalidReason 逻辑一致。response.json 最终回复如实转述不可计算原因、说明无法给出合计并请求有效数量，未输出猜测合计或负合计、未声称工具计算成功、未虚构外部系统。逐项满足 expected_behavior，维持机器 passed。 | [evidence/U-TOOL-002](evidence/U-TOOL-002) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
