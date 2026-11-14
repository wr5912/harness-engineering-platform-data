# 来源与装配

- 模板来源：本 Agent Candidate 内 `dsh/workspace/references/ui-baseline/方案文档生成工具-静态验收原型.html`。
- 模板性质：用户提供的合成验收基线，不是外部开源依赖；原始静态文件保持不改。
- 本包实现：将模板的内联样式、标记和交互脚本作为 Client Slot 组件内容，装配到 DSH 原生 `shell.overlay`；不使用 iframe，不追加第二个应用根节点。
- 状态边界：固定样本数字、下载按钮和本地 UI 交互不等于真实导出、需求覆盖或发布通过；真实业务数据需由 Agent 工具和项目工作区确认。
