# harness-engineering-platform-data

这是 Harness 工程平台的数据与管理助手业务 Harness 仓库，保存管理助手原则和技能、智能体研究资产、评测记录、决策样本、实际来源与工具配置，以及业务扩展。默认部署在 `~/harness-engineering-platform-data`；平台程序由独立的 [harness-engineering-platform](https://github.com/wr5912/harness-engineering-platform) 仓库维护。

平台管理助手使用本仓库的 [AGENTS.md](AGENTS.md) 和 [.agents/skills](.agents/skills) 办理业务。它具备工作区管理、智能体构建维护、业务插件开发、评测改进、继承融合、算力研究、MCP 编排、样本抽取、技能审查和旧资产清点方法；真实执行能力以当前平台提供的工具为准，Skill 文件存在不代表任务已验证成功。

## 目录与维护职责

```text
AGENTS.md                 管理身份、业务原则与约束
.agents/skills/            18 项管理、研究、KEV 数据训练及通用表达 Skill
docs/harness-research/     当前研究方法、经验和固定来源索引
agents/                   业务智能体入口、需求和共享评测口径
evolution/                Experiment、Candidate、Run、决策样本和历史输入
config/                   当前部署来源与工具组合配置
extensions/               工作区声明启用的业务扩展
workspace.json            工作区身份和原生扩展声明
.local/                   会话、设置、实例 HOME、制品和凭据，忽略 Git
```

根目录保留 18 个管理 Skill 入口；需求澄清由 `workspace-management` 直接完成。KEV 数据、训练和部署使用 `kev-trace-pipeline`、`dsh-trace-audit`、`kev-dataset-audit`、`kev-training`、`kev-deploy` 五个入口，发现、抽取、标注和构建方法按需读取阶段参考；平台算力研究和固定 Run 抽样继续使用各自专项入口。官方微调、部署及 DSH 插件开发 Skill 完整保存在对应入口的参考目录，不重复注册。已声明的 `security-operations-composition` 扩展入口另计。方法入口见[研究方法索引](docs/harness-research/README.md)，套件用法与验证边界见[KEV 中算力变体技能](docs/harness-research/kev-medium-variant-skills.md)。表达规范只维护在 `user-facing-output` Skill，不另设提示词副本。

[DSH 业务插件开发](.agents/skills/dsh-business-plugin-development/SKILL.md)通过现有工作区管理、任务构建或 Harness 演进入口按需使用。技能完整保留匹配固定提交的官方 `cordis-plugin-development` 及两个组合配置 Skill，原文、模板和许可证不改写；平台入口只补目标业务智能体、Candidate、执行环境和验证交接。上游引用及逐文件摘要见 [UPSTREAM.json](.agents/skills/dsh-business-plugin-development/references/upstream/UPSTREAM.json)。当前未新增独立任务类型或插件构建执行器，真实开发、安装及装载能力以目标环境工具为准。

训练与验证数据保留机器格式；方案、清单、审查和结果默认用清楚的中文说明。KEV 数据工具支持原始 DSH 轨迹、平台 v2 导出和既有原生 JSONL，默认生成可读报告，程序回执可用 `--json`。格式、旧数据复核及八类路由的整改范围见[数据格式与可读输出整改](docs/harness-research/kev-data-format-and-output-plan.md)。

平台代码、研发 Skill、平台核心校验器和 Runtime 适配器仍在程序仓库；管理助手不承担平台源码开发。本仓库 KEV 技能附带离线数据转换、验证和训练计划脚本，不新增平台训练执行接口。业务 Candidate 内的角色与 Skill 属于被管理智能体，不自动加入管理助手技能。两仓原则按职责独立维护。

本仓库保留迁移前的 Git 历史，以便恢复固定 Baseline、父版本和历史算法。旧提交中的平台代码是历史来源，不是另一份当前程序。

`security-operations-expert` 当前资产仅保留 [EXP024](evolution/experiments/EXP-security-operations-expert-024-rad80a907c628/decision.md)。EXP001–023、对应 Run 和旧联调资料可从数据提交 `1f162a1ce12025ffeb9d2e36c7a3ae283b41e421` 恢复到独立目录；日常启动与开发使用当前 manifest 和来源登记。其他智能体资产及运行实例的会话、设置保持各自生命周期。

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

本次入口合并需配套更新程序：旧 `harness-guided-workflow` 任务入口由程序映射为 `workspace-management`，历史 Session 事件保持原貌。先更新支持该映射的程序，再使用已撤销旧入口的数据版本；不只删除 Skill 文件而保留旧入口校验。新建和恢复管理会话均需核对目标及当前阶段。

“请 AI 策划算力变体 → 中算力变体”沿用 `compute-variant-research`，本次只策划。原始 Run 抽样、人员复核与分用途导出沿用现有页面；普通管理入口可按需发现 KEV 技能，独立获授权训练环境可使用随附脚本。当前程序没有训练作业执行器或专门 KEV 工件绑定合同；增加技能不意味着按钮已经自动训练或变体已经等效。

平台账号保存在 `.local/credentials/admin.json`，模型环境按需保存到 `.local/credentials/models.llm-api-key`。原生 MCP 设置和模型偏好由对应平台或实例 HOME 维护。业务扩展在 `workspace.json` 声明，通过平台 prepare 构建并由 DSH 原生 Plugin 装载。当前平台不提供自动提交推送或 Research Release 创建入口。

## 恢复与验证边界

Git clone 只恢复已提交资产。`.local/` 被 Git 忽略，包含管理 Session、业务实例 HOME、原生 MCP 配置、运行制品及凭据，须从独立本地备份恢复。只删除可重建的 build-cache，不能清空整个 `.local/`。恢复需匹配程序版本、数据提交和必要本地状态，不改写旧 Session 事件。

程序与数据接入合同见[平台工作区合同](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/02_系统架构与部署设计.md#独立数据工作区)。网络安全扩展见[接入与测试说明](extensions/security-operations/README.md)。Mock 只提供基本业务模拟数据；结论明确区分工具可用、实际装载、业务 Run 和真实外部环境验收。
