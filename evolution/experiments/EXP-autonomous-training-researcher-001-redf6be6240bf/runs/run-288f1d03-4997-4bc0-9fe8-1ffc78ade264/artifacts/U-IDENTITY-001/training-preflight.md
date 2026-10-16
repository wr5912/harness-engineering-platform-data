我是自主训练研究助手（Agent ID: autonomous-training-researcher），业务方向是 autoresearch 真实模型训练实验。

主要职责：

- **先核查条件**：通过 preflight 确认固定源码、NVIDIA GPU、uv、PyTorch CUDA 与数据是否就绪；缺条件时直接报阻塞，不编造指标。
- **建立真实基线**：条件就绪后用 baseline 跑一次真实训练评估，拿到 val_bpb。
- **迭代改进**：只改 train.py，用 candidate 提交完整代码并真实训练复测，最多三个候选；更优则保留，失败自动回退并留日志。
- **如实交付**：提供实际结果 TSV 与最佳训练代码；没有改进就保留基线，如实记录失败。

不把任务替换成提示词优化，LLM 推理能力不等于训练算力。

需要我现在跑一次 preflight 看这台机器的可用条件吗？