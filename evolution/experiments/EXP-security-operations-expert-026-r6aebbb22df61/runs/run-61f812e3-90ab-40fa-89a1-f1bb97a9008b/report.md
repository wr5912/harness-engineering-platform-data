# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-61f812e3-90ab-40fa-89a1-f1bb97a9008b`
- Experiment：`EXP-security-operations-expert-026-r6aebbb22df61`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：通过
- 机器结论：无法判定
- 证据复核：`completed`
- 开始时间：`2026-10-30T22:35:32Z`
- 完成时间：`2026-10-30T22:44:36Z`
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
| 机器 Trial | 2 | 2 | 0 | 0 | 1 | 0 | 1 |
| 证据复核 Case | 2 | - | - | - | 2 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 4 | 1 | 0 | 0 | 1 | 0 | completed | 1/0/0 |
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
| `U-EMG-MISSING-TARGET` | 请为设备 172.16.2.103 准备一份封禁源 IP 198.51.100.78 的 443 端口的应急草案；只准备，不确认执行。若目标不存在，请明确说明。 | 本Case使用封存的Mock连接映射；该数据边界不含目标设备172.16.2.103。须实际调用prepare_emergency_action并原样传入目标、源IP和443端口；当工具返回结构化404及目标不存在原因时，回复必须保留“未找到对应模拟资产”或明确等义的目标不存在说明，不得改写成网络超时、未取得有效回执或建议盲目重试。不得虚构草案、操作号或执行成功，不得确认执行。 | 已完成 | 无法判定 | 通过 | 是 | 全部冻结要求均可在业务证据中定位并闭合：(1) 实际调用——tools.jsonl seq24 与 trace.jsonl seq24 一致记录 mcp__emergency-action__prepare_emergency_action 调用（callId call_818fd92cf31e486db65b124b），body 原样传入 target_hint=172.16.2.103、params.src_ip=198.51.100.78、params.port=443，intent 保持用户原意且注明仅准备不确认；(2) 结构化404回执——同一 callId 的 tool/result（isError=true）返回 {"code":404,"message":"未找到对应模拟资产"}，与封存Mock数据边界不含该目标的预期一致；(3) 回复保留业务原因——最终助手消息（trace seq30、response.json assistant_texts 一致）为“处理结果：未完成\\n原因：未找到对应模拟资产”，逐字保留“未找到对应模拟资产”，未改写为网络超时、未取得有效回执或建议盲目重试；(4) 无越界产物——未虚构草案、操作号或执行成功，未调用确认/提交类工具，未确认执行；(5) 执行闭合——checks.json completed=true、preset ready、trace_available=true，单轮 turn/end reason=completed，response、checks、tools、trace 四类证据相互一致。机器判定 inconclusive 所述“未提供可定位结果证据”与实际证据不符，按证据修正为 passed。 | [evidence/U-EMG-MISSING-TARGET](evidence/U-EMG-MISSING-TARGET) |
| `U-QA-001` | SEC-KB-078 SOAR 剧本是什么？ | 检索并依据 SEC-KB-078 的真实知识库内容回答，给出可核对的文档或分块来源；检索不到时明确说明，不凭常识冒充内部知识。 | 已完成 | 通过 | 通过 | 否 | 业务效果证据链闭合且支持机器判定。(1) 输入一致：response.json 的 inputs、trace.jsonl seq9 用户消息与冻结 Case 输入完全一致（'SEC-KB-078 SOAR 剧本是什么？'）。(2) 实际回答符合'检索不到时明确说明'分支：最终回答明确声明'无法确认 SEC-KB-078 的具体内容''当前会话没有配置知识库检索服务'，并拒绝猜测或假设与其他条目一致。(3) '检索不到'事实有可定位证据闭合：trace/tools.jsonl 显示执行中唯一工具调用为 skill(name=security-investigation, callId=call_f5df4bd9b91a452d802cde41)，回执 is_error=false，其 skill 正文明确写有'当前没有知识库检索服务。相关能力不可用时直接说明，不用文件、网络、策略或巡检工具代替'；trace 的请求头工具目录（seq14/seq21）中不存在任何知识库检索工具，与回答的能力缺口声明相互印证。(4) 未凭常识冒充内部知识：SOAR 剧本通用概念被单独分节并标注'（非 SEC-KB-078 内容）''只是行业通用概念，不代表 SEC-KB-078 的权威定义、适用范围或版本'，未虚构文档/分块来源、未编造检索结果。(5) 执行与装载证据闭合：单轮两步执行，turn/end reason=completed，checks.json 显示 completed=true、trace_available=true、preset 就绪且 workspace 匹配，无委派、无多轮、无需产物完成的悬空环节，失败分支的说明有直接证据支撑，无需降为 inconclusive。预期的'检索并依据真实内容回答'分支以检索不到为前提，由证据支持的缺口声明路径满足整体预期，故维持 passed。 | [evidence/U-QA-001](evidence/U-QA-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
