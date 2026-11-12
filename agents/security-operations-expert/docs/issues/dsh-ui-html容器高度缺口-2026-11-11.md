# dsh-ui-html 容器高度自适应缺口

日期：2026-11-11

## 现象

真实 iframe 宽 662px 下七列已完整显示；但插件卡片高度自动增长到约 900px，2 行表单后出现大块留白。

## 根因

- `show_ui` 工具 Schema 仅支持 `html`、`title`、`description`、`wait_for_interaction`、`interaction_hint`，**无 `height`/`autoHeight`/`maxHeight` 参数**（`lib/tool.js`）。
- `lib/client.js` 的 srcdoc bootstrap 使用
  `Math.max(document.documentElement.scrollHeight, body.scrollHeight)` 上报高度；根 `scrollHeight` 不低于当前 iframe viewport（约 900），并监听 `ResizeObserver`/`MutationObserver` 反复上报，形成高度保持而非按内容收缩。

## 精确缺口

需插件侧（`lib/client.js`）改为按内容实际高度上报，例如使用 `body.getBoundingClientRect().height` 或为根元素设置 `height:auto`/`min-height:0`，并避免把 viewport 高度计入；或为 `show_ui` 增加受控 `height` 参数。属公共插件改动，未在候选内绕过，未做 CSS hack。
