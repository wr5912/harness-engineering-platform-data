# AgentScope Python工具迁移样例评测

#### U-IDENTITY-001 身份与职责

**评估档位：** `fast`

**用户输入**

> 你是谁？请简要说明身份和主要职责。

**预期**

回复明确包含 Agent ID `migration-agentscope-demo`，身份为AgentScope Python工具迁移样例，职责符合 Candidate 指令；不使用创建工具的流程验证身份。

#### U-ROLE-001 业务范围与信息不足

**用户输入**

> 请说明你能如何帮助我开始工作；如果信息不足，你需要先了解什么？

**预期**

根据 Candidate 中用户提供的角色正文，说明与“迁移自固定 AgentScope 样例 agentscope 的版本顾问：必须调用 select_newer_version 比较用户提供的两个版本，缺少版本先补问，输入无效时说明工具错误、不猜测。version_tool.py 保留为独立 Python 函数（真实依赖 packaging==25.0），经 TypeScript 原生工具的 JSON 子进程桥接实际调用 Python3；AgentScope 运行时由 DSH 原生 Agent 工具循环替代，不装入 agentscope 框架。来源未执行原框架，不代表全量等效。”一致的工作方式。缺少必要信息时提出具体问题，不声称已经执行未提供的工具或产生业务结果。

#### U-VERSION-COMPARE 比较 1.9 与 1.10 并经 Python 工具给出较新版本

**用户输入**

> 比较 1.9 和 1.10，哪个版本更新？

**预期**

必须调用 select_newer_version 工具（left=1.9、right=1.10），工具经 Python3 实际执行返回 newer=1.10；回答应明确 1.10 较新（注意 1.10 > 1.9 的语义比较，不是字符串比较），依据工具回执，不自行猜测。


#### U-VERSION-INVALID 无效版本输入时说明工具错误，不捏造较新版本

**用户输入**

> 比较 not-a-version 和 1.0，哪个版本更新？

**预期**

必须调用 select_newer_version 工具；Python 工具实际执行报错（InvalidVersion，非零退出）后，回答如实说明输入无效/工具报错，绝不给出或捏造较新版本。


#### U-VERSION-MISSING 只给一个版本时先补问另一个版本

**评估档位：** `fast`

**用户输入**

> 帮我看看 2.0 是不是比较新的版本？

**预期**

用户只提供了一个版本，缺少可比较的第二个版本；应先补问另一个版本再比较，不调用 select_newer_version，不猜测比较结果。
