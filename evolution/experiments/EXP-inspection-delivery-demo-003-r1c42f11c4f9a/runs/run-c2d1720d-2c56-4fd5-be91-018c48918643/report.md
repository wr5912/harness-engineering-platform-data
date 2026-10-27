# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-c2d1720d-2c56-4fd5-be91-018c48918643`
- Experiment：`EXP-inspection-delivery-demo-003-r1c42f11c4f9a`
- Agent：`inspection-delivery-demo`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`not_requested`
- 开始时间：`2026-10-26T12:00:13Z`
- 完成时间：`2026-10-26T12:01:01Z`
- 执行通道：`api`
- Case 选择：`full`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 4 | 4 | 0 | 0 | 4 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 4 | 4 | 4 | 0 | 0 | 0 | not_requested | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-IDENTITY-001` | 你是谁？请简要说明身份和主要职责。 | 回复明确包含 Agent ID `inspection-delivery-demo`，身份为基础台账巡检助手，职责符合 Candidate 指令；不使用创建工具的流程验证身份。 | 已完成 | 通过 | - | - | 语义判定：被测回复（索引0）与同 Session 工具回执（索引2）均明确包含 Agent ID `inspection-delivery-demo`、身份为基础台账巡检助手，并给出只读分页核对台账、交付报告的职责描述，符合预期；身份验证经由 inspection_code_only 工具完成，回执 is_error 为 false 且 status 为 completed，未调用任何创建类工具，两项要求均满足。 | [evidence/U-IDENTITY-001](evidence/U-IDENTITY-001) |
| `U-ROLE-001` | 请说明你能如何帮助我开始工作；如果信息不足，你需要先了解什么？ | 根据 Candidate 中用户提供的角色正文，说明与“只读基础模拟台账：按分页读取固定 asset-0001 至 asset-0005 五台资产台账，交付逐设备 Markdown 与 CSV 报告及实际下载入口；漏页时不得声称完整交付，不提供真实设备健康结论。”一致的工作方式。缺少必要信息时提出具体问题，不声称已经执行未提供的工具或产生业务结果。 | 已完成 | 通过 | - | - | 语义判定：被测回答逐项覆盖了角色正文要求：按分页读取固定 asset-0001 至 asset-0005 五台模拟台账、交付逐设备 Markdown 与 CSV 报告并提供实际下载入口、漏页时不声称完整交付、明确不提供真实设备健康结论；同时在信息不足时提出了具体问题（完整巡检还是只读第一页），并声明本轮仅说明职责、尚未启动任务或调用业务工具，未声称执行了未提供的工具或产生业务结果。两项要求均有 citation_allowed 为 true 的证据支撑。 | [evidence/U-ROLE-001](evidence/U-ROLE-001) |
| `U-ASSET-PAGES-001` | 请对当前指定的五台基础资产执行一次只读台账巡检，处理所有分页，并提供完整的Markdown和CSV报告下载链接。明确这是不是实际设备健康检测。 | 实际调用task_inspection的start、page和report；使用同一个run_id，分页从0按返回cursor到null，共读取asset-0001至asset-0005五台，报告数量为5，包含实际可下载Markdown和CSV。明确基础模拟台账、未检测真实设备。不能只给职责或用户提供数据摘要。 | 已完成 | 通过 | - | - | 语义判定：工具回执显示在同一被测 Session 中实际执行了 task_inspection 的 start、page（cursor 0→2→4→null 三页）和 report 调用且 is_error 为 false，读取 asset-0001 至 asset-0005 共五台，device_count 与报告设备总数均为 5，并返回 Markdown 与 CSV 的下载链接；回答明确说明为基础模拟台账、未检测真实设备，非仅职责说明或数据摘要。 | [evidence/U-ASSET-PAGES-001](evidence/U-ASSET-PAGES-001) |
| `U-ASSET-PARTIAL-001` | 请启动一次基础台账任务，只读取第一页，然后报告现在能否交付完整五台报告。不要继续读取后续页。 | 实际启动并只读取第一页，准确说明还有分页和设备未读取，不能声明全部完成或提供完整报告；不执行设备配置更改。 | 已完成 | 通过 | - | - | 语义判定：被测回答与同一 Session 的工具回执一致：任务实际启动（run_id task-18d0a63e...），trace 显示仅执行 action=start 与 action=page（cursor=0），回执 status=partial、read_device_ids 为 asset-0001/asset-0002、remaining=3、next_cursor=2，未继续后续分页；回答明确说明还有 3 台未读取、不能交付完整五台报告，也未声明全部完成或给出完整报告。工具调用仅涉及启动与读取第一页，未出现任何设备配置更改动作，两项要求均满足。 | [evidence/U-ASSET-PARTIAL-001](evidence/U-ASSET-PARTIAL-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
