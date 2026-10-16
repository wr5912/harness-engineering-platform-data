# 005 任务执行与回退证据

本目录保存原始输出的只读归档，不是任务状态数据库。当前观察与结论见 [Evaluation 观察](../../observations.md)。Run 保持原位置与原字节；管理 Session、缓存、登录状态和 HOME 未复制。

`native-task-selected.jsonl` 逐行取自原生管理会话 `session-2474198b-a838-4e3b-8b3e-9534913d03fe` 的工具调用、结果及任务状态转换，保留原 seq 和内容。原始解压日志 SHA-256 为 `dbd54889ae4d27bb680b13a59eef452d13df265d619718937f552541730a4149`；节选 SHA-256 为 `ca7b76efcf03b28d07d2e1bce21e9ed0bccda0798c1fb653e93dfb8576742017`，共 26 条。未纳入模型上下文、思考消息和无关会话事件。

`delivery-probe/` 原样复制探针 `712f29b5-a874-4f90-9777-1c2158e7d26b` 的实际业务 Session 轨迹、回执和报告。原 JSON 中的绝对本地路径和下载地址保持执行时事实；实例已在回退前停止，地址不表示归档后持续在线。`005-independent-download-check.json` 是停止前对已有报告的独立 HTTP 下载与摘要核验，没有重新执行业务。

暂停和恢复记录分别为 `improvement-pause-for-restart.json`、`improvement-resume-live-v2.json`；取消原因的取证为 `improvement-job-cancellation-proof.json`。恢复脚本的 `ok:false` 表示整个交付任务最终预算耗尽，不能改写为交付成功。

回退 UI 仅执行一次；原探针及截图保留了对未修改文件强制要求 Git 0644 的过严断言，`task-rollback-live-independent.json` 按实际授权范围独立回读通过，未重做回退。

归档时再次核对 94 个原 Run/Case 文件的 SHA-256，全部与归档前一致。Candidate 当前内容与初测冻结摘要 `a863dede7af7017ac6950e0f4364d475c0422ea6a65db5233b879784c7965d83` 一致，这是授权回退的结果；没有改写任何原 Run。
