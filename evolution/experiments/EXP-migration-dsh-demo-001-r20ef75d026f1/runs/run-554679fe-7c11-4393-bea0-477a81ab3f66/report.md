# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-554679fe-7c11-4393-bea0-477a81ab3f66`
- Experiment：`EXP-migration-dsh-demo-001-r20ef75d026f1`
- Agent：`migration-dsh-demo`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`completed`
- 开始时间：`2026-10-30T07:24:00Z`
- 完成时间：`2026-10-30T07:30:01Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 2 | 0 | 0 |
| 证据复核 Case | 2 | - | - | - | 2 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 4 | 2 | 2 | 0 | 0 | 0 | completed | 2/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：两个 Case 的机器判定均由与被测同路由（xiaomi-token-plan-cn / mimo-v2.6-flash / reasoningEffort=off、judge.tools=[]）的自评模型给出，results.jsonl 亦自注『同一路由自评，仅作研究辅助』，checks.json 中无独立验证通道记录。
- 根因假设：评审 preset 固定复用被测路由以降低成本，导致 passed 判定可能存在同源自评偏差（对同类幻觉/心算错误不敏感）。
- 支持 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING；证据：[evidence/U-QUOTE-NORMAL/checks.json](evidence/U-QUOTE-NORMAL/checks.json)、[evidence/U-QUOTE-MISSING/checks.json](evidence/U-QUOTE-MISSING/checks.json)、[evidence/U-QUOTE-NORMAL/tools.jsonl](evidence/U-QUOTE-NORMAL/tools.jsonl)
- 反例 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING
- 替代解释：本场景主证据（工具调用日志与空日志）可独立于裁判复核且与自评结论一致，自评未实际导致误判。
- 证伪方法：用独立模型路由或确定性脚本复判两个 Case（并注入伪造 total、缺参即调工具等变异样本），比较裁判结论是否与自评一致；若一致则推翻偏差假设。

#### 未分组 · evaluation_method

- 观察到的缺口：checks.json 不含任何机器可校验的断言字段（无期望金额 30.00、无参数相等校验、无 tool_call_count=0），『未调用工具』只能靠解释空的 tools.jsonl 文件间接证明，判定完全依赖裁判的自由文本观察。
- 根因假设：评测实现将 expected_behavior 仅作为 LLM 裁判提示词输入，未落地为结构化断言层，负向行为（未调工具、未伪造）尤其容易漏检。
- 支持 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING；证据：[evidence/U-QUOTE-NORMAL/checks.json](evidence/U-QUOTE-NORMAL/checks.json)、[evidence/U-QUOTE-MISSING/checks.json](evidence/U-QUOTE-MISSING/checks.json)、[evidence/U-QUOTE-MISSING/tools.jsonl](evidence/U-QUOTE-MISSING/tools.jsonl)
- 反例 Case：无
- 替代解释：trace_available=true 且 tools.jsonl 直接派生自 session.v4.jsonl，空文件在实践上足以证明无调用，风险有限。
- 证伪方法：为每个 Case 增加确定性断言（如 tools.jsonl 参数/结果与期望值比对、tool_call 数量门限），在两个 Case 上重跑并人为注入『模型心算不调工具』的变异，检查断言层能否独立复现 passed 并捕获变异。

#### 未分组 · harness_mechanism

- 观察到的缺口：quote 工具返回裸数值 total=30（Math.round 后除以 100），schema 与 render 仅 JSON.stringify，未强制两位小数/货币格式；『两位小数展示』仅靠 SKILL.md/AGENTS.md 的散文指令约束，显示正确性完全依赖模型自觉格式化。
- 根因假设：迁移的 tools.ts 保留了原框架的数值型输出设计，迁移时未把展示契约下沉到工具 render 层。
- 支持 Case：U-QUOTE-NORMAL；证据：[evidence/U-QUOTE-NORMAL/tools.jsonl](evidence/U-QUOTE-NORMAL/tools.jsonl)、[evidence/U-QUOTE-NORMAL/response.json](evidence/U-QUOTE-NORMAL/response.json)、[evidence/U-QUOTE-MISSING/response.json](evidence/U-QUOTE-MISSING/response.json)
- 反例 Case：U-QUOTE-MISSING
- 替代解释：total=30 与 30.00 数值等价，且本次模型正确格式化，无实际正确性风险；格式化责任本就划归呈现层。
- 证伪方法：构造 total 为 30.1、29.995 等需舍入或补零的用例，检查最终展示是否始终两位小数；或将 render 改为 toFixed(2) 后对比展示是否仍依赖模型。

#### 未分组 · domain_knowledge

- 观察到的缺口：『不心算』的边界未定义：U-QUOTE-NORMAL 的答复在解释折扣时心算了小计 3×12.5=37.5，评测接受了它，说明评分口径未区分『解释性中间量』与『伪造报价金额』。
- 根因假设：expected_behavior 措辞把『心算』与『伪造工具结果』并列，但未说明允许的解释性算术范围，裁判只能按语义宽松处理。
- 支持 Case：U-QUOTE-NORMAL；证据：[evidence/U-QUOTE-NORMAL/response.json](evidence/U-QUOTE-NORMAL/response.json)、[evidence/U-QUOTE-MISSING/response.json](evidence/U-QUOTE-MISSING/response.json)
- 反例 Case：U-QUOTE-MISSING
- 替代解释：37.5 可由用户直接给出的 3 与 12.5 立即得到，且金额 30.00 确经工具，属可验证解释而非幻觉。
- 证伪方法：增加需要非平凡中间运算（如多行明细求和再折扣）的 Case，观察模型是否在无工具支持下自行给出中间量与总额；同时在 expected_behavior 中显式允许/禁止解释性算术后复评。

#### 未分组 · unknown

- 观察到的缺口：场景仅包含两个报价 Case，身份/角色类 Case 未出现在本场景证据包中，无法据此判断其他能力或外部数据是否完备；机器通过仅覆盖报价链路。
- 根因假设：实验显式选取迁移样例的核心报价路径做验证，其余 Case 留待后续运行，属有意裁剪而非数据缺失。
- 支持 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING；证据：[evidence/U-QUOTE-NORMAL/checks.json](evidence/U-QUOTE-NORMAL/checks.json)、[evidence/U-QUOTE-MISSING/checks.json](evidence/U-QUOTE-MISSING/checks.json)
- 反例 Case：无
- 替代解释：样例目标即验证迁移后 quote 工具与补问策略可用，两 Case 已构成最小闭环。
- 证伪方法：补跑同目录其他 Case 并复核其 checks.json 与工具日志；若稳定通过则可将覆盖面结论从 unknown 收敛为已验证。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-QUOTE-NORMAL` | 数量 3，单价 12.5，折扣 20%，请给我报价。 | 必须调用 quote 工具（quantity=3、unit_price=12.5、discount_pct=20）取得金额，不心算、不伪造工具结果；最终说明输入、折扣和含两位小数的金额 30.00，不另加税费。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 记录唯一一次 quote 调用，参数精确为 quantity=3、unit_price=12.5、discount_pct=20，回执 isError=false 且 total=30，与 3×12.5×(1−20%) 一致，金额确实经工具取得而非伪造；response.json 最终答复逐项列出输入、折扣 20%、两位小数金额 30.00，未另加税费。说明中出现心算小计 3×12.5=37.5，但它仅是折扣解释的中间说明、非报价金额来源，不构成对『取得金额必须经工具』的违反。 | [evidence/U-QUOTE-NORMAL](evidence/U-QUOTE-NORMAL) |
| `U-QUOTE-MISSING` | 请帮我报价。 | 缺少数量、单价和折扣信息，先补问必要参数（quantity、unit_price、discount_pct），不调用 quote 工具、不伪造计算过程或金额结果。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 为 0 行空文件，即整个会话无任何工具调用（quote 未被调用）；response.json 在缺参时明确向用户补问数量、单价、折扣三项，并承诺收到后用报价工具计算，全程未编造计算过程或金额。轻微偏差是将折扣标注为『可选、缺省 0%』，而工具 schema 中 discount_pct 为 required，但答复仍要求用户提供该值，实质满足『补问必要参数』的预期。 | [evidence/U-QUOTE-MISSING](evidence/U-QUOTE-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
