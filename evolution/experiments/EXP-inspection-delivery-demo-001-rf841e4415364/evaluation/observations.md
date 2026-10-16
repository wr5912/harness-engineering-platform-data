# 新建基础台账巡检助手的真实验收

本次通过平台管理助手真正新建 `inspection-delivery-demo`，从 `EXP-daily-inspection-assistant-002-r9eba480e9d2a` 复用工具，用平台装配同时绑定新 Preset，再评测和交付实例。没有由开发者手工代装资产。固定范围为五台模拟资产、完整分页和漏页不能完成；Case、Candidate 和原始 Run 在执行期间保持不变。

## 结果与证据

`run-05973a80-6b91-40e7-a0da-acca3a4ea696` 的四个固定 Case 全部完成并通过：自动生成的身份、范围回归，以及 `U-ASSET-PAGES-001`、`U-ASSET-PARTIAL-001`。独立审读实际轨迹：正常业务使用同一运行 ID 依次执行 `start → page(0) → page(2) → page(4) → report`；漏页只执行 `start → page(0)`，明确说明还缺三台、不生成报告和下载链接。结论不只依赖同路线模型的评审标签。

实际交付实例为 `hep-new-inspection-delivery`，端口 `3112`。新业务 Session 再次读取全部五台并完成报告。实际点击平台界面的三个下载入口，得到封存报告 679 字节、实例 Markdown 684 字节、设备 CSV 347 字节，分别与工具及交付记录的 SHA-256 一致。完整判据、实际工具动作和原生调用归属见 [验收摘要](evidence/acceptance-summary.json)，[最终任务回执](evidence/builder-final.json)、[下载记录](evidence/ui-downloads.json)；[交付探针](evidence/delivery-probe/probe.json)及同目录原始轨迹、Markdown、CSV 已保存。探针记录是完成后的只读证据快照，原始 Run 未改写。

程序来源为 `93de78848ed0a8a8e13976f567d7571ffa360394` 的 dirty 工作树，数据来源为 `25a45000781d39615a1cfd14db9e2447d3572271` 的 dirty 工作树；锁定摘要和评测实现核验均 matched。镜像 ID 为 `sha256:060d338f4d4cfe18097d7c0ae72a4fb22d82c3fe8da11829bba0121686c458f8`。管理模型为 `deepseek-official/deepseek-flash`、推理 `max`；业务与评审为同提供商 `deepseek-flash`、推理 `off`。这证明当前固定范围可交付，不构成干净版本间的因果比较。

## 用户投入与成本

首轮是平台规划/创建失败，**没有业务 Run，也不是目标智能体业务失败**。平台接受了重复定义自动身份 Case 的方案，确认冻结后创建入口三次拒绝；任务已暂停，26 次管理模型调用和一次确认均保留于 [首次失败](evidence/first-planning-failure.json)。随后在平台修复共享预检后另开第二次验收，没有修改旧任务冻结口径或重置旧预算。

第二次耗时约 358 秒，一条自然需求、一次整体 RPC 确认、零轮修复，49 次真实模型调用：管理助手 27、四 Case 业务与评审 16、交付探针 6。含交付后的最后说明，最终任务卡也是 49；评测与探针均未触发辅助标题调用。该次在 60 次、30 分钟上限内完成；容器内外部调用没有实时硬封顶能力。两次验收累计 75 次调用、两次确认，不能称作全部工作只消耗 49 次。管理助手有一次辅助标题请求缺供应商 Token 用量，总 Token 和实际金额仍未知。

本次是实际管理模型、平台 RPC、工具和下载的端到端验收；自然需求由 `assistant/session` 注入上下文，确认通过 `assistant/confirm` 执行，未将其冒称全 UI 点击构建。390 像素的实际任务回执已查看；本次待确认卡的移动截图因验收脚本旧原生字段假设而未取得，不算该 UI 项通过。

## 适用边界

数据来自基本模拟台账，报告没有检测真实设备，也不证明真实上游接入效果。首次构建尚无可比较 Baseline；保留此可运行版本继续观察，不将一次固定四 Case 通过推广为任意新智能体均可自动交付。
