# 测试评估报告

> 本文件由 `run_record.py finalize` 根据本 Run 的结构化记录自动生成，请勿手工编辑。

- Run：`run-f43f08c4-de15-4709-87d4-596c0055de71`
- Experiment：`EXP-migration-opencode-demo-001-r2085b6b7a566`
- Agent：`migration-opencode-demo`
- 状态：已完成
- 有效结论：无法判定
- 机器结论：无法判定
- 证据复核：`completed`
- 开始时间：`2026-10-30T08:03:34Z`
- 完成时间：`2026-10-30T08:12:15Z`
- 执行通道：`api`
- Case 选择：`explicit`
- 封存来源核对：`matched`

## 统计

| 口径 | 总数 | 已完成 | 执行错误 | 已跳过 | 通过 | 失败 | 无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 机器 Trial | 1 | 1 | 0 | 0 | 0 | 0 | 1 |
| 证据复核 Case | 1 | - | - | - | 0 | 0 | 1 |

机器 Trial 与证据复核 Case 是两种口径；有效结论优先采用完整证据复核。未选场景不代表通过。

## 场景覆盖与归因

| 场景 | 定义 Case | 已选 | 机器通过 | 机器失败 | 机器无法判定 | 未执行 | 复核状态 | 复核通过/失败/无法判定 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 未分组 | 3 | 1 | 0 | 0 | 1 | 0 | completed | 0/0/1 |

- 未分组：已在单个归因 Session 中完整复核本场景全部 Case。 [阅读核对记录](evidence/analysis/scene-01/response.json)

### 缺口与归因

#### 未分组 · environment

- 观察到的缺口：reviewer 委派子角色三次调用（call_773c41cc…/call_862f5ac7…/call_202553be…）均在约 0.6–0.9 秒内返回 `[stop: error]` 且 review 内容为空，reviewer-before-finish 复核环节零产出；主代理已如实披露未虚报完成。
- 根因假设：reviewer 子会话 activation 在 deepseek-official/deepseek-flash 模型请求启动阶段即失败（provider 路由、凭证或该原生模型对子会话不可用），或 spawn 子会话初始化失败；秒级返回说明子角色几乎未执行任何 read/bash 操作。待验证：三个子会话的真实 stop reason 与错误码。
- 支持 Case：U-CODE-FIX；证据：[evidence/U-CODE-FIX/tools.jsonl](evidence/U-CODE-FIX/tools.jsonl)、[evidence/U-CODE-FIX/response.json](evidence/U-CODE-FIX/response.json)
- 反例 Case：无
- 替代解释：子会话可能确已创建（工具返回了 subagentId），错误也可能发生在结果回传层而非模型调用层；同一 session 内主代理的 bash/read/edit 全部成功，说明环境并非整体不可用，不能笼统归因为执行环境故障。
- 证伪方法：调取三个 reviewer 子会话（34d1549f-bfe3-456a-b26e-3e02b83363a3、3d25826e-84b6-4fa5-95a2-0a22c6cf7077、f10ed02a-2b27-4996-a958-d624756596a9）的 session 日志与 provider 错误详情，定位 stop:error 的错误码与发生阶段；在可控环境重放同一 reviewer 工具调用，若稳定复现则证实为环境/provider 缺口，若成功则回指主会话上下文因素。

#### 未分组 · harness_mechanism

- 观察到的缺口：『reviewer 使用指定原生模型 deepseek-official/deepseek-flash/max 且只读』无法从 case 级证据直接验证：只能从 managed reviewer.ts 源码推断硬编码配置，tools.jsonl 与 response.json 均不含子会话的模型路由、工具调用或只读约束生效记录；checks.json 声称 trace_available=true（dsh-session-export-envelope-v1）但子会话 trace 未纳入本场景证据包。
- 根因假设：证据导出管线只打包根会话的 tool/call 与 tool/result 事件，子会话（subagent activation）运行记录被排除在 evidence 之外，导致委派类 expected_behavior 的关键验证点不可核验。
- 支持 Case：U-CODE-FIX；证据：[evidence/U-CODE-FIX/tools.jsonl](evidence/U-CODE-FIX/tools.jsonl)、[evidence/U-CODE-FIX/checks.json](evidence/U-CODE-FIX/checks.json)
- 反例 Case：无
- 替代解释：子会话日志可能存在于未导出的 session.v4.jsonl 完整 trace 中，属于打包缺失而非运行时未记录。
- 证伪方法：导出该 session 的完整 trace，检索三个 reviewer 子会话的 route.model/provider、read/bash 工具调用与 stop reason；若 trace 中存在子会话记录且模型为 deepseek-official/deepseek-flash、无 write/edit 调用，则本缺口收窄为『证据打包不完整』，否则升级为『子会话可观测性缺失』。

#### 未分组 · evaluation_method

- 观察到的缺口：机器评审未产生有效结论：checks.json 中 judge.unavailable_reason=judge-output-not-json，results.jsonl 记录 verdict=inconclusive、『评审未产生有效结论，需人工判定』，本场景缺少对『主体任务全部真实成功但强制委派步骤环境性失败且代理如实披露』这一部分成功轨迹的自动判定路径。
- 根因假设：judge 输出未遵循 JSON 输出契约（格式约束缺失或未强制），叠加 expected_behavior 未区分『代理能力失败』与『委派基础设施失败+诚实披露』两种失败形态，导致判定器只能回退为 inconclusive。
- 支持 Case：U-CODE-FIX；证据：[evidence/U-CODE-FIX/checks.json](evidence/U-CODE-FIX/checks.json)、[evidence/U-CODE-FIX/response.json](evidence/U-CODE-FIX/response.json)
- 反例 Case：无
- 替代解释：judge-output-not-json 也可能源于 judge 模型对该混合轨迹给出自由文本结论（如同时陈述通过与不通过），并非格式约束完全缺失。
- 证伪方法：复用同一 session 记录重跑 judge 并强制 schema 校验：若多次仍产出非 JSON，则证实格式契约缺口；若产出 JSON，检查其 verdict 与理由是否区分『编码链路真实成功』与『reviewer 复核缺失』，以此验证评估维度粒度是否足够。

### 人工记录的研究缺口

本 Run 未追加人工研究缺口。

## Case 结果与证据复核

所有已选 Case 均已完成场景化证据复核。

有逐 Case 复核时，判定说明采用复核理由；否则采用机器观察。原始机器观察保留在 [`results.jsonl`](results.jsonl)。

| Case | 输入 | 判定依据 | 执行状态 | 机器结论 | 复核结论 | 是否修正 | 判定说明 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `U-CODE-FIX` | 业务项目 /work/project 内有 total.ts 与 total.test.ts。请在项目内先读 total.ts 和 total.test.ts，修复金额计算与舍入错误（测试期望 total(3, 0.333) === 1、total(2, 12.5) === 25，即金额在乘法后保留两位小数），执行 node --test total.test.ts 验证；完成前必须委派 reviewer 子角色读取实际项目文件、你的实际修改及测试结果并复核；最终说明实际修改和真实测试结果。 | 1) 在 /work/project 副本中先读 total.ts 与 total.test.ts 再做最小修改；2) 修复 total 使金额乘法后保留两位小数，total(3,0.333)===1 且 total(2,12.5)===25；3) 实际执行 node --test total.test.ts 且全部用例通过，报告真实测试结果；4) 确实委派 reviewer 子角色读取实际项目、修改与测试结果复核，reviewer 使用指定原生模型 deepseek-official/deepseek-flash/max 且只读不改文件；5) 最终答复说明修改点与真实测试结果。测试需通过、源码确实修改、reviewer 确实调用且使用指定原生模型；任何一步失败不得声称完成。 | 已完成 | 无法判定 | 无法判定 | 否 | 核心工程链路经 tools.jsonl 完整核实为真实：step1 先后 read /work/project/total.ts 与 total.test.ts（seq15/16/17/18），step2 单次 edit 将 return quantity * price 改为 return Math.round(quantity * price * 100) / 100（seq22/23，最小一行改动），step3 在 workdir=/work/project 实际执行 bash `node --test total.test.ts` 返回 1 pass 0 fail（seq27/28），response.json 最终答复如实报告修改点与真实测试输出，满足 expected_behavior 的 1)、2)、3)、5)。第 4) 项部分满足但实质未达成：reviewer 工具被真实委派 3 次（seq32/38/44），task 中写明了要读的文件、实际修改与测试结果；managed reviewer 工具实现将 agentPreset 固定为只读 reviewer（write:false/edit:false）且 agentOptions 硬编码 deepseek-official/deepseek-flash/max，满足『确实调用且使用指定原生模型、只读』的字面配置要求；但三次调用均在约 0.6–0.9 秒内返回 `[stop: error]` 且 review 为空，reviewer 未产出任何有效复核结论，约 1 秒的往返时间也不足以完成读文件+跑测试+复核，故『reviewer 读取实际项目、修改与测试结果并复核』实质未发生。证据中无 reviewer 子会话（34d1549f/3d25826e/f10ed02a）日志，无法验证子会话实际使用的模型与失败点。同时须指出代理行为合规：三次重试失败后明确声明『无法声称改动已通过 reviewer 复核』，遵守了『任何一步失败不得声称完成』。综合：主体能力链路通过、强制复核步骤失败且失败环节缺少子会话级证据，介于 failed 与 passed 之间，判 inconclusive（与机器判定一致但理由具体化）。 | [evidence/U-CODE-FIX](evidence/U-CODE-FIX) |

## 结构化记录

机器结果、证据复核与后续分析以 [`summary.json`](summary.json)、[`results.jsonl`](results.jsonl) 和 [`analysis.json`](analysis.json) 为准。人工缺口以 `gaps.jsonl` 为准（如存在）。
