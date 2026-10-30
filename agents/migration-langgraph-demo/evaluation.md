# LangGraph 报价流程迁移样例评测

#### U-IDENTITY-001 身份与职责

**评估档位：** `fast`

**用户输入**

> 你是谁？请简要说明身份和主要职责。

**预期**

回复明确包含 Agent ID `migration-langgraph-demo`，身份为LangGraph 报价流程迁移样例，职责符合 Candidate 指令；不使用创建工具的流程验证身份。

#### U-ROLE-001 业务范围与信息不足

**用户输入**

> 请说明你能如何帮助我开始工作；如果信息不足，你需要先了解什么？

**预期**

根据 Candidate 中用户提供的角色正文，说明与“迁移自固定 LangGraph 样例（LangGraph 1.5.0）的订单报价助手：LLM 收集 quantity 与 unit_price 后调用 TypeScript 图 SDK 实现的真实报价图（quantity>=10 命中 bulk 九折分支，否则 regular；tax 与 shipping 并行计算，join 汇合求总额），缺参数先补问、负数拒绝计算。来源为单次无状态流程，无 checkpoint/interrupt 要求；未运行原系统，不代表全量等效。”一致的工作方式。缺少必要信息时提出具体问题，不声称已经执行未提供的工具或产生业务结果。

#### U-GRAPH-BULK bulk 分支并行报价（quantity=10, unit_price=12）

**评估档位：** `fast`

**用户输入**

> 数量 10，单价 12，请给我报价。

**预期**

必须真实调用报价图工具 quote_graph（quantity=10, unit_price=12），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 bulk（route=bulk，quantity>=10 命中九折分支），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=108（10×12×0.9）、tax=10.8（108×10% 两位舍入）、shipping=0（subtotal>=100 免运费）、total=118.8（join 汇合后两位舍入）。回复需解释命中 bulk 分支及小计、税费、运费、总额，且与图回执一致。


#### U-GRAPH-REGULAR regular 分支并行报价（quantity=2, unit_price=20）

**评估档位：** `fast`

**用户输入**

> 数量 2，单价 20，请给我报价。

**预期**

必须真实调用报价图工具 quote_graph（quantity=2, unit_price=20），不得心算或用原子计算工具替代图计算。图回执要求执行完成（status=completed 且 complete=true），条件路由命中 regular（route=regular，quantity<10 不打折），tax 节点与 shipping 节点均实际执行（并行），join 节点在两节点之后汇合执行。金额与来源一致：subtotal=40（2×20）、tax=4（40×10%）、shipping=5（subtotal<100 收运费 5）、total=49（join 汇合后）。回复需解释命中 regular 分支及小计、税费、运费、总额，且与图回执一致。


#### U-GRAPH-MISSING 缺数量先补问不猜输入

**评估档位：** `fast`

**用户输入**

> 请帮我报价。

**预期**

缺少数量与单价时必须先向用户补问 quantity 与 unit_price，不得猜测或虚构输入，不得在参数不全时调用 quote_graph 图；本轮不给出任何报价数字。
