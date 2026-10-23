# 网络安全运营组合扩展

此原生 DSH 插件提供 SOC 资产及告警接口映射，以及取证、研判、回写和报告四阶段运行器。平台保留通用组合目录、固定子版本执行与兼容编辑表单；业务接口映射和运行算法由本扩展维护。平台未装载此扩展时，不提供业务样例创建入口，已有业务组合可查看但不能执行。

程序依赖由平台 `platform/plugin/pnpm-lock.yaml` 锁定。构建使用 `HARNESS_PROGRAM_ROOT=<程序根> node build.mjs`，返回 `.local/build-cache/security-operations/<源码及工具链摘要>`；将其 `plugin.js` 作为原生 DSH 插件插入平台 Profile。不复制 DSH 源码，不另建插件装载器。连接与模型配置继续由原生 MCP 配置管理和模型设置保存。阶段协调使用固定 Candidate 的原生 MCP 网关客户端，通过本机短期桥调用已绑定的 SOC 与报告连接。

运行算法从本数据仓库保留的 `c903724269be0ef249182e2fd7024325c7124629` 提交中恢复 EXP-security-operations-expert-022-r41bf6c2f0d3d Candidate；它是只读运行制品。历史来源从固定 Git 提交恢复，不依赖当前工作树保留旧 Experiment 目录。运行记录保存于工作区 `.local/artifacts/security-operations`，算法制品在该目录的 `source/` 下按固定提交封存；备份时一并保留，不能当普通缓存清理。更换固定算法后，旧 Run 仍可读取；已完成阶段在绑定、模型、result/context 一致性及必需交付文件存在与格式可解析检查后只返回既存结果，不再采样；Run 与必需制品路径不接受符号链接。旧未完成阶段拒绝跨版继续。旧 Run 没有逐文件摘要，该检查不证明历史文件从未被事后修改，也不会回填历史事实。

阶段协调使用平台启动器传入的 `HARNESS_PYTHON`；当前算法要求 Python 3.10 或更新版本。`HARNESS_PROGRAM_ROOT=<程序根> HARNESS_PYTHON=<解释器路径> node test.mjs` 运行扩展回归，包括固定 CLI 等效比较。组合回执分别记录程序提交、工作区提交与实际装载的扩展摘要。

LLM API Key 不进入本扩展或 Git。测试只使用基本运维状态和模拟事件，不构造恶意代码、病毒或渗透数据。
