---
name: kev-training
description: "将已复核且独立分组的数据交给固定版本 KEV，准备真实编码检查、训练、校准、评估和 Harness 变体接入。用于训练准备、继续已授权训练阶段或核对模型工件；先区分 plan_only 与执行能力，再按需使用官方 kev-finetune/kev-deploy，避免自动跨阶段。"
---

# KEV 训练与变体交接

## 1. 先确认当前阶段

| 当前状态 | 唯一下一步 |
|---|---|
| 固定算力专项或 `planning_intent=plan_only` | 留在 `compute-variant-research`，交付只读计划；不执行本技能脚本 |
| 固定 Run 抽样专项 | 完成 `decision-sample-extraction` 的保存与回读；人员复核后再交接 |
| 只有 trace 或未复核样本 | 当前作用域允许时交给 `kev-trace-pipeline`；不训练 |
| 已复核四分区，但没有真实训练执行工具 | 整理下述交接材料，说明执行器缺口；不猜平台接口 |
| 已授权且具备实际训练环境 | 从首个未完成步骤继续；一次处理一个阶段 |

当前平台没有训练启动/状态/取消/工件回收动作。训练服务器登记与 SSH banner 探测不证明训练环境可用；`platform_task kind=training` 不会运行 KEV。原生 shell 的存在也不授权绕过专项接口。实际环境由用户或真实工具提供，凭据使用既有引用。

## 2. 准备数据与模型身份

1. 先按 `kev-trace-pipeline/references/dataset-formats.md` 区分材料：平台 v2 按 platform-export.md 转换，离线 IR 完成标注和分组审计，既有 KEV 文件按 legacy-native.md 复核、构建并审计。三种 dataset.kind 分别为 platform-v2、trace-ir、legacy-native。保留四份实际非空文件，不再运行官方 convert_data.py 或 split_data.py。
2. 用真实 agent/父 Experiment/固定 git ref 绑定目标。轨迹和平台数据填写真实 source_run_ids；旧表格或既有 JSONL 确实没有 Run 时，legacy-native 允许空数组，来源留在导入材料中，不能补造 Run。界面的 `provider/model` 是运行路由；从实际可训练 checkpoint 的固定版本读取训练元数据，不直接将该路由拼成权重地址。
3. 从固定 checkpoint 获取 training_config.json，记录来源与 SHA-256。准备 `assets/training-request.example.json` 所列字段；示例占位值不能直接提交。路径指向执行训练的同一环境；路径改变后重新准备计划并做编码检查。
4. 当前脚本 recipe 支持原生 KEV LoRA + CUDA/bf16。全量权重、其他后端、提高上下文预算或混入公共 replay 属于独立 recipe，需要实际验证，不能临场改参数绕过检查。

## 3. 准备 → 编码 → 取训练命令

从 Skill 实际位置解析脚本绝对路径；下面的 FILE/DIR 均替换为已核对路径。当前环境没有执行权限时只交接，不执行。

| 步骤 | 命令 | 必须看到的结果 |
|---|---|---|
| 准备 | `python3 <skill_dir>/scripts/training_plan.py prepare --request FILE --out NEW_DIR` | training-plan.json.status=prepared；training=not_run |
| 编码 | `python3 <skill_dir>/scripts/check_encoding.py --plan FILE --kev-root DIR --out NEW_REPORT.json` | encoding-report.status=ready，绑定同一计划、代码提交、数据摘要与基座版本 |
| 取训练命令 | `python3 <skill_dir>/scripts/training_plan.py commands --plan FILE --encoding-report FILE` | encoding_ready_execution_not_started；仍需真实执行授权、硬件和预算检查 |

编码默认只读本地 tokenizer 缓存；只有当前环境已获准下载时才使用 `--allow-tokenizer-download`。依赖或缓存缺失会留下 blocked 报告。不得用字符数、模拟 tokenizer 或上一次不同数据的报告替代。

命令默认给出中文说明；prepare 保存 report.md，编码检查保存与 JSON 同名的 Markdown 报告。机器计划、编码结果和命令参数原样保留，程序接收 stdout 时显式加 `--json`。用户先看当前结果、待处理问题和下一步，不先看完整 JSON。命令卡的 cwd/argv/env/unset_env 仍必须精确使用。

## 4. 逐阶段执行与核对

执行前读取 `references/training-run.md`；需要校准时读 `references/calibration.md`。只复制计划当前 command card 的 cwd、argv、env、unset_env；检查 requires，不自行拼未支持参数。计划器不启动作业。

- **训练**：只用 train.jsonl；四项候选增删增强显式为 0，保留选项洗牌。记录实际作业或进程身份、退出状态、日志、checkpoint 文件与摘要。连接、命令生成或上传成功都不是训练完成。
- **开发与校准**：development 用于迭代，calibration 用于拟合；报告与写入 checkpoint 温度是不同动作。检查实际拒收数、有效题数和来源组。未成功前不进入依赖步骤。
- **最终测试**：从调参循环分离；先冻结模型、温度、阈值、状态/候选构造器和评判口径，再用 test。不得拿 test 定向造训练数据。
- **服务与变体接入**：仅在该阶段已授权时按 `references/variant-binding.md` 核对实际服务/工具 schema，再使用官方 `kev-deploy`。训练授权不自动包含云部署、发布、清理或实例切换。
- **完整比较**：交回 `compute-variant-research`，用同一固定父版和新两侧 Run 验证质量与资源；离线准确率不等于等效，end 仍由人员页面复核。

未知作业结果先查原作业，不改名重复启动。恢复只进入首个未完成阶段；保留失败与旧产物。较弱管理模型也遵守相同业务模型继承规则，不能为适配管理模型而修改父版模型。

## 官方资料按需用

`kev-finetune` 与 `kev-deploy` 是完整固定上游技能，具体原文及许可见各自 UPSTREAM.json。先读本阶段适配说明，再只读取所需上游部分；不连续执行其所有示例。两脚本默认 runtime pin 与本套原生训练 pin 的区别见 `references/training-run.md`。

交付先说用户关心的当前结果；按需要说明数据、编码、训练、校准、服务绑定和完整比较中哪些已完成、哪些未做。不要固定逐项倾倒内部状态。存在必要行动时给出下一步；技术身份和明细保留在可查报告。模型行为验收方法见 `references/model-evaluation.md`，不能把静态测试说成 GPT-5.5 已实测通过。
