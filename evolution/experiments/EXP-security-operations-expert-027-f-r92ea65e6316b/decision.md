# Decision

状态：inconclusive。保留原分支为 active；本次报告修复不代表规则建议研究或整版已采纳。

## 本地报告修复（2026-11-11）

用户指定继续修改本独立特性分支及 threat-analysis-004。报告制品取消 report-write/save_persistence_result 上传，沿用原 HTML 模板及本次运行目录；SOC 认领、结果/失败终态和 reportHtml/resultJson 回写合同保持，不能据此宣称 HTML 不再发送 SOC。

[本地回执](candidate/dsh/managed/threat-analysis/result_storage.py)核对 runner 已写入的同次 report.html，记录文件名、UTF-8 长度和 SHA-256，不调用 MCP。[下载与交付](candidate/dsh/managed/threat-report-download.mjs)通过现有 Web 服务注册 GET/HEAD 附件路由，仅交付身份、文件类型、大小与摘要相符的报告，不公开五源原始数据；链接由实例公开路径生成。单条及自动批次保留原始结果，手工委派继续复用原交付链。Profile 已引用模块，初始连接已移除 report-write，业务 Skill 已同步。未更改其他分支、模型、规则建议、报告 CSS、已有 SOC 终态保护或历史 Run；未同步管理工作区的其他 SOC 来源到实例。

本地保存位置为 `$DSH_HOME/threat-analysis/<run_id>/report.html`，五源在同一运行目录的 `fusion/`，不是把报告塞入五源 JSON。下载链接使用当前 Web 挂载动态生成的同源站内路径，例如 `/agents/security-operations-expert/instances/threat-analysis-004/api/threat-analysis/reports/<run_id>/download`；代码不硬编码 Agent 或实例名称，换部署会随当前挂载路径生成新链接。响应为 text/html 与 Content-Disposition: attachment。

## 下载 404 修复（2026-11-11）

用户实际研判 `INC-20261029-000207` 后，运行 `run-c33eada1-d86c-4b0d-9b72-d7105411d322` 曾返回页面相对链接，点击后显示“文件不存在”。已核对实例 HOME 中该运行的 `result.json` 与 `report.html` 均存在，报告状态为 `saved/local`，大小 `14101` 字节，SHA-256 为 `7dc13d8188f44ad39f4b0a4a9284a173a6b1f31a47c6753400cdaf9e66f018a9`，与绑定回执一致；五源目录及 SOC 200 回执也存在。

用户进一步确认：直接访问完整绝对地址 `http://172.16.138.228:53105/agents/security-operations-expert/instances/threat-analysis-004/api/threat-analysis/reports/run-c33eada1-d86c-4b0d-9b72-d7105411d322/download` 可以成功获取 HTML 文件。因此问题是**历史运行的 UI 展示链接仍是 `./api/...` 相对地址，页面所在路由解析错了**，不是报告文件丢失或下载路由本身失效。

下载读取已修复为允许 `DSH_HOME` 根目录挂载别名，同时要求规范化运行目录严格等于规范化根目录下的同一 `run_id`，继续拒绝运行目录、报告文件和 `result.json` 的越界符号链接。后续新运行返回当前 Web 挂载生成的绝对站内路径，避免在管理页面或非实例页面中解析到错误路由。旧运行的历史 `result.json` 和会话消息不改写；当前运行可用上面的完整绝对地址下载。

## 已取得与尚缺的证据

- 平台保存/回读及 JavaScript 草稿语法检查通过，research/validate 无错误、无警告；这些不是业务验收。
- 实际运行 `run-c33eada1-d86c-4b0d-9b72-d7105411d322` 已取得本地报告、五源、SOC 200 回执、内容摘要证据，并由用户确认完整绝对地址可下载 HTML。
- 本地报告组件测试、下载组件测试及兼容交付测试已保存回读，未执行。旧 test_threat_analysis_automation.py 仍包含远端 SAVE/GET 及历史兼容断言；平台读取为已脱敏/不可编辑，未绕过接口覆盖，不能宣称全套测试通过。
- 原实例多次 reload 后均返回 operation_failed/status=unknown；新进程仍运行，HOME、会话、端口、模型、来源及网关保留，但无可核验的本次装载回执。日志显示已有 instance-confirmation-config 未就绪；未读取或替换确认私钥。
- 独立评测 Run `run-29acc3c8-b698-4e1c-af38-93946b2cb6b7` 的 U-THREAT-001 因 SOC 409/COVERED 未生成正式报告，不能作为下载正向证据。

## 恢复条件

后续新运行应从当前实例页面显示动态绝对路径并直接下载；历史运行继续使用完整绝对地址。若新运行点击绝对路径仍 404，需要保留响应路径和服务端拒绝阶段，继续核对同一运行的 `result.json` 绑定状态。不能解锁 COVERED 事件、重写历史结果、伪造报告或使用另一 SOC 环境替代目标验收。
