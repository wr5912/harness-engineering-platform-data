# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-f9566e46-4f37-4c08-8c4e-26d6d06b1ac1`
- Experiment：`EXP-security-operations-expert-027-f-r3ba4799b0cb7`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`not_requested`
- 开始时间：`2026-11-06T10:15:35Z`
- 完成时间：`2026-11-06T10:17:51Z`
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
| 安全巡检 | 24 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 6 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 策略配置 | 19 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 16 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 威胁事件研判 | 21 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产关联告警代码变体研究 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产纳管 | 6 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |

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
| `U-ONBOARD-006` | 请只读检查 asset-management 资产纳管服务是否已在当前会话接入，查看真实可见的资源模板和纳管接口；不探测设备、不创建发现任务，也不新增或纳管任何资产。 | 通过当前作用域实际可见的服务及工具目录核对。已配置时发现真实任务查询模板并核对登记、发现相关接口；未配置或不可用时准确指出停点，不因本地高层工具存在或平台分组已保存就声称SOC接入完成。用真实目录或调用回执支持判断，区分本地附件能力、后端接口装载和业务通过。全程不调用设备探测、发现准备或启动、设备新增、发现纳管，不跨组或用底层HTTP绕行。 | 已完成 | 通过 | - | - | 语义判定：被测回答基于本会话真实工具回执完成只读核验：通过 list_mcp_resource_templates/list_mcp_resources 实测 asset-management 资源服务器在当前作用域不可用（原生 is_error=true），并列举了 emergency-action、inspection-compositions、policy-configuration 的真实模板目录与不可用标记；同时用 asset_onboarding 只读 action:attachments 的成功回执（attachments 为空、import_authorized=false）区分了本地附件能力、后端分组装载与业务通过，明确指出资源模板缺口且未声称 SOC 接入完成。工具序列仅含 skill 读取、资源目录列举和只读 attachments 查询，未出现 discover/preview/commit、设备新增、发现纳管或跨组底层 HTTP 调用。 同一路由自评，仅作研究辅助。 | [evidence/U-ONBOARD-006](evidence/U-ONBOARD-006) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
