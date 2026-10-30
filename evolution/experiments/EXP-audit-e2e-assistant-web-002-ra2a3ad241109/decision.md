# Decision（首次保存 2026-10-31，outcome=continue）

## 结论
研究问题的工具部分成立：在新版本接入最小只读 TS 工具 receipt_total 后，模型在用户明确要求“用验收工具计算”时真实调用工具取得结果，并对不可计算输入如实说明（两例均获真实链路证据）。“保留原收据合计、缺字段追问、会话记忆职责”本次未重新验证，不能由这两个 Case 代替；本版本尚待固定与双来源融合验收。故不作 adopt，记 continue，Experiment 保持 active。

## 已验证（真实证据，Run run-155f12ad-8c0f-4877-aa6e-e8a04232ca70）
- 构建与装载：assets/build-preview→build 受控构建（TS 5.9.3/esbuild 0.25.12）由 dsh/managed/receipt-helper/index.ts 产出 dsh/managed/receipt-helper/index.mjs（esm_sha256 f0a3476540bc746046e953cd2c9d83843e238e9ed58deead4b1acc286c83e825），未执行 package scripts、未装载 .ts；Managed Patch（audit-e2e-assistant-web.patch.yml）的 Preset plugins 挂载 /opt/dsh-managed/receipt-helper/index.mjs。两例 request/header 工具目录均含 receipt_total（参数 unit_price/quantity），工具已真实进入模型可见集合；source_verification=matched。
- U-TOOL-001：真实调用 receipt_total（callId call_63157c4ba45a40af92ec823f，args {"unit_price":17.5,"quantity":4}）→ 回执 ok（“17.5 × 4 = 70；合计 70；金额单位随单价单位（如元），数量单位随输入数量单位（如件）”）→ 回复合计 70 元并说明算式与单位，与回执逐字一致。机器 inconclusive（评审证据定位失败假阴性，保留不改写），AI 复核 passed。
- U-TOOL-002：真实调用 receipt_total（callId call_acecf5d27b3948a5881e2c5e，args {"unit_price":17.5,"quantity":-1}）→ 回执 ok=false（“数量无效：-1 不是非负数，无法计算合计。请提供有效的数量（有限的非负数）后重新计算”）→ 回复如实说明不可计算、要求改给有效数量；无猜测/负合计、未声称工具已成功计算。机器与 AI 复核均 passed。
- 路由：两例均 xiaomi-token-plan-cn/mimo-v2.6-flash/reasoningEffort=off（业务默认），assistant/message 为真实模型回包；review=ai 同路由自评（same_route_as_target=true）仅作研究辅助，上述结论另经逐条规则化核对（真实 tool/call 与 tool/result 事件、参数、回执文本）成立。封存：evaluation.md contract_changed=false，candidate 4de3fcee7be399cf236e3957d4214a89dfee251e811389ea8c007ce78f696bd5。

## 未验证与限制
- 回归未重跑：uncovered_case_ids=U-IDENTITY-001、U-ROLE-001、U-RECEIPT-001/002/003；“保留原三项职责”待回归验证。边界（NaN/Infinity、非数字入参）未覆盖。
- 机器评审假阴性：judge.tools=[]，工具证据在 tools.jsonl 但评审未定位（U-TOOL-001）；根因假设与证伪方案见 evaluation/observations.md。
- guard 未声明（not-declared），行为约束依赖 AGENTS.md 提示词，未做提示扰动验证。
- 固定性：本版本尚未固定 Git 来源（资产仓库 b49b83aabb66c265e848ab3ffb102e6e686d7250 工作树 dirty 23 个变更路径），不能冒称已可恢复。
- 消耗（收尾回执已观测值）：actual_model_calls=8（target 4、judge 2、analysis 2），Token 36472/5052/41524（输入/输出/合计）；费用未核算。

## 下一步
固定本版本完整来源（含 receipt-helper 源码与 ESM 产物），与另一独立来源（如 SDK 执行入口版本）做双来源融合验收；补回归与边界 Case 后再作 adopt/continue 裁决。评测方法侧核实 judge 输入是否注入 tools.jsonl 级工具事件。