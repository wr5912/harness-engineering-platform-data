---
name: harness-experiment-fusion
description: 固定同一业务智能体的多个研究来源，通过平台融合工具建立独立 Candidate，解决冲突并验证各来源能力及组合行为。
---

# 多来源 Harness 融合

使用 `platform_agents`；需要判断继承取舍时读取 `research/read-reference {topic:"inheritance-and-fusion"}`。已有融合目标先 `fusion/status`，从尚未完成步骤继续，不再次创建。编辑、受控构建和运行均通过平台动作核对，不操作 Git 分支或运行程序测试。

仅要求只读策划时，完成指定固定来源、必要资产与业务 Case 的核对，以及不带 plan 的来源盘点；给出应继承内容、验证方式、已有证据与缺口后结束。不提交完整方案、不创建或运行，也不因目录建议替换用户指定的来源。其他版本只在解释当前问题确有必要时作为补充。

1. 读所选来源的 `detail`，再用 `assets/read-fixed` 核对固定内容，来源须属于同一 Agent。优先使用用户指定的 `git:<40位提交>`；用户未指定时才取该版本的 `derivation.parent_ref`。`baseline_ref` 只表示比较祖先，不能当作该版本自身的固定来源。固定读取失败时核对参数与引用；仍不可读就说明具体缺口，停止依赖步骤，不猜 SHA，也不用当前工作树补证固定版本。
2. 调用 `fusion/preview {agent_id,parent_experiment_id,parent_ref,research_question}` 获取当前来源建议。`inventory.superseded` 表示当前盘点中被其他候选继承关系覆盖的来源，不证明其能力无效、业务已验证或不可继承。用户已要求实施时，才提交同一对象和完整 `plan:{sources:[{experiment_id,ref,decision:"inherit"|"omit",reason}],features:[{id,title,description}],conflicts:[{description,resolution}],checks:[{id,kind:"build"|"load"|"capability",command?,case_ids?}]}`。验证范围包含各来源的关键能力及共同场景；构建命令只能使用来源已核实、现有执行器允许的命令。
3. 完整方案通过校验后，平台按 DSH 原生权限衔接创建；以成功回执的目标 ID 继续，不另等平台确认卡，使用 `fusion/status` 获取当前摘要。创建只建立待融合工作树。用 `assets/read-fixed` 读取固定来源、`edit/read` 读取目标，再经 `edit/preview` 与 `edit/apply` 合并目标 Candidate。预览截断、二进制或缺文件时说明缺口，不能用空实现或截断正文替代完整资产。
4. 对每项已确认构建检查调用 `fusion/verify {experiment_id,check_id,expected_candidate_sha256}`。构建后资产摘要变化则使用新摘要重新核对。校验依赖、Preset、插件注册、MCP 范围和实际目标制品，不能用来源自己的测试结果替代目标集成证据。
5. 使用 `eval/preview`、`eval/start` 运行约定 Case，取得新的封存 Run，再调用 `fusion/verify {experiment_id,check_id,expected_candidate_sha256,run_id}` 完成 load/capability 检查。匹配当前资产、实际来源与约定输入；模型自报成功不作为回执。已确认融合只允许同一会话、目标和约定 Case 连续办理，不扩大授权。
6. 全部约定检查有效后调用 `fusion/finalize` 并回读状态；仍有失败则保留证据、停止完成声明。评测步骤按已加载的 `research-eval`，观察与 Decision 按[结论保存合同](../harness-evolution/references/decision-update.md)保存，不为查字段加载整个演进流程，不重新创建或重跑已有效的检查。说明未覆盖来源、能力和外部依赖，不能以“来源已声明”代替融合完成。

每步使用最近回执的目标 ID 与摘要。参数不确定或返回参数错误时先调用 `describe`，以需要核对的真实操作名填写 `input.action`；核对合同后再调用，不将未核实的请求并行复制到多个对象。构建改变资产后旧摘要失效；编辑冲突先重读。运行回执未知先查询已有 Job/Run，不能重复启动可能写入外部系统的任务。用户取消就停止依赖步骤，不通过直接文件或内部工具绕过。

形成结论前核对证据属于同一对象、同一版本和所声称的层级：单文件一致不能证明整树一致，历史 Run 的装载摘要不能充当当前资产摘要。未查全的来源与 Run 保持未知，不作全称或唯一性结论；当前回退、摘要不匹配或一次读取失败，只说明对应范围的状态，未核对恢复来源不能断言不可恢复。结论限于本次已检查范围，不为作全称判断而遍历无关历史。

所有变体都不能作为后续主线继承或融合的来源，该限制不取决于是否 `end`；来源选择以 `detail.derivation.derivable` 和实际固定元数据为准。运行中的同名实例不证明已加载新 Candidate，需要新 Session 或新实例的匹配证据。
