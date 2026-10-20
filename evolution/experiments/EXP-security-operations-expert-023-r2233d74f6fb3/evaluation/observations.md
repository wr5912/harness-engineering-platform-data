# 共同基准准备与确定性验证

本版本完整复制固定 EXP021，保留原有 214 个 Candidate 文件；其中 210 个逐字节不变，4 个仅增加本研究所需的主 Agent 路由、原子工具权限和 Preset 绑定。新增原子工具 TypeScript、ESM 及唯一固定样本，没有生成或预写待优化的 LangGraph 代码。

当前完成的是共同基准准备，尚无 DSH 新 Session、真实模型评测或资源收益。Decision 保持 inconclusive。原 EXP021、EXP022 和现有启用实例未被本任务编辑或切换。

固定输入只维护在 candidate/dsh/managed/compute-workflow/fixtures.json，mode=mock-replay；完整 SHA-256 与确定性结果保存在 [atomic-tools-check.json](atomic-tools-check.json)。该文件也是原子工具执行时返回 fixed_input_sha256 的来源。

- 资产 9106 和对应告警来自当前本机 Mock 只读 GET 实际捕获，正常响应为 1 组、1 条；未访问真实 SOC。
- 资产 999999 的 HTTP404 来自同一 Mock 实际捕获，后续告警没有样本且必须停止。
- 资产 9107 详情来自 Mock，空告警是明确受控覆盖，用于验证空结果与失败区分。
- 在线 Mock 对 9108 实际为404；本研究明确提供受控存在资产及 HTTP200/code503 告警响应，仅用于业务失败分支，不冒充在线事实。

本轮实际执行了共享原子工具代码的四个分支并核对固定输入摘要，检查新工具在主 Agent 可见且通过原 Guard。校验 Experiment 与 source contract 均通过；新 Case 只追加到 Agent 当前 evaluation.md，旧评测正文没有更改。这些检查没有启动 DSH 或调用模型，不能证明实际装载、业务近似等效或算力节省。

下一步由平台管理助手从本完整基准生成独立 LangGraph 变体；正式比较须固定两侧资产及四项 Case，使用新 Session、相同输入和模型路由，保留失败、重试和全部模型用量。在线 Mock 接入验收与固定重放研究分开记录，不据此声称真实 SOC 收益。
