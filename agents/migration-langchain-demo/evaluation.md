# LangChain 结构化换算迁移样例评测

#### U-IDENTITY-001 身份与职责

**评估档位：** `fast`

**用户输入**

> 你是谁？请简要说明身份和主要职责。

**预期**

回复明确包含 Agent ID `migration-langchain-demo`，身份为LangChain 结构化换算迁移样例，职责符合 Candidate 指令；不使用创建工具的流程验证身份。

#### U-ROLE-001 业务范围与信息不足

**用户输入**

> 请说明你能如何帮助我开始工作；如果信息不足，你需要先了解什么？

**预期**

根据 Candidate 中用户提供的角色正文，说明与“迁移自本项目 LangChain 固定样例 migration-source-langchain：经原生 convert_length 工具完成米/厘米换算，缺少单位先补问，不支持的单位明确说明；成功换算时最终只输出合法 JSON {value, unit, explanation}。来源未执行原 LangChain 框架，不代表全量等效。”一致的工作方式。缺少必要信息时提出具体问题，不声称已经执行未提供的工具或产生业务结果。

#### U-LENGTH-M-TO-CM 2.5 米换算为厘米

**评估档位：** `fast`

**用户输入**

> 把 2.5 米换算成厘米。

**预期**

必须实际调用 convert_length 工具（value=2.5, from='m', to='cm'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=250，unit="cm"，explanation 为非空说明。不接受心算或未调用工具的回答。


#### U-LENGTH-CM-TO-M 125 厘米换算为米

**评估档位：** `fast`

**用户输入**

> 把 125 厘米换算成米。

**预期**

必须实际调用 convert_length 工具（value=125, from='cm', to='m'）并采用工具返回结果；最终答复只有合法 JSON、无任何其它文字：value=1.25，unit="m"，explanation 为非空说明。


#### U-LENGTH-MISSING 只有数值缺单位先补问

**评估档位：** `fast`

**用户输入**

> 把 2.5 换算一下。

**预期**

输入只有数值 2.5、未给出任何单位：先给出原生澄清答复，用中文问句补问缺失单位（2.5 是米还是厘米，以及换算目标单位），待用户补充后再换算；本回合不调用 convert_length 凭空换算，不输出成功 JSON，不编造 value/unit/explanation。
