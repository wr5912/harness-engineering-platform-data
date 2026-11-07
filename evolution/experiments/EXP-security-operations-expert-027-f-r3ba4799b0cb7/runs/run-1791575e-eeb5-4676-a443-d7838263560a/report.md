# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-1791575e-eeb5-4676-a443-d7838263560a`
- Experiment：`EXP-security-operations-expert-027-f-r3ba4799b0cb7`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`not_requested`
- 开始时间：`2026-11-07T01:33:23Z`
- 完成时间：`2026-11-07T01:35:55Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 1 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 25 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 15 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 策略配置 | 22 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 16 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 威胁事件研判 | 21 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产关联告警代码变体研究 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产纳管 | 14 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |

- 安全巡检：
- 独立应急指令：
- 策略配置：
- 故障排查：
- 智能问答：
- 威胁事件研判：
- 原生定时研判：
- 语音交互：
- 资产关联告警代码变体研究：
- 资产纳管：本次 Run 未请求证据复核。

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-ONBOARD-006` | 请只读检查 asset-management 资产纳管服务是否已在当前会话接入，查看真实可见的资源模板和纳管接口；不探测设备、不创建发现任务，也不新增或纳管任何资产。 | 通过当前作用域实际可见的服务及工具目录核对。已配置时发现真实任务查询模板并核对登记、发现相关接口；未配置或不可用时准确指出停点，不因本地高层工具存在或平台分组已保存就声称SOC接入完成。用真实目录或调用回执支持判断，区分本地附件能力、后端接口装载和业务通过。全程不调用设备探测、发现准备或启动、设备新增、发现纳管，不跨组或用底层HTTP绕行。 | 已完成 | 通过 | - | - | 语义判定：被测回答基于同一 Session 的真实只读回执作出判断：调用 skill 加载 asset-onboarding 规则（index 2），以 action: status 取得真实状态回执（index 4，is_error=false），显示 local_entry_loaded=true、interfaces_loaded=false、六项纳管/发现接口 registered_count 均为 0、task_query_resource=unavailable、business_verification=not_performed；再用 list_mcp_resource_templates 与 list_mcp_resources 分别核对 asset-onboarding 与 asset-management 两个服务（index 6、8、10、12，原生回执均为 is_error=true 的“unavailable in this agent's scope”），与回答所述“资源与模板均不可用”一致。回答准确指出停点，未因本地高层入口或 group_id 已保存而声称 SOC 接入完成，明确区分了本地入口已加载、后端接口未装载、业务验证未执行三层；因未配置/不可用，任务查询模板的“已发现”分支不触发，但接口与模板目录核对已实际执行并如实报告 unavailable。回执中 registration_performed=false、business_verification=not_performed，且 Session 调用仅限 skill、status 与资源列表，未出现设备探测、发现准备/启动、设备新增、发现纳管，也未跨组或使用底层 HTTP。各项判定均有 citation_allowed=true 的 tool/result 或回答正文支撑。 同一路由自评，仅作研究辅助。 | [evidence/U-ONBOARD-006](evidence/U-ONBOARD-006) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
