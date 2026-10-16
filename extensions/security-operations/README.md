# 网络安全运营组合扩展

此原生 DSH 插件提供 SOC 资产及告警接口映射，以及取证、研判、回写和报告四阶段运行器。平台保留通用组合目录、固定子版本执行与兼容编辑表单；业务接口映射和运行算法由本扩展维护。平台未装载此扩展时，不提供业务样例创建入口，已有业务组合可查看但不能执行。

程序依赖由平台 `platform/plugin/pnpm-lock.yaml` 锁定。构建使用 `HARNESS_PROGRAM_ROOT=<程序根> node build.mjs`，返回 `.local/build-cache/security-operations/<源码及工具链摘要>`；将其 `plugin.js` 作为原生 DSH 插件插入平台 Profile。不复制 DSH 源码，不另建插件装载器。连接与模型配置继续由原生 MCP 配置管理和模型设置保存。

运行算法从本数据仓库保留的 `6e80f2c92b7983cbe8fc7957685d36338080b134` 提交中恢复原 EXP-020 Candidate；它是只读运行制品。完整实验历史和旧目录引用保持有效。运行记录保存于工作区 `.local/artifacts/security-operations`，算法制品在该目录的 `source/` 下按固定提交封存；备份时一并保留，不能当普通缓存清理。

阶段协调使用平台启动器传入的 `HARNESS_PYTHON`；当前算法要求 Python 3.10 或更新版本。`HARNESS_PROGRAM_ROOT=<程序根> HARNESS_PYTHON=<解释器路径> node test.mjs` 运行扩展回归，包括固定 CLI 等效比较。组合回执分别记录程序提交、工作区提交与实际装载的扩展摘要。

LLM API Key 不进入本扩展或 Git。测试只使用基本运维状态和模拟事件，不构造恶意代码、病毒或渗透数据。
