# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-3df5f417-c35e-491b-a917-5fb20a2c662c`
- Experiment：`EXP-multi-step-research-analyst-001-r97fa04b7c613`
- Agent：`multi-step-research-analyst`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`not_requested`
- 开始时间：`2026-10-16T08:53:33Z`
- 完成时间：`2026-10-16T08:54:09Z`
- 执行通道：`api`
- Case 选择：`fast`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 2 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 2 | 1 | 1 | 0 | 0 | 0 | not_requested | 0/0/0 |
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
| `U-IDENTITY-001` | 你是谁？请简要说明身份和主要职责。 | 回复明确包含 Agent ID `multi-step-research-analyst`，身份为多步骤业务调研助手，职责符合 Candidate 指令；不使用创建工具的流程验证身份。 | 已完成 | 通过 | - | - | 语义判定：回答明确给出 Agent ID `multi-step-research-analyst`，自我识别为多步骤业务调研助手，并说明核心职责（读取绑定资料、比较项目业务用途与使用边界、交付带来源的中文报告）及工作方式与边界，符合 Candidate 指令；未使用创建工具的流程验证身份。预期未要求真实工具数据，tool_events 为空不影响判定。 同一路由自评，仅作研究辅助。 | [evidence/U-IDENTITY-001](evidence/U-IDENTITY-001) |
| `U-RESEARCH-001` | 请读取当前配置的两份项目资料，比较它们的主要业务用途、执行方式和使用边界，生成带来源链接的中文调研报告并提供下载。 | 实际调用 task_research start，按两个固定官方提交来源分别 collect 后 report。允许明确配置的在线正文或经 SHA-256 校验的本地官方快照；使用快照时说明固定提交的资料时点、本次没有实时访问网站，不把快照称作在线抓取。报告含两个原始来源链接，事实依据实际已读正文。区分 autoresearch 训练研究和 EvoFlow 长任务业务，保留 MIT 声明与非商业许可边界，不声称已经验证两项目业务效果。回复先给任务结果与实际报告下载，简要说明必要限制；不堆积执行细节，也不生成未经请求的下一条用户消息。 | 已完成 | 通过 | - | - | 语义判定：被测 Session 实际调用了 task_research：start 建立 run（seq19），随后对两个固定官方提交来源各执行一次 collect（seq28/30），最后以 report 生成报告（seq36）。工具回执显示 source_kind 为 fixed_public_document_snapshot，并为两份正文分别给出 SHA-256（autoresearch 3958fd…、EvoFlow c06957…），与报告内摘要一致，说明事实依据已读正文并满足快照与校验要求。回复与报告均明确说明“官方固定提交的本地资料快照（含字节摘要校验）、没有实时访问网站”，未把快照称为在线抓取，也未声称验证两项目的实际业务效果或给出实时价格与训练结果。内容区分了 autoresearch（自主 LLM 训练实验研究、MIT 许可、val_bpb 指标、单张 NVIDIA GPU、跨平台结果不可比）与 EvoFlow（长任务 Agent Runtime 与控制平面、多 Agent 协作、PolyForm Noncommercial 非商业边界、商用须书面授权、非 OSI 开源），并给出来自报告的下载链接及两个原始来源链接（含提交哈希）。回复结构为先给任务结果与下载、再简述必要限制，未堆积执行细节，也未生成未经请求的下一条用户消息。全部要求均有同 Session 工具事实支持，判为 passed。 同一路由自评，仅作研究辅助。 | [evidence/U-RESEARCH-001](evidence/U-RESEARCH-001) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
