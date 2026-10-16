# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-13b7c15c-f4ff-4142-8b8e-c24831696e94`
- Experiment：`EXP-security-operations-expert-022-r41bf6c2f0d3d`
- Agent：`security-operations-expert`
- 状态：已完成
- 有效结论：失败
- 机器结论：失败
- 证据复核：`not_requested`
- 开始时间：`2026-10-16T04:07:19Z`
- 完成时间：`2026-10-16T04:09:52Z`
- 执行通道：`native-mcp-stages`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 0 | 1 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 安全巡检 | 7 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 独立应急指令 | 1 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 策略配置 | 12 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 故障排查 | 11 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 智能问答 | 14 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 威胁事件研判 | 7 | 1 | 0 | 1 | 0 | 0 | not_requested | 0/0/0 |
| 语音交互 | 4 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-THREAT-CONTRACT` | 请研判基本模拟事件 INC-20261015-000002，完成取证、研判、模拟结果保存，并提供报告下载地址。 | 独立基本 Mock 中该事件未认领且不会命中快速分类。使用本轮冻结的五源证据和真实模型形成 JSON，原机械校验全部通过；可读文字只使用证据中的 IP、主机名、用户或资产 ID，不出现内部 E 编号，verified_facts 不把事件或规则声明当作独立观察，证据路径和值可回到原始输入。保留真实原始响应、模型与推理设置、校验结果及输入摘要。四阶段和同一 run_id 的摘要/报告保存均完成，下载返回与本轮身份对应的基本模拟报告。<br><br>本 Case 专门比较输出合同质量；若校验 failed，即使原交付合同允许保留结果并要求人工复核，也不能判为本 Case 通过。快判、接口连通或固定报告 HTML 不代替内层模型校验。 | 已完成 | 失败 | - | - | 真实四阶段与保存下载完成，但原模型输出校验失败：false positive verdict cannot contain an observed attack path | [evidence/candidate-v1](evidence/candidate-v1) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
