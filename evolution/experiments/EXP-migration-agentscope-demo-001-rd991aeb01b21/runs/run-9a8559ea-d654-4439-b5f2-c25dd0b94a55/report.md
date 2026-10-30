# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-9a8559ea-d654-4439-b5f2-c25dd0b94a55`
- Experiment：`EXP-migration-agentscope-demo-001-rd991aeb01b21`
- Agent：`migration-agentscope-demo`
- 状态：已完成
- 有效结论：通过
- 机器结论：通过
- 证据复核：`completed`
- 开始时间：`2026-10-30T07:06:33Z`
- 完成时间：`2026-10-30T07:11:28Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 3 | 3 | 0 | 0 | 3 | 0 | 0 |
| 证据复核 Case | 3 | - | - | - | 3 | 0 | 0 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 5 | 3 | 3 | 0 | 0 | 0 | completed | 3/0/0 |
### 缺口与归因

#### 未分组 · evaluation_method

- 观察到的缺口：评审器与被测使用完全相同的模型路由（checks.json 中 judge.same_route_as_target=true，均为 mimo-v2.6-flash/xiaomi-token-plan-cn、reasoningEffort=off），results.jsonl 的评审意见自述“同一路由自评，仅作研究辅助”，评审缺乏独立性。
- 根因假设：为降低成本采用同路由自评，可能对细微失败（如未调用工具却给出结论、错误归因不准）系统性漏判，使机器 passed 偏松。
- 支持 Case：U-VERSION-COMPARE, U-VERSION-INVALID, U-VERSION-MISSING；证据：[evidence/U-VERSION-COMPARE/checks.json](evidence/U-VERSION-COMPARE/checks.json)、[evidence/U-VERSION-COMPARE/tools.jsonl](evidence/U-VERSION-COMPARE/tools.jsonl)、[evidence/U-VERSION-INVALID/checks.json](evidence/U-VERSION-INVALID/checks.json)、[evidence/U-VERSION-INVALID/tools.jsonl](evidence/U-VERSION-INVALID/tools.jsonl)、[evidence/U-VERSION-MISSING/checks.json](evidence/U-VERSION-MISSING/checks.json)、[evidence/U-VERSION-MISSING/tools.jsonl](evidence/U-VERSION-MISSING/tools.jsonl)
- 反例 Case：U-VERSION-COMPARE, U-VERSION-INVALID, U-VERSION-MISSING
- 替代解释：三个 Case 的原始 tool/call、tool/result 与 response 原文可独立于评审器复核，且与自评结论逐项一致——自评偏松的风险在本场景未实际表现为判定偏差，属于方法风险而非已观察到的结果缺口。
- 证伪方法：用不同模型（或更强 reasoningEffort、盲评、人工复核）重判同一 trace 集；若判定出现分歧，则证实自评影响结果；若全部一致则推翻该假设。

#### 未分组 · environment

- 观察到的缺口：每个 Case 仅有 1 个 session/trial（各 checks.json 只含单一 session_id，results.jsonl 每 Case 一条判定），n=1 无法区分稳定能力与单次偶然通过。
- 根因假设：评测按快速单次运行配置降低成本，模型行为波动可能使 passed 不可复现。
- 支持 Case：U-VERSION-COMPARE, U-VERSION-INVALID, U-VERSION-MISSING；证据：[evidence/U-VERSION-COMPARE/checks.json](evidence/U-VERSION-COMPARE/checks.json)、[evidence/U-VERSION-INVALID/checks.json](evidence/U-VERSION-INVALID/checks.json)、[evidence/U-VERSION-MISSING/checks.json](evidence/U-VERSION-MISSING/checks.json)
- 反例 Case：U-VERSION-COMPARE, U-VERSION-INVALID
- 替代解释：三个 Case 分别覆盖成功路径、工具错误路径与缺参路径三种不同行为模式且均按预期执行（含真实 Python InvalidVersion 报错路径），跨模式一致性降低了“偶然通过”的可能性，但不能替代同条件重复试验。
- 证伪方法：对每个 Case 重跑 ≥5 个独立试验并统计方差；若出现不调用工具、捏造结果或错误猜测的失败样本，则证实不稳定假设。

#### 未分组 · harness_mechanism

- 观察到的缺口：三个 Case 均只在迁移预设（session_preset=migration-agentscope-demo，DSH 原生工具经 JSON 子进程桥接 Python3）下运行，未与原始 AgentScope 固定样例对拍；证据中无任何原框架基线运行记录，迁移等效性未被验证。
- 根因假设：迁移演示以 DSH 原生能力替代 AgentScope 运行时，行为等效属未经对拍的假设；在本场景样本外（如 AgentScope 原生调度/重试语义）可能出现行为差异。
- 支持 Case：U-VERSION-COMPARE, U-VERSION-INVALID, U-VERSION-MISSING；证据：[evidence/U-VERSION-COMPARE/tools.jsonl](evidence/U-VERSION-COMPARE/tools.jsonl)、[evidence/U-VERSION-INVALID/tools.jsonl](evidence/U-VERSION-INVALID/tools.jsonl)、[evidence/U-VERSION-MISSING/tools.jsonl](evidence/U-VERSION-MISSING/tools.jsonl)
- 反例 Case：U-VERSION-COMPARE, U-VERSION-INVALID
- 替代解释：对本场景的两条工具路径，回执（newer=1.10、packaging 语义比较与 InvalidVersion/退出码 2）与预期的 Python packaging 行为完全一致，说明桥接在已覆盖路径上功能等效；缺口限于未覆盖路径而非已测路径。
- 证伪方法：对同一批输入运行原始 AgentScope 样例（原框架代码），diff 工具结果与回答行为；一致则把等效性结论收窄到已测路径之外的推断即被推翻。

#### 未分组 · evaluation_method

- 观察到的缺口：用例集仅覆盖成功比较、单侧无效输入、缺参补问三条路径；未覆盖边界语义：相等版本（version_tool.py 实现 newer=left if a>=b else right，平局时固定返回 left，语义未定义且未测）、预发布版本（如 1.0rc1 vs 1.0）、双侧均无效、空字符串等。机器三例全通过不代表这些边界行为正确。
- 根因假设：用例按迁移演示最小路径设计，边界 tie-break 与 pre-release 语义可能与用户预期不一致而长期未被发现。
- 支持 Case：U-VERSION-COMPARE, U-VERSION-INVALID, U-VERSION-MISSING；证据：[evidence/U-VERSION-COMPARE/response.json](evidence/U-VERSION-COMPARE/response.json)、[evidence/U-VERSION-INVALID/response.json](evidence/U-VERSION-INVALID/response.json)、[evidence/U-VERSION-MISSING/response.json](evidence/U-VERSION-MISSING/response.json)
- 反例 Case：无
- 替代解释：边界行为可能事实上正确（packaging 的预发布比较语义清晰；平局返回 left 也可能是可接受约定），只是未被评测覆盖，而非一定存在缺陷。
- 证伪方法：新增 tie（1.0 vs 1.0）、pre-release（1.0rc1 vs 1.0）、双无效、空字符串用例重跑；若回答按预期如实报告或暴露歧义，则收窄或证实该缺口。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-VERSION-COMPARE` | 比较 1.9 和 1.10，哪个版本更新？ | 必须调用 select_newer_version 工具（left=1.9、right=1.10），工具经 Python3 实际执行返回 newer=1.10；回答应明确 1.10 较新（注意 1.10 > 1.9 的语义比较，不是字符串比较），依据工具回执，不自行猜测。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 记录 tool/call select_newer_version 参数 {"left":"1.9","right":"1.10"}，对应 tool/result isError=false，返回 newer=1.10 及 runtime{python:3.11.2, packaging:25.0, bridge:python3-json-subprocess}，callId 一致，属真实工具执行回执；response.json 依回执表格明确结论“1.10 比 1.9 更新”，为语义比较而非字符串比较，且未自行猜测。全部预期要求满足，维持机器判定。 | [evidence/U-VERSION-COMPARE](evidence/U-VERSION-COMPARE) |
| `U-VERSION-INVALID` | 比较 not-a-version 和 1.0，哪个版本更新？ | 必须调用 select_newer_version 工具；Python 工具实际执行报错（InvalidVersion，非零退出）后，回答如实说明输入无效/工具报错，绝不给出或捏造较新版本。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 记录工具确被调用（left=not-a-version、right=1.0），tool/result isError=true，错误文本“Python 工具错误（退出码 2，InvalidVersion）：Invalid version: 'not-a-version'”与 version_tool_cli.py 的错误封装一致；response.json 如实说明输入非法与工具报错，未给出或捏造任何较新版本，并请用户提供合法版本后重试。全部预期要求满足，维持机器判定。 | [evidence/U-VERSION-INVALID](evidence/U-VERSION-INVALID) |
| `U-VERSION-MISSING` | 帮我看看 2.0 是不是比较新的版本？ | 用户只提供了一个版本，缺少可比较的第二个版本；应先补问另一个版本再比较，不调用 select_newer_version，不猜测比较结果。 | 已完成 | 通过 | 通过 | 否 | tools.jsonl 为 0 字节空文件，证实本轮未发生任何工具调用；response.json 明确指出只给一个版本号 2.0 无法单独判断新旧、主动补问另一版本，并以将来时说明将调用 select_newer_version，未猜测比较结果。全部预期要求满足，维持机器判定。 | [evidence/U-VERSION-MISSING](evidence/U-VERSION-MISSING) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
