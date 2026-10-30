# 研究假设

Baseline 为 `none:first-experiment`。LangGraph 报价流程迁移样例能否由标准 DSH Runtime 装载，并按提供的职责响应用户请求。

## 职责与比较方法

迁移自固定 LangGraph 样例（LangGraph 1.5.0）的订单报价助手：LLM 收集 quantity 与 unit_price 后调用 TypeScript 图 SDK 实现的真实报价图（quantity>=10 命中 bulk 九折分支，否则 regular；tax 与 shipping 并行计算，join 汇合求总额），缺参数先补问、负数拒绝计算。来源为单次无状态流程，无 checkpoint/interrupt 要求；未运行原系统，不代表全量等效。

角色正文只在 Candidate 的工作区 AGENTS.md 维护，Preset 声明身份并引用该指令。使用全新 Session 核对身份、职责、必要信息补问及真实工具边界。

## 限制

本次只创建来源和角色资产，尚未启动实例或执行模型评测；不将静态校验视为业务效果通过。
