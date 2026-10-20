# 资产关联告警只读共同基准

完整父版固定为 EXP-security-operations-expert-021-rdd331f9f2e30，引用见 [change.yaml](change.yaml)。该版本完整继承父版 Candidate，只新增本轮共同的只读原子工具、固定外部样本及必要主 Agent 路由与绑定，不实现优化图。

研究目的：先获得能够完成相同任务的未优化基准，后续由真实平台管理助手从本版本生成 LangGraph 代码变体，比较稳定工具编排所需模型请求和 token，保留关键失败分支与原有能力。当前任务口径唯一维护在 Agent 的 evaluation.md，本轮选 U-ASSET-ALERTS-001、U-ASSET-ALERTS-MISSING、U-ASSET-ALERTS-EMPTY、U-ASSET-ALERTS-FAIL。

唯一固定输入为 candidate/dsh/managed/compute-workflow/fixtures.json，mode=mock-replay。9106 资产及告警、999999 的404来源于现有 Mock 只读 GET 实际采集；9107 的空告警是明确受控覆盖，9108 在线 Mock 原为404，本轮明确提供受控存在资产及 HTTP200/code503 告警业务失败。它们不是真实 SOC 或在线服务当前事实。原子执行器仅在外部 GET 传输边界重放该文件，模型、DSH、Guard 和工具实际执行且可追踪。

后续比较前固定完整基准及 Case，并从基准创建独立变体；不得直接编辑 EXP021/EXP022 或更换已启用实例。真实 Mock 在线调用的接入验收与重放研究分开记录；本轮尚无模型 Run，不声明等效或节省。
