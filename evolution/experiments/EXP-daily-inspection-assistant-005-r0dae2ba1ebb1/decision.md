# Decision

decision: continue

保留本版本作为“旧版本初测失败→一轮修复→暂停重启恢复→业务复测与报告核验→额度耗尽→用户回退”的研究样例。修复后的业务 Case 和独立实例探针通过，但任务总消耗至少 62 次，超过确认的 60 次额度，因此本任务未完成交付。

当前 Candidate 已恢复到固定父版，不采纳为可交付版本，不修改当前启用版本，也不创建 Research Release。继续研究预算内完成改进的路径；业务结果、原失败和取消 Run、消耗不完整及实际回退的边界见 [Evaluation 观察](evaluation/observations.md)。
