# harness-engineering-platform-data

这是 Harness 工程平台的私有用户数据工作区，保存智能体研究资产、评测记录、决策样本、实际来源与工具组合配置，以及网络安全业务扩展。默认部署在 `~/harness-engineering-platform-data`，平台程序继续由独立的 `ai-agent-harness` 仓库维护。

`agents/` 是智能体入口，`evolution/` 保存研究过程与运行证据，`config/` 保存用户部署与编排配置，`extensions/` 保存明确启用的业务插件。平台管理助手的通用 Skill 和程序脚本随平台维护；业务扩展 Skill 随本仓库维护。

本仓库保留迁移前的 Git 历史，以便恢复固定 Baseline、父版本和历史算法。当前工作树只维护数据侧内容；旧提交中的平台代码仅是历史，不是另一份当前程序。

## 启动与验证

先准备匹配平台声明的系统全局 DSH、Node.js 24、pnpm 和 Python 3.10 或更新版本。平台程序位置可变化，数据根依次由 `HARNESS_ASSET_ROOT`、本机部署定位文件或默认位置选择。

```bash
export HARNESS_ASSET_ROOT="$HOME/harness-engineering-platform-data"
# 在平台程序仓库执行；不在本数据仓库安装平台 Runtime
./platform/dsh-platform prepare
./platform/dsh-platform start --dry-run
./platform/dsh-platform start
```

首次直接运行 `./platform/dsh-platform start`，缺少数据仓库、必要配置或平台账号时会显示浏览器初始化向导，支持选择已有目录、克隆或新建；确认预览后初始化并自动进入平台。平台账号保存在本数据根 `.local/credentials/admin.json`，模型环境按需保存到 `.local/credentials/models.llm-api-key`。原生 MCP 设置和模型偏好由对应平台或实例 HOME 维护。业务扩展在 `workspace.json` 声明，通过平台 prepare 构建并由 DSH 原生 Plugin 装载。

## 恢复边界

Git clone 只恢复已提交的资产。`.local/` 被 Git 忽略，包含管理 Session、业务实例 HOME、原生 MCP 配置、运行制品及凭据，须从独立本地备份恢复；只删除可重建的 build-cache，不能把整个 `.local/` 当缓存清空。

完整目录、单一写入来源、管理助手工作流和备份约定统一参考[平台工作区合同](https://github.com/wr5912/ai-agent-harness/blob/main/docs/platform-design/02_系统架构与部署设计.md#独立数据工作区)。网络安全扩展的接入和测试见 [extensions/security-operations](extensions/security-operations/README.md)。Mock 数据仅用于基本业务模拟，不能代表真实网络安全环境的验收结论。
