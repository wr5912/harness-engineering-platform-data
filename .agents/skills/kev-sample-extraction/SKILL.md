---
name: kev-sample-extraction
description: "按明确决策合同从轨迹前缀构造 Kev 中间样本的 state、候选、动作绑定和来源引用。用于样本抽取、状态压缩、动态工具或模板候选、检查未来信息泄漏；不从正确答案倒推候选，也不把最终结果写回早先决策输入。"
---

# Kev 决策样本抽取

## 入口与继续条件

固定算力策划或 Run 抽样专项不执行本技能的离线命令；沿用其指定技能与工具。只有当前任务允许离线处理且有真实执行工具时继续。完整边界见同级 `kev-trace-pipeline/references/platform-runtime.md`。

从实际 Skill 位置解析同级 core，使用脚本和输入输出的绝对路径。一次完成一个阶段后读取 `stage-status.json`：blocked 停止依赖步骤，requires_review 完成当前复核；不因退出 0 或有文件就自动进入训练。已有输出先回读，续做使用新目录。

## 本阶段操作


1. 读取已审计边界和决策合同。运行 core 的 extract，选择 next-operation 或已支持的 inspection-v1；新领域先实现并验证专用投影。
2. 只读取 decision_seq 之前真正进入 surface 的消息及最近 request/header。只读 event.data 的 user/message 时保留 source；其他消息按 data.message 处理。
3. 把模型输入与监督证据分开：state/question 来自前缀；observed_action、最终结果、标注理由和 reviewer 字段不进入输入。
4. 候选由当时的工具/模板目录或明确的静态合同生成。不得只给历史选中项完整参数；记录 candidate_bindings 和候选生成版本。
5. ID、版本、runId、requestId 与 URL 使用状态绑定或代码生成；不要让模型自由猜测。稳定 requestId 的重试规则属于执行层。
6. 对输入做未来不变性检查：改变后续事件，state 与 question 应保持不变。元数据中的文件哈希变化不算输入泄漏。
7. 保留 samples.jsonl、annotations.todo.jsonl、extraction-report.json。抽取默认不赋 gold label，规则建议只进入 review 字段。

读取 core 的 data-contract.md 和本技能 `references/extraction.md`。真实环境应复用同一状态/候选构造函数，不能离线强模型摘要、上线另一套截断。

完整前缀样本通常超过 Kev 的短状态预算。先检查精确 tokenizer，再根据业务事实投影；不以盲截断或字符数代替 token 检查。

共享实现位置：`../kev-trace-pipeline/scripts/kev_trace.py`。所有同级 core 引用路径均相对于本技能目录。
