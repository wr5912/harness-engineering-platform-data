# 中间样本与 Kev 导出合同

格式总览与各入口见 dataset-formats.md。这里约束离线 trace IR，不能直接套到平台 v2 或旧原生 KEV 文件；旧数据使用 legacy-native.md，平台数据使用 platform-export.md。用户阅读的方案和审查用中文报告，以下字段用于程序记录与校验。

## 样本单位

每个样本是一个明确定义的决策问题，不是一个日志事件。一个模型响应中多个工具调用需要联合/有序动作合同，不能无依据拆成互相独立的样本。shared source_group 必须保留。

IR schema_version: kev-decision-ir/v1。

| 字段 | 含义 |
| --- | --- |
| sample_id / decision_site_id / contract_version | 样本身份、职责与定义版本 |
| implementation | model、code、hybrid；是可修订建议 |
| state | 决策前可读状态，字符串或对象 |
| question | type 为 choice、noul 或 score；instructions 与 criteria 保持实际推理定义 |
| candidate_bindings | 候选对应的执行对象与参数来源；默认不作为训练答案 |
| observed_action / observed_candidate | 历史行为，永不自动等于 gold |
| label | status、value、source、evidence_refs；可选 target 和 target_semantics |
| provenance | 源文件哈希、session、来源组、turn/step、边界、状态/候选证据、builder 版本 |
| review | 规则建议、信息缺口、抽取限制；不进入模型输入 |

state_evidence_refs/candidate_evidence_refs 中 event 类型必须带整数 seq，且小于 decision_seq；静态候选合同使用 kind=contract 与 contract_version。label 的证据可以来自后续结果，但不能因此让输入获得未来事实。仅通过 seq 检查不能证明语义无泄漏，仍需原始证据核对和未来不变性检查。

## 标签

- unlabeled：仅抽取，value 为 null。
- weak：教师、历史行为或尚未独立验证的建议；显式允许后只能入训练。
- verified：依据当前业务合同已复核的目标；需 source 与 evidence_refs。
- ambiguous：合同或证据不足以唯一决定；保留可接受集合/缺失字段，不伪造 hard label。
- invalid：无有效来源、损坏或不适用；说明原因。

verified 是标注者的可追溯主张，脚本只验证结构和约束。source 字符串不能凭空把错误答案变成事实。评分 policy 时不要展示当前历史选中标记；评分给定动作的 verifier 要保留该动作和任务允许的证据。

AI 功能复核可以形成明确范围内的 verified 主张，source 与 evidence_refs 必须保留实际复核者、请求/响应及判定依据；这不等于人员审批或独立业务真值。仅有教师建议、模型投票或用户允许 AI 复核，不能自动把未复核目标提升为 verified。功能标签上的训练与校准指标按该标签来源解释，业务效果仍须独立验证。

weak 的允许范围只到数据阶段；当前 kev-training 的默认 IR 配方要求全部 verified，不接收 training_only 行。不要把数据编译成功称为已经满足训练配方。

## 原生 Kev 导出

输出 state、questions 和 _meta；一条 IR 对应一道题，同站点多题各自成行并继承同源组与会话。每个 questions 项保留 type/instructions/criteria/label：choice 标签为精确候选字符串，noul 为 JSON 布尔值，score 为从 0 开始的整数等级（布尔值不能充当整数）。noul 的 criteria 可省略或说明 false/true；score 的 criteria 为有序等级说明，顺序不排序。导出 _meta.id、group_id、source 和 variant=clean，审核信息放元数据。不会把原始整行 IR 序列化到 state。

soft target 即使存在也要有合法 hard label。其权重必须有限非负、总和正、无未知选项；记录概率来源与语义。标准评估和温度拟合仍依赖 hard label；不能把没有可确定答案的样本混入常规校准金标。避免随意均分来掩盖争议。

软目标键与原生概率键一致：choice 使用候选名，noul 使用字符串 false/true，score 使用字符串等级索引。split-manifest 的 label_statistics_version=question-native-label/v1 表示 partition_labels 按 question_definitions 中的职责、合同及题目定义分别统计这些键；missing_label_coverage 也按题报告，避免混淆不同题目的同名标签。

## 来源分组与切分

group 的单位为真实源任务家族。一个 session 中多个步骤、同任务重试、派生会话、模板改写和合成反事实继承同源标识。现有算法自动连接 source_group/session/相同输入，但不能发现没有被声明的跨 session 同源关系；使用者需提供真实父任务映射。

固定 seed 只保证可重复，不保证独立性。输出实际 train/development/calibration/test 文件，审查交集、分布和覆盖。_meta.split 不会让 Kev 的 --data 自动筛掉测试行。弱标签及其连通来源组只进 train。

合成反事实字段：synthetic_counterfactual=true、source_observed=false、generation_rule、parent_sample_id 和继承的 source_group_id。未执行的分支结果写 unknown，不捏造 reward。

## 泄漏与正常业务状态

state._meta、state.provenance、state.verified_target、state.observed_action、state.annotation_note、state.label_status、state.split 等属于明确保留字段风险。上一步已可见的 status/result/businessSummary 可以是合法输入。字段同名或文本提到某个类别不自动等于泄漏；结合时间、证据与合同判断。
