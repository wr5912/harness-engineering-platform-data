# 实际观察

尚未执行本版本真实业务评测。工具装载和任务效果分别记录，不以静态验证替代。

## 2026-10-16 真实业务链路与并发启动复验

本轮固定原有 `evaluation.md` 的 Case，使用真实 DSH API、标准镜像 `ai-agent-harness/dsh:21638c563-9b0b8da69314`（镜像 ID `sha256:060d338f4d4cfe18097d7c0ae72a4fb22d82c3fe8da11829bba0121686c458f8`），实际请求为 `deepseek-official/deepseek-flash`、`reasoningEffort: off`。所有临时评测实例均已停止；来源核验为 matched。机器判断、独立业务核查与真实上游验收分别说明。未开展人员复核。

初轮程序来源为 `001fd7c` 且工作树 dirty（17—19 个变化路径），相关评测实现文件指纹在 Run 内固定并核验。端口修复后的并发轮来自干净程序提交 `1f40ae06ded2ca0546b52a976b914fa5ccefdb20`。每个 Run 的数据来源、dirty 状态和完整摘要以 `inputs.lock.json` 为准，不将不同程序状态的结果作为同条件效果比较。

用量从原生 Session 的请求尝试结算及重试生命周期计数，按 Session ID/seq 去重；包含 target 和机器 judge，`review none` 不等于完全没有机器评判请求。当前没有外部请求总数的实时硬封顶（`hard_cap_supported: false`），未推算金额。

| Run | 固定 Case | 机器结果 | 实际模型调用（target / judge） | 总 token | 端口 |
|---|---|---|---|---|---|
| [run-0e64207b-4fa6-443b-824b-4277842deb5f](../runs/run-0e64207b-4fa6-443b-824b-4277842deb5f/report.md) | U-TRAIN-PREFLIGHT-001 | passed | 3（2 / 1） | 8684 | 3086 |
| [run-288f1d03-4997-4bc0-9fe8-1ffc78ade264](../runs/run-288f1d03-4997-4bc0-9fe8-1ffc78ade264/report.md) | U-IDENTITY-001, U-TRAIN-PREFLIGHT-001 | passed | 5（3 / 2） | 13067 | 3082 |

实际轨迹调用 `task_training` 的 preflight，六项检查均为 false：NVIDIA GPU、PyTorch CUDA、uv、固定训练源码、固定评估文件、已准备训练数据。工具返回 `ready: false`、`status: training-resource-unavailable`、`inference_api_is_training_backend: false`，没有执行 baseline/candidate，没有 val_bpb、提升比例或伪造训练记录。导出的 `training-preflight.md` 是预检说明，不是训练产物。首轮回复把六项缺口称为“五项”，属于计数表述瑕疵，原文保留；不改变资源不足的实质判断。

端口修复后 `run-0e64207b-4fa6-443b-824b-4277842deb5f` 与研究业务 Case 真正并发，训练使用 3086、研究使用 3084；来源核验均 matched，临时实例均停止。训练本轮预检通过的含义是“在真实资源不足时准确停止且不编造结果”。真实自主训练、预算内训练迭代、训练失败保留/回退和 val_bpb 改善仍待具备上述资源后验收；推理 API 不当作 GPU 训练后端，也没有改成 Harness 提示词优化来替代训练。
