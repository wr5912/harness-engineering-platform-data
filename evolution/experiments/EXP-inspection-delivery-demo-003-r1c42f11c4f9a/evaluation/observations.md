# Evaluation Observations

2026-10-26 执行比较，2026-10-27 完成证据整理。基础台账巡检助手的零模型代码变体已完成两次独立复测，8 项 Case 结果全部通过；业务执行的模型请求与供应商 Token 均为 0。父版的 8 项结果中有 5 项独立评审无法判定，当前证据不足以确认等效，未提交 end 或 human_confirmed。

## 比较对象与冻结条件

- 固定父版为 [EXP-002](../../EXP-inspection-delivery-demo-002-r7430faf014e7/hypothesis.md)，来源为 git:e3b61ee610707a972c6e9ad2968685a6b93f402e；只为巡检快照增加固定 seed，保持原业务执行逻辑。
- 变体 Candidate 冻结提交为 25d98d97c9f48377f1c85b98a56c8e098e282d59；Candidate SHA-256 为 2d812d5269a3ef955b7caed401888fa7c11b17c5481e11d5613122fbfd3bf247，构建摘要为 f51cc11a7d9a5be8f1b08b24264ac21e10be3d6048eb9cb58a7bcf804e1db790，ESM SHA-256 为 ace781197670d26e27cbb566b1ab84f5aaefc710c5905bc184070781c3028132。构建、路由和来源合同见 [change.yaml](../change.yaml)。
- 四个 Case 沿用 [Agent 评测口径](../../../../agents/inspection-delivery-demo/evaluation.md)，均为关键 Case；每侧每项至少两次，质量下降容忍度为 0pp，actual_model_calls 降幅要求为 100%。比较期间未修改 Case、预期或阈值。
- 四个最终 Run 使用程序提交 4f86644dd7a980ca12529dc613ba56eebcafaa44，程序工作树均为 clean，实际来源均匹配。同一标准镜像 ai-agent-harness/dsh:687f282e8-amd64-cbfc10fa115b，镜像 ID 为 sha256:6ea7cbe9e99a8a2f29e9918a5112d9092ae71642fe1dbf997a612b5edafb6ca4；未构建业务派生镜像。
- 两侧 fixtures.json 逐字节相同，摘要为 45c0c188996f6813efd4eeaac78b6b70ba8049e873e71c48862d5d25163d1ffb。固定 Mock 为 count=5、seed=42；父版宿主地址与变体 host.docker.internal 地址映射至同一外部接口，实测宿主/桥接请求的投影资产摘要均为 a664f52cc5d0b4c35d4d261ee00f34c5bf302d031c4272a7d2035b4d99998685。未修改或重启 Mock 服务。

## 代码化路径与真实装载

[TypeScript 入口](../candidate/dsh/managed/compute-workflow/index.ts)使用 LangGraph StateGraph，在 route-request 后以可见的 if/else 和 addConditionalEdges 分派 identity、role、full-inspection、first-page、unsupported 五条分支。各分支复用 [logic.ts](../candidate/dsh/managed/compute-workflow/logic.ts) 的规则；失败或取消在节点终态记录完毕后向 SDK 抛错。

完整巡检仍实际调用 task_inspection 的 start → page → page → page → report，核对同一 task_id、游标和 5 个设备；仅第一页路径只执行 start、page，不生成完整报告。身份和职责由本地模板返回；未覆盖、越界或相互冲突的输入进入 unsupported，不回退 LLM。会话路由、标题、编排及渲染均为本地代码，压缩类模型插件停用；代码生成和独立评审不计入业务执行成本。

实际浏览器 Session session-ee7be010-4880-4391-87c2-942d4c5dfd23 的 8 个连续 Turn 覆盖五条分支、混合越界输入、否定表达、长职责请求与 /compact；全部图回执 complete，图内无模型尝试。完整输出与第一页操作链符合上述边界。模型请求、失败请求、辅助请求和 Token 均为 0，采集完整且无未知原因。见 [会话摘要](evidence/ui-20261026/session-summary.json)及[实际图来源](evidence/ui-20261026/provenance.json)。

真实业务页面显示“纯代码工作流”，Markdown 和 CSV 链接可见；两份文件实际 HTTP 下载均返回 200，包含相同 5 个设备 ID，CSV 为表头加 5 行数据，Markdown 明示 Mock 数据来源。见[下载回执](evidence/ui-20261026/downloads.json)、[报告](evidence/ui-20261026/report.md)、[CSV](evidence/ui-20261026/devices.csv)、[业务页面](evidence/ui-20261026/business-full.png)及[源码页面](evidence/ui-20261026/conditional-source.png)。此处验证了真实链接和 HTTP 下载，未记录鼠标点击下载事件。

## 最终重复评测

| 对象 | Run | 通过 | 失败 | 无法判定 | 业务模型请求 | 独立评审请求 |
|---|---|---:|---:|---:|---:|---:|
| 父版 1 | [run-3cb5d380](../../EXP-inspection-delivery-demo-002-r7430faf014e7/runs/run-3cb5d380-b314-4cb8-8887-287bb095fadf/report.md) | 2 | 0 | 2 | 12 | 4 |
| 父版 2 | [run-bb12b61b](../../EXP-inspection-delivery-demo-002-r7430faf014e7/runs/run-bb12b61b-dc48-4f4c-9619-01998df63cda/report.md) | 1 | 0 | 3 | 16 | 4 |
| 显式分支变体 1 | [run-6e8b2d9b](../runs/run-6e8b2d9b-6e46-45a3-9f28-c34275f8b97c/report.md) | 4 | 0 | 0 | 0 | 4 |
| 显式分支变体 2 | [run-1a666623](../runs/run-1a666623-a876-4138-8910-03a58836301a/report.md) | 4 | 0 | 0 | 0 | 4 |

最终比较由平台界面选择上表四个 Run 生成，[不可变比较回执](compute-comparison-f3c376615550c755293321c22dbcf3687a057152858d48b995c3949e89749e21.json)为本次比较结果事实源。按共同 Case 等权平均，业务 actual_model_calls 从 3.5 降至 0、total_tokens 从 8375.75 降至 0，均下降 100%；资源证据通过且无缺口。这不是硬件算力、总研究费用或端到端时延下降的测量。

父版第一次的职责、完整分页，以及第二次的职责、完整分页、仅第一页结果无法判定：独立评审出现引用结构错误或无效 JSON，虽有业务回复和工具执行证据，仍按原校验保留未知，不将未知改判为通过或失败。最终回执 quality.passed=false、comparability.passed=false、eligible_for_end=false；未确认等效、未切换活动版本。

## 历史与验证边界

用于提取父版轨迹的 run-424f67b4、早期 run-16b16116、run-54788818、run-a20ca3b3，以及显式分支修改前已通过的 run-6400d097、run-c2d1720d 均保留原始记录。旧构建、旧执行器或诊断 Run 未混入最终四 Run 比较；评审失败与未知结果没有覆写。工具调整后的最终两侧重新运行相同冻结口径。

本次验证覆盖固定 Mock 台账、四项业务 Case、显式分支和零模型会话链；不能外推为开放领域自然语言等效、真实设备巡检、生产业务验收或 Research Release 复现。原活动版本 EXP-inspection-delivery-demo-001-rf841e4415364 保持不变。开发实例 inspection-code-only-20261026 保留供继续试用；当前结论为资源目标达成、业务等效证据不足。
