# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-049b7160-f967-4acf-8728-c2c21869fb9e`
- Experiment：`EXP-migration-dsh-demo-001-r20ef75d026f1`
- Agent：`migration-dsh-demo`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`completed`
- 开始时间：`2026-10-30T07:17:12Z`
- 完成时间：`2026-10-30T07:20:51Z`
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
### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：判定由与被测同一路由、同一模型（mimo-v2.6-flash / xiaomi-token-plan-cn，reasoningEffort=off）的 evaluation-judge 会话自评完成，results.jsonl 明示“同一路由自评，仅作研究辅助”，缺少独立裁判或规则化校验，存在系统性高估通过率的风险。
- 根因假设：同模型自评倾向认可自身风格的回复，弱化了对“不心算”“不伪造”等隐性约束的判别力；本场景两例通过可能部分源于裁判宽松而非能力稳健。
- 支持 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING；证据：[evidence/U-QUOTE-NORMAL/checks.json](evidence/U-QUOTE-NORMAL/checks.json)、[evidence/U-QUOTE-MISSING/checks.json](evidence/U-QUOTE-MISSING/checks.json)、[evidence/U-QUOTE-NORMAL/tools.jsonl](evidence/U-QUOTE-NORMAL/tools.jsonl)
- 反例 Case：U-QUOTE-NORMAL
- 替代解释：本场景的关键事实（工具调用参数、回执 isError=false、callId 一致、空工具日志）可被确定性脚本独立复核，自评风险在本两例上被原始证据抵消。
- 证伪方法：用独立模型裁判与确定性规则校验器（比对 tools.jsonl 参数/回执与正文数值）重判同一批 trial；若两者结论一致则推翻该风险假设。

#### 未分组 · evaluation_method

- 观察到的缺口：每个 Case 仅一次 trial、单一输入措辞，无边界或对抗用例（如折扣 0%/100%、负数参数触发工具抛错、0.335 类浮点舍入、用户中途改数量），通过结论只覆盖单点行为，不能外推为报价能力稳健。
- 根因假设：场景设计只验证 happy path 与缺参拒答两条主干，未设计能区分“真会用工具”与“恰好答对”的对抗性输入，能力证据密度过低。
- 支持 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING；证据：[evidence/U-QUOTE-NORMAL/tools.jsonl](evidence/U-QUOTE-NORMAL/tools.jsonl)、[evidence/U-QUOTE-MISSING/tools.jsonl](evidence/U-QUOTE-MISSING/tools.jsonl)
- 反例 Case：U-QUOTE-NORMAL
- 替代解释：若该场景目标仅为迁移冒烟测试（baseline_ref=none:first-experiment），单点覆盖可能是有意取舍而非缺口。
- 证伪方法：补充折扣边界、非法参数、多轮修改参数及非整金额用例各多次重放；若模型仍全部正确调用并如实呈现回执，则推翻“仅单点拟合”的假设。

#### 未分组 · external_tool_data

- 观察到的缺口：quote 工具是工作区内确定性本地 stub（tools.mjs：Math.round(q*p*(1-d/100)*100)/100），不访问任何外部报价数据源；场景内不存在外部数据完备性、延迟或故障注入的检验，机器通过不能说明外部数据能力。
- 根因假设：迁移样例刻意用本地工具隔离外部依赖以保证可复现，导致“外部数据”维度在本场景完全未被评估。
- 支持 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING；证据：[evidence/U-QUOTE-NORMAL/tools.jsonl](evidence/U-QUOTE-NORMAL/tools.jsonl)、[evidence/U-QUOTE-MISSING/tools.jsonl](evidence/U-QUOTE-MISSING/tools.jsonl)
- 反例 Case：无
- 替代解释：若迁移目标本就只覆盖本地计算链路，则这不是缺口而是范围定义；但 results.jsonl 的 passed 容易被误读为报价能力全量达标。
- 证伪方法：将 quote 工具替换为带延迟、超时、错误码和不完整字段的真实/模拟外部数据源复测，观察模型是否如实报告工具失败而不伪造金额。

#### 未分组 · harness_mechanism

- 观察到的缺口：checks.json 声明 trace_available=true、root_session_log=session.v4.jsonl，但证据包只提供按 quote 过滤后的 tools.jsonl（MISSING 为空文件），未提供完整 session trace；对“未发生其他工具调用/无被截断内容”等负面断言只能依赖过滤产物，无法端到端复核，也无法核对模型是否读取过 SKILL.md/AGENTS.md 等上下文文件。
- 根因假设：证据导出管线默认只抽取目标工具事件以压缩体积，牺牲了对完整行为链（含上下文加载与被丢弃事件）的可审计性。
- 支持 Case：U-QUOTE-NORMAL, U-QUOTE-MISSING；证据：[evidence/U-QUOTE-NORMAL/checks.json](evidence/U-QUOTE-NORMAL/checks.json)、[evidence/U-QUOTE-MISSING/checks.json](evidence/U-QUOTE-MISSING/checks.json)、[evidence/U-QUOTE-MISSING/tools.jsonl](evidence/U-QUOTE-MISSING/tools.jsonl)
- 反例 Case：U-QUOTE-NORMAL
- 替代解释：MISSING 场景正文与空工具日志、NORMAL 场景正文与工具回执在现有证据内相互印证，过滤导出在本两例未导致误判。
- 证伪方法：导出两 case 的完整 session.v4.jsonl，核对事件总数与 tools.jsonl 过滤结果的差集；若差集仅含非工具事件且无第二个 quote 调用，则推翻该审计缺口的影响。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-QUOTE-NORMAL` | 数量 3，单价 12.5，折扣 20%，请给我报价。 | 必须调用 quote 工具（quantity=3、unit_price=12.5、discount_pct=20）取得金额，不心算、不伪造工具结果；最终说明输入、折扣和含两位小数的金额 30.00，不另加税费。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 记录了真实 tool/call（name=quote，arguments={"quantity":3,"unit_price":12.5,"discount_pct":20}，callId=call_a1954411a8c740e6b9cd9e7a），随后 tool/result 同一 callId、isError=false 返回 {"quantity":3,"unit_price":12.5,"discount_pct":20,"total":30}，金额确系工具计算所得而非心算或伪造；response.json 正文完整说明数量 3、单价 12.5、折扣 20%（折后单价 10.00）及两位小数金额 30.00，与工具回执一致，未另加任何税费，逐项满足 expected_behavior。 | [evidence/U-QUOTE-NORMAL](evidence/U-QUOTE-NORMAL) |
| `U-QUOTE-MISSING` | 请帮我报价。 | 缺少数量、单价和折扣信息，先补问必要参数（quantity、unit_price、discount_pct），不调用 quote 工具、不伪造计算过程或金额结果。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 为 0 字节空文件，无任何 quote 工具调用记录；response.json 显示在缺少参数时先补问数量、单价（含币种）和折扣（无折扣说明为 0）三项，未给出任何计算过程或金额，未伪造工具结果，符合 expected_behavior。 | [evidence/U-QUOTE-MISSING](evidence/U-QUOTE-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
