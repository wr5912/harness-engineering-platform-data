# 脚本层决策发现结果（对照用）

- 命令：`python3 .agents/skills/kev-trace-pipeline/scripts/kev_trace.py discover evidence/*/trace.jsonl --profile next-operation --out <dir>`
- 输入：本 Run 的 65 个 `trace.jsonl`（86 个会话、265 次模型响应）
- `stage-status.json`：`status=blocked`，`reason_codes=[trace_audit_errors, unsupported_event]`，`next_allowed_stage=null`

## 输出规模

| 项 | 值 |
|---|---|
| decision candidates | 223 |
| blocked（`trace_integrity`） | 42 |
| 站点 | 全部落在脚本内置的 `next-operation.v1` |
| implementation 建议 | 223 条全部为 `hybrid` |

223 + 42 = 265，与模型响应数一致；42 条因前缀证据不完整（缺工具结果、未完成 turn 等）无法构造成样本。

## 审计问题分布

| code | severity | 数量 | 说明 |
|---|---|---|---|
| `unsupported_event` | error | 63 | 全部为子代理事件：`subagent/catalog` 21、`agent-preset/selected` 21、`subagent/descriptor` 21 |
| `lineage_requires_group_review` | warning | 21 | 多会话/委派血缘需人工分组 |
| `unfinished_turn` | warning | 21 | 轨迹在委派或查询后截断 |
| `missing_tool_result` | warning | 2 | 工具调用无配对回执 |
| `selection_not_executed` | warning | 2 | 选择后未执行 |

## 结论

脚本适配器尚未覆盖子代理事件，因此本批轨迹的自动发现停在 `blocked`；它给出的 223 条候选只是“下一个操作”类别级建议，无法替代按业务合同划分的决策站点。本目录的 `decision-points.md` / `decision-inventory.json` 为人工逐场景归纳，与脚本输出并列保留、互不替代。

脚本原始输出（含 223 条候选明细与 1.2MB 审计快照）未复制进仓库，需要时按上面命令在本地重新生成。
