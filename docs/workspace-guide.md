# 数据工作区使用说明

文中的业务目录与命令路径均相对数据根。

这是 Harness 工程平台的数据与管理助手业务 Harness 仓库，保存管理助手原则和技能、智能体研究资产、评测记录、决策样本、实际来源与工具配置，以及业务扩展。默认部署在 `~/harness-engineering-platform-data`；平台程序由独立的 [harness-engineering-platform](https://github.com/wr5912/harness-engineering-platform) 仓库维护。

平台管理助手使用本仓库的 [AGENTS.md](../AGENTS.md) 和 [.agents/skills](../.agents/skills) 办理业务。它具备工作区管理、智能体构建维护、业务插件开发、评测改进、继承融合、算力研究、MCP 编排、样本抽取、[LLM Wiki 知识整理](../.agents/skills/llm-wiki/SKILL.md)、技能审查和旧资产清点方法；真实执行能力以当前平台提供的工具为准，Skill 文件存在不代表任务已验证成功。

## 目录与维护职责

```text
AGENTS.md                 管理身份、业务原则与约束
.agents/skills/            管理、研究、部署、KEV 数据训练及通用表达 Skill
knowledge/                按需创建的管理知识库；业务运行按 Agent 与版本保存独立副本
docs/harness-research/     当前研究方法、经验和固定来源索引
agents/                   业务智能体入口、需求和共享评测口径
evolution/                Experiment、Candidate、Run、决策样本和历史输入
config/                   当前部署来源与共用配置
mcp/                      MCP 连接、组合资产与共用资料
extensions/               工作区声明启用的业务扩展
workspace.json            工作区身份和原生扩展声明
.local/                   会话、设置、实例 HOME、制品和凭据，忽略 Git
```

根目录维护管理 Skill 入口；需求澄清由 `workspace-management` 直接完成。KEV 数据、训练和部署使用 `kev-trace-pipeline`、`dsh-trace-audit`、`kev-dataset-audit`、`kev-training`、`kev-deploy` 五个入口，发现、抽取、标注和构建方法按需读取阶段参考；平台算力研究和固定 Run 抽样继续使用各自专项入口。官方微调、部署及 DSH 插件开发 Skill 完整保存在对应入口的参考目录，不重复注册。已声明的 `security-operations-composition` 扩展入口另计。方法入口见[研究方法索引](../docs/harness-research/README.md)，套件用法与验证边界见[KEV 中算力变体技能](../docs/harness-research/kev-medium-variant-skills.md)。表达规范只维护在 `user-facing-output` Skill，不另设提示词副本。

[远端数据更新](../.agents/skills/remote-data-deployment/SKILL.md)用于向 232、52、170 等已安装环境同步数据工作区、管理助手技能或指定版本资产，由工作区管理优先分流。复用程序仓库的 `platform/dsh-deploy` 增量更新、预检及恢复能力，保留最小安装与现场运行数据；用户只要求数据更新时不顺带升级程序。保存、实际装载与业务效果分别核对，远端操作按每次明确授权执行。

[跨框架智能体迁移](../.agents/skills/agent-migration/SKILL.md)将 DSH、AgentScope、OpenCode 等来源工程清点、映射为独立 DSH Harness，再按实际工具完成构建、装载与验证。保留原 Runtime 接入时由原系统管理生命周期，停用平台入口不停止原服务。

[评测用例审查与优化](../.agents/skills/evaluation-review/SKILL.md)用于审查和改写 `evaluation.md`，由工作区管理按需选择；用例保存、回读和执行继续使用既有维护与评测工具。技能来自用户提供的 `agent-e2e-acceptance-skill-V0.3-2026-11-02.zip`（SHA-256：`94ff72fd6cc2853306fd566c85747eeb2ae6cd1be2ec100e22ad91381cbcd52a`），以本地适配版名称 `evaluation-review` 维护，原压缩包内容可按该摘要核对；本地仅调整技能名称、标题和显示元数据；四个支撑文件与原包逐字节一致。

[DSH 业务插件开发](../.agents/skills/dsh-business-plugin-development/SKILL.md)通过现有工作区管理、任务构建或 Harness 演进入口按需使用。技能完整保留匹配固定提交的官方 `cordis-plugin-development` 及两个组合配置 Skill，原文、模板和许可证不改写；平台入口只补目标业务智能体、Candidate、执行环境和验证交接。上游引用及逐文件摘要见 [UPSTREAM.json](../.agents/skills/dsh-business-plugin-development/references/upstream/UPSTREAM.json)。当前未新增独立任务类型或插件构建执行器，真实开发、安装及装载能力以目标环境工具为准。

训练与验证数据保留机器格式；方案、清单、审查和结果默认用清楚的中文说明。KEV 数据工具支持原始 DSH 轨迹、平台 v2 导出和既有原生 JSONL，默认生成可读报告，程序回执可用 `--json`。格式、旧数据复核及八类路由的整改范围见[数据格式与可读输出整改](../docs/harness-research/kev-data-format-and-output-plan.md)。

平台代码、研发 Skill、平台核心校验器和 Runtime 适配器仍在程序仓库；管理助手不承担平台源码开发。本仓库 KEV 技能附带离线数据转换、验证和训练计划脚本，不新增平台训练执行接口。业务 Candidate 内的角色与 Skill 属于被管理智能体，不自动加入管理助手技能。两仓原则按职责独立维护。

本仓库保留迁移前的 Git 历史，以便恢复固定 Baseline、父版本和历史算法。旧提交中的平台代码是历史来源，不是另一份当前程序。

`security-operations-expert` 的研究版本以 `evolution/experiments/` 下各版本目录为准；业务源码仓库的 `agents/security-operations-expert/agent` 只作为当前可提取主线入口。EXP001–023、对应 Run 和旧联调资料可从数据提交 `1f162a1ce12025ffeb9d2e36c7a3ae283b41e421` 恢复到独立目录；日常启动与开发使用所选 Experiment 的 `change.yaml` 和 `candidate/harness.yaml`。其他智能体资产及运行实例的会话、设置保持各自生命周期。

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

中算力变体的“仅策划”和“生成并验证”均沿用 `compute-variant-research`，按其意图表进入对应阶段。固定 Run 抽样、复核与分用途导出使用现有页面和真实回执；实施任务及获授权普通管理任务可按阶段读取 KEV 技能，通过原生工具和受控 SSH 办理。程序核对 `decision_training` 的训练材料与工件摘要，没有独立训练调度平台；材料通过、训练完成和业务等效分别判断。

KEV 数据链路支持 choice、noul、score 的原生题型和标签统计；明确委托的 AI 复核保留实际输入读取证据、主体与用途。原生训练支持固定本地模型快照、命名 bf16/fp32 配方与受限执行环境，执行与恢复方法见[原生执行交接](../.agents/skills/kev-training/references/native-execution.md)。这些能力仍须核对当前程序合同、真实环境和业务效果。

平台账号保存在 `.local/credentials/admin.json`，模型环境按需保存到 `.local/credentials/models.llm-api-key`。原生 MCP 设置和模型偏好由对应平台或实例 HOME 维护。业务扩展在 `workspace.json` 声明，通过平台 prepare 构建并由 DSH 原生 Plugin 装载。当前平台不提供自动提交推送或 Research Release 创建入口。

平台管理助手使用 [DSH-Think-zh](https://github.com/Len7183/DSH-Think-zh) 提供思考语言设置。准备平台后，在本数据根的独立 HOME 安装固定提交，并核对 DSH 原生装载回执：

```bash
export HARNESS_ASSET_ROOT="$HOME/harness-engineering-platform-data"
DSH_HOME="$HARNESS_ASSET_ROOT/.local/platform-home" \
  dsh plugin --profile harness-platform add \
  github:Len7183/DSH-Think-zh#2ba0a1e338410b44c07f221087907e210ad65b59
```

平台已运行时优先使用 DSH 原生热重载；仅在回执提示需要重启时，在程序仓库运行 `./platform/dsh-platform restart`。进入平台“管理对话 → 设置 → 通用设置”，将“思考语言”设为“简体中文”；设置保存后从下一次模型请求生效。插件通过提示词影响模型，不能保证所有模型始终遵守。依赖登记、锁文件与设置由 `.local/platform-home/profiles/harness-platform/` 中的 DSH 原生 Profile 维护，不复制到业务实例。Git 保存此恢复步骤，原生 Profile 随本地状态备份；新部署或只恢复 Git 后需重新安装并选择语言。

平台管理助手通过 [Codex Connect](https://github.com/franksong2702/dsh-codex-connect) 接入 ChatGPT 账户模型，安装到同一个平台 Profile：

```bash
DSH_HOME="$HARNESS_ASSET_ROOT/.local/platform-home" \
  HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
  dsh plugin --profile harness-platform add dsh-codex-connect@0.2.0-alpha.10 \
  --save-exact --ignore-scripts --registry=https://registry.npmjs.org
```

进入“设置 → 模型 → Openai-Codex → 更多设置 → 网络”，启用插件代理并保存 `http://127.0.0.1:7897`。这里的地址指平台所在主机；安装命令的代理环境变量不代替插件的运行配置。通过账户卡完成 ChatGPT 授权；局域网地址需按插件 [安装说明](https://github.com/franksong2702/dsh-codex-connect/blob/main/INSTALL.md) 的 `trust-origin` 步骤信任实际平台 origin。模型目录出现只表示提供方已注册，账户可用模型以授权后的实际调用为准。该插件不自动切换管理助手的默认模型，配置与授权随原生 Profile 本地备份，不提交授权凭据。

已有 Codex CLI 的 ChatGPT 登录态也可一次性转换后复用，不能将 `~/.codex/auth.json` 原样复制为 `$DSH_HOME/.openai-codex-auth.json`。当前插件使用 v2 格式：顶层 `version: 2`、`activeAccountId` 和 `credentials` 数组；OAuth 条目的 `access`、`refresh`、`accountId` 分别来自源文件的 `tokens.access_token`、`tokens.refresh_token`、`tokens.account_id`，`type` 为 `oauth`，`expires` 为访问令牌 JWT 的 `exp` 秒值乘以 1000。授权文件只保存在被 Git 忽略的本地 HOME，权限为 `0600`，转换不修改源文件，不输出令牌；先保留已有目标文件，避免覆盖其他账户。2026-10-27 已在当前插件版本验证账户额度、页面“已登录”和 `gpt-6.1-sol` 实际聊天，无需再次登录或重启。两份文件不会自动同步，独立刷新可能使共享的刷新令牌失效；需要重新授权时使用插件账户卡。

## 恢复与验证边界

Git clone 只恢复已提交资产。`.local/` 被 Git 忽略，包含管理 Session、业务实例 HOME、原生 MCP 配置、运行制品及凭据，须从独立本地备份恢复。只删除可重建的 build-cache，不能清空整个 `.local/`。恢复需匹配程序版本、数据提交和必要本地状态，不改写旧 Session 事件。

程序与数据接入合同见[平台工作区合同](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/02_系统架构与部署设计.md#独立数据工作区)。MCP 连接与组合资产见 [MCP 管理入口](../mcp/README.md)。Mock 只提供基本业务模拟数据；结论明确区分工具可用、实际装载、业务 Run 和真实外部环境验收。
