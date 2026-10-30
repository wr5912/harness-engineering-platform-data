# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-2e105c05-0bf6-4d43-ac5c-92caeb41287a`
- Experiment：`EXP-migration-langchain-demo-001-rfa4065d93d85`
- Agent：`migration-langchain-demo`
- 状态：已完成
- 有效结论：通过
- 机器结论：无法判定
- 证据复核：`completed`
- 开始时间：`2026-10-30T07:09:37Z`
- 完成时间：`2026-10-30T07:13:21Z`
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
### 缺口与归因

#### 未分组 · harness_mechanism

- 观察到的缺口：U-LENGTH-MSSING 类澄清分支 Case 的机器判定停在 inconclusive：checks.json 记录 judge.unavailable_reason="judge-output-not-json"（评审会话 session-73b17f37… 未产出合法 JSON 判定），results.jsonl 记为“评审未产生有效结论”；而该 Case 的行为证据本可完全确定性地机械判定（tools.jsonl 为空且回复为澄清问句即通过），Harness 却缺少此类兜底规则，导致可定级 Case 未自动定级。
- 根因假设：evaluation-judge（mimo-v2.6-flash，reasoningEffort=off）偶发输出非 JSON 判定文本；同时场景判定管线对“澄清/不换算”分支没有确定性规则（tools.jsonl 无 tool/call 且最终答复非成功 JSON → passed），过度依赖 LLM judge。
- 支持 Case：U-LENGTH-MISSING；证据：[evidence/U-LENGTH-MISSING/checks.json](evidence/U-LENGTH-MISSING/checks.json)、[evidence/U-LENGTH-MISSING/response.json](evidence/U-LENGTH-MISSING/response.json)、[evidence/U-LENGTH-M-TO-CM/checks.json](evidence/U-LENGTH-M-TO-CM/checks.json)、[evidence/U-LENGTH-CM-TO-M/checks.json](evidence/U-LENGTH-CM-TO-M/checks.json)
- 反例 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M
- 替代解释：可能只是该 judge 会话单次偶发失败（超时、截断或采样随机性），而非 judge 系统性不输出 JSON——同路由同 preset 的另两个 Case 均产出了合法 JSON verdict。
- 证伪方法：对同一 checks/response 证据重复运行 judge N 次统计非 JSON 率；同时加入确定性兜底规则（空 tools.jsonl + 非 JSON 回复 → passed）与 LLM judge 结果对比，若兜底规则与人工复核一致则推翻“必须依赖 judge”的假设。

#### 未分组 · harness_mechanism

- 观察到的缺口：评审与被测使用同一路由自评：results.jsonl 的 observation 明示“同一路由自评，仅作研究辅助”，checks.json 中 judge.route 与被测 session 路由同为 mimo-v2.6-flash/xiaomi-token-plan-cn。语义判定缺乏独立评审器，存在自评偏好或同盲区风险。
- 根因假设：评测管线为省资源复用被测路由做 judge，可能对风格相近的回答更宽松，或与被测共享同一理解盲区（如对澄清分支格式的误判）。
- 支持 Case：U-LENGTH-MISSING；证据：[evidence/U-LENGTH-MISSING/checks.json](evidence/U-LENGTH-MISSING/checks.json)、[evidence/U-LENGTH-M-TO-CM/tools.jsonl](evidence/U-LENGTH-M-TO-CM/tools.jsonl)、[evidence/U-LENGTH-CM-TO-M/tools.jsonl](evidence/U-LENGTH-CM-TO-M/tools.jsonl)
- 反例 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M
- 替代解释：本场景两个 passed Case 有完整确定性工具日志（tool/call 参数与 tool/result 返回值逐字可验），自评结论已被原始证据独立背书，自评偏好在本场景未实际造成误判。
- 证伪方法：用不同家族模型或纯规则引擎复判全部 Case，比较 verdict 一致率；若一致率高且确定性证据吻合，则推翻自评偏好风险在本场景的实质影响。

#### 未分组 · evaluation_method

- 观察到的缺口：场景覆盖不完整且无重复采样：每个 Case 仅 1 trial；AGENTS.md 规则 3（出现米/厘米以外单位时明确说明不支持且不换算）、同单位换算（from==to）等错误/边界分支在本场景没有任何 Case 覆盖；inputs.lock.json 的 case_catalog 中 U-IDENTITY-001、U-ROLE-001 亦未纳入本场景复核。机器通过不等于全分支能力完备。
- 根因假设：场景只抽取了两个正例换算与一个缺单位澄清分支，错误分支（不支持单位）与重复试验缺失是场景设计的覆盖缺口，而非被测已证明能在这些分支正确行为。
- 支持 Case：U-LENGTH-M-TO-CM, U-LENGTH-CM-TO-M, U-LENGTH-MISSING；证据：[evidence/U-LENGTH-M-TO-CM/response.json](evidence/U-LENGTH-M-TO-CM/response.json)、[evidence/U-LENGTH-CM-TO-M/response.json](evidence/U-LENGTH-CM-TO-M/response.json)、[evidence/U-LENGTH-MISSING/response.json](evidence/U-LENGTH-MISSING/response.json)
- 反例 Case：无
- 替代解释：其余分支可能在同 Run 的其它场景或后续 trial 中被覆盖；本场景命名“未分组”也提示它只是样例集的一部分。
- 证伪方法：新增 Case（如“把 2.5 英尺换算成米”“把 2.5 米换算成 2.5 米”）并对每个 Case 重复 ≥5 trial，若全部稳定满足 AGENTS.md 规则 3 与同单位语义，则推翻覆盖缺口对能力结论的限制。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-LENGTH-M-TO-CM` | 把 2.5 米换算成厘米。 | 必须实际调用 convert_length 工具（value=2.5, from='m', to='cm'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=250，unit="cm"，explanation 为非空说明。不接受心算或未调用工具的回答。 | 已完成 | 通过 | 通过 | 否 | 独立复核原始证据：tools.jsonl 记录 tool/call 事件 name=convert_length、arguments={"value":2.5,"from":"m","to":"cm"}（call_cd5f6c2a07944dd2b7ba9614），对应 tool/result 的 isError=false 且返回 {"value":250,"unit":"cm"}，与最终答复采用的数值完全一致；response.json 的 assistant_texts 为单个合法 JSON 对象 {"value":250,"unit":"cm","explanation":"已调用 convert_length 工具将 2.5 米换算为厘米…"}，explanation 非空且无任何多余文字。expected_behavior 三项（实际调用、采用工具结果、纯 JSON 输出）均被确定性证据证实，机器 passed 正确。 | [evidence/U-LENGTH-M-TO-CM](evidence/U-LENGTH-M-TO-CM) |
| `U-LENGTH-CM-TO-M` | 把 125 厘米换算成米。 | 必须实际调用 convert_length 工具（value=125, from='cm', to='m'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=1.25，unit="m"，explanation 为非空说明。 | 已完成 | 通过 | 通过 | 否 | 独立复核原始证据：tools.jsonl 记录 tool/call 事件 name=convert_length、arguments={"value":125,"from":"cm","to":"m"}（call_1f0cf377fe7a40228f3c35f5），tool/result 的 isError=false 且返回 {"value":1.25,"unit":"m"}；response.json 的 assistant_texts 为单个合法 JSON {"value":1.25,"unit":"m","explanation":"已通过 convert_length 工具将 125 厘米换算为米…"}，无多余文字。三项要求均被确定性证据证实，机器 passed 正确。 | [evidence/U-LENGTH-CM-TO-M](evidence/U-LENGTH-CM-TO-M) |
| `U-LENGTH-MISSING` | 把 2.5 换算一下。 | 输入只有数值 2.5、未给出任何单位：先给出原生澄清答复，用中文问句补问缺失单位（2.5 是米还是厘米，以及换算目标单位），待用户补充后再换算；本回合不调用 convert_length 凭空换算，不输出成功 JSON，不编造 value/unit/explanation。 | 已完成 | 无法判定 | 通过 | 是 | 修正机器 inconclusive。确定性证据显示被测行为完全满足 expected_behavior：tools.jsonl 为 0 字节空文件（sha256 为 E3B0C442… 空摘要），即本回合无任何工具调用；response.json 的 assistant_texts 为中文澄清问句“2.5 缺少单位信息，请问 2.5 是米还是厘米？您想换算成哪种单位？”，同时补问了来源单位与目标单位，非 JSON、未编造 value/unit/explanation。机器 inconclusive 源自评审器失败（checks.json 中 judge.unavailable_reason="judge-output-not-json"，results.jsonl 观察为“评审未产生有效结论，需人工判定”），属评估侧缺口而非被测能力缺口，故依据原始证据改判 passed。 | [evidence/U-LENGTH-MISSING](evidence/U-LENGTH-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
