# 校准与最终测试

## 固定四种用途

train 仅更新模型；development 选择模型及配方；calibration 拟合概率/预先约定阈值；test 只作最终冻结验收。保留关联闭包后的 _meta.group_id；Kev 实际按 (source, group) 分折，不能只新增一个下游不读取的分组字段。calibration_folds 不得超过独立组数；满足这个条件也不保证统计充分。

## 两种明确策略

training.calibration_policy 默认 report_only：先用 KEV_TEMPERATURE=1.0 生成 calibration-raw/rows.json，再运行 kev.calibrate。该命令只产生报告，不写 head.pt，不能称为已部署校准。

显式选择 workload_heldout：本套额外生成原生 scripts/calibrate_checkpoint.py 命令，输入只能是同一计划的 calibration-raw/rows.json，并显式使用 --allow-in-distribution。原因是上游发布校准策略要求可查的 suite 级独立来源，通常拒绝自定义 --data；本业务研究采用同一业务分布内按来源组独立留出的校准集。此开关是上游公开选项，**不证明数据集级分布外独立性**。只有评审认可此业务校准口径且四分区摘要及组关系仍通过时执行；保留上游记录的 in_distribution 原因，不能隐去它声称符合通用发布标准。

该写入会改变新训练 checkpoint 的 head.pt；执行后回读温度与 temperature_fit，重新计算工件摘要，再跑 development-calibrated。不修改缓存中的原始发布基线。基线与微调模型可在同一校准集各自拟合，再比较独立开发结果。

## 校准结果的检查

确认 rows.json 对应 calibration 的实际记录和问题，检查拒收、失败、类别与来源组覆盖。report-only 和 workload_heldout 都不能使用 development 或 test 拟合温度。软标签分布不等于成功概率；原生评分和温度拟合依据硬标签。回退阈值按预先约定的选择集固定，报告 coverage-risk；在 test 上挑最好阈值属于再次调参。

## 最终测试

先固定 checkpoint、温度、阈值、状态/候选构造器、数据版本与验收规则。只执行计划中单独的 final-test card，清除 KEV_TEMPERATURE 覆盖，读取保存的温度。report_only 模式若保留 T=1，应准确报告未应用拟合温度。

不要直接以官方 kev_modal.py::evaluate --data test.jsonl 替代最终命令：本地 checkpoint 路径没有 calibration 文件时会强制 raw T=1。最终报告列有效/拒收数、每类及关键错误、组级不确定性，并保持测试材料不回流调参。完整 Harness 质量与资源仍需独立两侧 Run。
