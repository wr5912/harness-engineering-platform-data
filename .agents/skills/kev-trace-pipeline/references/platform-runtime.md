# 平台与离线执行边界

执行前读取当前程序工具合同；入口意图不能由助手自行升级。意图按 `compute-variant-research` 的任务表判断，冲突时保持只读策划。

| 入口 | 实际能力 | 本套用法 |
|---|---|---|
| 中算力策划按钮 | `compute-variant-research` 提供业务指导，`planning_intent=plan_only` 表示用户只授权策划 | 在已有 compute Skill 与 `research/read-reference` 的 compute-variants 主题中策划 |
| 中算力生成与验证按钮 | 固定 `compute-variant-research`，`generation_intent=implement` 且不是 `plan_only`；可用原生执行工具、KEV 技能及 datasets 动作 | 识别决策点、复核分组数据、编码、真实训练、校准、测试并回收工件，随后独立比较 |
| 固定 Run 抽样 | 单题 v2 合同；服务端绑定来源并自动保存 suggested | 保留原生抽样入口；人员在页面复核并指定用途；明确委托的 AI 复核须按当前工具合同保留实际主体、依据与 functional_validation 用途，不作为人工真值 |
| 普通管理会话 | 原生 Skill 可发现数据根新目录；实际动作仍由当前工具与授权决定 | 使用 workspace-management 分流；不能伪造新 task_context.skill 专项 |
| 独立训练环境 | 用户提供且实际可用的文件、Python、KEV 与硬件 | 运行本套离线脚本和经核对的训练命令，记录真实回执 |

所有管理会话复用完整原生能力；task_context 提供默认目标，不用于工具白名单、会话资格或动态 Schema 检查。plan_only 由管理规则和技能指导保持只读，不能自行扩大用户授权。明确执行任务可按当前原生工具与 KEV 技能办理，写动作遵循 DSH 原生权限，不另设任务启动步骤。程序没有 KEV 训练调度接口；training-servers/probe 只做 TCP/SSH banner 探测，不能替代真实认证与训练检查。

本套脚本不修改平台权限，不清空任务上下文，不创建训练服务器，不读凭据。数据根 `.agents/skills/` 是管理技能位置；Candidate 内业务技能不递归加载。

平台原始 v2 状态保持原义：suggested 不等于 reviewed，IR verified 不等于平台人员确认。新增离线产物不能直接覆盖平台批次或伪造 datasets/export 回执。导出 JSONL 离线可审计，但无法证明导出之后服务器来源仍未改变。

程序依据：`assistant/business-assets.ts`、`assistant/index.ts`、`assistant/tool-contracts.ts`、`agents/compute-variants.tsx`、`agents/training-servers.ts`、`agents/compute-generation-contract.ts`。
