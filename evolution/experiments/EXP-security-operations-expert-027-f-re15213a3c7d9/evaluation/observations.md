# Evaluation Observations

2026-11-13 完成原生 MCP 边界与部署验收，详见 [结构化证据](evidence/native-mcp-boundary-20261113.json)。Candidate 的 334 个文件与业务主线 `8d59b10` 逐字节一致，业务 Harness 的维护来源仍为 business-agents。

AMD64 在线包完成全新安装、资产更新、运行时更新、重启和会话保留；容器 HOME 为 `/var/lib/dsh`，智能体侧不包含 LFX 执行器。平台断连时普通对话和本地文件工具可用，恢复后同一原生会话完成 `inspection_baseline → get_composition_run → get_composition_artifact`，浏览器显示报告卡且没有脚本异常。管理助手使用 deepseek-flash 完成只读资产与 MCP 发现及配置方法核验。

真实 Run `run-17a30ee7-0868-49d3-add9-ad89f79e9747` 执行完成，业务结论为 `NO_DATA`，SOC 缺少基线采集数据，不能判定业务检查通过。另一次平台 SDK 调用读取全部四类产物与详情。平台 LFX 独立冒烟上传返回 201、执行返回 200。

插件全量测试通过 1861 项、跳过 1 项；被跳过的容器浏览器套件另行实测 3 项通过。部署 184 项、更新 30 项、原生工具接纳 6 项通过。默认高并发下曾触发短租约测试超时，隔离复测及并发 4 的全量测试均通过。恢复后的早期轮次曾遇到异步 MCP 发现未完成，发现完成后链路通过；成功模型轮次约八分钟，不代表延迟达标。

未对生产系统执行应急动作、策略变更或设备写操作；本次未覆盖离线安装、其他 CPU 架构及所有业务组合的真实效果，业务评测与采纳结论保持 inconclusive。
