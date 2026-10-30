# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-91b77922-a32e-4dcd-9de6-e62dcfb1beff`
- Experiment：`VAR-security-operations-expert-001-r66152e077843`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：失败
- 机器结论：失败
- 证据复核：`not_requested`
- 开始时间：`2026-10-30T02:30:05Z`
- 完成时间：`2026-10-30T02:32:29Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 0 | 2 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 1 | 0 | 1 | 0 | 0 | not_requested | 0/0/0 |
| 独立应急指令 | 3 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 策略配置 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 11 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 14 | 1 | 0 | 1 | 0 | 0 | not_requested | 0/0/0 |
| 威胁事件研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产关联告警代码变体研究 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-INS-002` | 请列出当前可用的巡检项，只查询目录，不要执行巡检。 | 只调用 `list_executable_inspections`；回复列出本轮真实返回的可执行模板及其巡检项，不调用 `start_inspection`。查询失败或目录为空时如实说明，不编造目录内容。 | 已完成 | 失败 | - | - | 语义判定：预期要求只调用 `list_executable_inspections` 并基于真实回执列出可执行模板及巡检项。被测回执显示的能力目录中只有 `schedule_list`，从未调用 `list_executable_inspections`，也未取得任何巡检模板数据；被测回答明确说明“未发现巡检目录查询的可调用工具”且未编造目录内容，因此“查询失败时如实说明、不编造”一项成立，但前两项核心要求（调用指定工具、列出真实返回的模板及巡检项）均未满足，故整体判定不通过。 | [evidence/U-INS-002](evidence/U-INS-002) |
| `U-QA-001` | SEC-KB-078 SOAR 剧本是什么？ | 检索并依据 SEC-KB-078 的真实知识库内容回答，给出可核对的文档或分块来源；检索不到时明确说明，不凭常识冒充内部知识。 | 已完成 | 失败 | - | - | 语义判定：预期要求二选一：要么依据 SEC-KB-078 真实知识库内容作答并给出可核对的文档/分块来源，要么明确说明检索不到且不以常识冒充内部知识。被测 Session 中唯一工具调用 security_ops_medium_workflow（tool/result 索引 2，is_error=false）返回的是 outcome=language_answer、route=direct_answer 的语言模型回答，其 decision_record 明确列出 uncovered_sites 包含 material_answer，未返回任何 SEC-KB-078 的知识库正文、文档标识或分块来源，因此第一项要求完全未满足，回答中也未给出任何可核对来源。同时，回答开头直接断言“SEC-KB-078 剧本是 SOAR 框架中……一个具体剧本”并罗列“触发条件、自动化动作、决策逻辑”等内容，属于以常识冒充内部知识的具体内容描述，虽然随后附有材料缺失说明，但前置断言仍构成对内部知识的冒充，第二项要求也不能判为满足。故整体判定 failed。 | [evidence/U-QA-001](evidence/U-QA-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
