# dsh-ui-html

> 在 DeepSeek Harness（`dsh`）对话中渲染沙箱化的交互式 HTML 界面，并把用户的操作**结构化地送回模型**——默认作为一条新的用户消息，阻塞模式下作为工具结果。

`dsh-ui-html` 提供一个 `show_ui` 工具：模型给出 HTML，对话里就地渲染成一张界面卡片；用户在其中操作后，界面通过 `window.dsh.emit(name, payload)` 提交的结构化数据会回到模型，模型据此继续。

## 功能

- **渲染**：`show_ui` 把 HTML 渲染进对话。前端半边在两个插槽上注册：`tool.call.toolview`（工具调用行上的界面卡片）与 `conversation.chat.turnTail`（把界面渲染进对话正文）。
- **回传**：界面调用 `window.dsh.emit(name, payload)` 提交结构化数据。**默认模式**下，这次提交由宿主注入为**一条新的用户消息**，模型在下一轮继续处理；**阻塞模式**下（`wait_for_interaction: true`），提交内容作为本次调用的**工具结果**返回。
- **两种等待模式**：
  - `wait_for_interaction: false`（默认，推荐）——界面立即展示，工具调用当轮返回 `presented`，不占用本轮；用户提交后作为新用户消息进入下一轮。
  - `wait_for_interaction: true`——工具调用在本轮内阻塞等待提交，交互作为工具结果返回；等待期间交互挂在工具调用上（旧模式）。
- **可视化配置**：7 项设置可在 DSH 设置页调整。宿主侧为即时生效（volatile 设置）；浏览器半边读取的是一份启动快照，改动后需刷新页面。

## 与 dsh-visualize 的区别

`dsh-visualize` 是单向展示——把 HTML 渲染给用户看，没有用户到模型的回传通道。
本插件是闭环——界面内的用户操作会**结构化地回到模型**，成为下一步的输入。

## 安装

```sh
dsh plugin --profile <profile> add github:<owner>/dsh-ui-html
```

安装后重启 DSH 生效（bundle 在启动时展开）。

## 工具：`show_ui`

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `html` | string | 是 | 要展示的 HTML（片段或完整文档），可用内联 `<style>`/`<script>`。 |
| `title` | string | 否 | 界面短标题，显示在对话卡片上。 |
| `description` | string | 否 | 界面之上的文字说明，也是界面无法渲染时的回退文本。 |
| `wait_for_interaction` | boolean | 否 | 默认 `false`：界面立即展示，用户提交后作为新用户消息回到模型。`true`：本轮内阻塞等待并把交互作为工具结果返回。 |
| `interaction_hint` | string | 否 | 提示用户如何操作。 |

返回结果：

| 字段 | 说明 |
| --- | --- |
| `status` | `presented`（已展示并等待提交，提交走新用户消息）/ `interaction`（阻塞模式已收到交互）/ `timeout`（阻塞等待超时）/ `cancelled`（交互前本轮被取消）/ `unsupported`（交互回传不可用，界面仅展示）。 |
| `ui_id` | 本次界面实例的稳定标识（等于工具调用 id）。 |
| `event_name` | 用户界面提交的事件名（阻塞模式）。 |
| `payload` | 界面显式 `emit` 的内容（阻塞模式）；可以是任何 JSON 值。 |
| `note` | 状态补充说明。 |

### 界面侧约定

- 界面运行在 `sandbox="allow-scripts"` 的 iframe 中：不透明源，不能访问宿主文档、Cookie、`localStorage`、剪贴板或本机文件。
- 默认不能访问任何网络地址；可加载的外部资源来源由 `allowedResourceOrigins` 逐条放行。
- 宿主注入 `--dsw-alias-*` 主题变量，界面可直接在 CSS 中使用。

## 配置

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关：关闭后不注册工具、不注册事件桥、不发系统提示。 |
| `announceToAgent` | `true` | 是否向 agent 的系统提示声明本插件；关闭后仅在用户点名时使用。 |
| `maxHtmlBytes` | `262144` | 单次界面 HTML 的最大字节数（UTF-8）。 |
| `maxEventBytes` | `65536` | 单条交互事件 payload 序列化后的最大字节数。 |
| `interactionTimeoutMs` | `0` | 阻塞模式等待用户交互的超时（毫秒）；`0` 表示一直等到本轮被取消。 |
| `allowedResourceOrigins` | `[]` | 允许界面加载的外部资源来源（`scheme://host[:port]`），默认全部禁止。 |
| `eventBridgeEnabled` | `true` | 交互事件回传开关；关闭后 `wait_for_interaction: true` 返回 `status: unsupported` 而不是抛错。 |

## 安全模型

不可信 HTML 只在 iframe 内接触页面：沙箱化 iframe（`allow-scripts`，无 `allow-same-origin`）提供不透明源，配合注入的 CSP，交互经由校验 `event.source` 的 `postMessage` 桥传递。策略由宿主半边决定，前端半边只读取一次只读描述（`/plugins/dsh-ui-html/status`）并照其执行；交互事件经 `/plugins/dsh-ui-html/event` 回传；默认不加载任何外部资源。

## 开发

```sh
npm install
npm test          # 等价于 node --test test/
```

测试覆盖协议、桥、配置、工具、入口与前端半边（`test/*.test.mjs`）。前端与桥的部分用例需要 `@deepseek-ai/dsh-llm`、`@deepseek-ai/schemastery`（随 `devDependencies` 安装）。

## 许可

MIT，见 [LICENSE](./LICENSE)。
