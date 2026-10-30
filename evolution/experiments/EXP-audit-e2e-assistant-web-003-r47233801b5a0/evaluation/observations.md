# Evaluation Observations

尚未执行评测（本轮授权明确禁用 eval/start，实际业务评测待后续同 Session 继续）。

## 融合装配与受控构建观察（2026-10-31，平台管理会话 session-5c4f16db-acce-4353-84bd-c713215a7efe）

### 已完成（真实回执）
- 两轮用例 U-FUSION-MEMORY-001 已存入 agents/audit-e2e-assistant-web/evaluation.md（保存后 sha256 01ed8b391fc72b6b768d7b8e6244345c7292552432ad208878afb0b567cd670e）：inputs 为两元素字符串数组，仅要求第二轮在同一 Session 原样返回 E2E-FUSION-6428，未覆盖旧用例、未降低已有预期。
- 融合目标 EXP-audit-e2e-assistant-web-003-r47233801b5a0 经 fusion/preview（含完整 plan）自动衔接 fusion/confirm 创建；fusion_sources=001（git:02107eaccbc42a2cbdf64131e5f0bfb74e6233c1，主父版）、002（git:2aadef23b3bb0694b43e276018408c6229c8e01c）。plan 中如实记载 002 继承 001 的重叠（同名角色指令超集、相同 Git blob 的 preset 两文件、ManagedPatch 含 001 注册行），未包装为两个独立实验等效比较。
- 实际装配（edit/preview→edit/apply，内容逐字来自 assets/read-fixed 固定读取）：dsh/workspace/AGENTS.md=002 版（写入后 sha256 492b414c38480969f83bfafefe79930197723ba94f1a0f81f3de72ac790f2b78）；dsh/managed/audit-e2e-assistant-web.patch.yml=002 版（a03fcd3fe07567ec7be5206d1cc3cabdd0fb2b145161b1afac0bc9015554604b，含 receipt-helper 挂载 /opt/dsh-managed/receipt-helper/index.mjs）；dsh/managed/receipt-helper/index.ts=002 版（496a888d0b12723896e7bbe4315322a1d0bbf5ff2a33cbc73421a3161e43121d）。三者与固定来源 selected.sha256 逐字一致。
- 未改动即一致（字节核对）：harness.yaml 已与 002 固定内容一致（19590a58350845ded505a58dfc551e2ef95a90be12747ea8e0ad7a9e5fc53e64）；dsh/presets/audit-e2e-assistant-web/agent.cordis.yml（7a478170d3e36a60dce31f14f2034544d544a59f27e577211f870359050bdd80）与 preset.yml（c70a925832abfdae94e3283e9648e8839d241cae49366c778eb21f811cb44c4f）与两固定来源同一 Git blob 逐字一致；Preset 路径 /opt/dsh-presets/audit-e2e-assistant-web/agent.cordis.yml 与 ManagedPatch 注册一致。
- 受控构建（assets/build-preview→assets/build，entry_path=dsh/managed/receipt-helper/index.ts，TS 5.9.3/esbuild 0.25.12，platform_lock 491d993c23951ee362ed5310b5192b37bb4fb1f147f5bc5c4e7ed872b3acf32d，未执行任何 package scripts）：产出 dsh/managed/receipt-helper/index.mjs，source_sha256 a2c346ae677edb5593ae21f1e15ec75935bb7a237127052645ca0ed40cf4fd9e、build_digest 30bffd6fb744c8a755ae3da6a71ade5f624f8cbdd4ab3e156acdcba90c6d51f2（与 002 构建记录相同）、esm_sha256 aec92fd145b17c1997cb7e5b71904886523dbc0591a40757d1a1e608b2ef4320、candidate_sha256 23a6382f0379108d8c4d8527dca0678f405741f7d196c9023681db10de297af3（最新回读一致）。
- 真实 ESM 语法检查：node --check dsh/managed/receipt-helper/index.mjs（Node v24.19.0，仅解析不执行）退出码 0。
- 无 HTTP 外部依赖：产物 runtime_imports 仅 node:module、node:fs、node:url，其余仅经 Runtime 解析 @deepseek-ai/dsh-tools；无网络与外部服务调用。

### 与来源产物的字节差异（如实保留）
- 目标重建 index.mjs 与 002 固定产物（esm_sha256 f0a3476540bc746046e953cd2c9d83843e238e9ed58deead4b1acc286c83e825）并非字节一致；逐行比对确认唯一差异为 esbuild 内嵌源路径注释行（…EXP-audit-e2e-assistant-web-002-…/index.ts vs …EXP-audit-e2e-assistant-web-003-…/index.ts），代码体、source_sha256、build_digest、编译器与平台锁均相同。功能等价性仍待实际装载与 U-TOOL-001/002 取证，不以源码相同提前声称等效。

### 缺口（未完成，不声称通过）
- fusion/verify 的两项 build 检查（build-receipt-helper、esm-syntax-index-mjs）均未取得回执：plan 中命令被冻结为整串命令行，而 fusion/verify 以 execFile(argv[0], argv[1..]) 执行，导致 spawn ENOENT（回执 verification_failed，版本保持未完成）。正确格式应为 argv 数组（如 ["node","--check","dsh/managed/receipt-helper/index.mjs"]）；creation.plan 仅在创建时写入、无公开修订入口，按技能要求不绕过接口直改 change.yaml。受控构建与语法检查的事实如上，但 fusion/verify 级 build 回执缺失，待后续阶段处置。
- load-preset-and-tool（load）与 cap-base-receipt、cap-tool-receipt-total、cap-session-memory（capability）按本轮禁令未执行；实际装载、真实工具调用、负数不可计算如实回报、两轮同会话记忆与基础回归均待真实 Run 取证。
- 002 遗留的边界（NaN/Infinity、非数字入参）与 U-IDENTITY-001、U-ROLE-001、U-RECEIPT-003 不在本次约定 Case 集合（U-RECEIPT-001/002、U-TOOL-001/002、U-FUSION-MEMORY-001）内，未覆盖部分保持未知。
