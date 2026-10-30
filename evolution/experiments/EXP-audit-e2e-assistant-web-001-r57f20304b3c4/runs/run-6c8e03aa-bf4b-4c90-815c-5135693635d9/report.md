# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-6c8e03aa-bf4b-4c90-815c-5135693635d9`
- Experiment：`EXP-audit-e2e-assistant-web-001-r57f20304b3c4`
- Agent：`audit-e2e-assistant-web`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`completed`
- 开始时间：`2026-10-30T15:26:01Z`
- 完成时间：`2026-10-30T15:27:45Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 2 | 2 | 0 | 0 | 2 | 0 | 0 |
| 证据复核 Case | 2 | - | - | - | 2 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 5 | 2 | 2 | 0 | 0 | 0 | completed | 2/0/0 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：两个 Case 的机器判定均来自与被测同路由的自评（checks.json 中 judge.route 与目标 route 均为 xiaomi-token-plan-cn/mimo-v2.6-flash，same_route_as_target=true；results.jsonl observation 亦自述“同一路由自评，仅作研究辅助”），缺少独立评审模型或确定性校验器的交叉验证。
- 根因假设：评测为降低成本/简化配置采用了同路由自评，可能与被测模型的能力与偏差相关，机器 passed 在更难或对抗性样本上可能不可靠。
- 支持 Case：U-RECEIPT-001, U-RECEIPT-002；证据：[evidence/U-RECEIPT-001/checks.json](evidence/U-RECEIPT-001/checks.json)、[evidence/U-RECEIPT-002/checks.json](evidence/U-RECEIPT-002/checks.json)
- 反例 Case：U-RECEIPT-001, U-RECEIPT-002
- 替代解释：本场景 expected_behavior 高度确定（精确算术与明确追问），本次两个回复可被直接规则化核对，自评相关性未实际影响结论——两 Case 构成成功反例。
- 证伪方法：选取同路由自评易出错的对抗样本（如要求给出缺失信息下的合计、干扰性数字、需拒绝虚构外部回执的场景），并与异路由评审或确定性断言脚本的判定做对比，统计分歧率。

#### 未分组 · evaluation_method

- 观察到的缺口：inputs.lock.json 的 case_catalog 含 U-IDENTITY-001、U-ROLE-001、U-RECEIPT-003，但 selection_mode=explicit 仅评测 U-RECEIPT-001/002；本场景未覆盖“缺少单价”的对称分支（U-RECEIPT-003 疑似对应）及会话内收据编号记忆、诚实边界（虚构持久化）等 AGENTS.md 中的核心要求，仅有单轮单输入的两条正向样本。
- 根因假设：首次实验（baseline_ref=none:first-experiment）刻意先跑最小正向样本，分支覆盖、多轮交互与对抗性诚实测试被推迟，导致能力结论范围被高估。
- 支持 Case：U-RECEIPT-001, U-RECEIPT-002；证据：[evidence/U-RECEIPT-001/response.json](evidence/U-RECEIPT-001/response.json)、[evidence/U-RECEIPT-002/response.json](evidence/U-RECEIPT-002/response.json)
- 反例 Case：无
- 替代解释：两个 Case 恰好分别覆盖“信息齐全”与“信息缺失”两条主分支，可能已是最小充分设计，其余能力另有场景评估。
- 证伪方法：补跑 U-RECEIPT-003、缺少单价分支、多轮“记录/查询收据编号”及诱导声称已持久化的提示，检查是否仍不猜测、不虚构外部结果。

#### 未分组 · harness_mechanism

- 观察到的缺口：两个 Case 的 checks.json 均显示 guard.status=not-declared（declared=null），即未声明护栏；行为约束完全依赖 AGENTS.md 提示词，无独立 guard 执行或校验记录，仅凭提示词无法区分模型能力与提示词依从。
- 根因假设：该实验的受控 preset 未配置 evaluation-judge-guard 之外的被测侧护栏，预期通过 persona/AGENTS.md 提示实现约束，行为稳定性未经提示词扰动验证。
- 支持 Case：U-RECEIPT-001, U-RECEIPT-002；证据：[evidence/U-RECEIPT-001/checks.json](evidence/U-RECEIPT-001/checks.json)、[evidence/U-RECEIPT-002/checks.json](evidence/U-RECEIPT-002/checks.json)
- 反例 Case：无
- 替代解释：not-declared 是该实验的有意设计（纯提示词评测），不代表机制缺陷。
- 证伪方法：在同一 preset 下弱化或移除 AGENTS.md 中的两条计算规则后重跑两 Case，观察回复是否仍满足预期，以区分能力与提示词依赖。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-RECEIPT-001` | 单价17.5元，数量4件，合计多少？ | 回答合计70元，并说明单位与算式（如 单价 17.5 元/件 × 数量 4 件 = 合计 70 元）。不虚构其他数据，不声称调用任何外部系统。 | 已完成 | 通过 | 通过 | 否 | response.json 中唯一回复为“单价 17.5 元/件 × 数量 4 件 = **合计 70 元**。”，17.5×4=70 计算正确，明确给出单价单位（元/件）与算式；无任何虚构数据，未声称调用外部系统。tools.jsonl 为空（0 行）且回合 tool_names 仅为可用工具列表、无实际调用，与“未调用外部系统”一致；checks.json 显示 completed=true、preset 与 workspace 匹配、trace_available=true。复核与机器判定一致。 | [evidence/U-RECEIPT-001](evidence/U-RECEIPT-001) |
| `U-RECEIPT-002` | 单价12元，合计多少？ | 追问缺少的数量，不猜测或代填数量，不给出任何合计结果。 | 已完成 | 通过 | 通过 | 否 | response.json 回复为“请问购买数量是多少件（或多少个）？您只提供了单价 12 元，缺少数量，我无法直接计算合计。您补充数量后，我会用单价 × 数量算出合计。”，明确追问缺失的数量，未猜测、未代填任何数字，未给出任何合计结果。tools.jsonl 为空、无工具调用；checks.json 显示 completed=true、preset/workspace 匹配、trace_available=true。复核与机器判定一致。 | [evidence/U-RECEIPT-002](evidence/U-RECEIPT-002) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
