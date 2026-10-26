---
name: kev-decision-discovery
description: "从已审计的智能体轨迹识别可交给 Kev 的决策职责，区分语义分类、确定性规则、参数绑定及开放生成。当用户要发现决策点、规划中低算力 Variant 或判断模型替换收益时使用；不把每次工具调用都当成独立可训练任务。"
---

# Kev 决策点发现

## 入口与继续条件

固定算力策划或 Run 抽样专项不执行本技能的离线命令；沿用其指定技能与工具。只有当前任务允许离线处理且有真实执行工具时继续。完整边界见同级 `kev-trace-pipeline/references/platform-runtime.md`。

从实际 Skill 位置解析同级 core，使用脚本和输入输出的绝对路径。一次完成一个阶段后读取 `stage-status.json`：blocked 停止依赖步骤，requires_review 完成当前复核；不因退出 0 或有文件就自动进入训练。已有输出先回读，续做使用新目录。

## 本阶段操作


1. 读取轨迹审计和边界索引；必要时执行同级 core 脚本的 discover 命令。
2. 先描述职责，再描述调用位置：路由、选择候选、继续/停止、重试/转交、结果判定。一次模型响应可承载多项职责，但来源组仍相同。
3. 为每个 site 填写 core 的 decision-contract.example.json：前缀触发条件、可读状态、候选生成器、参数绑定、目标规则、回退、拟替换的调用及完整路径成本。
4. 不用当前历史选中动作作为上线触发条件。按当前前缀和流程状态判断是否进入该 site。
5. 给出 implementation=model/code/hybrid。精确 matchPhrases、复制 runId/taskId/version、稳定 requestId、数字和 URL 绑定优先代码。开放报告正文不伪装成 choice。
6. 估计收益时计入状态整理、候选构造、参数生成、回退和后续重试。只在工具执行前加判定器，不能声称省掉已发生的模型选择。
7. 产出 decision-inventory.json 和明确的参考合同；列出已有覆盖、未知规则与新增轨迹需求。

读取 `references/discovery.md` 获取巡检示例、覆盖矩阵和合同评审要点。脚本输出的 implementation 是参考建议；业务合同未确认时不要自动训练。

共享实现位置：`../kev-trace-pipeline/scripts/kev_trace.py`。所有同级 core 引用路径均相对于本技能目录。
