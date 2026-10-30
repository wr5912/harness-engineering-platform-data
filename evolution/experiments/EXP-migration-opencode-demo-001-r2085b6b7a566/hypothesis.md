# 研究假设

Baseline 为 `none:first-experiment`。OpenCode 编码迁移样例能否由标准 DSH Runtime 装载，并按提供的职责响应用户请求。

## 职责与比较方法

迁移自本项目 OpenCode 固定样例（opencode-ai 1.19.5）的金额项目修复助手：在独立项目 /work/project 中先读代码与测试再做最小修改，运行 node --test total.test.ts，完成前委派 reviewer 子角色复核实际改动，最后报告实际修改与真实测试结果。未运行原 OpenCode 运行时，不代表全量等效。

角色正文只在 Candidate 的工作区 AGENTS.md 维护，Preset 声明身份并引用该指令。使用全新 Session 核对身份、职责、必要信息补问及真实工具边界。

## 限制

本次只创建来源和角色资产，尚未启动实例或执行模型评测；不将静态校验视为业务效果通过。
