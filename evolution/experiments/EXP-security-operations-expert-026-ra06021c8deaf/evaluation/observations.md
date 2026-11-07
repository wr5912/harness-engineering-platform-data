# 巡检评测 MCP 对齐与复测结果

## 结论

巡检相关 MCP 连接修复已真实验证：新评测实例能够发现并调用目录、启动及结果查询三个工具。七个用例全部执行完成，但正式机器结果为 0 通过、0 失败、7 不可判定；连接恢复不等于业务全部通过。未改写封存 Run，也未把人工轨迹观察写成正式复核结论。

## 固定来源与最小修改

完整继承 v24（EXP-security-operations-expert-024-rad80a907c628），固定父版 git:c5d0a2f2904233cd61e42d5796892fcd00311261。独立修复版为 EXP-security-operations-expert-026-ra06021c8deaf。原实例 sec-ops-v024-qwen35-4b-open、v24、并行 v25 和历史 Run 未由本任务修改；Agent 启用入口仍为 v24。v25 未融合，其未核对变动不纳入本轮结论。

[连接资产](../candidate/dsh/managed/web-profile.seed.patch.yml) 已保存并回读：inspection=http://172.16.138.228:26000/mcp/inspection；sec-ops=http://172.16.138.228:50500/mcp/security-operations-expert；inspection-readonly 对齐三个巡检工具。依据为平台 MCP revision 658cf3e217041237bb5c494d572818300765721b0ae98dfb310db6f7bb5ffa20。保留启用、空 headers 与原工具模式，不新增无关服务，不复制实例身份、签名、凭据或 HOME。

assets/diff 与固定父版比较仅一份 Candidate 文件修改，其他 221 个文件不变；无新增、删除或模式变化。工具名单两项换序不改变集合。research/validate 返回 valid=true、无错误和警告。管理端 test inspection 成功发现三个工具。

## 模型与运行来源

初次预览时全局默认为 local / Qwen3.8-27B，目标模型预检被拒绝；未覆盖全局并行配置或使用错误模型执行。用户选择“已切换，继续复测”后回读默认为 qwen / Qwen3.5-4B，目标模型预览通过、missing_env_names=[]。

新 Run：[run-4557516b-e440-46c4-b414-1c228378e75c](../runs/run-4557516b-e440-46c4-b414-1c228378e75c/report.md)，job_id=54443ccc-90be-4dc1-ba0e-7f5d4d29e221。2026-10-29 09:55:32 至 09:58:36（Asia/Shanghai），mode=full、executor=api、review=none，固定原 U-INS-001 至 U-INS-007，输入和预期未改变。模型实际路由为 qwen / Qwen3.5-4B，独立实例 security-operations-expert-eval-15ccb22d 的模型策略、Profile seed 和装载来源均匹配修复版。Run 来源及评测实现后置校验 matched，已封存；评测实例已自动停止。

原始用例文件摘要 f685481cf609fd2f437a7f173e4ac3397155795e92ea312d5b1f1e49b4ee7b6c；Run evaluation_sha256=e2b1a311da3849cd237c403994aafd649e7854e004ef065acedb0dbd77317b0d。二者口径不同；runs/show 逐项 frozen/current 的 contract_changed=false，旧新 Run 的冻结口径相同。

## 实际调用与业务限制

| 用例 | 直接证据与限制 |
| --- | --- |
| U-INS-001 | 目录及 start_inspection 成功，常规任务 task-73aa54d940fb4b94bbb364a7ca7829d0、V4，返回 run-98cd35a678cb4fa18ce93f48e1679a73、RUNNING/PENDING；未查询结果，不证明报告完成。 |
| U-INS-002 | 真实目录查询成功、未启动；正式评审因未覆盖全部冻结要求的可定位证据而不可判定，不能把模型原判 passed 当正式通过。目录总结准确性尚不能仅凭调用成功证明。 |
| U-INS-003 | 未调用工具，保留 39/12/4/2，但回答带 Markdown 代码围栏，不满足仅返回原始 JSON 的格式要求；正式结果仍保留不可判定。 |
| U-INS-004 | 读取技能和目录，未启动或创建提醒；是否完整澄清仍按正式证据复核，不能因连接成功判通过。 |
| U-INS-005 | 目录和 every_seconds=600 的 schedule_create 成功，首次到期 2026-10-29T02:07:27.443Z；本轮在到期前结束并停实例，无到期投递及执行回执，只证明创建。 |
| U-INS-006 | 目录成功，未发起指定资产巡检；不证明 A-001 检查完成。 |
| U-INS-007 | start 和两次 get_inspection_result 成功，第二轮复用 run-fee2b89eaa0846689ad97fe98f1f9658；最终服务为 PARTIAL/ABNORMAL，62 台设备，52 在线、10 离线，57 台基线检查未完成。部分证据不完整，不能称全部正常或完整业务通过。 |

关键证据：[U-INS-001 工具回执](../runs/run-4557516b-e440-46c4-b414-1c228378e75c/evidence/U-INS-001/tools.jsonl)、[U-INS-005 工具回执](../runs/run-4557516b-e440-46c4-b414-1c228378e75c/evidence/U-INS-005/tools.jsonl)、[U-INS-007 工具回执](../runs/run-4557516b-e440-46c4-b414-1c228378e75c/evidence/U-INS-007/tools.jsonl)。只读独立轨迹核验对 001/002/005/007 已检查的 12 组调用和返回均可按 Session、turn、step、callId 配对；未执行写产物的自动审计或正式证据复核。

001、007 首次请求直接启动，缺少当前工具合同要求的展示范围后下一轮确认；007 回答同时写“完整执行”又列未完成对象，存在状态措辞不严谨。原冻结 Case 并未都要求下一轮确认，因此该安全行为观察不冒充平台既有失败判定。Guard 激活仍为 unknown，Session API 缺少可核验信息。

## 评判、比较与决定依据

6 个 Case 的 judge.json 为 judge-output-not-json；002 虽模型原判 passed，平台因证据覆盖不足保留 inconclusive。正式总数 7 完成、0 执行错误、0 跳过，0 通过、0 失败、7 不可判定。失败业务观察与评审不可用分别保留，不修改机器标签。

历史对照 run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6 为 0 通过、1 失败、6 不可判定，旧 001 为 disconnected；新工具链恢复。runs/compare 返回 comparable=true、causal_comparable=false：两轮平台程序及评测实现有变化、工作树未固定、Guard 激活未知，外部目录版本也已变化，不能将差异单独归因于本次 Harness 修改。

本次 31 次模型调用（目标 24、评审 7），供应商结算 327802 输入、9954 输出、337756 总 Token，费用未知。保持 v26 供后续研究，不自动切换业务入口、不宣称发布或完整环境等价。下一步应独立处理评审格式与证据覆盖、确认流程、部分报告措辞及周期到期验证；这些未在本次 MCP 连接修复中擅自修改。

## 2026-10-29 全量回归预检与启动失败（尚无新 Run）

用户在后续管理会话选择对 v26 做全量回归，并要求解决启动问题后继续。此次目标仍为 EXP-security-operations-expert-026-ra06021c8deaf，不覆盖上述七例的封存 Run，也不改变原 Decision。

- detail 回读 Candidate 摘要仍为 f427a1cb52c9c3614706c71708975fff2dfd1a6359cc93f3b7c9c98b7504affb；cases/list 及逐项 cases/read 核对现有 69 例，用例文件摘要仍为 f685481cf609fd2f437a7f173e4ac3397155795e92ea312d5b1f1e49b4ee7b6c。research/validate 返回 valid=true，无错误和警告。
- 已预览但未实际执行的参数：source=experiment:EXP-security-operations-expert-026-ra06021c8deaf，mode=full，executor=api，review=ai，model=Qwen3.5-4B，显式选择现有全部 69 例，compare_to=run-4557516b-e440-46c4-b414-1c228378e75c。当前接口的 review 合法值为 ai/none；此前尝试 full 被参数校验拒绝，修正后预览成功。
- eval/preview 返回 preflight_scope=source-cases-and-model-policy、missing_env_names=[]。后续重新预览仍成功；这只证明该预检范围内满足条件，不证明实际 Runtime 装载、外部服务、浏览器语音或业务效果通过。
- 实际 eval/start 返回 model_policy_unavailable：ENOENT: no such file or directory, open '/home/cmp/harness-engineering-platform-data/config/sources.json'。未返回 job_id 或 run_id；随后 runs/index 回读证实 v26 仍只有旧的七例 Run。此次 69 例尚未执行，没有新 Trial、正式业务判定或资源消耗证据，不能记成 69 例业务失败，也不能把旧结果当作此次全量结果。
- 对 config 目录的文件名复核确认 sources.json 缺失；现有 business-model-default.json 仍指定 qwen / Qwen3.5-4B。当前管理动作目录及现行工作区说明中未找到这份缺失配置的版本合同或受控恢复入口。缺口不通过手写空配置、复制未知旧配置、读取凭据、导入内部实现或更换模型绕过；没有重复发起相同的启动请求。

恢复后应先回读来源、用例与模型配置，重新 preview，并沿 eval/start 的实际回执记录新 job_id/run_id。策略和应急流程不得自动代替用户确认；四个语音用例需要浏览器、音频及计时证据，固定 Mock 用例需要对应冻结样本，周期巡检需要真实到期与巡检闭环，受控实例用例需要其实际身份和网关证据。仅用 API 文本完成不能代替这些业务验收。此次为启动前记录，未修改 Candidate、用例、启用版本或任何已完成 Run。
