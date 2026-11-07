# dsh-decision-engine：EXP027 托管适配稿

**当前仅保存源码和静态检查结果，尚未安装、激活或完成业务验证。** 本文说明本 Candidate 的实际约束，不是上游安装说明的原样副本。

## 适用对象与来源

- 目标：`EXP-security-operations-expert-027-m-reab20c48f610`，沿用户确认继续修改的独立 Candidate 原位维护。
- 上游：[zuosus/dsh-decision-engine 固定提交](https://github.com/zuosus/dsh-decision-engine/tree/146453d1427e2cf27d02cc786f3baff78bf87c6c)，基线包 `1.1.0`，MIT。
- 上游原 README 的 SHA-256：`2b19c7bf3f96c6374b0fdeb97e3915b154b14337c454d4eb0fecf8e7e5fc9777`。本地说明为匹配当前匿名托管约束另行编写，不声称与原 README 一致。
- 固定来源、已保存文件摘要及本地差异见[来源记录](PROVENANCE.md)。

## 本次部署配置

用户授权的决策服务为 `http://i-1.gpushare.com:62770/`，无需 API Key。只有可信 Profile 显式传入 `managedDeployment: true` 才启用本部署锁定：

- 使用 custom/System One 协议，决策请求固定到 `/v1/systemone`；模型列表只读 `/v1/models`。
- 显式匿名不读取其他服务商凭据、不发认证头；禁止目的地变化、URL 凭据、query/hash 和请求重定向。
- 工具授权只做 `observe` 影子记录，其余七点保持 `off`。决策结果不代替原有业务安全守卫或审批，异常也退回既有流程。
- 关闭插件对外匿名使用统计；保留本地决策审计与统计。
- 独立数据子目录 `managed-security-operations-exp027`；不迁移旧插件配置或回填修改旧统计。
- 保持现有主模型、语音能力、工具权限及 MCP 配置；不新增虚构的 Agent 工具。

[Profile 配置示例](config.example.yml)仅说明插件节点的 config 字段，不自动生效，也不是向实例 HOME 复制配置的操作指令。HOME 配置不能开启可信托管标志或覆盖上述锁定。

## 装载与验收

目标 Runtime 为 DSH `0.2.1-rc.5`、官方提交 `b830ec950faba0a46dda564be3e2d854afed94f1`、Node 24。通过平台受控入口装配到目标业务 Profile，复用该 Runtime 的共享 peer；不能安装到管理助手 Profile，也不因全局依赖准备问题删除现有语音依赖。

确认范围为两个运行实例及本版本未来新建实例；不恢复历史评测容器。实际更新须保留 HOME、Sessions、主模型、原登记与统一网关设置。先补齐源码并验证客户端和受控装载，再更新运行实例。

验收分别核对：资产保存与摘要、完整导入和共享 peer、Host/Client 实际装载、真实决策请求及安全/业务回归。语法检查、状态查询或单次探测都不能代替整体验收。影子建议不能称为已发生的放行、询问或拦截；上游元数据和反事实节省估计也不是本实例已取得的业务收益。

## 文档与脚本边界

本目录为有明确差异的托管适配稿，非未修改的官方完整发行包。当前本地工作稿未因此声明为已冻结、已发布或已完整可恢复的业务版本。上游配置默认值、自动迁移、开发脚本和安装命令不成为本部署的现行操作指令；本任务未执行上游脚本或测试。

MIT 许可随包保留。
