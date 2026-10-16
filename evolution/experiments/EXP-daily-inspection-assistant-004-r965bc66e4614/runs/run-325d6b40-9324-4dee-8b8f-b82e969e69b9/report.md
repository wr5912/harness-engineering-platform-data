# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-325d6b40-9324-4dee-8b8f-b82e969e69b9`
- Experiment：`EXP-daily-inspection-assistant-004-r965bc66e4614`
- Agent：`daily-inspection-assistant`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`not_requested`
- 开始时间：`2026-10-16T09:55:57Z`
- 完成时间：`2026-10-16T09:56:22Z`
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
| 未分组 | 3 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 基础巡检摘要 | 1 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 实际基础接口与报告交付 | 2 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-ASSET-PAGES-001` | 请对当前指定的五台基础资产执行一次只读台账巡检，处理所有分页，并提供完整的Markdown和CSV报告下载链接。明确这是不是实际设备健康检测。 | 实际调用task_inspection的start、page和report；使用同一个run_id，分页从0按返回cursor到null，共读取asset-0001至asset-0005五台，报告数量为5，包含实际可下载Markdown和CSV。明确基础模拟台账、未检测真实设备。不能只给职责或用户提供数据摘要。 | 已完成 | 通过 | - | - | 语义判定：被测回答实际依次调用了 task_inspection 的 start、page（cursor 0→2→4，next_cursor 最终为 null）与 report，全部使用同一 run_id task-db533223-78bc-4824-810e-b86d3bc4754a；工具回执显示 source_kind 为 basic_mock、device_count 为 5，且逐条读出 asset-0001 至 asset-0005，与回答中表格的名称、类型、风险分值完全一致。report 回执给出真实可下载的 Markdown 与 CSV 链接（download_url、csv_url），回答按用户语言（中文）提供这两个链接，与预期“实际可下载 Markdown 和 CSV”相符。回答明确说明“这不是实际设备健康检测”，数据来自基础模拟接口、未连接探测任何真实设备、风险分值为台账自带字段，满足“基础模拟台账、未检测真实设备”的要求。回答给出实际设备清单与报告，而非仅职责说明或数据摘要，满足全部预期行为。 同一路由自评，仅作研究辅助。 | [evidence/U-ASSET-PAGES-001](evidence/U-ASSET-PAGES-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
