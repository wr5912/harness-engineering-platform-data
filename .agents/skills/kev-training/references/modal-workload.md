# 官方 Modal 工作负载微调

本路径保留官方 kev-finetune 的独立能力：从 Jev/TypeSafe/System One 调用、分类/路由/评分问题或已有标签开始，扫描工作负载、转换/生成数据、规划样本量、微调、校准和评估。只有选择该配方且具备当前阶段的真实执行能力与授权时执行；固定 plan_only 和 Run 抽样专项保持原作用域。

## 从现有材料继续

| 当前材料或目标 | 读取官方包中的内容 | 本阶段交付 |
|---|---|---|
| 已有 Jev/TypeSafe 调用，或尚未定型的业务问题 | [SKILL.md](upstream/kev-finetune/SKILL.md) Phase 0、scripts/extract_workload.py、assets/workload.example.json | 有来源位置与待补项的 workload.json；不把待补字段当事实 |
| 已有 CSV/JSONL 标签，需要原生格式 | [data-generation.md](upstream/kev-finetune/references/data-generation.md)、scripts/convert_data.py | 字段与标签映射明确的转换产物 |
| 要估算规模或生成合成样本 | 官方 Phase 1、scripts/plan_size.py、scripts/generate_data.py | 样本量依据、生成来源和待复核数据；模型建议不冒充人员真值 |
| 已有本配方的数据与训练环境 | 官方 Phase 2、scripts/kev_modal.py | 真实作业身份、训练/校准/开发评估报告；无执行能力则只交接 |
| 已有训练结果，要评估或迭代 | [hill-climbing.md](upstream/kev-finetune/references/hill-climbing.md) | 相同口径的基线比较、错误与下一次必要改动 |
| 只部署或清理已有资源 | 本地 [kev-deploy](../../kev-deploy/SKILL.md) | 直接办理指定模型或资源，不重新训练 |

完整原文与包内相对依赖均保留；不把这张索引当成上游算法的改写。原 `$kev-finetune` 入口改用 `$kev-training` 并说明“官方 Modal 工作负载路径”。

## 配方和来源边界

- 从实际 `references/upstream/kev-finetune/` 解析脚本绝对路径；输入输出使用真实工作目录中的路径，不把数据、日志或工件写进官方包。包内模块保持同目录，不能只拷出单个脚本。
- 平台 v2 或本套 IR/legacy-native 的已复核四分区不能重新跑官方 convert/split；沿用原生训练路径。官方通用数据转换不继承这些来源闭包与人员审核语义。
- 官方 Modal 的 `validate` 会上传数据，`train` 会上传并执行训练、校准和开发评估。执行前明确这些真实动作、所选环境和预算；只获准本地准备时交付准备结果，不调用远端入口。
- 官方合成数据保留生成模型与方法，核对标签及真实业务输入上的表现。需要重要最终验收时保留未用于迭代的测试材料，不能把训练或开发结果称为独立测试。
- 原生训练计划器不包装本配方。Modal train 的可配增强与原生配方不同，见 [training-run.md](training-run.md#官方-modal-路径的差别)；不向官方 CLI 添加未支持参数，也不把已登记 SSH 服务器静默换成 Modal。
- 保留作业身份和已有产物；网络报错后先查询原作业，结果未知时不换名称重复启动。实际确认未启动或已失败后，才按官方不可变名称规则创建新尝试。

官方来源固定于 [jaredpalmer/kev@2074cc44256200bb37540103fa4572901faa10f3](https://github.com/jaredpalmer/kev/tree/2074cc44256200bb37540103fa4572901faa10f3/skills/kev-finetune)，本地 [UPSTREAM.md](upstream/kev-finetune/UPSTREAM.md) 与 [UPSTREAM.json](upstream/kev-finetune/UPSTREAM.json) 保留原始来源记录。执行时使用已核对的本地固定副本，不照抄原文 main 下载示例；包外链接按该固定上游仓库解析。适配变更只写本地入口或另立适配文件，不修改上游原文件。
