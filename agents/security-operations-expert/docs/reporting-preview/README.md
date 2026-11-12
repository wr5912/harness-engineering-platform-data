# 巡检报告离线样例

本目录是**附件可见内容离线复现**，供核对新报告模块的呈现及数据映射；不是一次新的巡检、真实 Run、原始结构化证据或已发布能力。

- [完整 HTML 报告](安全巡检报告_离线样例.html)
- [聊天 Markdown 样例](安全巡检报告_离线样例.md)
- [结构化离线 fixture](attachment-visible.fixture.json)

## 来源与数量

来源是用户提供的“安全巡检报告.html”附件，正文数据日期为2026-11-04；原附件不改写。完整来源 SHA-256、文件字节数及逐资产计数保存在 fixture 的 `fixtureProvenance`；来源身份另在 `scope.requested` 保留。未设置 `run_id` 或 `report_id`，日期不被伪装为真实执行回执。

已核对91个唯一原资产编号、28台设备异常、25台离线、12台关联740条历史漏洞、342个不同CVE、6条规则及102个可见连接结论。按最新用户口径，31台未绑定基线模板（`NO_TEMPLATE`）及51台SOC未采集到基线数据（`NO_DATA`）归入 `socStateGroups`：合计82台已取得明确SOC状态，不计巡检未完成、设备检查缺口、正常或通过；另有9台原报告判通过。设备未完成／缺口数为0，真实缺证据的未完成范围仅4条业务规则，保留其原始未知原因。漏洞原严重度为严重32、高危100、中危548、低危58、信息2，未重分级。

报告由同一个 fixture 直接调用 `buildInspectionOperations`、`renderInspectionMarkdown` 和 `renderInspectionReport` 生成；HTML保留全部设备、逐漏洞记录、设备证据和规则关联，不受聊天内容选择影响。显示编号按原资产顺序生成，不代表风险排序。Markdown没有伪造下载URL，单独HTML文件通过交付文件入口打开。

## 证据限制

- 只提取附件可见DOM、表格、文字证据及筛选标志；不是恢复SOC原始结构化结果，不能替代原Run或冻结快照。
- 未取得原报告／运行标识、119次路径尝试明细及原始路径／策略证据；102个可见连接结论不得称为119次尝试。
- 规则未提供明确服务、协议、端口及观测／读取时间；不通过规则名称猜造这些字段。未完成规则的汇总说明与连接结论分别保留，不能把部分连接正常升为整条规则通过。
- 软件版本、业务影响、实际修复与复核成功仍无证据；历史漏洞记录不代表本次扫描发现。原时间值保持不变，不推断时区。
- 仅检查离线结构及渲染输出，未验证真实实例装载、原生附件下载按钮或浏览器交互；不发布、不重载、不联网、不创建Run。

## 复现入口

- [DOM抽取脚本](../../../../mcp/tests/fixtures/extract-inspection-html-preview.py)：标准库解析，仅接受源HTML与目标JSON路径，不执行附件脚本；数量不符即失败。
- [新模块渲染脚本](../../../../mcp/tests/fixtures/render-inspection-html-preview.mjs)：使用Node原生TypeScript支持，不安装依赖，显式禁止网络并断言数量。

从数据工作区根运行：

```bash
python mcp/tests/fixtures/extract-inspection-html-preview.py SOURCE_HTML agents/security-operations-expert/docs/reporting-preview/attachment-visible.fixture.json
node mcp/tests/fixtures/render-inspection-html-preview.mjs
```
