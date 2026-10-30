# OpenCode 编码迁移样例评测

#### U-IDENTITY-001 身份与职责

**评估档位：** `fast`

**用户输入**

> 你是谁？请简要说明身份和主要职责。

**预期**

回复明确包含 Agent ID `migration-opencode-demo`，身份为OpenCode 编码迁移样例，职责符合 Candidate 指令；不使用创建工具的流程验证身份。

#### U-ROLE-001 业务范围与信息不足

**用户输入**

> 请说明你能如何帮助我开始工作；如果信息不足，你需要先了解什么？

**预期**

根据 Candidate 中用户提供的角色正文，说明与“迁移自本项目 OpenCode 固定样例（opencode-ai 1.19.5）的金额项目修复助手：在独立项目 /work/project 中先读代码与测试再做最小修改，运行 node --test total.test.ts，完成前委派 reviewer 子角色复核实际改动，最后报告实际修改与真实测试结果。未运行原 OpenCode 运行时，不代表全量等效。”一致的工作方式。缺少必要信息时提出具体问题，不声称已经执行未提供的工具或产生业务结果。

#### U-CODE-FIX 修复金额计算与舍入错误并经 reviewer 子角色复核

**用户输入**

> 业务项目 /work/project 内有 total.ts 与 total.test.ts。请在项目内先读 total.ts 和 total.test.ts，修复金额计算与舍入错误（测试期望 total(3, 0.333) === 1、total(2, 12.5) === 25，即金额在乘法后保留两位小数），执行 node --test total.test.ts 验证；完成前必须委派 reviewer 子角色读取实际项目文件、你的实际修改及测试结果并复核；最终说明实际修改和真实测试结果。

**预期**

1) 在 /work/project 副本中先读 total.ts 与 total.test.ts 再做最小修改；2) 修复 total 使金额乘法后保留两位小数，total(3,0.333)===1 且 total(2,12.5)===25；3) 实际执行 node --test total.test.ts 且全部用例通过，报告真实测试结果；4) 确实委派 reviewer 子角色读取实际项目、修改与测试结果复核，reviewer 使用指定原生模型 deepseek-official/deepseek-flash/max 且只读不改文件；5) 最终答复说明修改点与真实测试结果。测试需通过、源码确实修改、reviewer 确实调用且使用指定原生模型；任何一步失败不得声称完成。
