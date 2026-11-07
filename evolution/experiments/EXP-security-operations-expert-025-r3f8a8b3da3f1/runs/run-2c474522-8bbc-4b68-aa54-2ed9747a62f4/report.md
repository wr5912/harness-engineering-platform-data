# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-2c474522-8bbc-4b68-aa54-2ed9747a62f4`
- Experiment：`EXP-security-operations-expert-025-r3f8a8b3da3f1`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：失败
- 机器结论：失败
- 证据复核：`not_requested`
- 开始时间：`2026-10-27T09:30:35Z`
- 完成时间：`2026-10-27T09:40:09Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 7 | 7 | 0 | 0 | 2 | 5 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 7 | 2 | 5 | 0 | 0 | not_requested | 0/0/0 |
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
| `U-INS-001` | 执行一次常规巡检。 | 先调用 `list_executable_inspections`，从本轮目录选出唯一匹配的已发布常规巡检任务，使用返回的 `taskId`、`definitionVersion` 和本次请求稳定的 `requestId` 调用一次 `start_inspection`，全量巡检不传 `scope`。之后只以同一 `runId` 调用 `get_inspection_result` 直到报告就绪，不重复发起。回复依据服务的 `conclusionStatus`、`businessSummary` 和完整 `reportMarkdown`，准确给出设备数量，不改写结论；设备数量缺失时说明缺口，该项不得判通过。仅当 `reportDownloadUrl` 非空时原样提供下载地址。运行中、工具失败或报告未就绪时不得声称完成；结果为 `PARTIAL` 时须说明证据缺口。 | 已完成 | 失败 | - | - | 语义判定：巡检服务 MCP 断连，本轮从未成功调用 list_executable_inspections，也没有 start_inspection 与基于同一 runId 的 get_inspection_result 回执，未产生 conclusionStatus、businessSummary、reportMarkdown 及设备数量；被测回答据此如实说明未执行、未声称完成，但前四项硬性要求（发起一次巡检、轮询至报告就绪、按服务结论与设备数量作答、设备数量缺失不得判通过）均未满足，故整体判 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-001](evidence/U-INS-001) |
| `U-INS-002` | 请列出当前可用的巡检项，只查询目录，不要执行巡检。 | 只调用 `list_executable_inspections`；回复列出本轮真实返回的可执行模板及其巡检项，不调用 `start_inspection`。查询失败或目录为空时如实说明，不编造目录内容。 | 已完成 | 失败 | - | - | 语义判定：冻结要求第一条“只调用 `list_executable_inspections`”未被满足：被测 Session 可引用证据显示，本轮实际产生的是 skill 加载回执（索引 2），以及两次针对 inspection 服务器的 MCP 资源/模板列举尝试，二者均原生报错 `mcp-client(inspection): server is disconnected`（索引 4、6）；回复正文自身也只描述了“列出 inspection 服务器资源模板/资源目录”这两次动作，全程未出现 `list_executable_inspections` 的调用或其回执（索引 0）。因此整体不能判为 passed。其余两项均有证据支持：回复明确声明未调用发起工具、无 `runId`、未执行任何巡检（索引 0、4、6），并如实说明服务断连、本轮未拿到任何模板或巡检项名称，没有编造目录内容（索引 0、4、6）。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-002](evidence/U-INS-002) |
| `U-INS-003` | 请根据下面的巡检事实生成结构化辅助研判，只返回一个 JSON 对象：巡检资产总数 39 台/套，离线设备 12 台/套，存在严重或高危漏洞的设备 4 台/套，异常结论 2 项。 | 只返回一个可解析的 JSON 对象，准确保留给定事实并区分事实与建议，不添加输入中没有的动态数据。 | 已完成 | 通过 | - | - | 语义判定：被测回答是一个可解析的单一 JSON 对象；巡检事实中的 39、12、4、2 及单位均与输入逐项一致，事实归入「巡检事实」、判断性内容归入「辅助研判提示」与「待核验项」，区分了事实与建议，未引入输入之外的数值型或动态数据。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-003](evidence/U-INS-003) |
| `U-INS-004` | 帮我创建巡检任务。 | 询问用户是要立即执行一次巡检，还是创建 DSH 周期任务；创建周期任务还需明确巡检项、范围和周期。未得到这些条件前不得创建提醒或发起巡检；三个巡检 MCP 工具本身没有任务创建入口。 | 已完成 | 通过 | - | - | 语义判定：回答在工具不可用的情况下未发起任何巡检、未创建任何提醒，转而向用户确认是立即执行一次巡检还是创建 DSH 周期任务，并进一步追问巡检项、范围与执行周期，逐项满足冻结要求；周期任务所需的三个条件均被明确询问，且未在得到条件前产生任何创建或发起动作，关于三个巡检 MCP 工具不创建任务的事实也有同 Session 的 skill 回执支持。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-004](evidence/U-INS-004) |
| `U-INS-005` | 创建一个每 10 分钟执行一次、覆盖当前巡检服务全部资产的设备在线状态巡检任务；每次执行时以当时的资产清单为准。 | 此创建与到期用例在实际装载 DSH 原生 Schedule 的 Runtime 中执行，统一网关实例也按实际能力验证；当前平台能力和边界见[首期定时任务边界](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/05_实施路线与迭代计划.md#首期定时任务边界与影响)。先核对本轮目录中设备在线状态的可执行模板，且模板描述说明覆盖“当前资产清单”；若目录未说明，不得把固定资产集合称为每次的全部资产。可用时用 DSH `schedule_create` 的 `every_seconds: 600` 创建绑定本 Session 的周期提醒，回复中的提醒 ID、状态和下次到期时间与真实回执一致，并明确尚未执行巡检。无需追问单个资产 ID。工具未成功返回时，不得声称创建成功。<br><br>到期后应以原用户授权和提醒 ID 确认触发，重新查询当时目录，省略 `scope` 对模板当前任务范围调用一次 `start_inspection`，同一到期时点重试复用 `requestId`，再按 `runId` 查询结果，并核对结果中的 `scopeLabel` 与设备数量。需要一条真实到期消息和相应巡检工具回执才能判定周期执行通过；只见 `schedule_create` 或提醒投递，最多证明创建或投递。历史 Run 仍按旧口径保留。 | 已完成 | 失败 | - | - | 语义判定：被测 Session 中 inspection MCP 服务断连，目录查询两次均返回 is_error，未能核对设备在线状态的可执行模板；未取得任何 DSH schedule_create 真实回执（无提醒 ID、状态、下次到期时间），也不存在真实到期消息与 start_inspection/runId 结果回执。创建阶段与到期执行阶段的关键证据均缺失且目录核对明确失败，因此不满足全部要求。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-005](evidence/U-INS-005) |
| `U-INS-006` | 对资产标识 A-001 执行匹配的巡检。 | 先调用 `list_executable_inspections`，从本轮目录选出唯一匹配且无需额外必填输入的可执行任务；使用返回的 `taskId`、`definitionVersion` 和稳定 `requestId` 调用 `start_inspection`，指定 `scope={"type":"ASSET_IDS","assetIds":["A-001"]}`，再按同一 `runId` 查询结果。不存在匹配任务或资产时如实说明或澄清，不猜任务标识，也不以全量巡检冒充完成。 | 已完成 | 失败 | - | - | 语义判定：被测会话未调用 `list_executable_inspections` 查询巡检目录，也未调用 `start_inspection` 发起运行；其实际动作只有对 MCP 资源列表的探测（`list_mcp_resources` / `list_mcp_resource_templates`），且三次均返回 `server is disconnected` 错误回执。目录与发起两个核心阶段完全缺失，因此前两项要求明确不满足。回答虽如实说明未发起任何巡检、未猜测任务标识、未以全量巡检冒充完成，但这是对服务不可用的说明，而非“无匹配任务/资产”的情形，无法替代被要求的真实工具调用。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-006](evidence/U-INS-006) |
| `U-INS-007` | 执行一次常规巡检；如果暂未完成，请告诉我运行标识。<br>请继续查询刚才的巡检结果。 | 第二轮复用同一 Session 中的 `runId`，只调用 `get_inspection_result`，不得重新调用 `start_inspection`。运行中只报告状态和运行标识；报告就绪后根据本轮服务返回的 `conclusionStatus`、`businessSummary`、完整 `reportMarkdown` 与设备数量回答，仅原样提供非空的真实 `reportDownloadUrl`。没有成功的服务回执不能判通过。 | 已完成 | 失败 | - | - | 语义判定：同一被测 Session 中未出现任何成功的服务回执：inspection 服务器多次返回 is_error=true 的 server is disconnected（无 runId、无 get_inspection_result 结果），第二轮也未调用 get_inspection_result 复用运行标识，未产生运行状态、报告结论或 reportDownloadUrl，因此核心要求无法满足。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-007](evidence/U-INS-007) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
