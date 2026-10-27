# 决策样本标注

已有 samples 或复核材料可直接进入本阶段，不重新抽取。执行与恢复边界沿用入口 Skill；字段见[中间样本合同](../data-contract.md)。旧原生 KEV 文件按 [legacy-native](../legacy-native.md)绑定真实文件和记录摘要，不伪造 IR 来源。

1. 读取职责合同与决策前缀。policy 首轮独立标注隐藏当前历史选中标记和未来结果；verifier 必须看到它所评判的动作及合同允许的证据。
2. 输出 label.status：unlabeled、weak、verified、ambiguous、invalid；记录 value、source、evidence_refs，必要时保留 acceptable_actions、missing_fields、adjudication。证据说明规则/复核者/判定器版本与引用。
3. verified 需要可检查的规则、执行判定或明确复核依据。结构校验不证明语义正确，同模型多 agent 投票仍可能相关；source 字段不等于模型当时见过该事实。
4. 分别判断工具返回成功、业务结果完整、发现异常与用户任务完成。PARTIAL 可能是如实完成一次巡检后的业务证据缺口；执行报错也不必然说明工具选错。
5. 后验轨迹可帮助判断已执行动作当时是否合理，不能证明未执行替代分支的优劣。未执行分支为 unknown，不自动成负例；必要时在可恢复环境验证。未来根因不倒灌成先知式目标。
6. 缺上下文不强行标“其他”，缺主语/对象不猜域，多任务不借未公开编号顺序仲裁。多答案先修订合同或采用集合评价，不为满足 loader 随填 hard label 或均匀 target。
7. 使用 `<core_dir>/scripts/kev_trace.py annotate` 合并 sample_id + label 覆盖文件；只修改监督侧，不改 state/question/provenance。
8. 合成负例说明修改内容、预期规则及是否实际执行，继承 source_group_id 并保留 synthetic_counterfactual=true。策略偏好对必须共享可比较状态。

候选可用性、目录版本、回执 runId、requestId 复用及数字/URL 忠实性可以程序核对；表达质量、路由泛化和未执行动作优劣需要额外判断。教师投票、动作成功率、偏好权重与校准概率分别管理；标准 hard-label 评估不等于可接受集合评分。

difficulty、annotation_certainty 和模型自报置信度只用于筛选复核，不自动变成 verified、训练权重或概率。数据编译显式允许的 weak 也不满足当前默认训练配方。保留待标注和弱标签材料，不为凑齐 train/test 将它们提升成独立金标。

向用户用“待标注、依据不足、已复核、已排除”解释状态，保留机器文件原枚举；给出需要裁决的具体业务区别和证据，不要求先读完整嵌套对象。
