# 观察与 Decision 保存合同

仅在本次任务包含保存研究观察或结论时读取。沿用已固定的 Experiment 和真实 Run；查询或比较请求只需报告时不额外写入，不因保存结论重新创建 Experiment 或启动评测。

1. 需要保存观察时，先 `edit/read` 读取目标 `evaluation/observations.md` 的完整内容和摘要，再以完整文本调用 `edit/preview`、`edit/apply` 并回读。保留反例、回归、失败、限制和下一步。
2. 保存 Decision 前读取当前 `detail`，用下表字段调用 `decision/update`。不要以旧 Run、别的 Experiment 或正文中的摘要替代当前目标摘要。

| 字段 | 来源与含义 |
|---|---|
| `experiment_id`、`content` | 当前目标与基于真实证据的结论正文，写清比较、依据、反例、回归、限制及下一步 |
| `expected_sha256` | 当前 `detail.decision.sha256` |
| `status`、`outcome` | 完成本轮研究时 `status=completed`，`outcome` 为 `adopt`、`continue`、`reject` 或 `inconclusive`；仅维护说明可省略 |
| `expected_change_sha256` | 更新结构化状态时取当前 `detail` 顶层 `change_sha256` |

3. 写动作由 DSH 原生访问策略处理；待批准、取消或失败不视为已保存，已获授权后不再等待独立的平台确认。成功后回读 `detail`，核对目标、正文及本次要求的结构化状态；仅写“adopt”正文不等于状态已更新。
4. 摘要冲突先重读，再核对所需变化；写入结果未知先查询实际记录，不重复保存。失败或证据不足可以形成真实的 `reject` 或 `inconclusive`，不能为结束任务而降低口径。
