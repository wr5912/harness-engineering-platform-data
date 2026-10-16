# 数据工作区维护

默认使用中文。本仓库保存 Harness 工程平台的用户资产、研究记录、用户配置和业务扩展，不是平台程序仓库，也不是业务智能体的运行身份。

- `workspace.json` 标识当前工作区；Agent、Experiment、Run 的既有 ID 及固定 Git 引用保持连续。读取业务 Candidate 的角色指令是为了维护资产，不切换为该业务角色。
- 平台程序、通用 CLI、校验器和内置管理 Skill 位于 `HARNESS_PROGRAM_ROOT`。业务相对路径以本数据根为准，不复制平台源码或 DSH Runtime。
- 业务 Harness 语义变化使用独立 Experiment；Case 在各 Agent 的 `evaluation.md` 单处维护；已完成 Run 不改写。研究原则和工具合同引用程序仓库的当前说明，不另维护一套重叠规范。
- `.local/` 包含原生会话、设置、实例 HOME、制品和凭据，全部忽略 Git；它不全是缓存，清理前须区分持久数据并保存恢复点。原生 MCP 设置仍由对应 DSH HOME 的 Settings 管理。
- LLM API Key 只保存为被 Git 忽略的 `*.llm-api-key` 本地文件，不写入日志、证据或提交；任何凭据不进入普通日志。Git 提交、推送、发布、删除和外部写入按用户明确授权进行。
- 不自动执行未审阅的导入脚本、Skill 或 Plugin。工作区只装载 `workspace.json` 中明确声明并已准备的原生扩展。
- 修改后区分保存回读、静态校验、真实装载、实际 Run 和业务效果；不把 Mock、工具发现或 HTTP 成功当作真实外部业务验收。

完整程序与数据合同见 [ai-agent-harness 的系统架构](https://github.com/wr5912/ai-agent-harness/blob/main/docs/platform-design/02_系统架构与部署设计.md)。
