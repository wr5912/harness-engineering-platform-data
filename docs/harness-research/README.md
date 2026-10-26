# Harness 研究方法

本目录是数据工作区当前业务研究方法入口，与管理 Skill 共同维护。文档解释研究判断与经验，技能负责具体任务路由及工具步骤；平台代码、接口实现与研发规则由程序仓库维护。

| 主题 | 用途 | 平台读取 topic |
|---|---|---|
| [受控改进](controlled-improvement.md) | 需求、复用、限额修复、恢复与交付 | controlled-improvement |
| [评测与证据](evaluation-and-evidence.md) | 口径、比较、归因、回归与 Decision | evaluation-and-evidence |
| [继承与融合](inheritance-and-fusion.md) | 固定来源、并行能力、目标装载 | inheritance-and-fusion |
| [算力变体](compute-variants.md) | 共同任务下的质量与资源研究 | compute-variants |
| [决策样本](decision-samples.md) | 切点、标签、复核、分组与导出 | decision-samples |

KEV 全流程套件见 [KEV 中算力变体技能](kev-medium-variant-skills.md)。中算力专项需要的方法已写入现有 `compute-variants` 主题，不新增程序尚未支持的 topic。官方训练与部署技能保留固定上游版本；平台适配入口按阶段调用。

数据格式、既有 KEV 数据接入、八类路由投影和面向人的报告要求见[数据格式与可读输出整改](kev-data-format-and-output-plan.md)。这些是对应技能的离线方法，不新增平台 research topic。

管理助手通过 `platform_agents research/read-reference {topic}` 按需读取。文档不扩展会话工具权限；专用任务只可读取其允许主题。原有详细资料保留在 [资产合同](../../.agents/skills/harness-evolution/references/repository-invariants.md) 和 [评估合同](../../.agents/skills/research-eval/references/experiment-contract.md)，不将它们误当当前平台已有全部发布能力。

## 固定来源与处置

以下内容从程序提交 `550ab412ab04de9fcb598dd371534e2270620499` 提炼迁入。链接始终指向该固定版本；摘要标识迁移输入，正文已按数据管理职责适配，不声称与原件逐字一致。历史观察不自动成为当前能力或默认流程，外部接口与许可采用时重新核对。

| 固定来源 | 输入 SHA-256 | 当前用途或目标 |
|---|---|---|
| [AGENTS.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/AGENTS.md) | `57599099b68a5a30a395ef187c50be1251905a0f73c3254ec3e3d6fcad5a6f1d` | 业务原则、身份边界与研究生命周期 |
| [docs/standards/PROJECT-INTERPRETATION.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/standards/PROJECT-INTERPRETATION.md) | `3dc4a9b27f47037236df29307c936bf42651b913ad4cd0238318e77c9d098890` | Research Mode 适用范围与记录合同 |
| [docs/standards/SOURCES.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/standards/SOURCES.md) | `6403c4441b825b5c504b56c35889c1f9aedd69494d29fc19add9b6cfd08370e1` | 受控输入来源与不自动继承的生产要求 |
| [docs/项目审查原则.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/项目审查原则.md) | `67cf7931df80d21c58937ec956cd2ee8b4147e54e24054af73c1c52b8d84c981` | 证据分层、替代解释、根因与消费链检查 |
| [docs/AI纠错经验总结.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/AI纠错经验总结.md) | `57c2a119ed41bb278b319f4a73157321e42f23da12d1038faacdef5a2afe8d69` | 目标识别、真实继承、生效、比较与当前事实核对 |
| [docs/智能体多形态Harness资产模型设计方案.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/智能体多形态Harness资产模型设计方案.md) | `c531a9d13b39384471659e7c1f42c1e03bd1250d8bcc8f45bc9808dd0c9ce2ca` | 算力层级、有限选项模型与等效研究 |
| [docs/DSH-Harness研究管理CLI设计方案.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/DSH-Harness研究管理CLI设计方案.md) | `220d3650cefd0a229b79a9a0325aebb95881b4c7f43d808955ca6d516a1a19bf` | 最短研究闭环及比较限制 |
| [docs/DSH开发与评测启动器设计方案.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/DSH开发与评测启动器设计方案.md) | `e1112b6357e82eba644f026f1442bf2a61c8a747605f6ac95b4b570868cc8529` | 评测实际来源与运行模式 |
| [docs/DSH容器开发启动器设计方案.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/DSH容器开发启动器设计方案.md) | `8a3fc3a70ec4751f50a8d46184c58abb5ab51eca689c4200083893ec866f4b2b` | 目标实例、实际装载与资产回流边界 |
| [docs/platform-design/04_核心业务闭环与服务接口.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/platform-design/04_核心业务闭环与服务接口.md) | `b2f31f460d6d296fdbfb49ff60c14b1844f03cb83e7bf2a1912e9e39c28be43e` | 业务闭环与外部依赖条件 |
| [docs/platform-design/12_阶段决策与实际执行协议.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/platform-design/12_阶段决策与实际执行协议.md) | `ef27b51625853bb9c9c40a73a721676de288063f48d30922e26e11dd70003b5c` | 固定输入、失败保留与决策 |
| [docs/platform-design/13_个人工作台与决策样本实施.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/platform-design/13_个人工作台与决策样本实施.md) | `89211301498ffbb318bfbaa4d7cfb7034bc0c5cf0b607af05907823fa98abe97` | 抽取、复核、保存与导出边界 |
| [docs/platform-design/14_决策样本构建研究.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/platform-design/14_决策样本构建研究.md) | `3eb4cf1ade38fc78138b452fc5cc47d844483acb5d9dd7b9c5d6240dd1f30769` | 用户资料摘要、Kev 固定格式及一手研究索引 |
| [docs/platform-design/15_独立数据工作区与管理助手实施.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/platform-design/15_独立数据工作区与管理助手实施.md) | `ed7ff585183f97c5547b85f76988b6fc0192d53dc580f547870f5d0087d60ea5` | 管理身份、数据定位与工作区连续性 |
| [docs/platform-design/16_完整闭环验收与恢复验证.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/platform-design/16_完整闭环验收与恢复验证.md) | `7827becdd7b91f38539a93a9b4d91ceb7a6ec1a980ef976e032a7c37f4eb0ad9` | 恢复验证与真实证据范围 |
| [docs/platform-design/17_任务型智能体交付与验收.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/docs/platform-design/17_任务型智能体交付与验收.md) | `895c9155cfd484a6d3c4f5e7db8a5f64895906fbd3d6b0376e52b15b64b04def` | 限额修复、交付探针、成本计量与恢复经验 |
| [platform/prompts/user-facing-output.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/prompts/user-facing-output.md) | `6522b0fa38d1080c341d26a929cb20917325a95f017b7c73ca05813899d89717` | user-facing-output Skill 的原始表达正文 |
| [platform/plugin/src/assistant/index.ts](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/plugin/src/assistant/index.ts) | `5c327c5e02669a51dd3efe4431b04de5956bba6a2f6f85c6d23dd39d3178cd63` | 管理身份、业务路由与确认回读规则 |
| [platform/skills/workspace-management/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/skills/workspace-management/SKILL.md) | `7c258a06b3cc72f1e3e36eb2d7e1788f073939b2e4c3275d6074cd98573ca4b7` | .agents/skills/workspace-management/SKILL.md |
| [platform/skills/task-builder/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/skills/task-builder/SKILL.md) | `5d364934316f4e1a1eb1592940440f5e15382a296941950e47ac20d3c3825847` | .agents/skills/task-builder/SKILL.md |
| [platform/skills/agent-maintenance/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/skills/agent-maintenance/SKILL.md) | `e27da689ea0adb8b7f9370213b3c5c1d2a703fd2e2faa96ef812a38b2b5abc06` | .agents/skills/agent-maintenance/SKILL.md |
| [platform/skills/mcp-composition/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/skills/mcp-composition/SKILL.md) | `42edefa98d24a60734f6ca02cd7be6716d5d41539dfc7c334bce2c8650150542` | .agents/skills/mcp-composition/SKILL.md |
| [platform/skills/compute-variant-research/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/skills/compute-variant-research/SKILL.md) | `12a39f2ff4fc767429d2fc771a593c5f3544dc35d640ae6902f91a01997122e3` | .agents/skills/compute-variant-research/SKILL.md |
| [platform/skills/decision-sample-extraction/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/platform/skills/decision-sample-extraction/SKILL.md) | `8da5b86b8709155e24927c3948f48a65dbbde46b5c81e6f02c5d9a29921ef8a5` | .agents/skills/decision-sample-extraction/SKILL.md |
| [.agents/skills/harness-guided-workflow/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/.agents/skills/harness-guided-workflow/SKILL.md) | `bba1a195dc0642f8503c19fea2303c48d23a37216d4dd551b963fbb3d9b40fe1` | .agents/skills/harness-guided-workflow/SKILL.md（按管理工具适配） |
| [.agents/skills/harness-evolution/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/.agents/skills/harness-evolution/SKILL.md) | `af7719d46f77b80c711d178cf5c5502930cc24bf111376b6a012869460b731d0` | .agents/skills/harness-evolution/SKILL.md（按管理工具适配） |
| [.agents/skills/harness-experiment-fusion/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/.agents/skills/harness-experiment-fusion/SKILL.md) | `92b63f6d51ce758c2aa6a8f2869a1042e951d8ede01554d381f4fa3e0a5f947e` | .agents/skills/harness-experiment-fusion/SKILL.md（按管理工具适配） |
| [.agents/skills/research-eval/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/.agents/skills/research-eval/SKILL.md) | `08a501c804cb907d11032552d383998d4a722994829f418794407622b1b0065a` | .agents/skills/research-eval/SKILL.md（按管理工具适配） |
| [.agents/skills/legacy-asset-intake/SKILL.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/.agents/skills/legacy-asset-intake/SKILL.md) | `abcd02dce3d2800dc754c4d00223cd6ee63c6c8f5cf6f7476cb9b327d83be74a` | .agents/skills/legacy-asset-intake/SKILL.md（按管理工具适配） |
| [.agents/skills/harness-evolution/references/repository-invariants.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/.agents/skills/harness-evolution/references/repository-invariants.md) | `6ef85cbd67c35bd25ad5ebce8b89af037acc536cab26f65772f67811014a5340` | .agents/skills/harness-evolution/references/repository-invariants.md（保留并适配数据职责） |
| [.agents/skills/research-eval/references/experiment-contract.md](https://github.com/wr5912/harness-engineering-platform/blob/550ab412ab04de9fcb598dd371534e2270620499/.agents/skills/research-eval/references/experiment-contract.md) | `66ac5e6c7b4b2988cfa3faf77d0eee0849310ad2d09ffa844481d0a5787d6ab3` | .agents/skills/research-eval/references/experiment-contract.md（保留并适配数据职责） |

研究技能原有的4份 agents/openai.yaml 随对应 Skill 保留；可执行检查脚本由程序侧 runtime/research 维护。当前业务规则以数据根 AGENTS.md、管理技能及本目录为准，不加载程序根研发规则作为管理身份。

## 历史研究来源索引

- 决策样本的用户原始资料摘要、Kev 固定版、Agent Lightning、过程监督、AgentTuning、去重、分组划分、教师标签与校准来源，统一保留在上表固定版本的《决策样本构建研究》中。当前方法只提炼适用于本平台的部分，不将论文结论外推为本项目验收。
- Jev、Laya、腾讯云接入及 DSH 社区插件的历史链接和观察，保留在固定版本的《智能体多形态 Harness 资产模型设计方案》中；它们是候选技术研究输入，采用前核对当前接口、许可、硬件与中文任务表现。EXP-010 的旧 inconclusive 不能被解释为效果等效已经成立。
- 受控规范的输入身份、原摘要与本地修订恢复位置保留在固定 SOURCES.md。生产 R1/R2/R3、固定 Case 门槛与审批结构不自动成为当前个人研究要求。
- 原始 AI 纠错记录及程序验收记录保留原仓库历史；本目录只提炼直接影响业务研究的有效经验，不迁入整份历史流水或重复保存业务 Run。
