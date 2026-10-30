# Decision

状态：continue；Experiment 保持 active。

双来源融合在约定五 Case 内通过，fusion/finalize 已完成。Candidate 为 `960cc3ace2e978d0bd6f655be8572284f188f1bd6126f9d44dd0956a8c4f9177`；主来源 001 固定于 `02107eaccbc42a2cbdf64131e5f0bfb74e6233c1`，工具来源 002 固定于 `2aadef23b3bb0694b43e276018408c6229c8e01c`。两来源存在继承关系，不属于独立 A/B 比较。003 的命令参数声明失败记录保留，不作为通过证据。

[Run run-83b2f055-b298-47ff-ad1b-5699842b3696](runs/run-83b2f055-b298-47ff-ad1b-5699842b3696/report.md) 的五项来源核对均 matched：金额计算、缺字段追问、真实 receipt_total 成功与错误回执、同 Session 两轮编号记忆均完成。机器结论为 4 passed / 1 inconclusive；正式 AI 复核为 5 passed，有效结论 passed。复核采用同模型路由，是研究辅助，不等同独立真值。五个融合检查回执对应同一 Candidate，当前受控构建核对 verified=true。

实际观测 15 次模型请求（target 8、judge 5、analysis 2），总 Token 64173；费用未核算。不以此声称资源优化。

本轮没有运行 U-IDENTITY-001、U-ROLE-001、旧 U-RECEIPT-003，也没有验证数值边界；结果不外推到未选 Case，不作 adopt。实际资产由本文所在 Git 提交保存，构建与运行依据上述回执核对。
