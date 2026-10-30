# 数据格式与用途

这里约定从轨迹或既有数据形成 KEV 训练文件时，各层负责什么。数据行遵守机器合同；方案、审查和执行结果按 `user-facing-output` 写成可读报告。不要把完整报告塞进 `state`，也不要为了好读修改协议字段。

## 选择入口

| 当前材料 | 处理入口 | 不应混淆的地方 |
|---|---|---|
| 原始 DSH v4 轨迹 | `kev_trace.py`：audit → discover → extract → annotate → compile → split → audit-dataset | IR 是可追溯的抽取记录，尚未复核的标签不能直接训练。 |
| 平台已复核、已分用途的 v2 导出回执 | `platform_export.py` | 保存真实回执；不能用候选下载或自己拼的 v2 对象冒充合格导出。 |
| 既有 `state/questions/_meta` JSONL，例如旧路由数据 | `legacy_native.py`：inspect → 复核 → build → audit | 保留原来源，不补造 DSH Session、决策序号或平台回执。 |

数据集名称里的 v2.1 是数据版本；平台 `schema_version=2` 是接口版本；`kev-decision-ir/v1` 是离线抽取协议。三者没有自动升级关系。不要把同一数据另存文件或改版本名，称为已经整改。

## 原生 KEV：最终交给模型的文件

每行一个 JSON 对象，无注释、无代码围栏。每条记录至少有 `state` 与非空 `questions`；本套导出还保留 `_meta`。问题说明、候选键及其定义应与实际推理保持一致，中文候选键可以保留。

| 字段 | 约定 |
|---|---|
| `state` | 决策前可见的请求和必要背景；保留信息来源、否定、引用与时间含义。不要把整行审计记录转成 state。 |
| `questions.<id>.type` | `choice`、`noul` 或 `score`；不是自由文本回答任务。 |
| `instructions` | 非空、明确的判断要求；问一个有定义的业务问题。 |
| `criteria` | choice 为候选键到说明；noul 可省略或明确 false/true；score 为从低到高的等级说明。 |
| `label` | choice 精确匹配候选键；noul 为 JSON 布尔值；score 为从 0 开始的整数。 |
| `target` | 可选软监督；按候选名、false/true 或等级字符串索引。必须解释分布来源，不能由“高/中/低确定性”随意换算。 |
| `_meta` | 样本身份、来源组、复核证据、数据用途、版本和转换记录；不进入模型输入。 |

原生形状例见 `assets/format-examples/native.jsonl`。这是合成说明样例，不是可用训练数据集。原生 loader 能读取不等于已通过本项目的数据复核、独立分组或编码检查。

## DSH 抽取 IR：先形成可复核的决策记录

完整字段与规则以 `data-contract.md` 和 `scripts/dataset.py` 为准。下列字段是编译器检查的核心：

| 字段组 | 必要内容 |
|---|---|
| 身份与职责 | `schema_version=kev-decision-ir/v1`、`sample_id`、`decision_site_id`、`contract_version`、`implementation` |
| 决策输入 | `state`、单数 `question`；支持 choice、noul、score，并保留原生标签类型。同站点多题各自成行且共享来源组。 |
| 监督目标 | `label.status/value/source/evidence_refs`；有 soft target 时增加 `target/target_semantics`。 |
| 来源与时点 | `trace_sha256`、`session_id`、`source_group_id`、`decision_seq`、`decision_line` |
| 输入证据与构造版本 | `state_evidence_refs`、`candidate_evidence_refs`、`state_builder_version`、`candidate_builder_version` |

事件证据必须满足 `seq < decision_seq`；候选也可以引用固定版本的静态合同。后续结果可以供标注者判断，但只能留在监督或审计侧。序号、哈希和非空引用的检查不能证明自然语言没有泄漏，仍需对照原始证据。

`candidate_bindings`、观察动作、复核建议与合成反事实信息应保留；当前编译器没有完整验证其业务语义。运行接管之前还要核对实际工具、参数和失败处理。

| 标签状态 | 数据阶段处理 | 当前默认训练配方 |
|---|---|---|
| `unlabeled`、`ambiguous`、`invalid` | 隔离或继续补采/复核 | 不接收 |
| `weak` | 仅显式允许时保留，整个来源关联组只能进 train | 当前配方不接收；需要单独验证弱监督配方 |
| `verified` | 检查合法硬标签、来源和证据，再继续编译 | 继续核对四分区、编码和真实训练环境 |

`verified` 是可追溯的复核主张，不是程序证明答案正确。平台的 `reviewed` 和这里的 `verified` 不是可以相互补填的审批字段。

## 平台 v2：输入与目标分开保存

顶层为 `schema_version,state,workflow,task,questions,targets,_meta`。服务器绑定 `state`、真实来源和样本身份，模型通过 `single-question-v1` 每次提交一题。不要自行扩展平台提交字段。

- `task.semantics=recommended_decision` 表达当前材料下应如何判断；`observed_action` 只表达实际动作，不能自动称为最优或正确。
- 每个 `questions.<id>` 对应一个 `targets.<id>`。支持 choice/noul/score；平台限制每条 1–32 题，choice 2–32 项、score 2–32 级。
- 导出前逐题 `reviewed`、`decision_time_reviewed=true`，并有明确用途。AI 生成的建议不能自行补填人员复核；复核后也保留原 model_suggestion 来源。
- `probabilities` 若提供，必须覆盖全部候选/等级、有限且在 0–1 之间、总和与 1 的误差不超过 1e-5，hard label 在最大概率集合中。没有概率时不自动补 one-hot。
- 桥接后 label/概率进入原生问题的 `label/target`；basis、来源和复核状态保留在 `_meta.platform`。完整条件见 `platform-export.md`。

不要照抄一个空 `export` 或示例 SHA 当作回执。可运行的合成回执构造见测试 `test_platform_export.py`，真实任务必须使用平台实际返回值。

## 独立数据文件与复核材料

| 文件 | 用途 | 可以用于什么 |
|---|---|---|
| `train.jsonl` | 训练集 | 更新权重 |
| `development.jsonl` | 开发集 | 选配方、找错误、迭代 |
| `calibration.jsonl` | 校准集 | 拟合概率校准参数和已约定阈值 |
| `test.jsonl` | 最终测试集 | 冻结模型、构造器及评判口径后独立验收 |
| `split-manifest.json` 及对应机器报告 | 程序核对 | 分组、计数、摘要和转换记录 |
| `report.md` | 人阅读 | 本阶段结果、问题及需要处理的事 |

`_meta.split` 不是训练器过滤器；`--data` 必须实际指向 train 文件。同 Session、同任务重试、改写、合成反事实及其他关联来源保组。增强后不能重新随机切分。四组只是形成四个非空用途的最低结构条件；不证明样本量、类别覆盖或统计可靠性。

原始 JSON 不同也可能生成相同模型输入。例如 `{"request":"same"}` 与字符串 `"request: same"` 在固定版本 KEV 中会渲染成同一文本。分组与冲突检查同时核对原结构和原生渲染内容；choice 候选换序不能制造独立样本。JSONL 写出保留输入对象顺序，不能为排版排序字段而悄悄改变模型所见文本。规范化哈希仅用于比对；这些检查仍不能代替真实分词器编码。

套件 0.3 起，IR 编译产物另存 `_meta.native_input_sha256` 与 `native_input_hash_algorithm=kev-rendered-input/v1`，用于核对输入顺序。旧版编译文件缺少这项依据时，从原始已复核 IR 重新执行 compile 和 split；不要手填哈希假装完成核对。原始 DSH、旧原生文件和已有复核记录均应保留。

训练配方会重新检查实际文件和来源分组，并使用固定模型的真实 tokenizer 检查 384/1024/2048 token 预算。不要把字符数检查、格式检查或上一次数据的编码报告称为本批编码已通过。

## 旧八类路由数据怎样改进

按 `legacy-native.md` 保留原生结构、原标签与原来源，先查原分组和不确定样本，再据真实复核结果生成四份文件。旧 certainty/difficulty 是审查切片，不自动成为训练权重。缺少路由事实、存在多任务争议和非业务域请求分别处理，不一律改成“其他（兜底）”。

新增 DSH 数据可使用 `security-routing.md` 的有界八类投影；它不替代全部业务合同，也不证明真实 Agent/工具已绑定。最终部署必须沿用同版输入构造逻辑和已确认的路由规则。
