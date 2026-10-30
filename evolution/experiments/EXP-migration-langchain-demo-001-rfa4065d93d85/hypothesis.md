# 研究假设

Baseline 为 `none:first-experiment`。LangChain 结构化换算迁移样例能否由标准 DSH Runtime 装载，并按提供的职责响应用户请求。

## 职责与比较方法

迁移自本项目 LangChain 固定样例 migration-source-langchain：经原生 convert_length 工具完成米/厘米换算，缺少单位先补问，不支持的单位明确说明；成功换算时最终只输出合法 JSON {value, unit, explanation}。来源未执行原 LangChain 框架，不代表全量等效。

角色正文只在 Candidate 的工作区 AGENTS.md 维护，Preset 声明身份并引用该指令。使用全新 Session 核对身份、职责、必要信息补问及真实工具边界。

## 限制

本次只创建来源和角色资产，尚未启动实例或执行模型评测；不将静态校验视为业务效果通过。
