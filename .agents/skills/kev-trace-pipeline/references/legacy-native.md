# 既有原生 Kev JSONL 的接入

本路径接收已有 `state`、`questions` 和可选 `_meta` 的 JSONL。保留 `choice`、`noul`、`score`，不要求补造 trace IR 或 DSH trace。缺本套 trace provenance 不等于原生 Kev 格式不合法。

## 目录

1. 阶段和命令
2. 独立复核格式
3. 来源闭包与既有分区
4. 构建结果和审计接口
5. 边界

## 阶段和命令

使用 `scripts/legacy_native.py`，标准库即可运行。不安装依赖，不联网，不加载 tokenizer，不训练。命令默认输出简短中文摘要，并写 `report.md`；需要完整机器输出时加 `--json`。所有输出目录必须是新目录，不能覆盖既有产物。实际执行时将以下占位路径替换为真实绝对路径，每次执行一条并阅读报告。

```bash
python3 /absolute/kev-trace-pipeline/scripts/legacy_native.py inspect --input /absolute/data/native.jsonl --out /absolute/work/01-native-inspect
```

检查复用固定版本 `.agents/skills/kev-training/references/upstream/kev-finetune/scripts/split_data.py::check_record`，另外拒绝重复 JSON 键、NaN、Infinity、数值溢出为 infinity、bool 概率权重及不合法 soft 总量。它不调用官方 `split()`。检查会生成 `reviews.todo.jsonl`；**所有题均为 `unreviewed`，`label` 和 `target` 均为空**。`original_label`、`original_target` 只是复核时的原始声明。旧 certainty、review_agent 字段和模型建议不会自动升级标签。

另外直接复用 `dataset.py::_input_leaks` 的现有根字段检查：模型可见状态顶层出现 `gold_label`、`future_tool_result` 等保留监督/后续信息字段时，保留原文并隔离，不静默清洗。原生格式合法与训练输入合格分别报告。检查不匹配文本词语，不一概拒绝合法嵌套业务 `status`、`result` 等字段；其他语义泄漏仍须合同复核。

`report.md` 用“原生格式检查通过，标签尚未复核”等直接中文结论，汇总原有低/中确定性和未定标记。优先复核数包含 `difficulty=uncertain`，与低确定性等线索按记录去重；低难度本身不解释为低确定性。`review-queue.md` 优先展示最多 30 条带上述标记或格式/输入边界问题的记录，随后补充普通未复核记录。每条以原文件行号定位，展示题目、输入状态、原标签摘录和优先理由，不展示冗长接入引用；完整绑定仍在复核模板。这里只安排复核顺序，不估计错标率、不预测新标签、不按确定性设权重。超过预览长度会明确标注，原文件和完整 JSONL 模板均不截断；stdout 给出报告和队列的实际路径。

人读队列将相同题目定义集中说明一次，并给出首次出现的原文件行号和原题名称；“题目1”等只是本页短引用。选择题只集中列候选名称，判断题保留原布尔标签，评分题显示原索引及对应等级。逐行展示优先原因、原标签与输入；常见状态对象的文本字段直接呈现为“用户输入指令”“背景信息”等键值，不重复整段题干或候选描述。此呈现不改写机器记录。

由实际人员或有可核查独立判据的规则完成复核，保存为新文件 `reviewed.jsonl`。完成后执行：

```bash
python3 /absolute/kev-trace-pipeline/scripts/legacy_native.py build --input /absolute/data/native.jsonl --reviews /absolute/work/reviewed.jsonl --out /absolute/work/02-native-build --seed 0 --fractions 0.7,0.1,0.1,0.1
```

比例顺序固定为 **train,development,calibration,test**，四个值必须有限、正数、总和为 1。只导出每道题都为合法 `verified` 的完整记录。任何题未定，整行进入 `quarantine.jsonl`；不删掉未定题再把同一行包装成可训练记录。构建阻塞时仍保存源/复核快照及报告，但不写四分区文件。

```bash
python3 /absolute/kev-trace-pipeline/scripts/legacy_native.py audit --dataset-dir /absolute/work/02-native-build --out /absolute/work/03-native-audit
```

`audit --out` 可省略；它不修改数据目录。审计失败不能继续训练交接。检查命令在原生检查有错误时返回 1；`needs_review` 的正常检查返回 0，这不表示标签已通过。构建/审计只有通过时返回 0。

## 独立复核格式

每行复核使用 `schema_version=kev-legacy-native-review/v1`，独立绑定：

| 字段 | 约束 |
| --- | --- |
| `source_sha256` | 原 JSONL 的原始字节 SHA-256，包括空行和换行变化 |
| `source_line` | 原文件的 1-based 行号，整数且不能是 bool |
| `record_sha256` | 原记录按 UTF-8、排序对象键、紧凑 JSON、保留 Unicode、禁非有限数字序列化后的 SHA-256 |
| `record_id` | 工具按文件 hash、行号、记录 hash 生成的接入引用；不是 DSH ID 或原始来源证明 |
| `grouping` | 可补充真实 `family_id` / `session_id`，新增值须有 `basis` 和非空 `evidence_refs` |
| `questions` | 键必须与原文件所有题目 ID 精确相同，每题独立填写 |

`questions` 中各项的复核字段如下。模板允许 `unreviewed`；已处理的题明确选 `verified`、`ambiguous`、`invalid` 或 `unlabeled`。保留未定状态是一种有效结果。

| 字段 | 用途 |
| --- | --- |
| `status` | 仅 `verified` 可导出；其余状态隔离 |
| `label` | 明确复核后的 hard label；choice 为选项名，noul 为 bool，score 为合法整数索引 |
| `source` | 标签依据来自哪里；不能仅写“模型说是”来替代独立判断 |
| `review_method` | `human` 或 `rule`；`model_suggestion` 不可成为 verified |
| `reviewer` | `human` 时填真实复核者标识，不由工具伪造 |
| `rule_id` / `rule_version` | `rule` 时须填可定位的独立规则标识和版本；不能把 certainty 阈值或教师自评分冒充答案判据 |
| `basis` | 简短解释为什么证据足以支持此标签；单独“高确定性/低确定性”不能充当解释 |
| `evidence_refs` | 非空真实证据引用列表；可用文件及位置、合同条款、可核查执行判定等；引用不需要假装是 DSH event |
| `target` / `target_semantics` | 可选 soft 权重和明确概率来源/语义；不得为掩盖歧义而随意均分 |

`verified` 要求 method 身份、source、basis、evidence_refs 均满足约束。非 verified 的 `basis`、`source` 和 `evidence_refs` 应如实说明未定、拒绝或缺证原因；证据缺失可保留空列表，不能为了填满模板造证据。`rule` 是离线独立判据，不新增平台审批流程；真实平台导出的人员 reviewed 流程仍走原平台路径。

soft 使用官方非负权重语义，额外要求所有值和总量有限、非负、非 bool，至少一个正值且无未知选项。构建按选项名归一化为概率；不自动创建分布。即便存在 soft target，所有分区仍需合法 verified hard label。原输入的 soft target 不会被默默继承：复核明确填 `target` 和 `target_semantics` 才导出，否则输出不含 soft target，原值仍在源快照中。多个可接受答案但无法唯一裁决，应保持 `ambiguous`，不得用随意 hard label 混入常规校准或测试。

修改原文件字节、原记录内容或绑定字段后必须重新检查和复核；不能只改 SHA 字段绕过绑定。未提供复核的记录隔离；重复或无对应原记录的复核、错误绑定和无依据的新增来源映射阻断整批构建。

## 来源闭包与既有分区

在**全量原输入**上先建立传递闭包，再根据复核状态筛选。被隔离行仍可能连接两个来源组，不能因为其标签无效而切断连接。

工具连接以下已知关系：

- 顶层、`_meta`、两处 `provenance` 中的 `group_id` / `source_group_id`、`family_id` / `task_family_id` / `source_family_id`、`session_id`。
- 复核中有依据的 `grouping.family_id` / `grouping.session_id`。
- 官方 `state_key` 的规范化相同状态，保守地将大小写/空白变体合组，包括同状态不同题和多题包装。
- 相同 canonical 状态及逐题 `type`、`instructions`、`criteria`；忽略 qid、label、target、src，避免改题 ID 或部分重叠题目绕开连接。
- 共享 `native_input.py` 按固定原生渲染规则得到的状态和逐题身份：对象与等价渲染字符串也连接；例如 `{"request":"same"}` 与 `"request: same"`。题目说明和选项说明同样经过原生渲染，选项名字与标签映射仍保留。此检查不加载分词器。

原始组不被随机拆开。连通后生成 `legacy-group-…` 作为导出 `_meta.group_id`；它只标识机械闭包，不宣称有不存在的原始 session。原 `group_id` 完整保存在 `_meta.legacy.original_meta`。没有真实 group/family/session 声明的记录，需要补真实映射及依据；逐行生成接入 ID 不证明这些行彼此独立。

相同逐题模型输入出现相互冲突的 verified hard label 会阻断构建，同时检查 canonical 身份和原生渲染身份，包括不同 qid、等价渲染的题目说明或不同多题包装中的同一题。先做合同裁决，不依据多数票、旧 certainty 或随机顺序选一条。

原顶层、`_meta` 或相应 `provenance` 中已有明确 `split` 时，保留 `train`、`development`、`calibration`、`test` 的既有分配。一个闭包跨多个已有 split，或出现含义未明确的 split 名称，均阻断；不把 `val` 等名称猜成某个用途。仅未分配的组按目标比例补充分配，报告会明确说明，因此实际比例可偏离请求值。至少需要四个有 eligible 记录的来源闭包，且在保留已有 split 后仍能填满四个物理分区。八百条同源记录也不等于四个独立来源。

## 构建结果和审计接口

成功目录包含四个真实物理文件 `train.jsonl`、`development.jsonl`、`calibration.jsonl`、`test.jsonl`，以及：

| 文件 | 内容 |
| --- | --- |
| `source.jsonl` | 原输入字节快照，保证未覆盖原文件 |
| `reviews.jsonl` | 绑定复核文件的原字节快照 |
| `quarantine.jsonl` | 完整隔离原记录、复核和逐题原因，空隔离时为空文件 |
| `split-manifest.json` | `schema_version=kev-legacy-native-split/v1`，`source_format=legacy-native`，状态、hash、分组、比例、四分区计数和文件信息 |
| `report.json` | 完整机器报告，额外绑定 manifest 字节 SHA-256 |
| `report.md` | 中文结论、隔离/阻塞信息、分区表和下一步边界 |

`split-manifest.json.files` 精确按四分区名索引，包含每个 `path`、`sha256`、`records`、`questions`、`groups`。manifest 和报告绑定原输入、复核、隔离、四分区文件；不只记录目录名或自报 `ok`。

模型可见的 `state`、题目定义、候选保持原样和原对象顺序；题 ID 和 `src` 作为身份/指标信息保留，不把它们误称为模型输入语义。`label`/`target` 是本次已复核的监督，`_meta` 保存审计信息，均不注入 state。原顶层扩展字段也保留。原 `source` 和 `provenance` 不冒充新来源，不被覆盖；原完整 `_meta` 连同原先的 `legacy` 命名空间保存到 `_meta.legacy.original_meta`。

本次每条导出统一使用稳定且唯一的字符串 `_meta.id`，取已绑定源文件、行号和记录 hash 的接入引用，避免原 ID 缺失、为整数或重复时令训练消费者失败。所有派生记录标记 `id_generated=true`；原 ID（包括 null、数字或重复值）完整保存在 `original_meta.id`，原文件不改。导出顶层 `_meta.group_id`/`split` 表示本次闭包和物理分配。派生记录设 `_meta.variant=clean`，让原生 Kev gold/benchmark 消费者按 clean 口径纳入本次已复核输入；这是本次派生输出用途，不是改写历史来源。原 variant 完整留在 `original_meta.variant`，同时记录 `variant_scope=derived-reviewed-export`。新复核快照和 hash 均放在 `_meta.legacy`；历史 `_meta.label_status` 等字段如果存在仍是原声明，不能替代新复核快照。

训练交接按 `dataset.kind=legacy-native` 调用：

```python
from legacy_native import audit_directory

audit = audit_directory(dataset_dir)
if not audit["ok"]:
    # 报告 audit["errors"] 并阻断交接。
    ...
```

返回 JSON-safe 字典：`schema_version=kev-legacy-native-audit/v1`、`kind=legacy-native`、`ok`、`status`、`errors`、`warnings`、`partition_records`、`partition_groups`、`manifest_sha256`、`source_sha256`、`reviews_sha256`、`token_budget` 和 `limitations`。文件损坏/缺失返回 `ok=false`；不能以旧 `report.ok` 代替调用。

审计重新读取严格 JSON，验证快照和分区 hash，重放所有原始记录、来源闭包、复核、冲突检查和分配，再对实际分区逐行复查共享的输入泄漏规则。四分区及隔离文件必须与重放所得预期 JSONL 字节一致，包含原生渲染依赖的对象顺序；不只比较排序后的 JSON。canonical 排序仅用于 hash，不用于改写输出。手工重排或重新格式化派生文件后需重新构建，不能通过重填 hash 绕过重放。

审计还核对实际计数、来源组不交叉、派生 ID、复核快照及 manifest/report 绑定。即便有人同步更新分区 hash 和报告，错误 label、group、状态、输入或字段顺序仍会与源/复核重放不一致。训练端直接使用四个已审计文件，不重新调用官方仅按 state 的三分区随机切分，也不把 `_meta.split` 当作 `--data` 的自动过滤器。

## 边界

hash 和结构检查证明产物能重放，不能认证复核者身份或证明业务标签正确。规则本身是否独立、证据是否足够、是否存在未声明的同任务重试/模板家族、状态是否只包含决策前可见信息，仍需真实合同和来源核对。不能为了让审计变绿，补造 session、family、trace hash、人员身份、规则版本或证据引用。

原文件原生合法，仅意味着可由原生格式检查解释；它不自动证明 hard gold、独立切分或 token 预算已通过。四分区通过后仍须用选定 checkpoint 的 tokenizer 做严格编码与预算检查，并按训练技能规划模型/规则基线、校准及锁定测试。这里没有质量、性能或成功训练的证据。

源快照、复核和隔离记录可能含用户私有数据。把运行输出写在工作树外或明确忽略的工作目录；不要把用户原始 JSONL、真实 trace 或复核副本写入 Git。脚本测试仅使用手工合成夹具。
