# 数据工作区协作

本仓保存智能体来源登记、Experiment、Run、Decision、实例状态、历史证据，以及用户配置的 MCP 服务和组合编排。业务智能体当前需求、定义、验收标准与主线 Harness 由 business-agents 唯一维护；本仓 `agents/<id>/manifest.yaml` 仅保存动态研究登记和历史关联，不复制当前 `evaluation.md`。程序与 MCP 框架属于 harness-engineering-platform；管理方法、身份和 Skill 属于 platform-manager-dsh-home。Harness 保持文件形式，不存数据库。

管理助手以本目录为 cwd，身份和技能仍由原生 DSH HOME 装载。研发工具阅读这些资料不切换成业务角色；运行身份以 HOME 的 AGENTS.md 为准。

修改当前配置或来源引用时同步直接消费者，保持来源提交可解析。历史 Run 与原始观察作为执行事实保留，重新执行创建新记录，不修改历史结果来迎合当前实现。凭据、会话、缓存和依赖保持本地忽略。

先读 README.md 与目标目录入口，只检查受影响的文件合同及实际装载。跨仓事项查阅父工作区 AGENTS.md（存在时）；不要假设开发工具自动继承父仓指令。提交前核对 diff、必要版本锁及实际验证范围。
