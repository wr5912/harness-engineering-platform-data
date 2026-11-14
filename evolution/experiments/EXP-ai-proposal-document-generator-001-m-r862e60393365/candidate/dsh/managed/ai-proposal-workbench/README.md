# 原生方案工作台

该包把业务 Agent 的静态 HTML 验收基线作为 React/Client Slot 内的原生 DSH Web 页面显示，不使用 iframe，也不替换 DSH 应用根节点。

- 入口：`lib/client.js`
- 宿主：`lib/index.js`（仅提供可装载 Host 入口）
- 挂载位置：`shell.overlay`
- 固定模板：`dsh/workspace/references/ui-baseline/方案文档生成工具-静态验收原型.html`
- 生成：`python3.10 tools/build-native-workbench.py`
- 校验：`node tools/verify-client.mjs`
- 页面中的指标当前标为“固定合成样本/状态待验证”；真实项目状态必须由 Agent 工具和工作区产物确认后再更新。
- 页面事件通过 `window.dsh.emit` 和同源 Host 路由发送小型 `view.change`、`evidence.select`、`ai.optimize`、`review.submit` 和 `download.request` 事件；当前 Host 仅确认接收并保留最后一条观测，不等于 Agent follow-up、业务写入或导出成功。
- Host 提供同源只读状态路由 `/plugins/ai-proposal-workbench/state`：优先读取 `/work/project` 中的真实 Markdown 产物，返回 `stateMode=live`、源文件和 SHA-256；没有项目产物时降级为 `fixture`。该路由不执行发布、不写入文件。
- Host 事件路由 `/plugins/ai-proposal-workbench/event` 只校验并接受白名单事件，返回 `persisted=false`；真正业务状态仍需 Agent 工具/工作区产物。
