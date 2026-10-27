# 决策样本抽取

从已有审计边界和已确认职责继续。先按[数据格式](../dataset-formats.md)选择输入：轨迹使用 `<core_dir>/scripts/kev_trace.py extract`；既有原生 KEV 文件走 [legacy-native](../legacy-native.md)，平台回执走[平台桥接](../platform-export.md)。执行与恢复边界沿用入口 Skill。

1. 轨迹选择已实现的 next-operation、inspection-v1 或 cybersecurity-routing-v1；八类初始路由的范围见[路由投影](../security-routing.md)。其他新领域先实现并验证专用投影，不把合同草案当成可执行配置。
2. 只读取 decision_seq 之前真正进入 surface 的消息及最近 request/header。读取 event.data 的 user/message 时保留 source；其他消息按 data.message 处理。每个事实和候选必须能定位到当时可见事件或固定版本静态合同。
3. state/question 来自前缀；observed_action、最终结果、标注理由、reviewer、辅助 token usage 和 stream 留在监督或审计侧。移除当前模型选择整体；以前步骤的合法动作与结果可以保留。
4. 候选由当时工具/模板目录或明确静态合同生成，不只给历史选中项完整参数。记录 candidate_bindings 和候选生成版本。ID、版本、runId、requestId、URL 使用状态绑定或代码生成；稳定 requestId 的重试规则属于执行层。
5. 做未来不变性检查：改变未来终态、答案或工具目录，早先 state/question 应不变；改变此前目录应改变候选；改变早先 runId 只更新对应 binding，不生成新的执行事实。文件哈希随未来变化不等于模型输入泄漏。
6. 保存 samples.jsonl、annotations.todo.jsonl、extraction-report.json；默认不赋 gold label，规则建议只进入 review。用户先看 report.md 中抽取内容、跳过原因和待复核事项，不把说明插进 JSONL。

字段合同见[中间样本合同](../data-contract.md)。inspection-v1 只是有界参考投影，不保证覆盖所有巡检表达或生成 verified 标签。离线与真实推理应复用同一状态/候选构造函数，不能离线强模型摘要、上线另用截断。

完整前缀通常超过 Kev 短状态预算。保留原始证据，先用精确 tokenizer 检查，再改进业务投影；不以字符数或盲截断冒充编码检查。
