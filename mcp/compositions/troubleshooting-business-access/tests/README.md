# 业务访问排查合同测试

[合同测试](contract.test.mjs)用于核对本包[公开组件入口](../src/index.ts)与[原生流程资产](../flow.json)的最小合同。测试使用外部 SOC Mock，验证范围见[合同](<../docs/contract.md#构建交接与验证状态>)。

## 研发运行

从数据工作区根目录执行；将变量替换为实际已安装程序根，不安装依赖：

```sh
HARNESS_PROGRAM_ROOT=<实际程序根> node --test mcp/compositions/troubleshooting-business-access/tests/contract.test.mjs
```

仅运行时通过 `createRequire(<程序根>/platform/plugin/package.json)` 复用该安装的 `esbuild`，以 `write:false` 编译并通过 data URL 导入 TypeScript；不写临时编译产物，不导入平台执行器。外部 SOC 边界全部为 Mock，未声明操作直接失败。

## 覆盖与假定接口

- 通过 `create(soc)`、冻结的 `branchItems`、`prepare(input, config)`、`components[name](value, config, context)` 和 `artifacts(report)` 访问公开入口；字段及业务语义以源码为准。
- 核对三路身份、输入深复制、独立 `scope.requested`、故障起点可未知、历史窗口可省略、只读调用经 `context.call` 和每次 30 秒 timeout、请求失败/收到响应/未执行分开记录。
- `sourceTcp` 只返回 `UNKNOWN` 并保留未执行事实；`branchResult({branch,value})` 保留任意输出并以传入 `context.nodeId` 标识终态；`summary({items})` 必须拒绝漏项、重复及错序。
- 共享判据测试核对对象/时间适用性、候选六态、相关冲突、真实schema参数校验和未知执行不重发；使用本地fixture，不代表线上目录已接入。这是装载前提检查，不替代真实根流程执行。
- 静态核对根图、三路并行节点、各自有限告警后继、局部汇合、独立终态及节点/端口引用闭合；明确断言无HepBatch/HepChild和无回边。正文对象、状态、证据、候选、轮次、缺口、下一步与折叠raw JSON分别检查，并用恶意hostname/message检查转义。
- 核对当前入口的编译依赖和当前包内Markdown引用；允许的包外源码依赖为显式共享的MCP公共动作接口、诊断判据模块与报告模块；文档引用使用公开动作接口合同。不把历史版本、`.local`或依赖安装目录纳入当前资产遍历。

## 验证边界

测试直接调用组件与静态检查同一份原生图，**不构造或执行官方Graph/HepBatch**，不证明并行调度、条件运行时行为、跨请求续问或完整候选循环。Mock nodeId只核对事实隔离，不证明官方`component/current_path`自动加前缀。

`progress` 的 Mock 只核对调用顺序，不证明 Run 持久化、查询恢复或页面装载。Mock 响应不是实际 SOC 数据，也不是业务基线；这些合同测试不证明真实对象在线、连接正常、根因成立或业务修复。官方运行时、画布与真实业务验收须由研发在相应授权下另行取证；不主动探测。
