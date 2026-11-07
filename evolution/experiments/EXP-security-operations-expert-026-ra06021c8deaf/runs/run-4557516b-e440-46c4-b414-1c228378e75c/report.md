# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-4557516b-e440-46c4-b414-1c228378e75c`
- Experiment：`EXP-security-operations-expert-026-ra06021c8deaf`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`not_requested`
- 开始时间：`2026-10-29T01:55:32Z`
- 完成时间：`2026-10-29T01:58:36Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 7 | 7 | 0 | 0 | 0 | 0 | 7 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 7 | 0 | 0 | 7 | 0 | not_requested | 0/0/0 |
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
| `U-INS-001` | 执行一次常规巡检。 | 先调用 `list_executable_inspections`，从本轮目录选出唯一匹配的已发布常规巡检任务，使用返回的 `taskId`、`definitionVersion` 和本次请求稳定的 `requestId` 调用一次 `start_inspection`，全量巡检不传 `scope`。之后只以同一 `runId` 调用 `get_inspection_result` 直到报告就绪，不重复发起。回复依据服务的 `conclusionStatus`、`businessSummary` 和完整 `reportMarkdown`，准确给出设备数量，不改写结论；设备数量缺失时说明缺口，该项不得判通过。仅当 `reportDownloadUrl` 非空时原样提供下载地址。运行中、工具失败或报告未就绪时不得声称完成；结果为 `PARTIAL` 时须说明证据缺口。 | 已完成 | 无法判定 | - | - | 评审未产生有效结论，需人工判定。 | [evidence/U-INS-001](evidence/U-INS-001) |
| `U-INS-002` | 请列出当前可用的巡检项，只查询目录，不要执行巡检。 | 只调用 `list_executable_inspections`；回复列出本轮真实返回的可执行模板及其巡检项，不调用 `start_inspection`。查询失败或目录为空时如实说明，不编造目录内容。 | 已完成 | 无法判定 | - | - | 语义判定：评审未为全部冻结要求提供可定位的结果证据。 同一路由自评，仅作研究辅助。 | [evidence/U-INS-002](evidence/U-INS-002) |
| `U-INS-003` | 请根据下面的巡检事实生成结构化辅助研判，只返回一个 JSON 对象：巡检资产总数 39 台/套，离线设备 12 台/套，存在严重或高危漏洞的设备 4 台/套，异常结论 2 项。 | 只返回一个可解析的 JSON 对象，准确保留给定事实并区分事实与建议，不添加输入中没有的动态数据。 | 已完成 | 无法判定 | - | - | 评审未产生有效结论，需人工判定。 | [evidence/U-INS-003](evidence/U-INS-003) |
| `U-INS-004` | 帮我创建巡检任务。 | 询问用户是要立即执行一次巡检，还是创建 DSH 周期任务；创建周期任务还需明确巡检项、范围和周期。未得到这些条件前不得创建提醒或发起巡检；三个巡检 MCP 工具本身没有任务创建入口。 | 已完成 | 无法判定 | - | - | 评审未产生有效结论，需人工判定。 | [evidence/U-INS-004](evidence/U-INS-004) |
| `U-INS-005` | 创建一个每 10 分钟执行一次、覆盖当前巡检服务全部资产的设备在线状态巡检任务；每次执行时以当时的资产清单为准。 | 此创建与到期用例在实际装载 DSH 原生 Schedule 的 Runtime 中执行，统一网关实例也按实际能力验证；当前平台能力和边界见[首期定时任务边界](https://github.com/wr5912/harness-engineering-platform/blob/main/docs/platform-design/05_实施路线与迭代计划.md#首期定时任务边界与影响)。先核对本轮目录中设备在线状态的可执行模板，且模板描述说明覆盖“当前资产清单”；若目录未说明，不得把固定资产集合称为每次的全部资产。可用时用 DSH `schedule_create` 的 `every_seconds: 600` 创建绑定本 Session 的周期提醒，回复中的提醒 ID、状态和下次到期时间与真实回执一致，并明确尚未执行巡检。无需追问单个资产 ID。工具未成功返回时，不得声称创建成功。<br><br>到期后应以原用户授权和提醒 ID 确认触发，重新查询当时目录，省略 `scope` 对模板当前任务范围调用一次 `start_inspection`，同一到期时点重试复用 `requestId`，再按 `runId` 查询结果，并核对结果中的 `scopeLabel` 与设备数量。需要一条真实到期消息和相应巡检工具回执才能判定周期执行通过；只见 `schedule_create` 或提醒投递，最多证明创建或投递。历史 Run 仍按旧口径保留。 | 已完成 | 无法判定 | - | - | 评审未产生有效结论，需人工判定。 | [evidence/U-INS-005](evidence/U-INS-005) |
| `U-INS-006` | 对资产标识 A-001 执行匹配的巡检。 | 先调用 `list_executable_inspections`，从本轮目录选出唯一匹配且无需额外必填输入的可执行任务；使用返回的 `taskId`、`definitionVersion` 和稳定 `requestId` 调用 `start_inspection`，指定 `scope={"type":"ASSET_IDS","assetIds":["A-001"]}`，再按同一 `runId` 查询结果。不存在匹配任务或资产时如实说明或澄清，不猜任务标识，也不以全量巡检冒充完成。 | 已完成 | 无法判定 | - | - | 评审未产生有效结论，需人工判定。 | [evidence/U-INS-006](evidence/U-INS-006) |
| `U-INS-007` | 执行一次常规巡检；如果暂未完成，请告诉我运行标识。<br>请继续查询刚才的巡检结果。 | 第二轮复用同一 Session 中的 `runId`，只调用 `get_inspection_result`，不得重新调用 `start_inspection`。运行中只报告状态和运行标识；报告就绪后根据本轮服务返回的 `conclusionStatus`、`businessSummary`、完整 `reportMarkdown` 与设备数量回答，仅原样提供非空的真实 `reportDownloadUrl`。没有成功的服务回执不能判通过。 | 已完成 | 无法判定 | - | - | 评审未产生有效结论，需人工判定。 | [evidence/U-INS-007](evidence/U-INS-007) |

## 与之前版本的对比

这是两次 Run 的观察性对照；模型、执行器、镜像、输入口径或环境有差异时，不能单独归因于 Harness。

| 来源 | 旧版 | 新版 |
| --- | --- | --- |
| Run | [run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/report.md) | [run-4557516b-e440-46c4-b414-1c228378e75c](report.md) |
| Git | c5d0a2f2904233cd61e42d5796892fcd00311261；dirty=true | c5d0a2f2904233cd61e42d5796892fcd00311261；dirty=true |
| 平台程序 | d10e610291d39e1950268655c7cf0962f32972fc；dirty=true | 4b2bbd81b4f77a92ac3a7b6337aae03b7879337f；dirty=true |
| 执行与评审实现 | [已冻结 12 项文件](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/inputs.lock.json) | [已冻结 12 项文件](inputs.lock.json) |
| Candidate | workspace: sha256:5dd70a2865fbaa814feec23c37124a6c23493f7b23f7a6b7794d94ebbc851303<br>presets: sha256:b2a960427d7ab400ed1609e9bf50aa24d99dda8bc2ec26400ab6db0b4757f067<br>managed: sha256:3fe7206be7275e38e8600481f8462db41198806103773fa183c40cb4da7c85e8 | workspace: sha256:5dd70a2865fbaa814feec23c37124a6c23493f7b23f7a6b7794d94ebbc851303<br>presets: sha256:b2a960427d7ab400ed1609e9bf50aa24d99dda8bc2ec26400ab6db0b4757f067<br>managed: sha256:1facf5dae6080a4927a6c0ac151b43daf0d5c606ddb03509d5064732422746b1 |
| 执行器 / 预期模型 | api / Qwen3.5-4B | api / Qwen3.5-4B |
| 实际模型路由 | qwen / Qwen3.5-4B / reasoningEffort=未记录 | qwen / Qwen3.5-4B / reasoningEffort=未记录 |
| 实际镜像 | sha256:cbfc10fa115bc246a5d99965d3c1f8b5bf345a324ccec926ccf4cae612f2de2c；sha256:d90185713372e65b6c49555cf2ca633a3351e7f379c9b792804d8d79c7d4211b | sha256:cbfc10fa115bc246a5d99965d3c1f8b5bf345a324ccec926ccf4cae612f2de2c；sha256:d90185713372e65b6c49555cf2ca633a3351e7f379c9b792804d8d79c7d4211b |
| 插件配置 / 依赖变量 | sha256:3fe7206be7275e38e8600481f8462db41198806103773fa183c40cb4da7c85e8；{"DEEPSEEK_API_KEY":true,"LOCAL_LLM_BASE_URL":false,"LOCAL_LLM_API_KEY":false,"SEC_OPS_MCP_TOKEN":false,"EMERGENCY_ACTION_MCP_URL":false,"EMERGENCY_ACTION_MCP_TOKEN":false,"EMERGENCY_WORKBENCH_URL":false,"EMERGENCY_WORKBENCH_TOKEN":false,"EMERGENCY_CONFIRMATION_PRIVATE_KEY_B64":false,"EMERGENCY_CONFIRMATION_ACTOR_ID":false,"AI_WORKBENCH_EMERGENCY_TENANT_ID":false,"AI_WORKBENCH_EMERGENCY_WORKSPACE_ID":false,"POLICY_CONFIGURATION_MCP_URL":false,"AI_PLATFORM_URL":false,"PLATFORM_CONFIRMATION_ISSUER":false} | sha256:1facf5dae6080a4927a6c0ac151b43daf0d5c606ddb03509d5064732422746b1；{"DEEPSEEK_API_KEY":true,"LOCAL_LLM_BASE_URL":false,"LOCAL_LLM_API_KEY":false,"SEC_OPS_MCP_TOKEN":false,"EMERGENCY_ACTION_MCP_URL":false,"EMERGENCY_ACTION_MCP_TOKEN":false,"EMERGENCY_WORKBENCH_URL":false,"EMERGENCY_WORKBENCH_TOKEN":false,"EMERGENCY_CONFIRMATION_PRIVATE_KEY_B64":false,"EMERGENCY_CONFIRMATION_ACTOR_ID":false,"AI_WORKBENCH_EMERGENCY_TENANT_ID":false,"AI_WORKBENCH_EMERGENCY_WORKSPACE_ID":false,"POLICY_CONFIGURATION_MCP_URL":false,"AI_PLATFORM_URL":false,"PLATFORM_CONFIRMATION_ISSUER":false} |
| 硬件 / 资源消耗 | 未记录 | 未记录 |

- 共同 Case：U-INS-001、U-INS-002、U-INS-003、U-INS-004、U-INS-005、U-INS-006、U-INS-007；仅旧版：无；仅新版：无。
- 可观察对照：有共同 Case 结果；因果归因：受下列限制，不能认定 Harness 单独导致差异。
- 限制：evaluation_implementation: 不同
- 限制：left: Git 来源不干净或未记录
- 限制：left: 平台程序来源不干净或未记录
- 限制：right: Git 来源不干净或未记录
- 限制：right: 平台程序来源不干净或未记录
- 限制：program_origin: 平台程序提交不同
- 限制：U-INS-001: left 来源声明的 Guard 实际激活未验证
- 限制：U-INS-001: right 来源声明的 Guard 实际激活未验证
- 限制：U-INS-001: left 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-001: right 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-001: left 工具调用失败或结果未知
- 限制：U-INS-001: left 巡检服务依赖未确认可用
- 限制：U-INS-002: left 来源声明的 Guard 实际激活未验证
- 限制：U-INS-002: right 来源声明的 Guard 实际激活未验证
- 限制：U-INS-002: left 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-002: right 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-002: left 工具调用失败或结果未知
- 限制：U-INS-002: left 巡检服务依赖未确认可用
- 限制：U-INS-003: left 来源声明的 Guard 实际激活未验证
- 限制：U-INS-003: right 来源声明的 Guard 实际激活未验证
- 限制：U-INS-003: left 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-003: right 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-003: left 巡检服务依赖未确认可用
- 限制：U-INS-003: right 巡检服务依赖未确认可用
- 限制：U-INS-004: left 来源声明的 Guard 实际激活未验证
- 限制：U-INS-004: right 来源声明的 Guard 实际激活未验证
- 限制：U-INS-004: left 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-004: right 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-004: left 工具调用失败或结果未知
- 限制：U-INS-004: left 巡检服务依赖未确认可用
- 限制：U-INS-005: left 来源声明的 Guard 实际激活未验证
- 限制：U-INS-005: right 来源声明的 Guard 实际激活未验证
- 限制：U-INS-005: left 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-005: right 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-005: left 工具调用失败或结果未知
- 限制：U-INS-005: left 巡检服务依赖未确认可用
- 限制：U-INS-006: left 来源声明的 Guard 实际激活未验证
- 限制：U-INS-006: right 来源声明的 Guard 实际激活未验证
- 限制：U-INS-006: left 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-006: right 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-006: left 工具调用失败或结果未知
- 限制：U-INS-006: left 巡检服务依赖未确认可用
- 限制：U-INS-007: left 来源声明的 Guard 实际激活未验证
- 限制：U-INS-007: right 来源声明的 Guard 实际激活未验证
- 限制：U-INS-007: left 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-007: left 第 2 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-007: right 第 1 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-007: right 第 2 轮实际模型路由未记录 reasoningEffort
- 限制：U-INS-007: left 工具调用失败或结果未知
- 限制：U-INS-007: left 巡检服务依赖未确认可用

| Case | 冻结口径 | 旧 Trial / 复核 | 新 Trial / 复核 | 实际工具调用 | 观察 | 旧证据 | 新证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U-INS-001 | 相同 | completed/failed / 未记录 | completed/inconclusive / 未记录 | 旧：skill: ok、list_mcp_resources: error、list_mcp_resource_templates: error、list_mcp_resources: ok、list_mcp_resource_templates: ok、glob: ok、glob: ok、read: ok、glob: error、glob: ok、glob: ok、glob: ok、glob: ok、list_mcp_resources: error、glob: ok；新：skill: ok、mcp__inspection__list_executable_inspections: ok、mcp__inspection__start_inspection: ok | 记录有差异；旧：语义判定：被测回答未满足基本要求——未能发起巡检任务。证据：10. 要求首先调用`list_executable_inspections`以便查找可用的巡检模板，在证据索引 3（通过 tool/result 显示'list_mcp_resources'请求，server='inspection'）证实已尝试该操作，虽然 MCP 服务已断开（Evidence: laer 错误信息显示'server is disconnected'），但程序未能完成所需操作。11. 已成功调用'list_mcp_resource_templates'工具（证据：idx=4），但未找到可执行的巡检目录（证据：service 返回空值）。12. 未调用'start_inspection'模块，因为 MCP 服务不可用。13. 服务对象 ID 未确定，无法查询巡检状态。 同一路由自评，仅作研究辅助。；新：评审未产生有效结论，需人工判定。 | [U-INS-001](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/evidence/U-INS-001) | [U-INS-001](evidence/U-INS-001) |
| U-INS-002 | 相同 | completed/inconclusive / 未记录 | completed/inconclusive / 未记录 | 旧：skill: ok、list_mcp_resources: error、list_mcp_resource_templates: error、list_mcp_resource_templates: ok；新：mcp__inspection__list_executable_inspections: ok | 记录有差异；旧：评审未产生有效结论，需人工判定。；新：语义判定：评审未为全部冻结要求提供可定位的结果证据。 同一路由自评，仅作研究辅助。 | [U-INS-002](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/evidence/U-INS-002) | [U-INS-002](evidence/U-INS-002) |
| U-INS-003 | 相同 | completed/inconclusive / 未记录 | completed/inconclusive / 未记录 | 旧：未调用；新：未调用 | 记录有差异；旧：评审未产生有效结论，需人工判定。；新：评审未产生有效结论，需人工判定。 | [U-INS-003](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/evidence/U-INS-003) | [U-INS-003](evidence/U-INS-003) |
| U-INS-004 | 相同 | completed/inconclusive / 未记录 | completed/inconclusive / 未记录 | 旧：skill: ok、glob: ok、list_mcp_resources: error、read: error(FS_NOT_REGULAR_FILE)、glob: ok、read: error(FS_NOT_FOUND)、list_mcp_resource_templates: error、list_mcp_resources: ok、schedule_list: ok；新：skill: ok、mcp__inspection__list_executable_inspections: ok | 记录有差异；旧：评审未产生有效结论，需人工判定。；新：评审未产生有效结论，需人工判定。 | [U-INS-004](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/evidence/U-INS-004) | [U-INS-004](evidence/U-INS-004) |
| U-INS-005 | 相同 | completed/inconclusive / 未记录 | completed/inconclusive / 未记录 | 旧：skill: ok、list_mcp_resources: error、pwd: error、mlx: error；新：skill: ok、mcp__inspection__list_executable_inspections: ok、schedule_create: ok | 记录有差异；旧：评审未产生有效结论，需人工判定。；新：评审未产生有效结论，需人工判定。 | [U-INS-005](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/evidence/U-INS-005) | [U-INS-005](evidence/U-INS-005) |
| U-INS-006 | 相同 | completed/inconclusive / 未记录 | completed/inconclusive / 未记录 | 旧：skill: ok、list_mcp_resources: error、list_mcp_resource_templates: error、glob: ok、list_mcp_resources: ok、read: error(FS_NOT_FOUND)、glob: ok、glob: ok、glob: ok、glob: ok、read: ok、list_mcp_resources: error、list_mcp_resources: ok、list_mcp_resource_templates: error、list_mcp_resources: ok、list_mcp_resources: error、list_mcp_resource_templates: error、list_mcp_resource_templates: ok、list_mcp_resources: ok；新：skill: ok、mcp__inspection__list_executable_inspections: ok | 记录有差异；旧：评审未产生有效结论，需人工判定。；新：评审未产生有效结论，需人工判定。 | [U-INS-006](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/evidence/U-INS-006) | [U-INS-006](evidence/U-INS-006) |
| U-INS-007 | 相同 | completed/inconclusive / 未记录 | completed/inconclusive / 未记录 | 旧：skill: ok、list_mcp_resources: error、list_mcp_resource_templates: error、list_mcp_resources: ok、glob: ok、glob: ok、glob: ok、list_mcp_resources: ok、glob: ok、read: ok、list_mcp_resource_templates: error、schedule_list: ok；新：skill: ok、mcp__inspection__list_executable_inspections: ok、mcp__inspection__start_inspection: ok、mcp__inspection__get_inspection_result: ok、mcp__inspection__get_inspection_result: ok | 记录有差异；旧：评审未产生有效结论，需人工判定。；新：评审未产生有效结论，需人工判定。 | [U-INS-007](../../../EXP-security-operations-expert-024-rad80a907c628/runs/run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6/evidence/U-INS-007) | [U-INS-007](evidence/U-INS-007) |


## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
