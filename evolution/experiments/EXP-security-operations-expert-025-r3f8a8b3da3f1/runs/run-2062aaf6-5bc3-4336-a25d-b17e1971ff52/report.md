# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-2062aaf6-5bc3-4336-a25d-b17e1971ff52`
- Experiment：`EXP-security-operations-expert-025-r3f8a8b3da3f1`
- Agent：`security-operations-expert`
- 状态：失败
- 有效结论：无法判定
- 机器结论：失败
- 证据复核：`not_requested`
- 开始时间：`2026-10-27T08:59:17Z`
- 完成时间：`2026-10-27T09:02:35Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`changed`

`source-changed`：candidate, managed 与初始锁定来源不一致或无法读取。原始 Case 结果保留，本 Run 不能用于证明锁定来源通过；请固定来源后重新运行。

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 0 | 2 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 2 | 0 | 2 | 0 | 0 | not_requested | 0/0/0 |
| 独立应急指令 | 3 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 策略配置 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 11 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 14 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
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
| `U-INS-001` | 执行一次常规巡检。 | 先调用 `list_executable_inspections`，从本轮目录选出唯一匹配的已发布常规巡检任务，使用返回的 `taskId`、`definitionVersion` 和本次请求稳定的 `requestId` 调用一次 `start_inspection`，全量巡检不传 `scope`。之后只以同一 `runId` 调用 `get_inspection_result` 直到报告就绪，不重复发起。回复依据服务的 `conclusionStatus`、`businessSummary` 和完整 `reportMarkdown`，准确给出设备数量，不改写结论；设备数量缺失时说明缺口，该项不得判通过。仅当 `reportDownloadUrl` 非空时原样提供下载地址。运行中、工具失败或报告未就绪时不得声称完成；结果为 `PARTIAL` 时须说明证据缺口。 | 已完成 | 失败 | - | - | 语义判定：inspection MCP 服务在本轮明确断连（list_mcp_resources 与 list_mcp_resource_templates 均返回 server is disconnected），因此 list_executable_inspections、start_inspection、get_inspection_result 全部未被调用，没有 taskId、runId、conclusionStatus、reportMarkdown 与设备数量等任何真实巡检数据。被测回答如实报告服务不可用、未声称完成、未编造结论或下载地址，这部分行为正确；但冻结预期要求的“目录查询→选定唯一模板→发起→按 runId 轮询→依据报告作答”整条主链路一项都未完成，关键数据要求无法满足，故整体判定 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-001](evidence/U-INS-001) |
| `U-INS-002` | 请列出当前可用的巡检项，只查询目录，不要执行巡检。 | 只调用 `list_executable_inspections`；回复列出本轮真实返回的可执行模板及其巡检项，不调用 `start_inspection`。查询失败或目录为空时如实说明，不编造目录内容。 | 已完成 | 失败 | - | - | 语义判定：被测回答未调用要求中指定的 `list_executable_inspections`，而是改为调用 `list_mcp_resources` 与 `list_mcp_resource_templates` 两个非要求工具（工具回执 index 4、6 显示这两次调用确实发生并返回 inspection 服务器断开错误），因此第一项“只调用 list_executable_inspections”这一冻结要求明确未满足，整体不能判为 passed。另一方面，回答确实未发起任何 `start_inspection`，且在查询失败时如实说明“巡检服务断开、无法列出巡检项、不猜测模板名”，与真实错误回执一致，没有编造目录内容——这两项（不执行巡检、如实说明失败）是满足的。但只要有一项要求明确不满足，即判 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-002](evidence/U-INS-002) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
