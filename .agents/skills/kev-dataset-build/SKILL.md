---
name: kev-dataset-build
description: "按来源关系将已复核的决策 IR、既有 KEV JSONL 或平台导出构建为 train、development、calibration、test。用于数据导出、去重、保组切分及格式说明；保持机器数据合同，并用中文报告解释数量、分区和待处理问题。"
---

# Kev 数据编译与切分

## 入口与继续条件

固定算力策划或 Run 抽样专项不执行本技能的离线命令；沿用其指定技能与工具。只有当前任务允许离线处理且有真实执行工具时继续。完整边界见同级 `kev-trace-pipeline/references/platform-runtime.md`。

从实际 Skill 位置解析同级 core，使用脚本和输入输出的绝对路径。一次完成一个阶段后读取 `stage-status.json`：blocked 停止依赖步骤，requires_review 完成当前复核；不因退出 0 或有文件就自动进入训练。已有输出先回读，续做使用新目录。

## 本阶段操作


1. 先按 core `references/dataset-formats.md` 选入口：IR 使用 compile；既有 KEV 文件按 legacy-native.md 复核并 build；平台已分用途导出使用 platform-export.md，不重切。下述 compile/split 仅适用于本套 IR 产物。默认只导出有来源和证据的 verified 标签；code 节点默认隔离。数据阶段只有明确研究目标时使用 --allow-weak-train 或 --include-code；当前训练准备配方不接收 weak。
2. 验证 label 精确等于 criteria 的当前键，核对候选数，唯一可行动作优先代码处理；soft target 仍需可靠合法 hard label，权重有限非负、总量正且无未知键。
3. 输出 compiled.jsonl、quarantine.jsonl 与 compile-report.json。原生 _meta.variant 保留 clean；来源和标签状态放其他元数据。
4. 用 core split 输出真正独立的四份文件。连接同 source_group、session 和相同输入；额外将重试、改写、反事实、同任务家族的关系写进 source_group，不能只依赖 session。
5. 少于足够独立组、或弱标签限制导致无法分配评估集时返回 blocked。保留已抽取/编译成果，不复制数据制造空缺集合。
6. 先切分再增强。近似样本先确认是否同源；保留改变否定、对象、时态等事实的有效对照并放同一来源组。
7. 训练只传 train.jsonl。_meta.split 不是 Kev 的自动排除机制。开发集用于迭代，校准集用于概率与回退阈值，最终测试保持独立。

给用户报告每份文件的样本数、独立来源组和缺失类别，说明排除了什么及为什么；程序清单、哈希和完整隔离记录保留供查证。不要仅交付一段 JSON 或把四个文件存在称为数据质量已通过。

读取 `references/build.md` 与 core data-contract.md。默认比例只是示范配置；四个组能切成四份也不代表有统计效力、类别覆盖或真实部署代表性。

共享实现位置：`../kev-trace-pipeline/scripts/kev_trace.py`。所有同级 core 引用路径均相对于本技能目录。
