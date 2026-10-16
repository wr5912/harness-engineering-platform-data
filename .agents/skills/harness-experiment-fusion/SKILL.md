---
name: harness-experiment-fusion
description: 固定同一业务智能体的多个研究来源，通过平台融合工具建立独立 Candidate，解决冲突并验证各来源能力及组合行为。
---

# 多来源 Harness 融合

使用 `platform_agents`，先读取 `research/read-reference {topic:"inheritance-and-fusion"}`。保持数据工作区管理身份；所有版本、编辑、构建和运行证据通过平台动作核对，不要求管理助手操作 Git 分支或运行程序测试。

1. 用 `list/detail`、`assets/read-fixed` 盘点所选来源。固定同一 Agent 的主父版 ID 与 `git:<40位提交>`；从主父版的 `derivation.parent_ref` 核对实际完整内容，不用其历史 Baseline 代替。远端或其他工作树未被平台盘点时明确范围，不声明所有并行开发已覆盖。
2. 调用 `fusion/preview {agent_id,parent_experiment_id,parent_ref,research_question}` 获取当前来源建议。随后提交同一对象和完整 `plan:{sources:[{experiment_id,ref,decision:"inherit"|"omit",reason}],features:[{id,title,description}],conflicts:[{description,resolution}],checks:[{id,kind:"build"|"load"|"capability",command?,case_ids?}]}`。验证范围包含各来源的关键能力及共同场景；构建命令只能使用来源已核实、现有执行器允许的命令。
3. 确认后以创建回执的目标 ID 继续，使用 `fusion/status` 获取当前摘要。创建只建立待融合工作树。用 `assets/read-fixed` 读取固定来源、`edit/read` 读取目标，再经 `edit/preview` 与 `edit/apply` 合并目标 Candidate。预览截断、二进制或缺文件时说明缺口，不能用空实现或截断正文替代完整资产。
4. 对每项已确认构建检查调用 `fusion/verify {experiment_id,check_id,expected_candidate_sha256}`。构建后资产摘要变化则使用新摘要重新核对。校验依赖、Preset、插件注册、MCP 范围和实际目标制品，不能用来源自己的测试结果替代目标集成证据。
5. 使用 `eval/preview`、`eval/start` 运行约定 Case，取得新的封存 Run，再调用 `fusion/verify {experiment_id,check_id,expected_candidate_sha256,run_id}` 完成 load/capability 检查。匹配当前资产、实际来源与约定输入；模型自报成功不作为回执。已确认融合只允许同一会话、目标和约定 Case 连续办理，不扩大授权。
6. `fusion/finalize` 通过全部约定检查后，回读最终状态。使用 `research-eval` 保存实际观察及 Decision，明确未覆盖来源、能力和外部依赖。失败保留证据，不能以“来源已声明”代替融合完成。

只有固定主线父版、效果与资源证据齐全且人员确认的算力 `end` 版本才可排除主线继承；探索性变体仍需判断。运行中的同名实例不证明已加载新 Candidate，需要新 Session 或新实例的匹配证据。
