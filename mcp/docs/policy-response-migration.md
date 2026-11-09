# 策略与应急迁移

当前方案见[交互设计](policy-response-interaction-design.md)：固定接口衔接使用策略变更与应急动作两个组合，咨询、发现和语义判断使用原始 AISOC 工具、资源及业务 Skill；取消固定八包和本地业务台账。业务服务源码只读参考，不在本次整改范围。

## 实施范围

- 新建 `policy-response` 工具与资源分组，复用已登记的 `ai-soc-ingest`、`ai-soc-response`、`ai-soc-graph` 及 `ai-soc-correlate` 的必要只读发现接口。其他版本仍依赖的旧服务与分组保留。
- 只修改 [EXP-security-operations-expert-027-f-r5efdc136f237](../../evolution/experiments/EXP-security-operations-expert-027-f-r5efdc136f237/hypothesis.md) 的 Candidate。固定调用链见[交互设计](policy-response-interaction-design.md#智能体与固定调用链的边界)，两个组合已通过平台管理助手发布，经 `policy-response-acceptance` 分组调用固定发布版本开展验收。保存、装载和业务通过分别取证。
- 已撤除八个未发布旧草稿：`policy-single`、`policy-department`、`emergency-single`、`disposition-preview`、`soc-target-resolution`、`policy-dispatch-draft`、`soc-workflow-approval`、`policy-response-observe`。新固定链的业务验收状态见下文引用，不将旧包清理视为整体迁移通过。巡检编排保持原用途。
- `acl-hit`、`entity-data`、`workflow/task` 不作为普通策略办理的前置步骤。前两者的既有巡检／条件查询用途不受影响；审批只在真实任务需要时处理。

通用的组合必要性判断只维护在[组合编排开发方法](../../.agents/skills/mcp-composition/references/development.md)，管理与审查 Skill 引用它。批量策略由原接口 `changes` 表达；组织名称只是候选范围，不构成另一套产品或本地任务。

## 验收与边界

通过平台管理助手保存、回读及发现新分组，在指定版本的隔离实例验收。保留既有实例的 HOME、会话、端口、模型与标准镜像；已有 HOME 覆盖连接时不把重载回执当作新连接生效，以实际工具调用核对。具体实例与结果见该 Experiment 的 [observations.md](../../evolution/experiments/EXP-security-operations-expert-027-f-r5efdc136f237/evaluation/observations.md)。

后续验收从 Agent 当前核心集的[策略配置](../../agents/security-operations-expert/evaluation.md#策略配置)与[独立应急指令](../../agents/security-operations-expert/evaluation.md#独立应急指令)中选择本次涉及的用例，不沿用已移除的编号范围；已完成 Run 仍按各自冻结的编号与口径阅读。目标、授权及结束位置以冻结到该次 Run 的输入为准。历史草稿示例不作为本轮写入授权。只读查询、真实预览、任务创建、下发及原号回读分别取证；异常路径用外部接口边界隔离测试，不能冒充真实设备效果。

审批仅在原 SOC 任务实际要求时进入，外部连接和能力缺口以本轮回执为准，不虚构审批或绕过凭据。历史[交接记录](policy-response-handoff.md)只保留旧过程证据，不作为当前执行步骤。
