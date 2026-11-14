# 原生方案工作台

该包把业务 Agent 的静态 HTML 验收基线作为 React/Client Slot 内的原生 DSH Web 页面显示，不使用 iframe，也不替换 DSH 应用根节点。

- 入口：`lib/client.js`
- 宿主：`lib/index.js`（仅提供可装载 Host 入口）
- 挂载位置：`shell.overlay`
- 固定模板：`dsh/workspace/references/ui-baseline/方案文档生成工具-静态验收原型.html`
- 页面中的静态指标仅代表固定合成样本；真实项目状态必须由 Agent 工具和工作区产物确认后再更新。
