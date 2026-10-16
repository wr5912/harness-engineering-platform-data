# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-66de2525-68db-4066-8d29-749bd950b19e`
- Experiment：`EXP-multi-step-research-analyst-001-r97fa04b7c613`
- Agent：`multi-step-research-analyst`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`not_requested`
- 开始时间：`2026-10-16T09:09:50Z`
- 完成时间：`2026-10-16T09:10:46Z`
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
| 未分组 | 2 | 0 | 0 | 0 | 0 | 0 | not_evaluated | 0/0/0 |
| 多步骤业务交付 | 2 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |
### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

本次 Run 未请求证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-RESEARCH-001` | 请读取当前配置的两份项目资料，比较它们的主要业务用途、执行方式和使用边界，生成带来源链接的中文调研报告并提供下载。 | 实际调用 task_research start，按两个固定官方提交来源分别 collect 后 report。允许明确配置的在线正文或经 SHA-256 校验的本地官方快照；使用快照时说明固定提交的资料时点、本次没有实时访问网站，不把快照称作在线抓取。报告含两个原始来源链接，事实依据实际已读正文。区分 autoresearch 训练研究和 EvoFlow 长任务业务，保留 MIT 声明与非商业许可边界，不声称已经验证两项目业务效果。回复先给任务结果与实际报告下载，简要说明必要限制；不堆积执行细节，也不生成未经请求的下一条用户消息。 | 已完成 | 通过 | - | - | 语义判定：被测 Session 实际调用 task_research start（seq18），随后按 start 返回的两个固定官方提交来源分别 collect（seq28、seq30），两次 collect 回执均给出 fixed_public_document_snapshot、完整正文与 SHA-256，最后 report 成功（seq42，completed），符合预期执行路径。报告正文基于工具回执中已读正文：区分 autoresearch 的自主训练研究循环（单文件 train.py、固定 5 分钟、val_bpb、单张 NVIDIA GPU、MIT）与 EvoFlow 的长任务业务控制平面（Plan/Goal、隔离执行、失败可恢复、可观测、PolyForm Noncommercial 非商业许可、非 OSI 开源），保留 MIT 声明与非商业边界，未声称已验证两项目业务效果。报告含两个原始来源链接（raw.githubusercontent.com 固定提交）及读取时间与摘要。回复先给出任务结果与实际报告下载链接（download_url 与工具回执一致），并明确说明使用官方固定提交的本地快照、逐字节校验、本次未实时访问网站，未把快照称为在线抓取；未堆砌执行细节，也未生成未经请求的下一条用户消息。 同一路由自评，仅作研究辅助。 | [evidence/U-RESEARCH-001](evidence/U-RESEARCH-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
