# 本包合同测试

[测试源码](<contract.test.mjs>)只检查本包TS组件和原生flow静态合同，外部SOC仅使用Mock；不模拟/替换官方LFX调度器，不发真实请求，不绑定、不发布。本会话未执行测试；已收到的研发测试反馈及正式源文件复验边界见[契约](<../docs/contract.md#报告依赖与验证状态>)。

在数据根运行（将程序根占位符替换为研发实际绝对路径；环境已有esbuild，不安装依赖）：

```sh
HARNESS_PROGRAM_ROOT=<实际程序根> node --test mcp/compositions/troubleshooting-device-offline/tests/contract.test.mjs
```

覆盖用户重复alertId跨页复现、稳定ID重复、总数变化/类型/字段冲突、错组/错snapshot、多数组歧义、重复/非法cursor、游标与total终点冲突、cursor-only超快照总数即停止续读、零页/重复组/总数不符，以及正常游标、页码、多组分页和零组；保留不完整结果、原错误与原始页。同时覆盖prepare深拷贝和独立requested、resolve使用冻结输入、progress先于返回且抛错不可转成功、无真实响应不读采集、根summary三项身份/顺序/Run/事实闭包、HepBatch嵌套body闭包和互斥独立终态、HTML转义及details折叠JSON。

新增递归检查覆盖根及嵌套HepBatch：body/items_key/concurrency和其余非code输入须保留`show:true`，常量须有value并保留官方字段类型，防止只看原生body存在却遗漏装载前提。

测试通过最多证明上述组件/Mock及静态合同；不证明官方LFX可装载/执行、真实并行、即时后继、HTTP流式行为或真实SOC业务验收。管理原子仍unavailable，因此真实响应→适用性→绑定→本地采集批次路径尚无本包真实响应运行证据，不用模型自填响应补造。

原生流程与执行边界见[契约](<../docs/contract.md>)。本次读过的用户临时重复成员复现和官方LFX外部SOC模拟边界探针只作缺陷/来源说明，不作为测试运行依赖；本文件不执行这些探针，也不将其称为本稿或真实业务验收。
