# Decision（首次保存 2026-10-30，outcome=inconclusive）

## 结论
本次真实证据仅覆盖两个单轮计算 Case；会话内收据编号记忆（U-RECEIPT-003）等验收目标尚未验证，业务证据不足，不作 adopt，记 inconclusive。Experiment 保持 active，验收继续。

## 已验证（真实证据）
- research/validate：valid=true，无 errors/warnings。
- 真实 api 评测：Job d78602ac-f39f-4d15-9592-dea8dbcd4ef7 → Run run-6c8e03aa-bf4b-4c90-815c-5135693635d9（mode=full、executor=api、review=ai），独立评测实例 audit-e2e-assistant-web-eval-ebe42915，结束后已停止。机器与 AI 评审均 2/2 passed，source_verification=matched（candidate c18d568075899f63b7f6858e3257a1c79bc417ca04e653ca31a598ec9b6725e3）。
- U-RECEIPT-001 passed：response.json 回复“单价 17.5 元/件 × 数量 4 件 = **合计 70 元**。”；逐条核对：17.5×4=70 正确，算式与单位齐备，无虚构数据、无外部系统声称，无工具调用。
- U-RECEIPT-002 passed：回复追问数量（“请问购买数量是多少件（或多少个）？”），未猜测、未代填、未给合计，无工具调用。
- 真实模型来源（trace 证据）：两例 request/header 与 request/context 均为 provider=xiaomi-token-plan-cn、model=mimo-v2.6-flash、reasoningEffort=off；assistant/message 为真实模型回包（source.kind=model，api=openai-completions，stopReason=stop，含供应商 usage）。本次主角色模型即平台业务默认 MiMo flash，未改管理模型。
- 封存：evaluation.md sha256 5607df45464acbf228af8621c9333e04985d179de73b94cb1fe2eab5d74c4f51，冻结 Case 与当前一致（contract_changed=false）。

## 未验证与限制
- U-RECEIPT-003 未运行（按本次授权排除）：evaluation.md 将“第1轮/第2轮”写在同一个用户输入内（单次调用），即使运行也不能证明真正跨轮记忆；待用真实会话两轮独立验收，本次不修改 evaluation.md。
- uncovered_case_ids：U-IDENTITY-001、U-ROLE-001、U-RECEIPT-003。
- review=ai 为同路由自评（judge.route 与 target 同为 xiaomi-token-plan-cn/mimo-v2.6-flash，same_route_as_target=true），仅作研究辅助，不是独立真值；上述两例结论另经按预期的规则化核对（算术与追问行为）成立。
- guard 未声明（not-declared），行为约束依赖 AGENTS.md 提示词，未做提示扰动验证。
- 固定性：资产提交 097eeb0c91f0bc2fd6b0c93e5c06d57d4fae7c3f 工作树 dirty（12 个变更路径）；程序 origin 9ac455a48b09b28db2dd2c220e27276405b8e237 dirty（1 个变更路径）；实际装载体以 candidate_sha256 与 Run 封存核对为准。
- 消耗（读取收尾回执时的已观测值）：actual_model_calls=7（target 2、judge 2、analysis 3），Token 44585 输入/2429 输出/47014 合计；费用未核算。

## 下一步
沿用本版本与 Run run-6c8e03aa-bf4b-4c90-815c-5135693635d9 的真实 ID，用真实会话两轮独立验证 U-RECEIPT-003（“记录收据编号E2E-024。”→“刚才的收据编号是什么？”原样返回），再复核完整证据后决定 adopt/continue。