# 用户参考报告格式完善

目标为 `EXP-security-operations-expert-027-f-r3ba4799b0cb7`（陈飞）。本任务按用户两份只读 HTML 参考修改现有报告产生节点；不复制参考业务数据，不调用旧 Java 入口，不在下载时给原 HTML 重套模板。

## 当前实现

- [巡检模板](../../../mcp/src/reports/inspection.ts)：报告身份与冻结范围、30 秒速读、五项指标、当班关注、覆盖与基线依据、分类搜索、逐条证据、建议与缺口、全量安全附录。外层执行状态与源检查结果完整性分开，基线通过率只使用有明确结论的对象为分母。
- [故障模板](../../../mcp/src/reports/troubleshooting.ts)：概览和四页签，分别组织故障现象、故障链关联、过程审计及处置恢复；真实保存的原因支持/反驳与引用证据可独立查看，缺项不补造。业务访问与设备不在线共用该纯渲染器。
- [公共离线展示层](../../../mcp/src/reports/common.ts)：安全字段投影、转义、响应式布局、状态配色、键盘与焦点、CSP、独立全量打印。公共源码显式归属 MCP 公共层，不通过兄弟组合私有目录复用。
- [巡检产物入口](../../../mcp/src/inspection/index.ts)、[访问故障入口](../../../mcp/compositions/troubleshooting-business-access/src/index.ts)、[设备离线入口](../../../mcp/compositions/troubleshooting-device-offline/src/index.ts)已调用对应模板。保留原 `report`/`details` 标识、HTML 文件名、UTF-8 MIME 及 JSON 事实合同；既有原生附件保存、校验和重复下载路径不因样式修改而重写。

## 可打开的新版样例

以下均明确显示“离线格式测试样例”，仅用于确认版式，不是现场业务报告。

- [巡检 HTML](report-format-reference-20261107/inspection-format-preview.html) · [独立全量打印版](report-format-reference-20261107/inspection-print-preview.html)
- [业务访问故障 HTML](report-format-reference-20261107/troubleshooting-format-preview.html) · [独立全量打印版](report-format-reference-20261107/troubleshooting-print-preview.html)
- [设备不在线 HTML](report-format-reference-20261107/device-offline-format-preview.html) · [独立全量打印版](report-format-reference-20261107/device-offline-print-preview.html)
- [纯渲染及生产入口回归](report-format-reference-20261107/report-render-tests.tap) · [真实 Chrome 检查与对应源码摘要](report-format-reference-20261107/browser-checks.json) · [技术边界](report-format-reference-20261107/technical-boundaries.md)

## 保存与运行边界

通过公开 `saveCompositionDraft` 保存了三条相关草稿：访问 proposal `69e1e680-8da4-4c42-9272-89136fb7b567`、离线 proposal `2ede653c-3d13-492a-b92f-df7a50ec0f13`、常规巡检 proposal `a5648aed-6a30-4325-8509-2d0ef0928f76`，并回读了原生源码目录及编译执行模块。首次目录并发冲突未覆盖，刷新后保存成功。未手写编译物，未覆盖历史版本、冻结 Run 或已生成 HTML。

本任务仅完善生成端、保存草稿并完成离线样例与技术验证，没有重载、发布、改变实例草稿绑定或启动业务评测。新版用于后续采用此生成源码的报告；已保存原附件继续保持原字节，重复下载不会因模板变更而生成另一份报告。指定实例的最终来源、装载及真实新 Run 验收依[统一接入与验收](troubleshooting-candidate-integration-20261107.md)办理，不能以离线样例声称当前实例已切换新版。
