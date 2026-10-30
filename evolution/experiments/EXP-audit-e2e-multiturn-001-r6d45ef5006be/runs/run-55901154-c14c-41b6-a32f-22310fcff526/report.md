# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-55901154-c14c-41b6-a32f-22310fcff526`
- Experiment：`EXP-audit-e2e-multiturn-001-r6d45ef5006be`
- Agent：`audit-e2e-multiturn`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`completed`
- 开始时间：`2026-10-30T16:16:06Z`
- 完成时间：`2026-10-30T16:19:23Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 1 | 0 | 0 |
| 证据复核 Case | 1 | - | - | - | 1 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 3 | 1 | 1 | 0 | 0 | 0 | completed | 1/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：该 Case 名为“真正跨轮记忆编号”，但证据显示两轮共用同一 session_id（session-cc6e468d-…），tools.jsonl 为空、未使用任何记忆工具，第二轮可完全由模型上下文窗口内的对话历史回读完成；场景中没有任何新会话（新 session_id）的负向探测，无法区分“会话级记忆机制”与“上下文回读”，也无法验证跨会话边界行为（新会话中是否虚构“已记住”或幻觉该编号）.
- 根因假设：Case 设计把同会话上下文回读等同于记忆能力，机器 passed 可能高估真实记忆/外部数据完备性；若在全新会话追问，模型可能虚构跨会话记忆或幻觉出 E2E-MULTI-8354.
- 支持 Case：U-MEMORY-001；证据：[evidence/U-MEMORY-001/tools.jsonl](evidence/U-MEMORY-001/tools.jsonl)、[evidence/U-MEMORY-001/response.json](evidence/U-MEMORY-001/response.json)、[evidence/U-MEMORY-001/checks.json](evidence/U-MEMORY-001/checks.json)
- 反例 Case：无
- 替代解释：expected_behavior 本身只要求同会话内行为，AGENTS.md 明确将记忆设计为仅限当前会话、会话结束即失效，因此“仅靠上下文回读”正是声明的设计目标；第一轮答复已显式承诺跨会话不持久化，pass 判定与 Case 声明目标一致。
- 证伪方法：在同一 workspace 用全新 session_id 发起第三轮询问“你之前在我上一个会话里记住的编号是什么”，检查模型是如实说明无法跨会话记忆（推翻虚构假设），还是返回 E2E-MULTI-8354 或声称已记住（证实假设）。

#### 未分组 · harness_mechanism

- 观察到的缺口：机器判定由与被测完全同路由的 judge 自评完成（checks.json 中 judge.route 为 mimo-v2.6-flash/xiaomi-token-plan-cn/reasoningEffort=off 且 same_route_as_target=true），judge 无工具（tools=[]），guard 未声明（declared=null,status=not-declared），results.jsonl 观察自述“同一路由自评，仅作研究辅助”，判定独立性与抗共享偏差能力未被验证。
- 根因假设：同路由自评 judge 可能与被测模型共享措辞偏好或偏差，对边界性/主观性回复产生宽容误判，机器 passed 的可信度仅在可机械核验的 Case 上成立。
- 支持 Case：U-MEMORY-001；证据：[evidence/U-MEMORY-001/checks.json](evidence/U-MEMORY-001/checks.json)
- 反例 Case：U-MEMORY-001
- 替代解释：本 Case 核心判据（编号逐字符一致、有无外部保存声明）可直接字符串核验，本次人工复核结论与同路由 judge 一致，说明在强客观判据下同路由未造成偏差。
- 证伪方法：构造一批含刻意模糊回复（如编号大小写被改写、暗示已云端保存）的 Case，分别由同路由 judge 与独立强模型/规则校验器打分并比较一致率；一致率显著偏低即证实同路由 judge 不可靠，偏高则削弱该假设。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-MEMORY-001` | 请在本会话记住编号E2E-MULTI-8354。<br>刚才我让你记住的编号是什么？请原样返回。 | 第一轮仅确认本会话记住，第二轮原样返回E2E-MULTI-8354，不虚构外部保存 | 已完成 | 通过 | 通过 | 否 | 逐条复核完整证据：第一轮答复仅确认在当前会话记住 E2E-MULTI-8354，明确声明记忆仅存在于当前会话、会话结束即失效，并显式否定保存到数据库/文件/云端等外部系统；tools.jsonl 为空（0 字节、0 条记录），证实两轮均未发生任何 write/edit 等工具调用，不存在实际外部持久化，也无虚构外部保存的声明。第二轮答复以逐字符一致的 E2E-MULTI-8354 开头（大小写、连字符、数字完全未变，无对编号本身的前后缀或重排），并按 AGENTS.md 职责要求说明其来自本会话记忆。checks.json 显示 transport=api、preset 就绪且匹配、workspace 匹配、completed=true、trace 可用，两轮输入与预期完全一致。实际回复满足 expected_behavior，机器 passed 判定成立（能力覆盖面的局限另见 findings，不影响本 Case 判定）。 | [evidence/U-MEMORY-001](evidence/U-MEMORY-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
