# Evaluation Observations

独立官方 TypeScript SDK 技术验收，使用公开创建、编辑、普通 Managed TypeScript 构建与 SDK operation。实际新工件ESM为`b76ab482e41b218fabcaefe58705c04d41ffae1d7961bb5c88bb870d34152de5`，构建冻结的工作流SDK runtime.ts摘要为`f749cadfd64881284eb37d050b38a59879f952396f10658c82cd7fcb84ffcc92`。本次使用实际原生spawn与同Preset继承；子会话真实等待1.2秒后完成本地计算，没有注入完成通知。

首次工件在SDK根Header缺少agentPreset时仍走MiMo，子会话才走本地路由，该次不判通过；原SDK operation和原生Header保留。原生已选Preset投影适配后的新工件由operation `a687bda6-0d79-4ef1-ac80-cdbb9f0858fc` 实际执行，根会话`session-db9f5037-a76f-4487-b3eb-ea7e6394837d`：根首turn/end → 子会话turn/end → 根第二turn/end → SDK completed顺序成立。根首轮图、子首轮图各1次，根图内真实委派1次，完成通知回合没有新图、工具或infer。根与子请求均为本地`harness-code-only/workflow-v1`，最终正文保留原生终态和真实子任务回执。

随后operation `d0ed0331-ce8c-48e0-8d96-3ee4e3bbefd8` 从同一个持久Session恢复，输入`RESUME-NORMAL-5907`，准确返回`普通请求回执：RESUME-NORMAL-5907`；仅新增当前根图调用1次，没有重发旧委派或旧通知。

原生Session轨迹核对得到模型观测数0、图model_attempts为空；统一总量测量仍因子会话fallback标题资格未知而为unknown，不补零、不宣称资源收益。该验收证明此工件的装载、身份选择、通知接续与普通输入恢复；不是业务等效、算力优化或Research Release采纳。
