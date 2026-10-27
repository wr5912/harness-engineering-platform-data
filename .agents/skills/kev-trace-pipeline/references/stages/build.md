# 数据编译与分组切分

已有复核或编译产物可直接继续本阶段，不重做发现、抽取和标注。执行与恢复边界沿用入口 Skill。唯一实现为 `scripts/dataset.py`，通过 `<core_dir>/scripts/kev_trace.py` 调用，不复制分割器。

1. 按[数据格式](../dataset-formats.md)选入口：本套 IR 使用 compile/split；既有原生 KEV 文件按 [legacy-native](../legacy-native.md)复核并 build；已分用途的平台回执按[平台桥接](../platform-export.md)处理，不重新切分。以下 compile/split 仅适用于本套 IR。
2. 默认只导出有来源和证据的 verified 标签；code 节点隔离，可作程序回归夹具。仅明确研究目标时使用 --allow-weak-train 或 --include-code；weak 及关联来源组只能进 train，当前默认训练准备配方不接收 weak。
3. 验证 label 精确匹配当前 criteria 键及候选数；唯一可行动作优先代码处理。soft target 仍需合法可靠 hard label；权重有限非负、总量正、无未知键。
4. compile 保存 compiled.jsonl、quarantine.jsonl、compile-report.json，保留所有隔离原因；原生 _meta.variant=clean，来源和标签状态放其他元数据。字段见[数据合同](../data-contract.md)。
5. split 输出独立的 train、development、calibration、test。连接同 source_group、session 和相同输入；同任务重试、改写、反事实、跨 Session 同任务家族及重复导出的关系仍须明确 source_group，不能只依赖 session。
6. 独立组不足或弱标签限制使评估集无法分配时返回 blocked，保留已有成果，不复制记录填补集合。先切分再增强；衍生和反事实继承分区与来源，保留映射版本。否定、对象、时态改变的有效对照可保留但放同源组。
7. 检查四份实际文件、组和样本 ID 交集。训练只传 train.jsonl；_meta.split 不会让 Kev 自动过滤测试行。development 用于迭代，calibration 用于校准与约定回退阈值，最终 test 保持独立。

默认 70/10/10/10 只是起点；独立组数量、关键类覆盖和待识别效果差决定设计，四组并不代表统计充分或部署代表性。报告各文件样本数、来源组、缺失类别、排除内容及原因；保留哈希、清单和隔离记录，不把四个文件存在称为质量已通过。
