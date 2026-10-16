# Evaluation 观察

本次改进获得了业务修复的证据，但没有在 60 次模型调用额度内完成交付。平台保留预算耗尽状态，随后经用户在界面回退资产；当前 005 已恢复到固定父版，不能用回退前的通过结果宣称当前版本可用。

2026-10-16，管理会话从固定旧 001 派生本版本，来源见 [change.yaml](../change.yaml)。目标是复用 002 的只读台账工具，保留身份与用户给定数据摘要能力，并核验五台模拟资产的分页查询和报告下载。三次 Run 使用相同的三个冻结 Case，评判文件摘要均为 `0bc54f9a2ff21315c641ba291e6644f8e30fb2fe7183255630c7aeeb0bea32db`。

| 执行 | 实际结果 |
| --- | --- |
| [初测](../runs/run-1822acd1-3780-4554-8ae2-17d910aa5ee8/report.md) | Run 完成，身份和摘要通过，分页报告失败；目标 Session 没有业务工具，无法查询或生成下载链接。 |
| [一轮修复后的复测](../runs/run-80b598ef-5546-45a2-a950-e413f781a402/report.md) | 用户为平台重启主动暂停；Run 取消，身份通过，其余两项未完成，保留部分轨迹，不能计作通过。 |
| [重启恢复后的复测](../runs/run-9521d681-a5c0-4d62-a620-ef1b3f0280f1/report.md) | 三项均 passed；本次业务报告来自真实 `task_inspection` 工具回执，身份和摘要回归保留。 |

平台随后在 `hep-improved-inspection`（3116）的新业务 Session 完成三页查询和报告生成。[交付探针](evidence/task-delivery-20261016/delivery-probe/probe.json)保存了实际轨迹、699 字节 Markdown 和 362 字节 CSV；两份报告均包含 `asset-0001` 至 `asset-0005`，无遗漏、重复，逐行状态和设备总数一致。[独立下载核验](evidence/task-delivery-20261016/005-independent-download-check.json)再次 HTTP 下载已有报告，正文摘要与工具回执一致。报告明确是基础模拟台账，不是实时设备健康检测。

[暂停记录](evidence/task-delivery-20261016/improvement-pause-for-restart.json)和[恢复记录](evidence/task-delivery-20261016/improvement-resume-live-v2.json)证明同一任务恢复时仍为 36 次已观测调用、一轮修复，原任务 ID、开始时间和截止时间未重置。计入最终评测和交付探针后，实际已观测至少 62 次调用，其中助手 35、初测 7、取消中的评测至少 3、最终复测 11、探针 6；取消 Run 统计不完整，因此总数和完整 Token、费用保持未知。任务正确停为 `budget_exhausted`，从未标记 `completed`，没有追加额度。

用户先停止 3116 实例，再通过任务卡执行一次资产回退。[独立回读](evidence/task-delivery-20261016/task-rollback-live-independent.json)确认三份原文件恢复固定内容及模式，新增工具文件删除，其他文件保留；仍为额度耗尽、至少 62 次调用、一轮修复及原截止。当前 Candidate 内容摘要回到初测的 `a863dede7af7017ac6950e0f4364d475c0422ea6a65db5233b879784c7965d83`，已不包含修复后的业务工具。既有 Run、Case、输出和失败证据未改写，当前启用版本仍为 002。

修复后通过的 Run 对应当时的 Candidate `fa2d105e1a2fb6743977fe023d33cdd50667c44034c70f82211e4747c4e2f6e9`；它与当前回退后的资产不同。评审与目标使用同一路由，执行期间平台程序版本也有变化且记录 dirty，不能据此作严格因果比较或宣称长期效果、真实上游及生产验收通过。原始节选、回退前后状态和 UI 截图的来源见[证据说明](evidence/task-delivery-20261016/README.md)。
