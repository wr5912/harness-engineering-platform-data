# KEV 中算力变体技能配置

更新日期：2026-10-26。适用对象：平台管理助手；目标是从 DSH 轨迹建立决策数据、训练 KEV，并为同一 Harness 的中算力等效变体提供可复现交接。

## 已配置内容

新增 10 个根技能，与原有 13 个管理技能共同使用。主入口保留 workspace-management；前端“请 AI 策划算力变体 → 中算力变体”继续使用 compute-variant-research。

| 技能 | 职责 |
|---|---|
| kev-trace-pipeline | 原始轨迹、平台 v2 导出和旧原生 JSONL 的数据入口 |
| dsh-trace-audit | DSH v4 支持子集、可见前缀和工具集合审计 |
| kev-decision-discovery | 区分模型判断、确定代码与待补上下文 |
| kev-sample-extraction | 按已实现投影构造状态、问题、候选和绑定 |
| kev-sample-labeling | 监督证据、弱标签、歧义与复核记录 |
| kev-dataset-build | 原生格式、关联分组与四用途文件 |
| kev-dataset-audit | 输入泄漏、分组、标签和训练前缺口 |
| kev-training | 固定训练计划、实际编码预检、训练/校准/评估命令与变体交接 |
| kev-finetune | 完整官方训练 Skill，原文与许可保留 |
| kev-deploy | 完整官方部署 Skill，原文与许可保留 |

官方两技能固定在 [jaredpalmer/kev@2074cc4](https://github.com/jaredpalmer/kev/tree/2074cc44256200bb37540103fa4572901faa10f3/skills)。两目录 UPSTREAM.json 保存完整清单、Git blob、SHA-256、许可和运行时差异；16 个上游文件逐字节保留。适配层单独维护，后续升级先核对差异，不覆盖业务规则。

## 当前按钮如何工作

按钮发起 planning_intent=plan_only。助手核对固定目标和父版，读取必要 Case/Run，列出决策点、来源与补采需求，给出训练及完整比较计划。没有模型或训练服务器时可先完成策划，保持 suggest/later，不强迫用户先配置资源。

当前专项只能加载 compute-variant-research；不能在其中调用 datasets/*、KEV 同级技能、shell 或训练。新增方法写入已有 compute-variants 研究主题；没有新增程序不识别的 topic 或 task_context.skill。

下一阶段沿用 Run 页面“请 AI 抽取决策样本”，一次提交一题，服务端绑定来源并自动保存 suggested。人员在决策样本页面逐题复核时点与标签，明确 train/development/calibration/test 用途后导出。后续获授权普通任务或独立训练环境使用本套脚本。

## 三条数据输入路径

**原始 DSH trace**：audit → discover → 已支持投影 extract → annotate → compile → 来源分组 split → audit-dataset。当前 profile 包含 next-operation、inspection-v1 和 cybersecurity-routing-v1。八类路由只覆盖真实初始请求的首次决策，背景只取真实用户原文；系统/开发/框架内容留在审计侧，不能事后借用来补标签。其他新业务仍需实现真实投影；新合同草案不会自动生效，没有 --contract 参数。

**平台已复核 v2 导出**：保存真实 datasets/read 身份与 datasets/export 回执 → platform_export.py → 四份原生 JSONL、split-manifest、bridge-report。支持 choice/noul/score，保持硬标签、软分布、原 ID、人工状态及模型建议来源。不重新切分，不把 suggested 或 unassigned 升级为合格数据。

**既有原生 KEV JSONL**：legacy_native.py inspect → 独立复核 → build → audit。保留旧文件来源、标签和组信息，先连接全量来源再筛选，生成四分区与可重放源/复核快照。低确定性只用于安排复核，不自动成为软概率；原生格式通过不能代替真实标签复核。训练入口 dataset.kind=legacy-native，无真实来源 Run 时保持 source_run_ids 为空。

转换按 group_id/source_group_id/group_history、Run、Session 和等价输入形成关联闭包。派生原生 _meta.group_id 使用闭包，供实际 KEV 校准分折读取；原平台组保留在审计字段。未来信息、历史动作、标签理由不得混入决策前模型输入。未执行的候选不自动成为负例。

具体格式与用途见[数据格式规范](../../.agents/skills/kev-trace-pipeline/references/dataset-formats.md)，入口见 [.agents/skills/kev-trace-pipeline/SKILL.md](../../.agents/skills/kev-trace-pipeline/SKILL.md)。

## 结果先让人看懂

训练、开发、校准和测试 JSONL 保持机器合同；方案、决策点清单、审查和运行结果默认中文摘要及 Markdown 报告。报告先说明真实结果、主要问题和必要行动，程序状态、完整哈希和诊断保留在机器文件。需要原 stdout JSON 的程序显式加 --json。

旧数据检查另提供最多 30 条优先复核预览，完整待复核模板与原文件保持。训练准备写 report.md；编码结果写同名 .md，避免覆盖前一阶段说明。表达规范只维护在 user-facing-output，整改计划和验证方法见[数据格式与可读输出整改](kev-data-format-and-output-plan.md)。

## 训练、校准与接入

1. 在实际训练环境准备固定 Kev checkout、训练 checkpoint 的固定 Hub revision 与对应 training_config.json、已审计四分区数据和真实资源信息。
2. kev-training 的 training_plan.py 生成训练交接；不安装依赖、不连接服务器、不启动作业。当前 recipe 是 LoRA + CUDA/bf16，四项候选增删增强显式置零，保留顺序洗牌。
3. check_encoding.py 使用实际原生 loader/materialize/encode/fits 与固定 tokenizer。默认只用本地缓存；缺依赖/缓存就阻断。检查 384/1024/2048 预算、原生标签索引及 8 个种子的选项洗牌。
4. commands 子命令重新核对计划、数据与完整编码报告，只返回训练命令卡。真实执行器检查授权、硬件、时限和预算，保存真实作业身份、日志和 checkpoint。命令卡不是作业执行器。
5. train 只更新权重；development 选择配方；calibration 拟合概率/约定阈值；test 由外部执行流程在冻结后单独验收。最终测试卡上的 requires 是执行条件说明，本套没有声称提供远端强制执行门禁。
6. report_only 校准只产报告，不改温度；workload_heldout 是需明确选择和评审的业务分布内校准口径，原生写回选项及偏差完整说明在训练技能参考中。不能将业务留出集说成通用发布的分布外校准证据。
7. 获授权后使用真实推理服务/工具合同接入 Candidate。LangGraph 工具参数与回退由代码承担；再按原算力流程验证 generated、built、frozen、loaded、compared，人员复核 end。

具体步骤与示例见 [.agents/skills/kev-training/SKILL.md](../../.agents/skills/kev-training/SKILL.md)。外部数据目录、模型缓存、训练日志和权重放忽略的本地状态或独立训练环境；不要提交凭据、真实会话附件或模型权重。

## 为较弱管理模型做的适配

- 一条主入口，一次一阶段；当前阶段只读取必要参考，不提前加载所有官方脚本。
- 平台抽样保留 single-question-v1，程序负责来源、ID 和批次结构。
- 显式区分 observed 与目标、code/model/hybrid、suggested/reviewed 与离线 IR verified。
- 数据命令统一 stage-status.json：completed/requires_review/blocked、reason_codes、next_allowed_stage。blocked 返回非零且保留证据；退出 0 仍可能需要复核。
- 使用已核对的绝对路径和固定参数；不让模型猜 CLI、SHA、模型架构、分区或训练作业 ID。
- 状态未知先回读；不删除旧输出重跑，不因失败自动扩大任务范围。
- 提供 17 个可重用模型行为场景，包括旧数据、不确定标签、可读报告与机器格式、空分区、初始路由边界及“准备方案 → 编码检查”的顺序。需要实际调用 GPT-5.5 等目标模型、记录配置与工具轨迹后，才能报告各模型效果；适配设计和单测不能替代跨模型成绩。

## 已完成验证

- 158 项针对性测试全部通过，零跳过：数据核心 123 项，训练交接与编码合同 35 项。覆盖真实 CLI、旧格式接入、保组分区、原生渲染碰撞、输入保序、复核快照变化和可读报告。10 个修改的非官方技能通过格式校验。
- 平台锁文件对应的 dsh-skill-filesystem 0.2.1-rc.2、dsh-skill 0.2.1-rc.2 与 yaml 2.9.1 实际函数：发现并加载 23 个根技能及 1 个已声明扩展，无解析警告；原有 13 项全部保留。
- 两份官方 compatibility 元数据被实际 provider 接受。通用 skill-creator 的窄字段检查不接受该键，保留上游原文并以实际 provider 结果区分兼容性。
- 实际 assistantConfiguration 对默认与 compute 入口 ready=true/missing=[]；新的 kev-training 不是已注册专项 context，仍通过现有普通管理入口使用。
- 平台 v2 与旧原生 JSONL 两条合成输入 → 原生四分区 → 训练计划的真实 CLI 均通过。修改派生数据、旧数据来源或复核快照会阻断相应后续步骤。固定上游的 renderer、to_record、loader/materializer 均运行了真实函数，未加载模型权重。
- 独立对抗复核确认的 7 项消费链问题已修复并复测通过；两次独立试用核对了人读解释和准备/编码顺序。它们不等于指定目标模型的成绩。
- 用户提供的旧数据只读检查：4,800 条均符合原生结构，60 条有去重后的优先复核线索；没有自动复核或构建真实训练数据。DSH 示例的 42 条记录含 5 个模型时点，初始路由抽取 1 条未标注候选并跳过 4 个后续步骤。原文件未改。

未进行真实 GPU 训练、远端部署、当前线上 UI/Session 验收或 GPT-5.5 跨模型测试。编码帮助脚本的原生执行路径需要实际训练依赖和 tokenizer；本环境验证了失败合同，没有伪造 ready。上一次轨迹研究的编码结果只适用于当时那批样例，不替代新数据预检。

复现测试：在 kev-trace-pipeline/scripts 运行 `python3 -m unittest discover -s tests -v`，并将 KEV_UPSTREAM_ROOT 指向所固定的上游来源以运行原生兼容检查；在 kev-training/scripts 运行同一 unittest 命令。测试夹具均为人工合成，测试输出不作为训练证据。

## 程序侧仍需接入的能力

本次只修改数据仓库。程序依据固定为 [19a877e3](https://github.com/wr5912/harness-engineering-platform/tree/19a877e337a288cc4364d1fbe0f440e65030ff37)。

| 当前边界 | 后续程序侧最小工作 |
|---|---|
| training-servers 只有 list/save/probe，probe 只探测 banner | 实际训练执行器 start/status/cancel/collect、作业身份、恢复与工件回收 |
| medium 会话只策划，datasets 和新增 Skill 不在专项范围 | 明确后续用户授权与阶段转换合同，按阶段开放必要动作并绑定来源；不能简单取消整个 scope |
| generation_contract 是 LangGraph AOT + callTool + 文本 infer | 注册真实 KEV 推理服务/插件 schema、版本与 checkpoint/输入构造器绑定 |
| 服务、工件、构建不等于已装载/等效 | 新两侧 Run 的装载回执、关键 Case 与资源比较、人员 end 复核 |

以上缺口写在技能和研究方法中，助手可以准确策划与交接；不能仅因技能文件存在就声称按钮已自动训练或中算力变体已经等效。
