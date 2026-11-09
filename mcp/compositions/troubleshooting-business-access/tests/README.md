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
- 核对固定六项及解析输出隔离、输入深复制、独立 `scope.requested`、纯准备阶段、只读调用经 `context.call` 和每次 30 秒 timeout、事实先 `progress` 后返回。
- `sourceTcp` 只返回 `UNKNOWN` 并保留未执行事实；`branchResult({branch,value})` 保留任意输出并以传入 `context.nodeId` 标识终态；`summary({items})` 必须拒绝漏项、重复及错序。
- 递归核对非code模板字段的`show:true`；明确断言HepBatch的body/items_key/concurrency常量可见、具有实际value并保留官方类型。这是装载前提检查，不替代真实根流程执行。
- 静态核对根图、`HepBatch.template.body.value.data.nodes/edges`、全部条件端口的准确中文`display_name`与批节点业务名、六路原生条件、TCP 四路实际后继、独立终态、局部汇合及节点/端口引用闭合。正文对象、状态、证据、缺口、下一步与折叠 raw JSON 分别检查，并用恶意 hostname/message 检查转义。
- 核对当前入口的编译依赖和当前包内 Markdown 引用；允许的包外源码依赖为显式共享的 MCP 公共动作接口与报告模块；文档引用使用公开动作接口合同。不把历史版本、`.local` 或依赖安装目录纳入当前资产遍历。

## 验证边界

测试直接调用组件与静态检查同一份原生图，**不构造或执行官方 Graph/HepBatch**，不证明并行调度、条件运行时行为或即时后继推进。带 `batch[index]` 的 Mock nodeId 只核对事实隔离，不证明官方 `component/current_path` 自动加前缀。

`progress` 的 Mock 只核对调用顺序，不证明 Run 持久化、查询恢复或页面装载。Mock 响应不是实际 SOC 数据，也不是业务基线；这些合同测试不证明真实对象在线、连接正常、根因成立或业务修复。官方运行时、画布与真实业务验收须由研发在相应授权下另行取证；不主动探测。
