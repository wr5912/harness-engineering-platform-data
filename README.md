# harness-engineering-platform-data

Harness 工程平台的数据工作区，保存智能体来源登记、Experiment、Run、Decision、历史证据、用户配置与 MCP 编排。管理助手 Harness 位于 [DSH home 仓库](https://github.com/wr5912/platform-manager-dsh-home)，业务设计、验收与 Harness 资产位于 [business-agents](https://github.com/wr5912/business-agents)。

平台运行环境使用 Node.js 24.9+、Python 3.10+，启动与依赖准备见[程序仓说明](https://github.com/wr5912/harness-engineering-platform/blob/main/README.md#快速启动)。

- [智能体研究登记与历史资料](agents/)
- [业务 Harness 来源登记](registry/agents/)
- [仓库版本锁定](locks/repositories.yaml)
- [管理助手业务工作区契约](config/assistant-workspace.json)
- [研究与运行记录](evolution/)
- [当前配置](config/)
- [MCP 管理](mcp/README.md)
