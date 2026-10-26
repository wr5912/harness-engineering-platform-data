---
name: kev-sample-labeling
description: "为抽取后的决策样本建立可追溯监督目标，区分 observed_action、教师弱标签、验证标签、多答案与缺上下文。用于轨迹标注、冲突裁决、反事实数据和训练金标复核；不会把历史成功或工具 isError=false 自动变成正确动作。"
---

# Kev 决策样本标注

## 入口与继续条件

固定算力策划或 Run 抽样专项不执行本技能的离线命令；沿用其指定技能与工具。只有当前任务允许离线处理且有真实执行工具时继续。完整边界见同级 `kev-trace-pipeline/references/platform-runtime.md`。

从实际 Skill 位置解析同级 core，使用脚本和输入输出的绝对路径。一次完成一个阶段后读取 `stage-status.json`：blocked 停止依赖步骤，requires_review 完成当前复核；不因退出 0 或有文件就自动进入训练。已有输出先回读，续做使用新目录。

## 本阶段操作


1. 读取决策合同及前缀。对 policy 首轮独立标注隐藏当前历史选中标记和未来结果；verifier 必须看到它所评判的动作及合同允许的证据。
2. 输出 label.status：unlabeled、weak、verified、ambiguous、invalid。记录 value、source、evidence_refs，必要时 acceptable_actions、missing_fields、adjudication。
3. verified 要有可检查的规则、执行判定或明确复核依据；结构校验器不替你证明语义正确。同模型多 agent 投票仍可能相关。
4. 工具返回成功、业务结果完整、发现异常与用户任务完成分别判断。PARTIAL 可能是如实完成一次巡检后的业务证据缺口。
5. 对未来才知道的根因，判断当时动作是否合理；不要训练先知式选择。未执行候选默认未知，不是负例。
6. 缺上下文不强行标“其他”。多答案先修订合同或采用集合评价；为满足 Kev loader 而随意填 hard label/均匀 target 都不可取。
7. 使用 core 的 annotate 命令合并 sample_id + label 覆盖文件；它只允许修改监督侧，不改 state/question/provenance。
8. 合成负例说明修改了什么、预期规则、是否实际执行；继承 source_group_id，并保留 synthetic_counterfactual=true。策略偏好对必须共享可比较状态。

旧 KEV 文件的复核使用 core `references/legacy-native.md`，绑定真实原文件与记录摘要，不伪造 IR 来源。`difficulty`、`annotation_certainty` 和模型自报置信度仅供筛选复核，不自动变成 verified、训练权重或概率。数据阶段允许的 weak 与当前训练配方不同：默认训练准备只接受已复核记录，不能因为编译接纳 weak 就声称可直接训练。

面向用户用“待标注、依据不足、已复核、已排除”等可理解的状态说明问题；保留机器文件中的原枚举。给出需要裁决的具体业务区别和证据，不要求用户先阅读完整嵌套对象。

读取 `references/labeling.md` 与 core data-contract.md。让待标注/弱标签材料可继续积累；不要为了凑齐 train/test 把它们提升为独立金标。

共享实现位置：`../kev-trace-pipeline/scripts/kev_trace.py`。所有同级 core 引用路径均相对于本技能目录。
