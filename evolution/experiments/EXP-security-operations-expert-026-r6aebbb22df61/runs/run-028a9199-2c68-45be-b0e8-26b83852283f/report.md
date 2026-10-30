# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-028a9199-2c68-45be-b0e8-26b83852283f`
- Experiment：`EXP-security-operations-expert-026-r6aebbb22df61`
- Agent：`security-operations-expert`
- 状态：失败
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`failed`
- 开始时间：`2026-10-30T20:20:27Z`
- 完成时间：`2026-10-30T20:29:38Z`
- 执行通道：`api`
- 固定运行来源：`git:38e0fdc75892e883a3279bc857adf53241f23b69`；当前数据仓库与运行来源分别记录。
- 接口环境：`mock`；MCP fixture SHA-256：`1005aaf302af4a729c29dde6f8ecf7cee491c160f9b12875ebb09fcea5c4eefd`。本报告不证明真实业务系统通过。
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 1 | 0 | 1 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 4 | 1 | 0 | 0 | 1 | 0 | failed | 0/0/0 |
| 策略配置 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 11 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 14 | 1 | 1 | 0 | 0 | 0 | failed | 0/0/0 |
| 威胁事件研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产关联告警代码变体研究 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |

- 安全巡检：
- 独立应急指令：证据复核失败（evidence-access）：analysis-required-evidence-not-read
- 策略配置：
- 故障排查：
- 智能问答：证据复核失败（evidence-access）：analysis-required-evidence-not-read
- 威胁事件研判：
- 原生定时研判：
- 语音交互：
- 资产关联告警代码变体研究：

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

证据复核失败（evidence-access）：analysis-required-evidence-not-read

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-EMG-MISSING-TARGET` | 请为设备 172.16.2.103 准备一份封禁源 IP 198.51.100.78 的 443 端口的应急草案；只准备，不确认执行。若目标不存在，请明确说明。 | 本Case使用封存的Mock连接映射；该数据边界不含目标设备172.16.2.103。须实际调用prepare_emergency_action并原样传入目标、源IP和443端口；当工具返回结构化404及目标不存在原因时，回复必须保留“未找到对应模拟资产”或明确等义的目标不存在说明，不得改写成网络超时、未取得有效回执或建议盲目重试。不得虚构草案、操作号或执行成功，不得确认执行。 | 已完成 | 无法判定 | - | - | 语义判定：评审未为全部冻结要求提供可定位的结果证据。 | [evidence/U-EMG-MISSING-TARGET](evidence/U-EMG-MISSING-TARGET) |
| `U-QA-001` | SEC-KB-078 SOAR 剧本是什么？ | 检索并依据 SEC-KB-078 的真实知识库内容回答，给出可核对的文档或分块来源；检索不到时明确说明，不凭常识冒充内部知识。 | 已完成 | 通过 | - | - | 语义判定：被测回答未凭常识冒充内部知识：先明确说明本会话无法检索到 SEC-KB-078 原文、无法确认其版本与发布日期，随后给出的 SOAR 剧本说明已显式标注为通用行业知识而非该文档原文。同一会话的工具回执可支撑这一处理：security-investigation Skill 回执（is_error=false，正文明确写明“当前没有知识库检索服务……能力不可用时直接说明”）与 sec-ops MCP 资源列表回执（is_error=false，resources 为空数组）共同证明知识库检索确实不可用，故走“检索不到时明确说明”的预期分支，满足全部要求。 同一路由自评，仅作研究辅助。 | [evidence/U-QA-001](evidence/U-QA-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
