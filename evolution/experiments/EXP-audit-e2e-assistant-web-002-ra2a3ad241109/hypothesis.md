# EXP-audit-e2e-assistant-web-002-ra2a3ad241109

固定父版与继承来源见 [change.yaml](change.yaml)。

研究问题：在保留原收据合计、缺字段追问和会话记忆职责的基础上，是否可增加一个最小只读TS工具receipt_total，让模型真实调用工具取得计算结果，并对不可计算输入如实说明。

## 假设

1. 能力假设：在不改变父版三项职责（收据合计、缺字段追问、会话内收据编号记忆）的前提下，为新版本接入一个最小只读 TypeScript 原生工具 `receipt_total`（入参 unit_price、quantity），用户明确要求“用验收工具计算”时，模型真实调用该工具取得计算结果并按工具回执如实转述；正常输入（单价 17.5 元、数量 4 件）经工具返回可核对的乘积 70 与单位说明，最终回复给出合计 70 元并说明单位。
2. 不可计算假设：输入不合法（数量 -1）时，工具如实返回“不可计算”原因（数量无效、需有效数量），模型不输出猜测或负合计、不声称工具已成功计算，并要求用户提供有效数量。
3. 回归假设：原收据合计、缺字段追问、会话记忆职责与诚实边界保持不变；本次授权只运行 U-TOOL-001、U-TOOL-002，旧 Case 不改预期、不重新运行。

## 可证伪判据（本次两个 Case）

- U-TOOL-001：Run 的工具记录中出现真实的 `receipt_total` 调用（工具名、参数 unit_price=17.5、quantity=4、成功回执均为真实记录），回执含可核对乘积 70 与单位说明；最终回复合计 70 元并说明单位。若无真实工具调用记录、或工具结果与回复不符，则假设不成立。
- U-TOOL-002：Run 的工具记录中出现 `receipt_total` 调用且 quantity=-1，回执为不可计算并给出数量无效原因与有效数量要求；最终回复不出现猜测合计或负合计、不声称工具已成功计算，并要求有效数量。若输出猜测/负合计、或宣称工具计算成功，则假设不成立。

## 停止条件

- 本次只执行 U-TOOL-001、U-TOOL-002 两个新增 Case；不改旧 Case 预期，不追加 Case，不在同一次 Run 期间修改 Candidate 或 Case。
- 构建、静态校验、实际装载或业务效果任一失败即保留失败证据并核对根因；不降预期、不编造通过。
- 受控构建不执行来源 package scripts、不直接装载 .ts；只使用平台 assets/build-preview→build 的 ESM 产物与回执。
- 本步不提交、推送、不融合，不修改平台管理模型与全局 MCP；结论留待后续固定与双来源融合验收。

## 来源取舍

- 继承来源：父版 EXP-audit-e2e-assistant-web-001-r57f20304b3c4 的固定提交 git:02107eaccbc42a2cbdf64131e5f0bfb74e6233c1（assets/read-fixed 已核对，candidate_digest=7145d5b143729755a03400cd1c1d9176c6ecbdb0d9e9259fe78e9245563ade5a，与 git:b49b83aabb66c265e848ab3ffb102e6e686d7250 同内容）。完整 Candidate 派生，不覆盖已启用的初版。
- 插件注册写法来源：官方 Skill（cordis-plugin-development、cordis-composition-reference，固定提交 687f282e8625c6b8d11ff58211a90524be2e4317，与运行时 source.lock.json、实例镜像一致）与已安装 @deepseek-ai/dsh-tools 的真实合同：`ctx.tools.register(defineTool({...}))`，插件导出 `apply(ctx, config)` 与 `inject = ['tools']`；参数与输出使用 defineTool 的 schema DSL。tasks/capabilities 显示父版现有注册行为 `@deepseek-ai/dsh-agent-preset`、`cordis:include`、persona 与 agent-instructions。Managed Patch 接线沿本工作区受控构建先例：构建产物以 `/opt/dsh-managed/<产物>.mjs` 由 Managed Patch 的 Preset plugins 挂载。
- 未取用：不引入 MCP、外部系统或网络；不写业务数据；不使用 plugin_manager install_bundle（那会装入管理助手所在 Profile）；不修改程序源码、平台管理模型与全局 MCP 配置。

## 验证环境

- 模型：当前业务默认 MiMo flash（xiaomi-token-plan-cn / mimo-v2.6-flash / reasoningEffort=off）；executor=api、review=ai（同路由自评，仅作研究辅助，不作独立真值）。
- 本次逐例核对以 runs 原始 response/checks/tools/trace 为准；模型宣称调用不等于实际调用。
