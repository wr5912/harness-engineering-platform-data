# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-971516bf-fc6c-4f3b-b62a-c3cf400a3a5c`
- Experiment：`VAR-security-operations-expert-002-r79757f173c53`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：通过
- 机器结论：无法判定
- 证据复核：`completed`
- 开始时间：`2026-10-31T00:00:45Z`
- 完成时间：`2026-10-31T00:06:27Z`
- 复核方法：业务效果与源码诊断分别评估；有效结论来自业务结果与效果复核。
- 源码诊断：`incomplete`；已完整读取 11/270 个源码证据分包。
- 源码诊断完成仅表示本次声明范围已审读，不表示所有代码正确或业务通过。
- 执行通道：`api`
- 固定运行来源：`git:b49b83aabb66c265e848ab3ffb102e6e686d7250`；当前数据仓库与运行来源分别记录。
- 接口环境：`mock`；MCP fixture SHA-256：`1005aaf302af4a729c29dde6f8ecf7cee491c160f9b12875ebb09fcea5c4eefd`。本报告不证明真实业务系统通过。
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| 证据复核 Case | 1 | - | - | - | 1 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 3 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 策略配置 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 11 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 14 | 1 | 0 | 0 | 1 | 0 | completed | 1/0/0 |
| 威胁事件研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产关联告警代码变体研究 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |

- 安全巡检：
- 独立应急指令：
- 策略配置：
- 故障排查：
- 智能问答：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-05/response.json)
- 威胁事件研判：
- 原生定时研判：
- 语音交互：
- 资产关联告警代码变体研究：

### 缺口与归因

源码诊断：源码诊断未完成（evidence-access）：analysis-required-evidence-not-read；未核实范围保持未知。 [源码阅读记录](evidence/analysis/source-diagnosis/response.json)

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-QA-001` | SEC-KB-078 SOAR 剧本是什么？ | 检索并依据 SEC-KB-078 的真实知识库内容回答，给出可核对的文档或分块来源；检索不到时明确说明，不凭常识冒充内部知识。 | 已完成 | 无法判定 | 通过 | 是 | 执行证据可闭合：trace.jsonl 显示单轮会话（turn 1，两步）以 turn/end reason=completed 结束，tools.jsonl 仅一次工具调用 security_ops_medium_workflow（参数 request="SEC-KB-078 SOAR 剧本是什么？"，结果 ok=true、outcome=native_business_handoff），response.json 的 assistant 回答与 trace seq24 流式输出逐字一致，无委派、无多轮、无工具错误。对照预期行为的回退分支：回答开头明确结论“无法检索 SEC-KB-078 具体内容——当前会话未配置知识库（KB）检索工具，本轮可见能力中也没有可查询该编号的接口”，并声明不能确认原文、版本或时效、不猜测结论；随后的 SOAR 剧本说明明确标注为“通用知识，非该条目原文”，未冒充内部知识条目内容，还给出“提供原文/导出材料或在已接入知识库检索的会话中查询”的后续建议且标注尚未执行。该“检索不到时明确说明、不凭常识冒充内部知识”的表述与冻结工具目录一致（trace seq16 工具清单中无任何知识库/文档检索工具，工作流能力发现仅 inspection_catalog 与 system-reminder 中“当前未配置知识库检索”记载相符），无证据表明存在可用的 SEC-KB-078 检索通道而被忽略。预期行为的两条分支中检索失败回退分支已满足且证据完整，故修正机器 inconclusive 判定为 passed；本裁决仅针对业务效果，不涉及源码根因。 | [evidence/U-QA-001](evidence/U-QA-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
