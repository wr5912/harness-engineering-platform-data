# 正式平台与交付实例复验（2026-10-16）

正式平台 `http://10.0.160.32:3090/hep/` 的首页与六页只读交互通过；新交付实例 `http://10.0.160.32:3114/assistant/` 的真实新会话完成三页台账读取，Markdown 与 CSV 下载均通过独立核验。

本次程序为 `main@a58a2129d65dd9aa8f53d72feeb09e11f02e27ad`、数据起点为 `main@e8f9b0d`。复用既有 `inspection-delivery-demo` 001 与四 Case Run `run-05973a80-6b91-40e7-a0da-acca3a4ea696`；没有重新通过构建助手创建智能体，也没有改写原 Run。

## 正式验收经过

1. `preflight-collector-failure/` 是采集器首次误拦：DSH 容器使用 host 网络，没有 Docker 端口映射。此时未调用平台启动或模型。修正为按实际实例登记、Compose 归属、端口监听及容器身份核对，原记录保留。
2. 顶层 `acceptance.json` 记录真实详情页的单次“确认启动”：`instances/run` 1 次、`instances/preview` 0 次，新建 `hep-inspection-delivery:3114` 并取得真实入口。随后服务端来源核对拒绝继续，尚未发起业务模型调用。迁移仅使三个文件的模式由冻结 `0644` 变成 `0664`；文件内容、Candidate 摘要、Preset 和评测实现均一致。
3. `source-permission-restoration.json` 记录按原 `inputs.lock.json` 恢复上述三个文件的精确模式，不改内容或冻结标准；`source-verification-after.json` 五项均 matched。完整模式不由 Git 保存，后续迁移复现仍需核对原冻结权限，不能把这次本地恢复当作通用迁移能力已经实现。
4. **最终通过结果**见 [复验回执](source-permission-recheck/acceptance.json) 与 [服务端核验](source-permission-recheck/delivery-result.json)。复验仅复用已运行实例，不重复启动；真实新 Session 为 `session-f9f3bc6e-54fe-4d0e-8b3a-fe2d0eb97f1e`，依次实际执行 `start → page(0) → page(2) → page(4) → report`。原始轨迹及本轮产物在 `source-permission-recheck/delivery-probe/`。

[Markdown](source-permission-recheck/report.md) 为 699 字节、SHA-256 `852ba82755455c1864ad77037d039d244d6214969b153fd8b486cc56d931dd95`；[CSV](source-permission-recheck/devices.csv) 为 362 字节、SHA-256 `cf8ffece058e5c0d63e0ea88f0521ca82493139429a19fcedfd58d97c95f6288`。两者经独立 HTTP 再次下载，与该新 Session 的真实工具完成回执逐字节一致。固定五设备无缺项、重复或额外设备；状态为“台账已记录”。

新业务探针约 23 秒，6 次模型调用、0 次失败，供应商回报 18,684 Token。该数仅覆盖正式交付实例的新业务探针，不包含早先构建助手、原四 Case Run 或隔离验收；没有账单，费用未知。容器外部调用不具备实时硬封顶能力。

## 页面与原实例

[页面结果](ui/homepage-and-pages.json) 核对了准确新标题“让AI帮您管理、评测和改进智能体”、三模式、输入高度、可选运行关联及已启用的真实示例来源。三模式共 9 组、六页共 18 组 `1440/900/390` 几何检查均无横溢，页面错误为空。空改进输入只核对界面和默认查询/问询合同，未再次提交模型任务。

原 `security-operations-expert-eval:3081` 与 `test01-002-64212:3089` 的容器 ID、running、StartedAt、重启次数及实例登记 SHA 前后完全一致。仅本次新实例继续运行。

这是基础 Mock 台账上的正式平台 API、实例与下载验收，不代表真实设备健康检测、真实业务上游接入或长期稳定性通过。
