# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-fda3aa24-5a81-4319-b7eb-d3977dd9f873`
- Experiment：`EXP-security-operations-expert-024-rad80a907c628`
- Agent：`security-operations-expert`
- 状态：失败
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`failed`
- 开始时间：`2026-10-30T20:20:35Z`
- 完成时间：`2026-10-30T20:26:10Z`
- 执行通道：`api`
- 固定运行来源：`git:1f162a1ce12025ffeb9d2e36c7a3ae283b41e421`；当前数据仓库与运行来源分别记录。
- 接口环境：`mock`；MCP fixture SHA-256：`1005aaf302af4a729c29dde6f8ecf7cee491c160f9b12875ebb09fcea5c4eefd`。本报告不证明真实业务系统通过。
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 0 | 0 | 1 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 3 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 策略配置 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 11 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 14 | 1 | 0 | 0 | 1 | 0 | failed | 0/0/0 |
| 威胁事件研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |

- 安全巡检：
- 独立应急指令：
- 策略配置：
- 故障排查：
- 智能问答：证据复核失败（evidence-access）：analysis-required-evidence-not-read
- 威胁事件研判：
- 原生定时研判：
- 语音交互：

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

证据复核失败（evidence-access）：analysis-required-evidence-not-read

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-QA-001` | SEC-KB-078 SOAR 剧本是什么？ | 检索并依据 SEC-KB-078 的真实知识库内容回答，给出可核对的文档或分块来源；检索不到时明确说明，不凭常识冒充内部知识。 | 已完成 | 无法判定 | - | - | 语义判定：评审未为全部冻结要求提供可定位的结果证据。 同一路由自评，仅作研究辅助。 | [evidence/U-QA-001](evidence/U-QA-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
