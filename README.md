# harness-engineering-platform-data

这是 Harness 工程平台的数据与管理助手业务 Harness 仓库，保存管理助手原则和技能、智能体研究资产、评测记录、决策样本、实际来源与工具配置，以及业务扩展。默认部署在 `~/harness-engineering-platform-data`；平台程序由独立的 [harness-engineering-platform](https://github.com/wr5912/harness-engineering-platform) 仓库维护。

平台管理助手使用本仓库的 [AGENTS.md](AGENTS.md) 和 [.agents/skills](.agents/skills) 办理业务。它具备工作区管理、智能体构建维护、评测改进、继承融合、算力研究、MCP 编排、样本抽取和旧资产清点方法；真实执行能力以当前平台提供的工具为准，Skill 文件存在不代表任务已验证成功。

## 目录与维护职责

```text
AGENTS.md                 管理身份、业务原则与约束
.agents/skills/            12 项管理、研究及通用表达 Skill
docs/harness-research/     当前研究方法、经验和固定来源索引
agents/                   业务智能体入口、需求和共享评测口径
evolution/                Experiment、Candidate、Run、决策样本和历史输入
config/                   当前部署来源与工具组合配置
extensions/               工作区声明启用的业务扩展
workspace.json            工作区身份和原生扩展声明
.local/                   会话、设置、实例 HOME、制品和凭据，忽略 Git
```

管理技能共12项：`workspace-management`、`task-builder`、`agent-maintenance`、`mcp-composition`、`compute-variant-research`、`decision-sample-extraction`、`harness-guided-workflow`、`harness-evolution`、`harness-experiment-fusion`、`research-eval`、`legacy-asset-intake`、`user-facing-output`。方法入口见[研究方法索引](docs/harness-research/README.md)。表达规范只维护在 `user-facing-output` Skill，不另设提示词副本；其他智能体可在各自作用域内复用。

平台代码、研发 Skill、校验器和 Runtime 适配器仍在程序仓库；管理助手不承担平台源码开发。业务 Candidate 内的角色与 Skill 属于被管理智能体，不自动加入管理助手技能。两仓原则按职责独立维护。

本仓库保留迁移前的 Git 历史，以便恢复固定 Baseline、父版本和历史算法。旧提交中的平台代码是历史来源，不是另一份当前程序。

## 启动与验证

准备与程序版本匹配的系统全局 DSH、Node.js、pnpm 和 Python 环境，具体版本以[平台启动说明](https://github.com/wr5912/harness-engineering-platform#快速启动)为准。在程序仓库运行：

```bash
export HARNESS_ASSET_ROOT="$HOME/harness-engineering-platform-data"
./platform/dsh-platform prepare
./platform/dsh-platform start --dry-run
./platform/dsh-platform start
```

数据根由 `HARNESS_ASSET_ROOT`、本机部署定位文件或默认位置选择，不依赖当前目录。首次启动缺数据仓库、必要配置或平台账号时进入初始化向导，可选择已有目录、克隆或新建。新建空白工作区可以使用基础平台；完整管理能力还需本仓库的管理资产，页面按实际缺失项给出连接或恢复提示，不从程序目录回退加载业务副本。

平台默认加载数据根规则和表达 Skill，其余管理 Skill 按任务读取。技能目录只扫描本工作区 `.agents/skills/` 与显式声明扩展的技能目录。变更后用新管理会话或恢复会话核对实际规则与任务行为，保存文件不能代替生效验证。

平台账号保存在 `.local/credentials/admin.json`，模型环境按需保存到 `.local/credentials/models.llm-api-key`。原生 MCP 设置和模型偏好由对应平台或实例 HOME 维护。业务扩展在 `workspace.json` 声明，通过平台 prepare 构建并由 DSH 原生 Plugin 装载。当前平台不提供自动提交推送或 Research Release 创建入口。

## 恢复与验证边界

Git clone 只恢复已提交资产。`.local/` 被 Git 忽略，包含管理 Session、业务实例 HOME、原生 MCP 配置、运行制品及凭据，须从独立本地备份恢复。只删除可重建的 build-cache，不能清空整个 `.local/`。恢复需匹配程序版本、数据提交和必要本地状态，不改写旧 Session 事件。

程序与数据接入合同见[平台工作区合同](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/02_系统架构与部署设计.md#独立数据工作区)。网络安全扩展见[接入与测试说明](extensions/security-operations/README.md)。Mock 只提供基本业务模拟数据；结论明确区分工具可用、实际装载、业务 Run 和真实外部环境验收。
