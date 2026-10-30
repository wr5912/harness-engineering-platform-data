# Evaluation Observations

本轮两个用例的独立评测与比较已完成，结果和限制见下文。

## 2026-10-30 两 fresh Run 与 compute-variants/compare（AI 功能验证）

本轮为已授权的两 fresh Run→compare，各 2 Case（U-INS-002、U-QA-001）/min1，未扩面、未重跑、不补救：

- 父版 EXP-024：Run `run-b4846065-1e39-4bd6-9894-4ba27ded6e04`（job `f5e7bb9d-e1f8-4afa-afb8-ee3ac814433b`），verdict failed：U-INS-002 failed（未调用 `list_executable_inspections`，inspection MCP 断连；如实说明、未编造）；U-QA-001 inconclusive（初判 passed 后证据校验不足降级，judge 未为全部冻结要求提供可定位证据）。
- 变体 VAR-001：Run `run-91b77922-a32e-4dcd-9de6-e62dcfb1beff`（job `c43beeca-5617-4fbc-8629-3dce4c39da74`），verdict failed：U-INS-002 failed（无实际巡检目录，Native 能力目录只有 `schedule_list`）；U-QA-001 failed（未检索知识库，route=direct_answer，先无来源断言 SEC-KB-078 具体剧本后称材料缺失）。
- 两侧 source_verification matched（父 Candidate `d2572e8c…`、VAR Candidate `d0259589…`），Case 冻结=当前（contract_changed:false），同一标准 runtime 镜像。

正式 compare（comparison_sha256 `71cb7c3d2e75a7df07ee23f1d28bd3f03151090c4b8761fd9f4bad2e5c4092f4`；receipt `evaluation/compute-comparison-d28806898b5f64b84416f73a6b52b6a0b27d9cb324de07fb5b20deaa5882e7d6.json`，sha256=`d28806898b5f64b84416f73a6b52b6a0b27d9cb324de07fb5b20deaa5882e7d6`）实际返回：

- `quality.passed=false`：U-INS-002 父/变体 pass_rate 0/0；U-QA-001 父 pass_rate null（inconclusive 不计入）、变体 0。
- `resource_evidence.passed=true`，limits 逐字：「run-91b77922-a32e-4dcd-9de6-e62dcfb1beff/U-INS-002: 至少一个模型调用的供应商 token 用量缺失或分桶不一致」「run-91b77922-a32e-4dcd-9de6-e62dcfb1beff/U-QA-001: 至少一个模型调用的供应商 token 用量缺失或分桶不一致」；VAR token 指标为 null，如实保留、不补零。
- `eligible_for_end=false`。
- `comparability.passed=false`，limits 逐字：「run-b4846065-1e39-4bd6-9894-4ba27ded6e04: U-INS-002 工具结果失败或未知」「run-b4846065-1e39-4bd6-9894-4ba27ded6e04: U-INS-002 原始工具回执失败、未知或不能配对」「run-b4846065-1e39-4bd6-9894-4ba27ded6e04: U-QA-001 工具结果失败或未知」「run-b4846065-1e39-4bd6-9894-4ba27ded6e04: U-QA-001 功能结论未确定」「run-b4846065-1e39-4bd6-9894-4ba27ded6e04: U-QA-001 原始工具回执失败、未知或不能配对」「run-b4846065-1e39-4bd6-9894-4ba27ded6e04: 程序版本未冻结或不同」「run-91b77922-a32e-4dcd-9de6-e62dcfb1beff: 程序版本未冻结或不同」。该 compare schema 无 top-level verdict 字段，未编造。
- 资源（`actual_model_calls`，target 口径）：父 6 / VAR 5（逐 Case 3/2 与 3/3，均值 3/2.5），观察性减少 16.7%；judge 另计各 2，全 Run 合计 8/7 不与 target 口径混用；legacy `model_calls`（会话回复次数）均值 3/2 与 actual 口径不同；耗时均值 -53.8%；VAR token 用量 unknown。

环境限制：本轮父 target 与逐 Case judge 实际均为 `xiaomi-token-plan-cn/mimo-v2.6-flash/off`（平台模型投影），同路由自评、AI functional 非 human；区别于冻结父资产 Qwen27B（local-qwen/Qwen3.8-27B）声明，不证明原 Qwen27B 父运行等效或独立真值。VAR 业务双角色仍 Qwen3.5-2B＋训练 KEV（checkpoint `2c9d8670…`），管理 MiMo-Pro/high 仅属管理编排。质量失败与环境限制下，16.7% 仅为观察性调用减少，不能宣称效果或收益。训练 finaltest 2/4=0.5、main_routeonly、其余 12 站点未覆盖等限制保持。

技术 Graph 完成不等于业务通过。正式记录以上述 Run 与 compare 文件为准，本文件不复制原 ZIP/system/header/HOME 或秘密。
