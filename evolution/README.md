# 当前评测运行数据

本目录只保存当前 `business:<agent-id>@<commit>` 产生的运行数据，不保存业务 Harness 源码、Candidate、运行时包或旧版本资产。

当前运行器的唯一写入入口是 `runs/<run-id>/`：其中保存 `run.yaml`、`inputs.lock.json`、执行结果、摘要以及该 Run 的 `evidence/` 和判定材料。Run 通过 `business:<agent-id>@<commit>`、Case、输入摘要、运行环境和证据定位保持可追溯。

`evidence/` 与 `decisions/` 顶层目录保留为运行数据边界目录；当前实现把证据与判定材料嵌入对应 Run，禁止写入 Harness/Candidate 可执行资产副本。`evolution/experiments` 不再是有效来源或运行目录。
