# 平台与离线执行边界

核对程序提交：`19a877e337a288cc4364d1fbe0f440e65030ff37`。以后采用新版本时重新读真实工具合同。

| 入口 | 实际能力 | 本套用法 |
|---|---|---|
| 中算力策划按钮 | 固定 `compute-variant-research`，三种管理工具，`planning_intent=plan_only` | 在已有 compute Skill 与 `research/read-reference` 的 compute-variants 主题中策划 |
| 固定 Run 抽样 | 单题 v2 合同；服务端绑定来源并自动保存 suggested | 保留原生抽样入口；人员在页面复核并指定用途 |
| 普通管理会话 | 原生 Skill 可发现数据根新目录；实际动作仍由当前工具与授权决定 | 使用 workspace-management 分流；不能伪造新 task_context.skill 专项 |
| 独立训练环境 | 用户提供且实际可用的文件、Python、KEV 与硬件 | 运行本套离线脚本和经核对的训练命令，记录真实回执 |

现有专项工具限制由程序实施；plan_only 本身是本次用户要求，当前没有单独的服务端只读分支。不能因为动作出现在工具 schema 中就忽略 plan_only。程序没有 KEV 训练启动、状态、取消、回收接口；training-servers/probe 只做 TCP/SSH banner 探测；platform_task 的 training 类别不是训练执行器。

本套脚本不修改平台权限，不清空任务上下文，不创建训练服务器，不读凭据。数据根 `.agents/skills/` 是管理技能位置；Candidate 内业务技能不递归加载。

平台原始 v2 状态保持原义：suggested 不等于 reviewed，IR verified 不等于平台人员确认。新增离线产物不能直接覆盖平台批次或伪造 datasets/export 回执。导出 JSONL 离线可审计，但无法证明导出之后服务器来源仍未改变。

程序依据：`platform/plugin/src/assistant/extraction-scope.ts`、`assistant/business-assets.ts`、`assistant/task.ts`、`agents/compute-variants.tsx`、`agents/training-servers.ts`、`agents/compute-generation-contract.ts`。
