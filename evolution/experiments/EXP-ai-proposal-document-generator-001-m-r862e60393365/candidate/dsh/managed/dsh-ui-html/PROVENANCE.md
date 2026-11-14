# 来源与装配状态

## 固定上游

- 仓库：https://github.com/eaglezlee/dsh-ui-html
- 提交：`5ef7d44927e1c505b8d42e7abe066aa055419e6a`（2026-10-09，`dsh-ui-html 0.1.0`），MIT。
- 包名 `@eaglezlee/dsh-ui-html`，版本 `0.1.0`。
- 上游 `files` 声明的交付内容为本目录的 `lib/`、`locale/`、`cordis.patch.yml`、`icon.svg`、`README.md`、`LICENSE`；上游 `test/` 与 `.gitignore` 未纳入本部署。源码字节未修改。

机器核对清单（相对本目录，SHA-256）：

```text
lib/index.js 71eb092a0304f9bbf8abc005d40ac02b3b07b5bb06abedbb325beabae869bc29
lib/bridge.js b7ad16d596a743980c0d26cb4a69264a85eb4a7638163b4ead5182b195624192
lib/config.js b059092ed26b24cec0c41738e2be828bc6c205d0d9f4b61313883210f33d4135
lib/tool.js d505650b469c311ad4389c0effea1d7c9bf51e139456b08ce7400dd9b5b7e3d9
lib/protocol.js 98da7c17a8c62c84a34b155fec45696a00f121408d6b9001eb7ee959a70cc6ae
lib/client.js 83d8db0f7f2c6787af8f174ec77df4919385b0ff59c927715d7102143bc1b3e4
locale/zh.json 319d3d46781f4f8e769a8fad4cce9e07de6b397d1c96d9d437d3c2c49127f74f
locale/en.json 2aaa664f0b4fdc60e0e3bac619dae11665adfdbbc85b3bbaa44aed15fa5b64b7
package.json 3760d8cca3ed02e71618af818f140ce585fb6541b07e538f5d9b197aab5bb345
cordis.patch.yml d6795b1fc19162703e6a78e917ff7f7fadf3bf5235220902f4f8c740130cc93c
icon.svg a9141195c8c6fa9ee97a31fce1598e1564c1111f64621970c591e4ba6ef9b8b3
README.md 30a9f34599812275d072e48553accc1c7f42d7d6cdb126936114b7cc7410b1a7
LICENSE 8e66f4e41e5833600fac03dc3c915c44da612c97416281c0ed011d0e8813125c
```

## 运行时依赖与解析方式

本实例的 Profile 目录 `node_modules` 由平台以只读空白目录覆盖，Profile 安装的包无法进入；宿主半通过绝对路径加载，Node 从本目录向上解析 `node_modules`。因此本目录自带扁平依赖闭包（`node_modules/`，不进入 Git，按平台既有做法本地保留），未修改任何依赖源码。

依赖闭包按目标运行时 `ai-agent-harness/dsh:b830ec950`（DSH `0.2.1-rc.5`，源码提交 `b830ec950faba0a46dda564be3e2d854afed94f1`）的安装内容生成；生成方式为从 `@deepseek-ai/dsh-llm` 与 `@deepseek-ai/schemastery` 出发，按各包 `dependencies`/`peerDependencies` 递归复制真实目录并去掉嵌套 `node_modules`，保持扁平布局：

```text
@deepseek-ai/dsh-llm 0.2.1-rc.5
@deepseek-ai/schemastery 3.18.5
@deepseek-ai/cordis 4.0.5
@deepseek-ai/cordis-plugin-include 1.0.10
@deepseek-ai/cordis-plugin-loader 1.0.6
@deepseek-ai/cosmokit 1.8.6
@deepseek-ai/dsh-brand 0.2.1-rc.5
@deepseek-ai/dsh-timeout 0.2.1-rc.5
@deepseek-ai/dsh-typert-protocol 0.2.1-rc.5
@deepseek-ai/dsh-util-crypto 0.2.1-rc.5
@deepseek-ai/dsh-util-values 0.2.1-rc.5
@standard-schema/spec 1.1.0
js-yaml 4.3.2
zod 4.4.3
argparse 2.0.1
node-addon-native-custom-loader 0.1.9
node-addon-require-builtin 0.1.9
```

来源真实目录（运行时容器内）：`/opt/dsh/packages/**`、`/opt/dsh/vendor/**`、`/opt/dsh/node_modules/.pnpm/**`。依赖仅服务于本插件的宿主半；客户端半由 DSH 的 `dsh-client-modules` 读取本包 `package.json` 的 `dsh.client` 与 `exports["./client"]` 提供，不需要本目录 `node_modules`。

## 装配

- 装配行写入 `../security-operations-expert.patch.yml`（Profile 层），`id: ui-html`，`name: /opt/dsh-managed/dsh-ui-html/lib/index.js`；容器内把本目录挂载为 `/opt/dsh-managed/dsh-ui-html`。
- 配置沿用上游 `cordis.patch.yml` 的默认值；不在 Preset 内重复注册，避免同一工具在 Preset 与 Profile 双份注册。
- 客户端半注册 `tool.call.toolview`，界面实例通过 `window.dsh.emit(name, payload)` 回传；宿主半注册 `show_ui` 工具与 `/plugins/dsh-ui-html/{status,event}` 路由。

## 验证状态

已核验（2026-11-11，`inspection-027-schedule-acceptance`，来源 `experiment:EXP-security-operations-expert-027-f-r3ba4799b0cb7`）：

- 静态加载：宿主 Node `v24.21.0` 导入 `lib/index.js` 成功（导出 `Config/apply/default/inject/name`），扁平依赖闭包完整。
- 实例装载：`platform_instances run reload` 返回 `asset_status.status=current`，装载回执 `ok=true`、`verification=runtime-observer`，`source_files` 已列出本目录插件文件。
- 宿主半：容器内 `GET .../plugins/dsh-ui-html/status` 返回 HTTP 200，声明 `tool=show_ui`、`eventVersion=1`、`bridgeEnabled=true`，与装配配置一致。
- 客户端半：实例页面 boot 清单包含 `@eaglezlee/dsh-ui-html/client.js`；请求该 combo bundle 返回 HTTP 200、44662 字节，内容含 `tool.call.toolview` 与 `conversation.chat.turnTail` 注册。
- 会话内调用：新会话真实提示词触发 `show_ui`，`tool/result` 的 `meta.status=presented`，页面渲染出输入框与「提交」按钮的界面卡片。
- 交互回传：POST `/plugins/dsh-ui-html/event` 返回 `{"ok":true,"code":"injected"}`，会话新增用户消息「[交互式 HTML 界面回传] … 事件名：submit …」，模型据此开启新一轮并完成回复。

限制：验证会话（`session-31b1b62b-…`）保留在实例 HOME；未验证 `wait_for_interaction: true` 的阻塞模式、超时与取消分支，也未验证界面内脚本对受限能力（网络、剪贴板、存储）的越权尝试。

## 侧边栏插件页与实例内安装入口

侧边栏「插件」页（`dsh-client-ui-plugin-manager`）的数据源是 `pluginManager/listBundles`，只列 profile 组合包、profile 依赖、安装自带包与官方按需目录。本插件按实例合同以 `/opt/dsh-managed/dsh-ui-html` 绝对路径行装配，不属于任何组合包，因此**该页不会列出本插件**；`dsh-voice-hub`、`security-operations-ui`、`inspection-report-card` 等全部业务插件同样不显示。该页仍会拉取 `pluginManager/listPlugins`，但只用其行状态回填组合包卡片，不单独列未归属行。

2026-11-11 实测该页「添加插件」入口，两种来源均真实失败（同一次会话内先 GitHub、后本地目录）：

```text
GitHub：https://github.com/eaglezlee/dsh-ui-html
  github-connection 日志：Command failed with ENOENT: git -c 'credential.helper=' ls-remote -- 'https://github.com/eaglezlee/dsh-ui-html.git' HEAD
  spawn git ENOENT                       # 容器内没有 git
本地目录：/opt/dsh-managed/dsh-ui-html
  安装详情 pnpm 日志：[ENOENT] ENOENT: no such file or directory, mkdir '/home/node/.local'
  pnpm: ENOENT: no such file or directory, mkdir '/home/node/.local'
```

容器内核对：`/home/node` 为只读文件系统（`touch /home/node/.write-test` 报 `Read-only file system`），pnpm 无法初始化 store；`command -v git` 无结果。即使 pnpm 可用，profile 的 `package.json` 也是只读挂载（`-r--r--r--`），`node_modules` 被 `verification-home-controls/module-deny` 以只读空目录覆盖，安装结果仍无法进入加载路径。

因此本实例的业务插件不能通过页面安装、无法成为 profile 组合包；这是实例运行环境的既有约束，不是本插件的装配缺陷。若要让它出现在侧边栏插件页，需要平台侧提供可写 pnpm store 与 git、放开受控 profile 依赖安装，或让插件页枚举 managed 装载行；这些都不在本数据仓库的改动边界内。失败尝试的日志保留在实例 `$HOME/profiles/web/.plugin-manager/logs/`（`operation-4DCS1m`、`operation-KMpW77`、`operation-khCUVu`、`github-connection-CqhK6v`），未修改 profile 清单。

## 本 Agent 的运行时适配

- 上游源码与 MIT 许可证保持不变；为适配当前 DSH `0.2.2-rc.2`（来源锁定提交 `ddac96760b6edf8fa0fe17cbdcf0b512f4c12b2c`），Candidate 额外携带由该运行时现有包生成的扁平依赖闭包，位于 `node_modules/`，不执行网络安装或 package scripts。
- 闭包包含 `@deepseek-ai/dsh-llm`、`@deepseek-ai/schemastery`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-error` 及其运行时依赖；依赖版本以当前来源锁定环境为准，不把 0.2.1 的历史闭包冒称当前运行时验证。
- 该闭包只服务本 Agent 的 managed 插件，不能替代 profile 组合包；实际激活、客户端渲染和交互回传仍须以目标实例装载与页面证据为准。
