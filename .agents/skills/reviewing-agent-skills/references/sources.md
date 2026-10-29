# 来源、版本与规则适用性

核查日期：**2026-10-28**。以下官方规范与实现用于判断规则来源；设计文章不能新增格式义务。复审不同版本时重新核对适用性，不用本日期冒充“始终最新”。

架构专项的官方设计资料于 **2026-10-29** 补充核查；其建议标为 `official-guidance`，本包由此制定的审查协议标为 `local-quality`。未重新核验的固定格式实现不因新增本节而改称最新版。

## 官方规范与参考实现

| 来源 | 固定版本/定位 | 用途与边界 |
|---|---|---|
| [Agent Skills Specification](https://agentskills.io/specification) | [规范源码](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/docs/specification.mdx)，提交 `69ef37e9424c0a7ea9dd2293b559e43ec8176379` | 通用格式与组织建议；正文没有固定章节限制 |
| [skills-ref validator](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref/src/skills_ref/validator.py) | 同一提交，包版本 `0.1.0` | 官方参考实现；接受 Unicode 名称，拒绝未列顶层字段，但没有覆盖全部可选字段和正文 |
| [skills-ref parser](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref/src/skills_ref/parser.py) | 同一提交 | 使用 StrictYAML，标量按字符串处理；某些表示与分隔符处理有参考实现限制 |
| [skills-ref tests](https://github.com/agentskills/agentskills/tree/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref/tests) | 同一提交 | 官方用例接受未加引号的 `metadata.version: 1.0`；不能用另一解析器的隐式 float 类型误报 |
| [skills-ref package](https://github.com/agentskills/agentskills/blob/69ef37e9424c0a7ea9dd2293b559e43ec8176379/skills-ref/pyproject.toml) | Python >=3.11；StrictYAML >=1.7.3、Click >=8.0 | 官方命令的依赖要求，与本包 Python 3.9+ 检查器分开 |
| [YAML 1.2.2 nodes](https://yaml.org/spec/1.2.2/#3211-nodes) | YAML 1.2.2 | 映射键唯一；不能静默忽略重复字段 |
| [Anthropic authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | 在线文档，按核查日期 | 简洁、渐进披露、自由度、反馈与示例的官方建议；产品特有约束不自动扩展为所有运行时的通用格式 |

## DSH 官方目标合同

目标版本 `0.2.1-rc.2`，固定提交 `687f282e8625c6b8d11ff58211a90524be2e4317`：

- [skill-filesystem README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/README.md)：目录/扁平入口、发现深度、可选字段和调用开关。
- [skill-filesystem 实现](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts)：原生 frontmatter、`whenToUse`、`metadata`、开关合法值和旧字段拒绝。
- [skill registry 实现](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill/src/index.ts)：ASCII kebab-case 名称及注册合同。

DSH 扩展合法性、通用可移植性、原生装载和实际调用效果分别报告。官方参考拒绝扩展字段不自动等于 DSH 缺陷；DSH 宽松接收某字段也不自动满足通用规范。

## 实现复用与已知边界

本检查器使用 StrictYAML `1.7.3` 的解析能力，不复制官方 `skills-ref` 源码。自行实现的补充检查注明来源，结果不标成官方命令回执；依赖缺失不静默降级。

`skills-ref 0.1.0` 的检查范围不能等同完整规范：它没有完整校验 `metadata`、`allowed-tools`、`license` 的形状，也未落实 `compatibility` 非空下限；不检查正文章节、任务方法或运行时效果。参考解析器对普通标量的字符串处理与 YAML 1.1/1.2 的隐式类型解析不同，遇到边界要保留原文及各解析器结果，按目标合同判断。

## 设计与专项参考

以下仅提供审查思想和专项知识，不作为通用格式新增硬要求：

- [Anthropic: Equipping agents for the real world with Agent Skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills)。
- [Anthropic skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator)：评估与改进闭环。
- [Agent Skills: Evaluating skill output quality](https://agentskills.io/skill-creation/evaluating-skills)：代表任务、干净上下文、旧版/无 Skill 基线、结果与时间/Token 对照；示例数量和目录组织不是通用格式义务。
- [Claude Code: Skills](https://code.claude.com/docs/en/skills)：按需加载、触发评估和描述预算；具体字段、预算与配置属于该产品，不直接写进 DSH 合同。
- [Claude Code: Subagents](https://code.claude.com/docs/en/sub-agents)：独立上下文、可用工具、Skill 预加载和主/子任务取舍；独立上下文不自动代表文件系统、进程或权限隔离，也不证明 DSH 具备相同配置字段。
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents)：固定路径与动态判断、路由、并行及编排者/执行者模式；2024 年设计文章，页面已提示工具生态变化，不能作为当前 API 合同。
- [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)：按需获取信息、控制上下文以及子任务分工；长上下文和更多执行者的收益仍须按任务验证。
- [Anthropic: Multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system)：委派输入、边界、输出、协调成本和并行条件；文中成本倍数与效果数字来自其研究环境，不将其外推为本平台承诺。
- [Anthropic: Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)：确定性编排与上下文成本。
- [MCP Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)：发现、调用和变化通知；不保证自动语义兼容。

已核对的资料没有给出跨任务、模型和运行时通用的最佳 Skill 数量。500 行、正文 Token 规模和较浅引用是组织建议，不是自动拆 Skill、创建子智能体或判定装载失败的规则。架构建议须回到 [专项检查](architecture-review.md) 的任务、配置和实际轨迹取证。

DSH 的 Skill/子智能体装配、作用域、继承与工具权限按目标实际版本及发现结果核实；本包没有新增原生接口、调用额度或审批层。MCP 名称变化与过细编排仍是重点，但格式、正文内容与工整性检查不得因此省略。
