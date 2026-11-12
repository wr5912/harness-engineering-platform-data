# dsh-ui-html 事件桥反代缺口（not-loopback）

日期：2026-11-11
对象：`security-operations-expert`、实例 `inspection-027-schedule-acceptance`、受管插件 `dsh-ui-html`

## 现象

- 实例内 `show_ui` 工具可调用并返回 `presented`，卡片可渲染。
- 浏览器访问 `GET /plugins/dsh-ui-html/status` 经 53105 业务网关返回：
  `HTTP 403 {"ok":false,"code":"forbidden","message":"not-loopback"}`
- 浏览器侧显示“交互通道不可用”，编辑/确认/取消事件无法回传。

## 根因（代码位置）

1. 受管插件 `dsh/managed/dsh-ui-html/lib/bridge.js`
   - `refuse(req)` 先执行 `if (!isLoopbackPeer(req)) return 'not-loopback'`（约 312 行）。
   - `isLoopbackPeer` 只认 `req.socket.remoteAddress` 为 `127.0.0.1`/`::1`/`::ffff:127.0.0.1`（约 321 行）。
   - 反代后 peer 是容器网关地址，不是 loopback，因此直接拒绝，不再进入 `isSameOrigin`。
2. 插件配置项（`lib/config.js`）未提供 `trustProxy` / `allowedOrigins` / `publicOrigin` 等受管开关；仅能关闭总开关或事件桥，不能安全放行反代。
3. 业务网关 `platform/plugin/src/business-control/gateway.ts`
   - 约 261 行：删除调用方传入的 `authorization`、`cookie`、`forwarded`、`x-forwarded-for`、`x-forwarded-host`、`x-forwarded-proto` 等。
   - 约 262–264 行：仅重建 `x-forwarded-host`、`x-forwarded-proto` 为受信外部来源；**未重建 `x-forwarded-for`**。
   - 因此即使插件愿意信任代理头，也拿不到真实客户端地址。

## 现有安全约束（必须保留）

- `isSameOrigin`：`Origin` 与 `Host` 同源，且 `sec-fetch-site` 仅允许 `same-origin`/`none`。
- UI 实例绑定（`ui_id` = 工具调用 id）。
- 事件去重与注册表校验（`pending`/`registered` 计数）。
- 本轮不伪造 loopback、不放开任意 IP/Origin、不修改全局网关权限。

## 需要的程序侧改动（精确入口）

任一即可，均属插件/网关公共代码，不在候选配置范围：

1. **插件侧受信代理开关**（推荐）
   - `lib/config.js` 增加 `trustedProxyCidrs: []`（默认空）。
   - `bridge.refuse` 改为：peer 为 loopback → 通过；peer 属于 `trustedProxyCidrs` → 使用 `x-forwarded-for` 最右非代理地址判定；否则仍 `not-loopback`。
   - 保留 `isSameOrigin`、UI 实例绑定与去重不变。
2. **网关侧补齐来源头**
   - 在 `gateway.ts` 受信反代处重建 `x-forwarded-for`（仅受信链，不继承调用方值）。
3. **同源代理路由**
   - 由 DSH 主服务把 `/plugins/dsh-ui-html/*` 以 loopback 转发给插件 HTTP 桥，使 peer 恒为 `127.0.0.1`，同时保留 Origin/Host 校验。

## 当前结论

- 受管配置无法直接启用受信代理；缺口已定位于上述代码，未做任何绕过。
- 服务端 `asset-table:cancel` 取消逻辑已随 runtime 装载（`loaded=dd2af687…` 之后版本），但前端事件桥被拒时点击“取消纳管”只会显示“取消请求未送达，请稍后重试”，不会伪装成功。
- 端到端“点击 → 事件回传 → Agent 调 ui_event → 服务端失效”仍未通过，需上述程序侧改动后复验。

## 前端桥失败语义与超时（2026-11-11 补充）

- `window.dsh.emit` 是返回 **boolean** 的 `postMessage`，不是 Promise；宿主桥未注册时返回值不代表服务端已受理。
- 模板已改为：
  - `emit` 返回 `false` 或抛错 → 立即显示“交互通道不可用，取消未送达；请刷新页面后重试”，不进入“正在取消”，取消按钮保持可重试，并恢复基线/冲突提示；
  - 发送成功（或旧桥返回 undefined）→ 显示“正在取消…请等待服务端确认”；
  - 15s 未收到确认 → 提示“未收到服务端确认，交互通道可能不可用；请重试或刷新页面，勿继续提交”，仅恢复取消按钮重试，确认按钮与输入保持禁用，避免对已失效批次继续提交。
- 宿主真实提示“交互通道不可用（事件桥未注册或页面已刷新）”仍来自插件 bridge 的 loopback 拒绝，需前述程序侧改动才能端到端通过。
