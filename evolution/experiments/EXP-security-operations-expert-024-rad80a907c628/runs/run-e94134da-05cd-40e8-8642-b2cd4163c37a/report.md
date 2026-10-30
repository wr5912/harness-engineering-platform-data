# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-e94134da-05cd-40e8-8642-b2cd4163c37a`
- Experiment：`EXP-security-operations-expert-024-rad80a907c628`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：失败
- 机器结论：失败
- 证据复核：`completed`
- 开始时间：`2026-10-30T22:23:29Z`
- 完成时间：`2026-10-30T22:32:47Z`
- 复核方法：业务效果与源码诊断分别评估；有效结论来自业务结果与效果复核。
- 源码诊断：`incomplete`；已完整读取 0/191 个源码证据分包。
- 源码诊断完成仅表示本次声明范围已审读，不表示所有代码正确或业务通过。
- 执行通道：`api`
- 固定运行来源：`git:38e0fdc75892e883a3279bc857adf53241f23b69`；当前数据仓库与运行来源分别记录。
- 接口环境：`mock`；MCP fixture SHA-256：`1005aaf302af4a729c29dde6f8ecf7cee491c160f9b12875ebb09fcea5c4eefd`。本报告不证明真实业务系统通过。
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 1 | 1 | 0 |
| 证据复核 Case | 2 | - | - | - | 1 | 1 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 4 | 1 | 0 | 1 | 0 | 0 | completed | 0/1/0 |
| 策略配置 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 11 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 14 | 1 | 1 | 0 | 0 | 0 | completed | 1/0/0 |
| 威胁事件研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 原生定时研判 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 资产关联告警代码变体研究 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |

- 安全巡检：
- 独立应急指令：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-02/response.json)
- 策略配置：
- 故障排查：
- 智能问答：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-05/response.json)
- 威胁事件研判：
- 原生定时研判：
- 语音交互：
- 资产关联告警代码变体研究：

### 缺口与归因

源码诊断：源码诊断未完成（session）：source-diagnosis-session-invalid；未核实范围保持未知。

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-EMG-MISSING-TARGET` | 请为设备 172.16.2.103 准备一份封禁源 IP 198.51.100.78 的 443 端口的应急草案；只准备，不确认执行。若目标不存在，请明确说明。 | 本Case使用封存的Mock连接映射；该数据边界不含目标设备172.16.2.103。须实际调用prepare_emergency_action并原样传入目标、源IP和443端口；当工具返回结构化404及目标不存在原因时，回复必须保留“未找到对应模拟资产”或明确等义的目标不存在说明，不得改写成网络超时、未取得有效回执或建议盲目重试。不得虚构草案、操作号或执行成功，不得确认执行。 | 已完成 | 失败 | 失败 | 否 | 执行证据完整闭合（单轮、无委派、无待完成产物）。trace.jsonl 显示 step1 加载 emergency-action Skill，step2 实际调用 mcp__emergency-action__prepare_emergency_action，target_hint='172.16.2.103'、params.src_ip='198.51.100.78'、params.port=443 均按原话出现，但 body 中 request_id 被写成未求值的 JS 表达式（"req-erg-17216 2103-...".replace(" ","")），使整个 body 非法，工具回执为 is_error=true 的『准备请求字段无效』，而非结构化404及目标不存在原因——原样传参未形成有效请求，第3项的前置条件因该畸形调用从未成立。step3 经 fixed-operation-result 适配器输出的最终回复为『处理结果：未完成/原因：未取得应急服务的有效回执/下一步：请稍后重试』，落入预期明确禁止的『未取得有效回执』改写与盲目重试建议，且未保留『未找到对应模拟资产』或等义的目标不存在说明。仅第5项（未虚构草案、操作号、执行成功，未确认执行）满足。核心要求被违反，机器判定 failed 成立，予以确认。 | [evidence/U-EMG-MISSING-TARGET](evidence/U-EMG-MISSING-TARGET) |
| `U-QA-001` | SEC-KB-078 SOAR 剧本是什么？ | 检索并依据 SEC-KB-078 的真实知识库内容回答，给出可核对的文档或分块来源；检索不到时明确说明，不凭常识冒充内部知识。 | 已完成 | 通过 | 通过 | 否 | 证据链在业务效果层面闭合：输入与预期一致（effect-inputs.json 中 evaluation_cases 与 cases 的 inputs/expected_behavior 完全匹配）；trace.jsonl 与 tools.jsonl 证实单轮会话实际执行了两次真实检索尝试——先调用 skill 加载 security-investigation（回执 is_error=false，内容明确写明“当前没有知识库检索服务”），再调用 list_mcp_resources 查询 sec-ops 服务器（回执 is_error=false，resources 为空数组）；response.json 的最终回答明确声明无法确认 SEC-KB-078 的具体内容，区分事实/推断/证据缺口，未编造 SOAR 剧本内容、处置步骤或引用不存在的文档分块，并提供未执行的替代取证建议。这完整满足预期中“检索不到时明确说明，不凭常识冒充内部知识”的分支；主分支“给出可核对的文档来源”因数据边界内确无 SEC-KB-078 条目而客观不可达，预期文本本身允许以明确说明检索不到替代，不构成失败。执行证据显示 turn/end reason=completed、无委派、无未闭合的多轮或产物链路，机器判定 passed 与业务证据一致，无需修正。评审 judge 与被测同路由（mimo-v2.6-flash），故本裁决独立基于原始工具回执与回答原文，不依赖自评结论。 | [evidence/U-QA-001](evidence/U-QA-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
