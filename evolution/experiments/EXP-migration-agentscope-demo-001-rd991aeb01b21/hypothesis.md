# 研究假设

Baseline 为 `none:first-experiment`。AgentScope Python工具迁移样例能否由标准 DSH Runtime 装载，并按提供的职责响应用户请求。

## 职责与比较方法

迁移自固定 AgentScope 样例 agentscope 的版本顾问：必须调用 select_newer_version 比较用户提供的两个版本，缺少版本先补问，输入无效时说明工具错误、不猜测。version_tool.py 保留为独立 Python 函数（真实依赖 packaging==25.0），经 TypeScript 原生工具的 JSON 子进程桥接实际调用 Python3；AgentScope 运行时由 DSH 原生 Agent 工具循环替代，不装入 agentscope 框架。来源未执行原框架，不代表全量等效。

角色正文只在 Candidate 的工作区 AGENTS.md 维护，Preset 声明身份并引用该指令。使用全新 Session 核对身份、职责、必要信息补问及真实工具边界。

## 限制

本次只创建来源和角色资产，尚未启动实例或执行模型评测；不将静态校验视为业务效果通过。
