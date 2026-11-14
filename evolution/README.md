# 当前评测运行数据

本目录只保存当前 `business:<agent-id>@<commit>` 运行产生的评测记录，不保存业务 Harness 源码、Candidate、运行时包或旧版本资产。

允许的运行数据边界：

- `runs/<run-id>/`：输入快照、执行结果和运行状态；
- `evidence/<run-id>/`：与该 Run 直接关联的原始回执和证据；
- `decisions/<run-id>/`：基于当前 Run 的判定记录。

每条记录必须包含 Agent ID、固定 business source、Case/输入摘要、运行环境和证据定位。运行目录不得出现业务 Harness 装载目录或可执行资产副本。
