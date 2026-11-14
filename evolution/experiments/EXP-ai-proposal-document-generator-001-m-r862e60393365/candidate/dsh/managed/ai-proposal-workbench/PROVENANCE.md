# 来源与装配

- 模板来源：本 Agent Candidate 内 `dsh/workspace/references/ui-baseline/方案文档生成工具-静态验收原型.html`。
- 模板性质：用户提供的合成验收基线，不是外部开源依赖；原始静态文件保持不改。
- 本包实现：将模板的内联样式、标记和交互脚本作为 Client Slot 组件内容，装配到 DSH 原生 `shell.overlay`；不使用 iframe，不追加第二个应用根节点。
- 状态边界：固定样本数字、下载按钮和本地 UI 交互不等于真实导出、需求覆盖或发布通过；真实业务数据需由 Agent 工具和项目工作区确认。
- 固定模板 SHA-256：`ddb475a2660265182499d3f1c166348e9269dc187d34da900fb21387545df376`。
- 可恢复生成：在本目录运行 `python3.10 tools/build-native-workbench.py`；运行 `node tools/verify-client.mjs` 检查包名、Client 入口、原生 Slot、基线选择器、事件桥、无 iframe/外网和模板摘要。
- 生成产物：`lib/client.js`；生成文件应随模板变化重新生成，不手工编辑。
- Host 状态合同：`lib/index.js` 注册只读 `/plugins/ai-proposal-workbench/state`，仅读取受控 `/work/project` 已知 Markdown 产物和固定 RFP 文件，返回来源文件、摘要、要求/证据/评审/发布门禁的待核对状态；没有 MCP 或领域工具时不伪造真实台账。
