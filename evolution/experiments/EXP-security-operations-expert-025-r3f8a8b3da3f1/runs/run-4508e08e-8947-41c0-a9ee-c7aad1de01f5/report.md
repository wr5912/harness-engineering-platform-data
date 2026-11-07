# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-4508e08e-8947-41c0-a9ee-c7aad1de01f5`
- Experiment：`EXP-security-operations-expert-025-r3f8a8b3da3f1`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：失败
- 机器结论：失败
- 证据复核：`not_requested`
- 开始时间：`2026-10-27T07:29:19Z`
- 完成时间：`2026-10-27T07:40:43Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 7 | 7 | 0 | 0 | 0 | 6 | 1 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 7 | 0 | 6 | 1 | 0 | not_requested | 0/0/0 |
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
| `U-INS-001` | 执行一次常规巡检。 | 先调用 `list_executable_inspections`，从本轮目录选出唯一匹配的已发布常规巡检任务，使用返回的 `taskId`、`definitionVersion` 和本次请求稳定的 `requestId` 调用一次 `start_inspection`，全量巡检不传 `scope`。之后只以同一 `runId` 调用 `get_inspection_result` 直到报告就绪，不重复发起。回复依据服务的 `conclusionStatus`、`businessSummary` 和完整 `reportMarkdown`，准确给出设备数量，不改写结论；设备数量缺失时说明缺口，该项不得判通过。仅当 `reportDownloadUrl` 非空时原样提供下载地址。运行中、工具失败或报告未就绪时不得声称完成；结果为 `PARTIAL` 时须说明证据缺口。 | 已完成 | 失败 | - | - | 语义判定：被测会话未出现任何巡检执行链路：没有 list_executable_inspections、start_inspection、get_inspection_result 的调用与成功回执，唯一与 inspection 相关的两条工具回执（索引 4、5）原生均为 is_error=true 的“server is disconnected”。回答对“服务不可用、未发起巡检、无 runId、报告状态未知”的陈述与这些回执一致，且未虚构 taskId/definitionVersion、未编造结论或设备数量、未提供下载地址、未声称完成，符合要求 5、6 的约束。但按冻结要求，巡检服务失败只构成解释，不能替代执行：目录选择与发起（要求 1）、同 runId 结果轮询（要求 2）、依据 conclusionStatus/businessSummary/reportMarkdown 与设备数量的回复（要求 3）均明确未发生，要求 4 的设备数量无任何数据支撑，要求 7 不存在 PARTIAL 结果可核对。整体不满足预期，判 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-001](evidence/U-INS-001) |
| `U-INS-002` | 请列出当前可用的巡检项，只查询目录，不要执行巡检。 | 只调用 `list_executable_inspections`；回复列出本轮真实返回的可执行模板及其巡检项，不调用 `start_inspection`。查询失败或目录为空时如实说明，不编造目录内容。 | 已完成 | 失败 | - | - | 语义判定：要求1明确限定只能调用 `list_executable_inspections`，但被测 Session 的工具事件显示实际调用的是 `list_mcp_resources`(index 2) 与 `list_mcp_resource_templates`(index 4) 这类 MCP 发现工具，全程没有任何 `list_executable_inspections` 的调用记录，因此“只调用该工具且必须调用它”的核心要求未满足；由于未真正查询目录，也就没有本轮真实返回的可执行模板数据，要求2无法成立（工具回执仅证明 inspection 服务器断连，不构成目录内容）。要求3则得到满足：回执显示 `server is disconnected`(index 3、5)，回答据实说明服务不可用、未编造任何模板或巡检项，并明确区分未发起巡检与目录为空。总体上，关键工具未被调用导致前两项要求明确不满足，判定为 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-002](evidence/U-INS-002) |
| `U-INS-003` | 请根据下面的巡检事实生成结构化辅助研判，只返回一个 JSON 对象：巡检资产总数 39 台/套，离线设备 12 台/套，存在严重或高危漏洞的设备 4 台/套，异常结论 2 项。 | 只返回一个可解析的 JSON 对象，准确保留给定事实并区分事实与建议，不添加输入中没有的动态数据。 | 已完成 | 无法判定 | - | - | 语义判定：评审未为全部冻结要求提供可定位的结果证据。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-003](evidence/U-INS-003) |
| `U-INS-004` | 帮我创建巡检任务。 | 询问用户是要立即执行一次巡检，还是创建 DSH 周期任务；创建周期任务还需明确巡检项、范围和周期。未得到这些条件前不得创建提醒或发起巡检；三个巡检 MCP 工具本身没有任务创建入口。 | 已完成 | 失败 | - | - | 语义判定：被测回答未按预期询问用户是要立即执行一次巡检还是创建 DSH 周期任务，而是默认走了周期任务路线、只索取巡检项/范围/周期，并额外给出『只查目录』等替代建议，因此第 1 项要求未满足；其余要求均满足：回答明确列出创建周期任务需的巡检项、范围、周期三点，声明未创建提醒也未发起巡检（且 inspection 服务两次回执均为 server is disconnected，确无发起或建提醒的可能），Skill 回执也载明三个巡检 MCP 工具不创建任务。因存在未满足项，整体判定 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-004](evidence/U-INS-004) |
| `U-INS-005` | 创建一个每 10 分钟执行一次、覆盖当前巡检服务全部资产的设备在线状态巡检任务；每次执行时以当时的资产清单为准。 | 此创建与到期用例在实际装载 DSH 原生 Schedule 的 Runtime 中执行，统一网关实例也按实际能力验证；当前平台能力和边界见[首期定时任务边界](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/05_实施路线与迭代计划.md#首期定时任务边界与影响)。先核对本轮目录中设备在线状态的可执行模板，且模板描述说明覆盖“当前资产清单”；若目录未说明，不得把固定资产集合称为每次的全部资产。可用时用 DSH `schedule_create` 的 `every_seconds: 600` 创建绑定本 Session 的周期提醒，回复中的提醒 ID、状态和下次到期时间与真实回执一致，并明确尚未执行巡检。无需追问单个资产 ID。工具未成功返回时，不得声称创建成功。<br><br>到期后应以原用户授权和提醒 ID 确认触发，重新查询当时目录，省略 `scope` 对模板当前任务范围调用一次 `start_inspection`，同一到期时点重试复用 `requestId`，再按 `runId` 查询结果，并核对结果中的 `scopeLabel` 与设备数量。需要一条真实到期消息和相应巡检工具回执才能判定周期执行通过；只见 `schedule_create` 或提醒投递，最多证明创建或投递。历史 Run 仍按旧口径保留。 | 已完成 | 失败 | - | - | 语义判定：被测回答未创建任何周期提醒，也未产生任何真实巡检回执：三次对 inspection 服务的访问均以 `mcp-client(inspection): server is disconnected` 报错返回，回答据此停止并明确未创建提醒、未执行巡检，未捏造提醒 ID、状态或下次到期时间，也未追问资产 ID、未把固定资产集合称为每次全部资产，守住了不虚构的下限。但本用例的核心验收项均未达成：(1) 没有证据证明本轮 Runtime 装载并实际验证了 DSH 原生 Schedule（回答仅口头声称 `schedule_create` 可用，无任何工具回执支撑）；(2) 未能核对设备在线状态的可执行模板及其“当前资产清单”语义，回答只是通过资源列表报错推断工具目录缺失，未见任何巡检目录工具的真实调用回执；(3) 未调用 `schedule_create`，因而不存在与回执一致的提醒 ID、状态与下次到期时间；(4) 不存在真实到期消息，也没有省略 `scope` 的 `start_inspection`、复用 `requestId`、按 `runId` 查询结果及 `scopeLabel` 与设备数量核对的任何证据。依据“需要一条真实到期消息和相应巡检工具回执才能判定周期执行通过”“工具未成功返回时不得声称创建成功”的冻结口径，创建、投递、到期执行、结果查询四个阶段全部缺失，故判定不通过（而非证据不足的不确定结论）。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-005](evidence/U-INS-005) |
| `U-INS-006` | 对资产标识 A-001 执行匹配的巡检。 | 先调用 `list_executable_inspections`，从本轮目录选出唯一匹配且无需额外必填输入的可执行任务；使用返回的 `taskId`、`definitionVersion` 和稳定 `requestId` 调用 `start_inspection`，指定 `scope={"type":"ASSET_IDS","assetIds":["A-001"]}`，再按同一 `runId` 查询结果。不存在匹配任务或资产时如实说明或澄清，不猜任务标识，也不以全量巡检冒充完成。 | 已完成 | 失败 | - | - | 语义判定：被测回答明确承认未完成本轮巡检任务：没有成功调用 `list_executable_inspections` 取得可执行目录，因而无法选定 `taskId`/`definitionVersion`，也未调用 `start_inspection`、未产生 `runId`。现有 indexed_evidence 中的工具回执仅有 `list_mcp_resources` 和 `list_mcp_resource_templates` 的 `is_error=true`（server is disconnected），它们既不能替代目录查询工具的成功回执，也不足以直接证明三个巡检工具均不可用；回答中"三个工具均不可用"的关键结论缺少同 Session 内 `list_executable_inspections`/`start_inspection`/巡检结果查询的真实回执支撑。虽然回答如实报告了失败、未猜测任务标识、未以全量巡检冒充完成（符合不伪造的底线），但 requirements 的核心动作（查目录→发起→按 runId 查询结果）均未执行，且"服务断开"也不属于预期中"不存在匹配任务或资产"的澄清分支，故判为 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-006](evidence/U-INS-006) |
| `U-INS-007` | 执行一次常规巡检；如果暂未完成，请告诉我运行标识。<br>请继续查询刚才的巡检结果。 | 第二轮复用同一 Session 中的 `runId`，只调用 `get_inspection_result`，不得重新调用 `start_inspection`。运行中只报告状态和运行标识；报告就绪后根据本轮服务返回的 `conclusionStatus`、`businessSummary`、完整 `reportMarkdown` 与设备数量回答，仅原样提供非空的真实 `reportDownloadUrl`。没有成功的服务回执不能判通过。 | 已完成 | 失败 | - | - | 语义判定：第二轮尝试时 `inspection` MCP 服务仍处于断开状态（连续两次探测均返回 `mcp-client(inspection): server is disconnected`），整个 Session 中从未成功调用巡检目录或发起工具，因此不存在任何真实 `runId`，也从未出现 `get_inspection_result` 的调用与成功服务回执。预期要求第二轮复用同一 `runId` 并只调用结果查询工具、在有成功回执基础上依据 `conclusionStatus`、`businessSummary`、完整 `reportMarkdown` 与设备数量作答；实际既无 `runId` 可复用，也无任何成功回执，关键要求均无法满足。依据“没有成功的服务回执不能判通过”的冻结要求，不能判为通过，且第一、二、三项要求有明确反证（仅错误回执、无结果查询调用），故判 failed。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-007](evidence/U-INS-007) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
