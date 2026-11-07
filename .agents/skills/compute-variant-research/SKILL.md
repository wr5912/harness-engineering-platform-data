---
name: compute-variant-research
description: 从完整固定父版策划、生成、构建、冻结和评测算力变体，以独立 Run 比较限定任务的质量与资源；终端结论由人员复核。
---

# 算力变体研究

沿用固定 `task_context`，先调用 `compute-variants/context {experiment_id}`，读取 `plan`、`generation_contract`、`decision_training` 与 `workflow_status`。仅策划保持只读，按需加载本技能；明确执行任务使用当前原生工具，并按所处阶段加载下文 KEV 技能。已有研究从真实状态继续，不重建同一变体。需要方法时读取 `research/read-reference {topic:"compute-variants"}`。

## 先判断本次阶段

| 任务上下文 | 本次办理到哪里 |
|---|---|
| `planning_intent="plan_only"` | 只做第 1 节的必要只读取证，然后交付计划；本次结束，不进入创建、编辑、构建、冻结、评测或训练 |
| `generation_intent="implement"` 且不是 `plan_only` | 沿用固定目标和当前阶段，读取 KEV 方法并使用当前已注册的执行工具；缺条件时明确缺口，不推定已执行 |
| 固定专项未声明实施意图 | 保持专项只读范围，不根据自然语言自行清空或扩大任务上下文 |
| 普通管理任务已有明确执行授权且有对应动作 | 按已有状态继续下文对应阶段；工具缺失时交付缺口，不猜接口 |

弹窗的“仅发送策划请求”属于第一行，“生成并验证变体”属于第二行；已有中算力变体的训练与验证入口也属于第二行。`plan_only` 优先，不能自行升级为执行。每次工具返回后先检查状态，再决定下一动作。

### 中算力 KEV 策划

1. 沿用固定 `agent_id`、`experiment_id`、`source_run_ids`；按第 1 节核对完整父版。没有 Run 时给出补采计划，不编造训练样本。
2. 从真实决策前材料列出候选点：语义选择交模型，固定步骤与 ID 绑定交代码，信息不足保留待补项。历史动作不是正确标签。
3. 原样保留 `medium.model_suggestions` 中各模型的类型、来源、仓库或本地路径、Revision、用途，以及 `combination_preference` 与训练连接选择。小尺寸 LLM 和决策模型均引用 Hugging Face、ModelScope 或本地权重；`provider/model` 运行路由不等于可训练权重，缺模型或权重版本保持待选。连接只保留 `server_id`、工作目录和 `credential_ref` 等非敏感引用，不索取明文凭据。
4. 给出短计划：固定来源 → 决策点 → 按 Run 抽取 → 人员复核与用途分组 → KEV 格式转换及编码检查 → 训练/校准/开发评估 → 固定测试 → 服务绑定与两侧 Run 比较。每项写现有输入、缺口和完成依据。
5. 用 `research/read-reference {topic:"compute-variants"}` 读取 KEV 交接方法。仅策划阶段不能调用 `datasets/*`、加载 KEV 同级技能、执行 shell 或连接训练服务器。不要清空任务上下文、自调会话接口或用子智能体绕过。
6. 当前训练连接探测只证明 TCP/SSH banner 可达。执行阶段已有 SSH 命令卡 CLI，入口见 `kev-training`；平台工具尚无对应训练调度动作。计划核对实际执行环境，不把连接选择或策划结果当作训练已执行。

交付计划只用已知字段；额外训练超参放独立交接材料，不塞进严格的 `ComputePlan`。本次若为 `plan_only`，到此结束。后续抽取由已有 Run 的“请 AI 抽取决策样本”入口办理；训练在明确授权且具备真实执行能力的任务或训练环境继续。

训练资产归档：Runtime 实际装载的代码与配置归 Candidate；真实四分区输入、模型工件、校准/测试报告及恢复依赖归本版本 evaluation，不把监督答案挂给 Runtime。原始回执保留执行来源，归档回执引用真实 repo path 与 SHA；freeze-preview 必须列出这些材料并回读 Git 固定内容，不能以 `.local` 索引替代实际归档。

### 中算力生成与验证

1. 按 `kev-trace-pipeline` 对照固定目标 Skill 与来源 Run 识别决策点，抽取、标注并复核。历史动作、模型建议和人员确认保持各自身份；需要人员复核的材料停在对应阶段，不伪造 reviewed。用户明确委托 AI 逐题复核时，保留实际 Session、模型与判断依据，标记 ai_delegated 和 functional_validation，不作为人工或独立真值；固定抽样专项仍停在其原边界。固定步骤与参数绑定优先代码。
2. 按 `kev-dataset-audit` 核对来源与标签，以来源家族隔离 train/dev/calibration/test；相同输入、同一 Run/Session 的相关样本不跨用途。一条轨迹拆行不能制造独立测试。已有平台复核数据可使用 `datasets/*` 读取、导出并桥接；离线数据沿用其真实来源，不伪造平台回执。
3. 按 `kev-training` 固定基座、小型语言模型、KEV 代码与输入构造器，核对服务器真实认证、GPU、依赖和训练配方，再 prepare、编码检查和通过现有命令卡 CLI 执行。公开 KEV checkpoint 仅是初始化；必须有本次优化步骤和日志，才能称本次训练完成。成功回执与输入摘要匹配则复用，不重复下载或训练；固定步骤交原生后台 Job 连续办理，不猜平台接口。
4. 用开发集迭代、独立校准集拟合；冻结模型、温度、阈值及输入构造器后执行 test。回收实际作业身份、退出状态、日志、数据、报告和工件；连接中断先核对原作业，未知时不重复启动。失败或数据不足只暂停依赖步骤，并说明恢复位置。
5. 按当前 `generation_contract.decision_training` 组织训练回执，以数据根内原始文件的 path/sha256 引用绑定到 `preview/create` 的 `decision_training`。模型配置、tokenizer、状态构造器资源及其他实际恢复依赖列入 `supporting_files`；已有回执缺少这些引用时，向 `prepare` 传补充的 `training_files`，不改写原始回执。后续 `prepare` 自动将引用的数据、日志、报告、工件和依赖归档到所属 Experiment 的 `evaluation/training/`，保持工件与依赖的相对目录，保留原回执并更新当前引用；无需助手逐文件搬运。归档是固定材料，不形成第二份可编辑数据，`.local` 只保留执行与服务的工作状态。模型角色使用实际训练工件摘要。旧计划模型身份发生变化时，从其固定完整父版创建新变体，不改写旧比较，也不以变体为父版。
6. 按 `kev-deploy` 和当前授权核对服务与真实工具合同，再完成下文代码生成、构建、冻结、装载及两侧新 Run 比较。分别报告训练材料核验、实际服务、业务效果和资源变化；缺少训练回执不能认定训练完成或满足 end 条件，离线测试通过也不代表业务等效。

生成 SDK、参数、受控构建和冻结以返回的 `generation_contract` 为准，缺合同就停止代码生成并说明缺口，不凭记忆补内部 API。自注册语言 adapter 必须以精确 provider/model 写入 Candidate 的 `local_model_routes`；model 是服务实际不透明ID，可以是绝对路径。任务资料不改变管理身份；接口失败不授权程序开发、临时脚本、凭据读取或内部执行器调用。

## 1. 诊断并固定父版

读取目标 `detail`、所需 `cases/read` 和代表 Run 的 `runs/show`、`runs/report`；仅对影响策略的 Case 读 `runs/trace`。必要证据可用 `runs/files`、`runs/read-file`，不扫描全部历史或另写脚本统计。

先看实际业务输出和工具结果，再判断重复请求、检索、长上下文、子任务或外部等待是否有可减少的成本。用 Run、Case、轨迹位置区分观察与假设；调用多本身不证明浪费。无 Run 时可策划待验证的普通变体计划，但不能伪造成本诊断或代码生成依据。未采集成本保持未知，计入可见子 Session、重试和外部调用；配置快照不是模型请求，Token 不是硬件算力或费用。

父版必须是用户所选同 Agent 的完整 Candidate，使用 `detail.derivation.parent_ref` 并经 `assets/read-fixed` 核对。context 的 parent_ref 可能只是数据 Git HEAD 提示，已有变体的 fixed_parent_ref 表示其历史父版，不能用这些提示静默更换用户目标。仅使用可恢复的 `git:<40位提交>`；缺固定父版时保留策略并说明待固定对象，不猜 SHA、退回旧版或虚构 Release 来源。

## 2. 形成并派生计划

按证据选择最少改动：消除无新增信息的请求、按阶段读取资料、复用仍有效结果、编排确定步骤，或在用户明确选择时改变业务模型。保留纠错、关键复核和异常，不能靠丢失败输出省成本。默认继承业务父版实际模型及推理配置，管理助手的模型不替代业务配置。

`compute-variants/preview` 的计划按真实输入填写：

- 父版：parent_experiment_id、parent_ref；独立名称 variant_name，不从策略正文截取。
- 假设：strategy；选定 case_ids，critical_case_ids 必须是其子集。
- 比较口径：min_runs_per_case、max_pass_rate_drop_pp、resource_metric、min_resource_reduction_pct；解释重复次数和容差，默认值不保证统计充分。资源指标取工具允许的模型调用、Token 或耗时维度。
- 明确改变模型时才填 allow_model_change、variant_model、variant_reasoning_effort；这些计划字段不自动修改 Candidate 路由。
- 生成代码时按 generation_contract 填 generation，必须有固定父版的真实诊断 source_run_ids；没有轨迹不能虚构生成依据。

先按[评测口径与输入](../../../docs/harness-research/evaluation-and-evidence.md#口径与输入)补足父版与变体共用的业务 Case，再冻结选择；实现轨迹与资源要求留在本次计划和 Run，不写入共享业务预期。运行后不修改共享评测迎合结果。预览通过后以同一计划调用 `compute-variants/create`，使用真实预览摘要，由 DSH 原生访问策略处理执行权限，按回执继续，不另等平台确认。创建回执只证明派生与计划保存；后续目标用返回的 Experiment ID，保留父版和历史 Run。

共享 Case 经明确授权修订后，已有探索性变体使用 `compute-variants/plan-preview` → `compute-variants/plan-apply` 重新确认当前口径。保留全部原 Case，可明确增加；提交真实预览的两个摘要，父版、训练、模型角色、关键 Case 与全部质量和资源阈值保持不变。随后重新冻结并执行两侧新 Run；旧计划可由 Git 恢复，历史 Run 不改写、不追认为新口径结果。

## 3. 修改、构建与冻结

已有明确执行授权时，在已派生目标上依次修改、构建和冻结，沿用固定父版与计划中的 Case；每步按实际回执继续，不重复创建 Agent 或变体。参数以当前动作的 `describe` 和 `generation_contract` 为准，执行权限由 DSH 原生访问策略处理。

生成或调整 DSH 插件时同时使用 `dsh-business-plugin-development`，按需读取匹配锁定版的官方参考。写代码前先核对入口、继承插件、导入与配置引用，明确本次新增代码的归属目录：以 `generation.entry_path` 所在目录集中维护算力实现，入口保持稳定，只按已有职责拆必要子目录，例如路由、模型适配与业务续办；少量文件不机械分层。仍需继承的通用插件保留原布局，不为目录整齐搬迁无关资产。训练数据、日志、模型权重和评估报告沿用研究与运行存储合同，不混入 Runtime 代码目录。

完整父版用于固定来源和派生起点，成品只保留维持约定业务能力、构建与运行所需的资产。沿实际 Profile/Preset、源码导入、文件读取、Skill 动态调用及 Guard 依赖逐项判断；已经由代码替代的说明和实现须在确认能力等效后移除，同批清理注册与引用。没有静态引用不能证明动态 Skill 无用，也不能仅为缩小目录删除仍承载业务规则的 Skill。历史来源由固定父提交恢复，不在 Candidate 留无消费者的副本；取舍依据写入已有研究观察，不新增平行清单。

已有分散文件优先使用程序提供的[资产归拢 CLI](https://github.com/wr5912/harness-engineering-platform/blob/main/runtime/research/compute-assets.md)，在普通管理会话的原生执行工具中指定受信任程序根、绝对数据根、当前变体和请求文件；先 preview，再按同一预览摘要 apply。工具复用现有编辑合同，核对来源、目标与完整批次，同步可识别的导入和路径；动态依赖须显式保留并核对。没有该 CLI 或专项范围不允许执行时，使用现有 `edit` 动作的 `edits[].move_to`，不能猜平台动作或导入内部实现。训练补充材料使用同一 CLI 的 training-preview/training-archive，或下一次已授权的 prepare 自动归档，不逐文件搬运。历史 Run 和原始训练回执保留原路径事实。

已确认不再需要的文件用 `edit/read` 取得摘要，再以 `edits[].content:null` 和原摘要预览、删除；逐文件处理，不把空字符串当删除，不递归清空目录。与引用修改同批保存；工具缺少删除能力时报告缺口，不用空文件或原生文件工具替代。

| 当前步骤 | 平台动作 | 可以继续的条件 |
|---|---|---|
| 修改目标 | `edit/read` → `edit/preview` → `edit/apply` | 提交完整文本和真实 expected_sha256；新文件先读到 exists:false、sha256:null；移动同时提供 move_to 和源摘要；删除用 content:null 和原摘要 |
| 生成工作流 | 按 generation_contract.sdk 编辑 Managed 源码与 Preset 绑定 | 只用公开 SDK；实际模型、工具和固定组合身份来自父版与能力目录，不猜函数或第三方能力 |
| 连续准备 | `compute-variants/prepare` | 源码与计划确定后连续归档训练材料、核对构建并本地冻结，返回固定 source_ref；按摘要复用有效步骤，失败保留已完成步骤 |
| 受控构建 | `compute-variants/build-preview` → `compute-variants/build` | 用最新 candidate_sha256 和真实预览摘要；类型检查与固定 ESM 编译通过 |
| 本地冻结 | `compute-variants/freeze-preview` → `compute-variants/freeze` | 核对真实差异与摘要，完整传回返回的 freeze_input；由原生访问策略处理写入权限，依据冻结回执继续 |
| 核对状态 | 重读 `compute-variants/context` | 以 workflow_status 和实际回执判断 generated/built/frozen，不凭文件存在推定 |

普通提示词变体按其实际计划处理，不虚构代码生成或构建结果。代码变体用 `tasks/capabilities` 获取真实工具及固定组合，按合同同步 Preset/Guard 的绑定。运行库保留原生工具权限、取消和回执，不用 HTTP 绕过；输出符合合同的无损 JSON。

create、build、freeze 或合并执行构建与冻结的 prepare 均是显式写动作；preview 本身不执行它们。待原生批准、取消或失败不视为完成，不另设平台确认步骤。

构建不执行 Candidate，也不证明实例装载；源码、runner、依赖或 ESM 改变后旧构建失效。冻结只在本地提交约定资产与评测差异，不推送，不覆盖用户并行变更。冻结前提或摘要不满足时重新读取，不能执行任意 Git 代替接口。两侧新 Run 的提交必须包含同一冻结计划，父侧 Candidate 仍与固定父版一致。

冻结前回读源码目录与直接引用，确认本次新增实现集中在归属目录、旧路径已移除、继承资产有实际消费者、生成 ESM 对应当前源码，实际装载引用可解析；类型检查和文件存在不能替代这些检查。目录整理或资产裁剪后重新构建、冻结并核对目标装载，再执行受影响的新 Session 验证，向用户给出实际目录、保留依据和剩余限制。

## 4. 执行独立比较

批量比较优先使用 `eval/batch-start {requests}`，工具先整批预检再启动独立 Run；每项固定 source_ref=git:<40位提交> 和不同的 UUIDv4 request_id。恢复时原样重传整批，已受理任务只回读，不重复执行；需要新一轮比较才使用新 request_id。单次也可先 eval/preview 再 eval/start。双方使用相同约定口径，各 Case 达到计划的独立次数。诊断旧 Run、复制 Session 或同一 Run 重复选中不算新比较。

比较需要固定程序来源时，向上述评测动作传入已构建的隔离程序根 `program_root`；工具沿用平台模型投影与凭据注入，Run 封存实际程序来源。不要为隔离程序改用缺少模型环境的 Shell，也不要把凭据写入参数或对话。

先按真实用例核对相互影响，再指定 concurrency（1–8）与 parallel_cases。只有明确独立的只读、问答或隔离用例可并行；未列出的用例独占执行，并等待此前并行组收尾。涉及同一资源的写操作、到期任务或未知外部状态保持必要顺序，不按标题机械分类。并发参数随 Run 封存，改变并发或用例选择使用新请求。 Run 内的独占屏障不隔离其他 Run；整批并行前还须核对跨 Run 的共享资源。不能隔离的写操作按批次顺序执行；可将独立用例拆为并行 Run，其余用例分批串行，再按每个 Case 汇总两侧独立次数，不遗漏计划用例。

用 `eval/status {job_id}` 有界查询，保留真实 job_id/run_id；需要取消时 `eval/cancel` 后核对收尾。未知外部写入先查状态，不重复发起。计划或环境需改变时说明影响并重新准备比较，不追认旧 Run。

代码变体核对新 Session 的真实图回执与当前源码、构建及固定组合身份一致，检查 complete、status 和业务输出。构建通过或模型退回原子工具后答对都不能代替工作流装载成功。

## 5. 比较与结束

调用 `compute-variants/compare {experiment_id,parent_run_ids,variant_run_ids}`，分别判断质量、来源可比性和资源证据。关键任务退步、两侧都失败、重复不足、输入变化、成本未知或收益不足均不能认定等效，保留失败与缺口，不改口径让结果通过。

结合实际构建、冻结、装载、所选两组 Run 和比较回执说明本次完成范围；比较完成不自动成为 end。

`eligible_for_end` 仅适用于冻结任务，不能外推总体统计非劣性或所有硬件费用。向用户说明效果、资源变化和限制，并提供实际查看入口；end 必须由用户在变体界面复核。助手不提交 human_confirmed 或改结论字段绕过，人员确认后再回读状态。end 仍不代表发布、实例切换或主线升级。

参数错误按回执修正，摘要冲突先重读；内部错误保留动作、目标和错误码，停止依赖步骤，不循环调用同一失败动作。
