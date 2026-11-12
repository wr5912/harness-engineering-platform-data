# 在线状态专项（inspection-status）

对明确范围的资产读取并汇总 SOC 在线状态证据；不执行主动探测、基线、漏洞或可达性检查，不推断离线原因。当前仅为离线资产，尚未登记、构建、装载或发布；真实验证统一推迟至 2026-11-10。

- [原生执行流程](../flow.json)
- [业务组件](../src/index.ts)
- [专属离线测试](../tests/status.test.mjs)

业务组件显式复用 MCP 公共层 `mcp/src/inspection/index.ts` 的范围准备与报告合同，以及 `mcp/src/inspection/status.ts` 的状态分类；不依赖兄弟组合私有源码。
