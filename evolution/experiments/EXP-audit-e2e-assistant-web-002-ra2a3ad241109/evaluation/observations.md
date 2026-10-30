# Evaluation Observations

本轮观察基于真实 Run run-155f12ad-8c0f-4877-aa6e-e8a04232ca70（Job f9f0f19a-42ed-4edb-96d2-379073a3853f，executor=api、review=ai、mode=full，独立评测实例 audit-e2e-assistant-web-eval-7e8d069b，收尾后 instance_stopped=true）。仅运行新增的 U-TOOL-001、U-TOOL-002；Run 期间未修改 Candidate 或 Case（contract_changed=false）。

## 构建与装载（真实证据）

- 受控构建：assets/build-preview→build（TypeScript 5.9.3 + esbuild 0.25.12，platform_lock_sha256 491d993c23951ee362ed5310b5192b37bb4fb1f147f5bc5c4e7ed872b3acf32d），entry dsh/managed/receipt-helper/index.ts → 产物 dsh/managed/receipt-helper/index.mjs（esm_sha256 f0a3476540bc746046e953cd2c9d83843e238e9ed58deead4b1acc286c83e825，source_sha256 a2c346ae677edb5593ae21f1e15ec75935bb7a237127052645ca0ed40cf4fd9e）；未执行来源 package scripts，未直接装载 .ts。产物经 resolve-runtime 适配器将 @deepseek-ai/dsh-tools 解析为 Runtime 原生模块（native-dsh 解析，非打包伪造）。
- 真实装载：两例 trace 的 request/header 工具目录均含 receipt_total，参数 schema 为 unit_price/quantity（number，required），描述与受控源码一致；sessions 的 agentPreset=audit-e2e-assistant-web，preset/workspace 均 matched（checks.json preset_readiness=ready）。source_verification=matched（candidate 4de3fcee7be399cf236e3957d4214a89dfee251e811389ea8c007ce78f696bd5 等五项全部 matched）。
- 评测口径：model_selection=xiaomi-token-plan-cn/mimo-v2.6-flash/reasoningEffort=off（当前业务默认）；两例 request/header 与 request/context 均为该路由，assistant/message 为真实模型回包（source.kind=api kind=model，openai-completions）。judge 同路由（same_route_as_target=true）且 judge.tools=[]，仅作研究辅助。

## U-TOOL-001（正常输入）

- 真实调用：assistant/message seq14（stopReason=toolUse）→ tool/call seq15，name=receipt_total，callId=call_63157c4ba45a40af92ec823f，arguments={"unit_price":17.5,"quantity":4}。
- 真实回执：tool/result seq16（同一 callId，isError=false）：“receipt_total 计算成功：17.5 × 4 = 70；合计 70；金额单位随单价单位（如元），数量单位随输入数量单位（如件）”。
- 业务效果：最终回复给出算式 17.5 × 4 = 70、合计 70 元并说明单位（金额单位随单价、数量单位随输入），明确声明为工具回执结果；无外部系统声称、无伪造。人工逐项核对与工具回执逐字一致。
- 判定：机器 inconclusive（理由“评审未为全部冻结要求提供可定位的结果证据”），AI 复核 passed。本次按原始 response/checks/tools/trace 逐项核对，全部冻结要求均满足；机器 inconclusive 为评审侧证据定位失败的假阴性（保留不改写），非业务失败。

## U-TOOL-002（不可计算输入）

- 真实调用：assistant/message seq14（stopReason=toolUse）→ tool/call seq15，name=receipt_total，callId=call_acecf5d27b3948a5881e2c5e，arguments={"unit_price":17.5,"quantity":-1}。
- 真实回执：tool/result seq16（isError=false）：“receipt_total 无法计算（ok=false）：数量无效：-1 不是非负数，无法计算合计。请提供有效的数量（有限的非负数）后重新计算”。
- 业务效果：最终回复如实转述 ok=false 与原因，说明无法计算合计，要求提供有效数量（有限非负数）；未输出猜测合计或负合计，未声称工具已成功计算，未伪造工具结果或外部系统。机器与 AI 复核均 passed。

## 反例、失败与限制（保留）

- 机器评审假阴性（U-TOOL-001）：judge 会话 tools=[]，可核对性完全依赖框架注入内容；证据存在（tools.jsonl 全链路）但评审未有效定位。run 分析给出根因假设（冻结工具事件未完整注入 judge 输入或低推理预算下定位失败）与证伪方案（显式附 tool/call、tool/result 事件原文对照重复 N≥5 次）；备选解释为单次采样波动（同链路 U-TOOL-002 判定证据充分）。
- 覆盖限制：本次仅两条工具路径（合法正数、负数）；未覆盖非有限数（NaN/Infinity）、非数字字符串、缺字段追问、会话内编号记忆与诚实边界的回归（uncovered_case_ids：U-IDENTITY-001、U-ROLE-001、U-RECEIPT-001/002/003）。“保留原职责”未在本 Run 重新验证，不能由本次两个 Case 代替。
- guard 未声明（not-declared）；行为约束依赖 AGENTS.md 提示词，未做提示扰动验证。
- 固定性：资产仓库 commit b49b83aabb66c265e848ab3ffb102e6e686d7250 工作树 dirty（23 个变更路径，含本版本新资产）；程序 origin 15a96dfe30ce823c1be89ef94fcc49497ec82641 clean。本版本尚未固定 Git 来源（待后续固定），不能冒称已可恢复。
- 消耗（收尾回执已观测值）：actual_model_calls=8（target 4、judge 2、analysis 2），Token 36472 输入 / 5052 输出 / 41524 合计；费用未核算。

## 下一步

固定本版本完整来源后，与另一来源（如 SDK/其他执行入口版本）做双来源融合验收；补回归（U-RECEIPT 系列）与边界 Case 后再作 adopt 判断。评测方法侧：核实 judge 输入是否注入 tools.jsonl 级别工具事件，消除机器假阴性。
