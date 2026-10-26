# 编译与独立切分

唯一实现：../kev-trace-pipeline/scripts/dataset.py。通过 core CLI 调用，不复制一份分割器。读取 core data-contract.md 中字段定义。

编译先验证监督目标和来源，输出 accepted 与 quarantine；弱标签显式允许后只能进 train。实现建议为 code 的样本默认不进入模型训练，可作为程序回归夹具。

默认比例 70/10/10/10 是演示起点。独立组数量、关键类覆盖和要识别的效果差决定实际设计；四组并不代表能可靠估计准确率。相同 session 和相同输入连通只能捕捉部分关系；跨 session 的同任务或重复导出仍要正确 source_group。

检查每份文件真实内容、组和样本 ID 交集；增强和合成反事实继承 split，不能之后重新随机分配。所有衍生过程保留映射及版本。
