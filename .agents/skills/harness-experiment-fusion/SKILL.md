---
name: harness-experiment-fusion
description: 固定同一业务智能体的多个研究来源，通过平台融合工具合并同代特性或建立未分代来源的独立 Candidate，解决冲突并验证目标能力。
---

# 多来源 Harness 融合

使用 `platform_agents`；需要判断继承取舍时读取 `research/read-reference {topic:"inheritance-and-fusion"}`。已有 `operation_id` 先 `fusion/status {operation_id}`，否则按目标 ID 查询；从尚未完成步骤继续，不再次创建。编辑、受控构建和运行均通过平台动作核对，不操作 Git 分支或运行程序测试。

仅要求只读策划时，完成指定固定来源、必要资产与业务 Case 的核对，以及不带 plan 的来源盘点；给出应继承内容、验证方式、已有证据与缺口后结束。不提交完整方案、不创建或运行，也不因目录建议替换用户指定的来源。其他版本只在解释当前问题确有必要时作为补充。

1. 读所选来源的 `detail`，再用 `assets/read-fixed` 核对固定内容，来源须属于同一 Agent。优先使用用户指定的 `git:<40位提交>`；用户未指定时，通过来源回执核对包含该版本完整 Candidate 的固定提交；`derivation.parent_ref` 和 `baseline_ref` 表示派生或比较祖先，不能直接当作该版本自身的固定来源。固定读取失败时核对参数与引用；仍不可读就说明具体缺口，停止依赖步骤，不猜 SHA，也不用当前工作树补证固定版本。
2. 调用 `fusion/preview {agent_id,parent_experiment_id,parent_ref,research_question}` 获取当前来源建议。纳入分代治理时，父版选同代 `f`，并提供 `target_experiment_id` 指向该代已有 `m`；不能通过融合自动升号或另建同代主线。`inventory.superseded` 表示当前盘点中被其他候选继承关系覆盖的来源，不证明其能力无效、业务已验证或不可继承。用户已要求实施时，才提交同一对象和完整 `plan:{sources:[{experiment_id,ref,decision:"inherit"|"omit",reason}],features:[{id,title,description}],conflicts:[{description,resolution}],checks:[{id,kind:"build"|"load"|"capability",command?,case_ids?}]}`；同代合并通过下一步准备草稿，不需要模型搬运整份文件或填写 `plan.edits`；原有页面的 `preview + plan.edits` 接口继续兼容。验证范围包含各来源的关键能力及共同场景；构建命令只能使用来源已核实、现有执行器允许的命令。
3. 同代 `f → m` 用相同来源、目标和完整方案调用 `fusion/prepare`，保存 `operation_id` 与最新 `plan_sha256`。平台固定来源、真实目标工作树、可核验共同祖先和评测口径，自动复制来源独有变化、保留目标独有变化，并对可安全合并的文本使用 Git 三方合并；准备不写 Candidate。先看差异统计和 `conflicts` 清单，按需读取冲突文件及必要上下文，不将全部自动合并内容重传给模型。共同祖先未知时逐项明确取舍，不用当前 HEAD 猜祖先。只对 `conflicts` 或确需调整的差异调用 `fusion/resolve {operation_id,expected_plan_sha256,resolutions:[{path,decision,reason,...}]}`：`source`、`target`、`delete` 明确取舍，`content` 只传确需人工修改的文本；二进制、删除／修改、重命名冲突及文件／目录互换须明确处理。每次以返回的新方案摘要继续。
   用户需要本地对比时，可使用 `bundle_path` 下的 `base/source/target` 固定快照和唯一可编辑的 `result` 输出，按当前安装的 Beyond Compare 能力打开目录比较。不得直接写目标 Candidate 或改快照；只通过同一操作的映射路径、`decision:"result"` 和 `expected_result_sha256` 导入输出，删除用 `delete`。该工具仅为可选辅助；平台离线内置 Git（兼容 2.34.1）即可完成融合，不要求另装 Beyond Compare、启用新 Git 参数或全局 `rerere`。
   冲突清零后调用 `fusion/confirm {operation_id,expected_plan_sha256}`，由平台按 DSH 原生权限办理，以真实成功回执中的原 m ID 继续；重复确认返回既有回执。来源、目标、版本或评测口径变化时，保留旧草稿并重新 `prepare`；未变则沿用已有 `operation_id` 和仍匹配当前资产的有效验证，不覆盖并行修改。返回未知或中断先查状态；`applying` 使用 `fusion/recover`，仅在全部预期资产和元数据均已写入时用 `recovery:"complete"` 补记完成，否则用 `recovery:"rollback"` 恢复本次写入。恢复遇到并行修改时停止并说明路径，不自动重放写操作。
   未分代来源沿用原独立目标的 `fusion/preview`、`confirm` 流程。后续补充编辑使用 `assets/read-fixed`、`edit/read`、`edit/preview` 与 `edit/apply`。预览截断、二进制或缺文件时说明缺口，不能用空实现或截断正文替代完整资产。
4. 确认前检查完整输出的装载结构，包括未改动的入口、删除、移动和二进制替换；预检失败时保留阶段、路径和原因，通过 `edit/read → edit/preview → edit/apply` 修复来源，再重新预览。Web 挂载点遵循[统一资产合同](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/03_存储架构与数据契约.md#candidate-asset-validation)，不得删除必需入口、忽略错误或放宽凭据规则绕过工具。对每项已确认构建检查调用 `fusion/verify {experiment_id,check_id,expected_candidate_sha256}`。任何资产变化都会使旧摘要的构建回执失效，须按当前完整摘要重新执行检查。校验依赖、Preset、插件注册、MCP 范围和实际目标制品，不能用来源自己的测试结果替代目标集成证据。
5. 使用 `eval/preview`、`eval/start` 运行约定 Case，取得新的封存 Run，再调用 `fusion/verify {experiment_id,check_id,expected_candidate_sha256,run_id}` 完成 load/capability 检查。匹配当前资产、实际来源与约定输入；模型自报成功不作为回执。容器启动、新 Session 或 HTTP 成功只证明相应技术状态，不能代替封存 Run。用户只授权工具修复或启动恢复时，保留 `integrating` 和 `Decision: continue`，明确待执行检查，不调用 finalize 或扩大运行范围。已确认融合只允许同一会话、目标和约定 Case 连续办理，不扩大授权。
6. 全部约定检查有效后调用 `fusion/finalize` 并回读状态；仍有失败则保留证据、停止完成声明。评测步骤按已加载的 `research-eval`，观察与 Decision 按[结论保存合同](../harness-evolution/SKILL.md#记录观察与结论)保存，不为查字段加载整个演进流程，不重新创建或重跑已有效的检查。说明未覆盖来源、能力和外部依赖，不能以“来源已声明”代替融合完成。

每步使用最近回执的目标 ID 与摘要，核对工具内层 `result.ok` 与真实错误；外层已返回不等于动作成功。委派仅用于只读盘点、冲突建议或审查，父会话统一写入和续办，不向子任务扩大身份或授权。缺少平台动作或执行失败时保留具体阶段、路径和错误，交由研发工具补齐，不改走任意 Shell、内部模块或手工文件写入。参数不确定或返回参数错误时先调用 `describe`，以需要核对的真实操作名填写 `input.action`；核对合同后再调用，不将未核实的请求并行复制到多个对象。构建改变资产后旧摘要失效；编辑冲突先重读。运行回执未知先查询已有 Job/Run，不能重复启动可能写入外部系统的任务。用户取消就停止依赖步骤，不通过直接文件或内部工具绕过。

形成结论前核对证据属于同一对象、同一版本和所声称的层级：单文件一致不能证明整树一致，历史 Run 的装载摘要不能充当当前资产摘要。未查全的来源与 Run 保持未知，不作全称或唯一性结论；当前回退、摘要不匹配或一次读取失败，只说明对应范围的状态，未核对恢复来源不能断言不可恢复。结论限于本次已检查范围，不为作全称判断而遍历无关历史。

只有固定主线父版、效果与资源证据齐全且人员确认的算力 `end` 版本才可排除主线继承；探索性变体仍需判断。运行中的同名实例不证明已加载新 Candidate，需要新 Session 或新实例的匹配证据。
