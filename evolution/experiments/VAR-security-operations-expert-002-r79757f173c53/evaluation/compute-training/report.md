# Qwen 与 KEV 协同研究

本次以 `EXP-security-operations-expert-024-rad80a907c628` 的 `git:1f162a1ce12025ffeb9d2e36c7a3ae283b41e421` 为固定父版，使用指定的 `run-e6ffe4c8-932b-4b6a-b9fb-1f802f536408`。父版 Candidate 与该 Run 的封存摘要一致；当前 EXP 工作树已经变化，不能代替这个历史来源。

Qwen3.5-2B 从 ModelScope 固定修订 `c00cc5fd7803c60b7788e053dcce33d0d26b11ef` 下载。KEV 初始化来自 `jaredpalmer/kev-0.8b@bf75a6a8848ea6960ff2ed108d9ed44c2941174f`，基础模型为 `Qwen/Qwen3.5-0.8B-Base@dc7cdfe2ee4154fa7e30f5b51ca41bfa40174e68`，运行源码固定为 `jaredpalmer/kev@2074cc44256200bb37540103fa4572901faa10f3`。下载文件逐项核对官方仓库元数据；基础模型从 ModelScope 中转的文件与固定 Hugging Face 文件逐字节匹配，唯独仓库属性文件另从固定 Hugging Face 修订取得。文件身份见本目录的验证清单。

本轮复用该 Run 已有 AI 功能复核的 37 条主路由样本，保留原始复核模型与来源，不冒作本轮 MiMo 标注或人工真值。训练、开发、校准与最终测试的来源分组及文件摘要在 [训练计划](plan-v1/training-plan.json) 和 [编码检查](encoding-v2.json) 中。未新增最终测试真值；历史测试集合的复用限制继续成立。

在授权训练机的独立项目目录真实执行 BF16 LoRA：8 个 epoch、学习率 2e-5、batch 1、累积 4、seed 0，共 48 个优化步。开发集与校准集全对，冻结后最终测试只有 1/4 正确，且出现高置信错误。四组逐条预测及原始报告保存在 `training-v1/`；最终测试没有用于重调配方、温度或阈值。这些结果不支持业务等效或效果改善。

温度在独立来源组的业务内校准集拟合并实际写入新 checkpoint；上游明确标记为 `in_distribution`。不将业务内留出解释为分布外校准，也不将校准集准确率推广到业务。最终测试之前生成的 [冻结清单](training-freeze.json) 固定了权重、温度、构造器输入、数据及评判口径。

Qwen 与新 KEV checkpoint 均已在同一 RTX 3090 上实际部署。Qwen 完成真实文本请求；KEV 完成真实编码检查与 `/v1/systemone` 推理，回执包含模型身份、用量及编码证明。它们只证明模型技术链路可运行。原始回执见 [文件清单](files.json)，不以健康检查代替业务验收。

实际执行环境见 [环境记录](execution-environment.json)。本次解释器为 Python 3.12.3；上游项目元数据要求 3.13，因此保留这个兼容性边界，不能声称已复现其完整官方环境。

本变体仅对 `main_route` 做了本轮微调。其余决策点没有本轮训练证据。考虑主路由泛化结果不足，图保留 Qwen 理解与 KEV 路由建议后，将业务办理交回同一 Session 的原生 MiMo Flash，继续沿用父版的 Skill、工具、Guard 和多轮上下文；未完成或被取消的回执不能触发回退重放。全部真实 Qwen、KEV、MiMo 和角色调用都纳入后续比较，不能只计算小模型部分而声称节省。

原生预检的第一轮 Qwen 产生空引用并被拒收，随后 MiMo 接续完成概念问答。加入合法空数组和逐字引用示例后，第二个新 Session 实际完成 Qwen 理解、KEV 主路由与 MiMo 接续，图全部节点完成，并保留两侧模型用量；原始记录在 `preflight/`。最终回复仍在“两句话”的要求后追加说明，保留其格式约束不足，未判为完整业务通过。

预先固定的 14 个业务 Case、关键 Case 和资源门槛以本 VAR 的 `change.yaml.compute_variant` 为准。当前训练与部署证据不构成这些 Case 的通过结论，也不构成变体 `end`。
