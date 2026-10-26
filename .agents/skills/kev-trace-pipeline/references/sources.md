# 一手依据与借鉴边界

核验日期：2026-10-26。固定行为以所列提交或实际目标环境为准。

- DSH session： https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md
- DSH surface： https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/surface.ts
- DSH llm/stream： https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/llm-streaming.md
- DSH agent-loop： https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md
- DSH tools： https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md
- Kev 原生格式/训练： https://github.com/jaredpalmer/kev/tree/2074cc44256200bb37540103fa4572901faa10f3
- Kev 官方训练 Skill： https://github.com/jaredpalmer/kev/tree/main/skills/kev-finetune
- 通用轨迹转训练工作流： https://github.com/wshobson/agents/tree/main/plugins/llm-finetuning/skills
- smithtune： https://github.com/langchain-ai/smithtune
- TabAgent 前缀特征： https://github.com/dolev31/TabAgent/blob/main/docs/concepts/three-phases.md
- Bandits typed recipe： https://github.com/bandr-ai/bandits/blob/main/recipes/jev/README.md
- LangGraph time travel： https://docs.langchain.com/oss/python/langgraph/use-time-travel
- DAgger： https://proceedings.mlr.press/v15/ross11a.html

本套是原创适配与工作流实现，没有复制上述项目的完整技能。wshobson 的转换假设已评分轨迹；smithtune 主要做轨迹级微调；TabAgent 是方法/代码参考；Bandits 的动作后 verifier 不能直接当作所有候选动作的 policy 真值。核心数据约束须由实际业务合同和程序检查承担。
