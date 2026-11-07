# EXP-security-operations-expert-027-f-r5efdc136f237

固定父版见 [change.yaml](change.yaml)。本轮按用户确认的简化方向，在原分支继续策略与应急迁移，不创建其他版本。

## 假设

由智能体使用原始 AISOC 工具与 Skill 完成咨询、发现和语义选择，固定多接口衔接交给策略变更、应急动作组合连续执行并直接返回结果，可以完成用户任务，并减少旧服务包装、固定确认器和本地业务台账。AISOC 继续负责业务校验、审批、执行及状态。

实现入口为 [策略 Skill](candidate/dsh/workspace/.agents/skills/policy-configuration/SKILL.md)和[应急 Skill](candidate/dsh/workspace/.agents/skills/emergency-action/SKILL.md)；调用顺序与边界见 [共同交互设计](../../../mcp/docs/policy-response-interaction-design.md)。参数和实现事实不在本文重复维护。

## 验证

先核对实时工具 Schema 与实际装载，再用真实多轮任务检查未知对象的发现、选择、预览、草稿回读和取消。静态检查、分组发现、实例装载和业务通过分别记录；没有同口径对照时不宣称性能收益。旧失败及本轮证据见 [研究观察](evaluation/observations.md)。

本轮验收口径为 [evaluation.md](../../../agents/security-operations-expert/evaluation.md) 的 `U-POL-020`～`U-POL-022`、`U-EMG-007`～`U-EMG-010`。用户授权三条指定策略下发；应急分别仅准备、仅真实预览、仅创建不启动、仅准备。每次 Run 冻结完整输入，历史草稿示例不作为本轮授权。外部能力、配置或凭据缺失时保留停点，不修改外部仓库，不绕过业务校验。
