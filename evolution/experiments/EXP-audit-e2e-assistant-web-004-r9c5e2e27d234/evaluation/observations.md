# Evaluation Observations

## 双来源融合验收评测（2026-10-31，管理会话 session-5c4f16db-acce-4353-84bd-c713215a7efe）

### 本轮真实评测（Run run-83b2f055-b298-47ff-ad1b-5699842b3696）
- 真实 api 评测：job 3af1a7ee-af4d-4e38-a6c2-fee7952eb6cc，mode=full、executor=api、review=ai、model_selection=xiaomi-token-plan-cn/mimo-v2.6-flash/reasoningEffort=off；5 个冻结 Case 全部 execution_status=completed，封存 source_verification=matched（candidate 960cc3ace2e978d0bd6f655be8572284f188f1bd6126f9d44dd0956a8c4f9177 与 workspace/presets/managed/evaluation_implementation 全部 matched）；评测实例 audit-e2e-assistant-web-eval-4a1fb7b7 结束后已停止。
- 机器逐例：U-RECEIPT-001 passed、U-RECEIPT-002 passed、U-TOOL-001 inconclusive、U-TOOL-002 passed、U-FUSION-MEMORY-001 passed（机器总体 inconclusive）；正式 AI 逐例复核 5/5 passed（复核修正 U-TOOL-001），有效结论 effective_verdict=passed。review=ai 为同路由自评（与目标同为 xiaomi-token-plan-cn/mimo-v2.6-flash，same_route_as_target），仅作研究辅助；关键结论另经原始证据逐条核对成立（见下）。
- 工具真实回执（evidence/U-TOOL-001/tools.jsonl、U-TOOL-002/tools.jsonl 原文核对）：U-TOOL-001 tool/call callId call_5d40979f5e3c48e0b9a37731，args {"unit_price":17.5,"quantity":4}，tool/result isError=false、回执“receipt_total 计算成功：17.5 × 4 = 70；合计 70；金额单位随单价单位（如元），数量单位随输入数量单位（如件）”，最终回复据此给 70 元与算式单位。U-TOOL-002 tool/call callId call_8dd48f07f99741a8b2386fee，args {"unit_price":17.5,"quantity":-1}，回执“无法计算（ok=false）：数量无效：-1 不是非负数……请提供有效的数量（有限的非负数）后重新计算”；最终回复如实说明无法计算、要求有效数量（>=0），无猜测合计/负合计，未声称工具成功。
- 基础回归（evidence/U-RECEIPT-001、U-RECEIPT-002）：合计“单价 17.5 元/件 × 数量 4 件 = 合计 70 元”含算式与单位、tools.jsonl 为空（未声称用工具）；缺数量时只追问不猜测、不给合计。
- 同会话记忆（evidence/U-FUSION-MEMORY-001/response.json）：同一 session-c20d37ab-417f-4726-8aeb-8a976bc838d9 内两个真实 human turn（input_message_id 6e2d85c1…/63ba2ceb…，两轮 inputs 与冻结口径一致）；第二轮原样返回“E2E-FUSION-6428”，未改写补全，两轮均声明仅本会话记忆、未持久化。
- 实际装载：各 Case load_observation preset_matches=true、workspace_matches=true（session_preset=audit-e2e-assistant-web），目标工具目录含 receipt_total（参数 unit_price/quantity），实际镜像 sha256:6ea7cbe9…；fusion/verify load-preset-and-tool 已凭本 Run 取得回执。

### 已知缺口与限制（保持未知，不外推）
- U-TOOL-001 机器 inconclusive 为评审证据定位假阴性（judge.tools=[] 未定位 tools.jsonl 事件），复核修正为 passed；非被测行为缺陷，但评审口径缺陷待评测方法侧修复（证伪方案见本 Run analysis.json / report.md）。
- 未覆盖 Case：U-IDENTITY-001、U-ROLE-001、U-RECEIPT-003（该旧用例仍为单输入多行写法，本轮未运行、未修改）；工具边界（NaN/Infinity、非数值、单价为负、quantity=0、浮点精度）无证据。
- 本轮仅验证冻结五 Case 与融合五检查；不代表生产业务验收，也不代表两个来源已做独立 A/B 等效比较（002 继承 001，重叠已如实记载）。
- 消耗（收尾回执已观测值）：actual_model_calls=15（target 8、judge 5、analysis 2），Token 59023 输入/5150 输出/64173 合计；费用未核算。

### 融合检查回执（均对应 candidate 960cc3ace…f9177、evaluation a96bfda9…ea2f8）
- build-esm-syntax（build，2026-10-30T17:58:04Z）：argv ["node","--check","dsh/managed/receipt-helper/index.mjs"] exit 0。
- load-preset-and-tool（load，18:13:53Z）、cap-base-receipt（18:13:58Z）、cap-tool-receipt-total（18:14:01Z）、cap-session-memory（18:14:08Z）：均凭 Run run-83b2f055-b298-47ff-ad1b-5699842b3696（run_sha256 d3ba697f…507d）取得回执。
- fusion/finalize 于 18:14:13Z 完成，creation.status=completed。
