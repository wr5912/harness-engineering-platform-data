# 基础台账巡检·零模型代码变体

研究策略：依据固定父版真实诊断轨迹，将身份、职责、完整分页与仅第一页的规则分支实现为LangGraph TypeScript。沿用task_inspection真实start/page/report工具和相同Mock快照；会话调度、图节点、结果渲染与标题均本地代码执行，未覆盖输入中止报告，不回退模型。。

固定父版和任务范围见 [change.yaml](change.yaml)。
