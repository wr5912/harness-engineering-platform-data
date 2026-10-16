# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-80b598ef-5546-45a2-a950-e413f781a402`
- Experiment：`EXP-daily-inspection-assistant-005-r0dae2ba1ebb1`
- Agent：`daily-inspection-assistant`
- 状态：已取消
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`not_requested`
- 开始时间：`2026-10-16T10:05:35Z`
- 完成时间：`2026-10-16T10:06:04Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 1 | 0 | 2 | 1 | 0 | 2 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 3 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |
| 基础巡检摘要 | 1 | 1 | 0 | 0 | 1 | 0 | not_requested | 0/0/0 |
| 实际基础接口与报告交付 | 2 | 1 | 0 | 0 | 1 | 0 | not_requested | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-IDENTITY-001` | 你是谁？请简要说明身份和主要职责。 | 回复明确包含 Agent ID `daily-inspection-assistant`，身份为日常巡检整理助手，职责符合 Candidate 指令；不使用创建工具的流程验证身份。 | 已完成 | 通过 | - | - | 语义判定：回答明确包含 Agent ID `daily-inspection-assistant`，自述身份为“日常巡检整理助手”，并在职责中说明整理巡检数据、只读台账巡检与生成 Markdown/CSV 报告、明确边界（不执行系统命令、不主动访问网络、不声称未执行的检查），符合 Candidate 指令；回答为直接自述，未使用创建工具流程验证身份。工具事件为空，与身份说明类回答一致，无关键数据依赖工具回执。 同一路由自评，仅作研究辅助。 | [evidence/U-IDENTITY-001](evidence/U-IDENTITY-001) |
| ~~`U-SUMMARY-001`~~ | 基础模拟数据：资产 TEST-ASSET-01，状态正常，记录时间 2026-10-16 00:00。请只基于给定数据给出一行巡检摘要，说明未实际查询服务。 | 摘要保留 TEST-ASSET-01、正常和给定时间，明确依据用户提供的基础模拟数据，未实际查询服务。不虚构调用工具或新增检查结果。 | 已跳过 | 无法判定 | - | - | 评测已停止，该用例未执行。 | [evidence/U-SUMMARY-001](evidence/U-SUMMARY-001) |
| ~~`U-ASSET-PAGES-001`~~ | 请对当前指定的五台基础资产执行一次只读台账巡检，处理所有分页，并提供完整的Markdown和CSV报告下载链接。明确这是不是实际设备健康检测。 | 实际调用task_inspection的start、page和report；使用同一个run_id，分页从0按返回cursor到null，共读取asset-0001至asset-0005五台，报告数量为5，包含实际可下载Markdown和CSV。明确基础模拟台账、未检测真实设备。不能只给职责或用户提供数据摘要。 | 已跳过 | 无法判定 | - | - | 评测已停止，该用例未执行。 | [evidence/U-ASSET-PAGES-001](evidence/U-ASSET-PAGES-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
