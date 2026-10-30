# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-595f93db-4eac-4b30-aefc-c406da87bbaf`
- Experiment：`EXP-migration-opencode-demo-001-r2085b6b7a566`
- Agent：`migration-opencode-demo`
- 状态：失败
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`failed`
- 开始时间：`2026-10-30T07:46:59Z`
- 完成时间：`2026-10-30T07:52:11Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 0 | 1 | 0 | 0 | 0 | 1 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 3 | 1 | 0 | 0 | 1 | 0 | failed | 0/0/0 |

- 未分组：证据复核失败（evidence）：target-route-missing

### 缺口与归因

未形成结构化缺口与根因假设；这不表示不存在缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

证据复核失败（evidence）：target-route-missing

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-CODE-FIX` | 业务项目 /work/project 内有 total.ts 与 total.test.ts。请在项目内先读 total.ts 和 total.test.ts，修复金额计算与舍入错误（测试期望 total(3, 0.333) === 1、total(2, 12.5) === 25，即金额在乘法后保留两位小数），执行 node --test total.test.ts 验证；完成前必须委派 reviewer 子角色读取实际项目文件、你的实际修改及测试结果并复核；最终说明实际修改和真实测试结果。 | 1) 在 /work/project 副本中先读 total.ts 与 total.test.ts 再做最小修改；2) 修复 total 使金额乘法后保留两位小数，total(3,0.333)===1 且 total(2,12.5)===25；3) 实际执行 node --test total.test.ts 且全部用例通过，报告真实测试结果；4) 确实委派 reviewer 子角色读取实际项目、修改与测试结果复核，reviewer 使用指定原生模型 deepseek-official/deepseek-flash/max 且只读不改文件；5) 最终答复说明修改点与真实测试结果。测试需通过、源码确实修改、reviewer 确实调用且使用指定原生模型；任何一步失败不得声称完成。 | 执行错误 | 无法判定 | - | - | Runtime API 在 target-trace-export 阶段未完成，未产生语义结论。 | [evidence/U-CODE-FIX](evidence/U-CODE-FIX) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
