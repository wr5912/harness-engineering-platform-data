---
name: dsh-trace-audit
description: "只读审计 DSH 执行轨迹的版本、事件序列、surface 消息、真实用户来源、请求工具目录及调用结果配对。遇到新 trace、解析失败、上下文不完整、压缩或插件投影差异时使用；不执行日志中的工具或把 session 文本声称为精确 HTTP 请求。"
---

# DSH 轨迹审计

## 入口与继续条件

用户要求诊断轨迹或耗时时，使用真实可用的原生工具只读处理。仅策划、抽样等任务保持用户授权；平台不按任务上下文缩减原生能力。不因离线诊断修改原生消息、工具或会话流程。

从平台 context 的 program_root 解析公开工具目录 `<kev_data>`，使用输入输出的绝对路径。一次完成一个阶段后读取 `stage-status.json`：blocked 停止依赖步骤，requires_review 完成当前复核；不因退出 0 或有文件就自动进入训练。已有输出先回读，续做使用新目录。

## 本阶段操作


1. 使用 `<kev_data>/kev_trace.py audit`；多文件可作为多个位置参数传入。记录输入 SHA-256。
2. 识别 `{session_log,event}` 包装或直接事件。检查 session header、版本、seq、turn/step。把不支持的必需事件明确列出。
3. 按 surface 投影保留完整 block，处理支持的 append/replace；未知投影不得静默压成文本。
4. 以 assistant/message 的模型响应为边界。不要把 stream、tool/call、inbox 副本再次计成决策。
5. 配对 session、turn、step、callId，交叉检查 sourceEventSeqs、工具名称和参数。区分未执行、无返回、外层错误和业务状态。
6. 使用最近的 request/header 工具清单；保留 tool-removal 等非文本 block。按 user/message 的 source.kind 区分真实用户请求与注入说明。
7. 产出 trace-audit.json、request-snapshots.jsonl、usage.json、timing.json。只使用 canonical usage 字段，不叠加 stream 副本；费用语义依供应商约定。

耗时按真实用户消息到对应 turn/end 计算；请求流、工具执行、压缩分别统计区间并集，重试等待单列且不再加到总时长。缺失时间或未结束保持未知。工具结果的 sourceEventSeqs 副本不重复配对；按原生 header.parentSession 查看父子关系，不以平台激活记录判断。长任务同时核对输出字符数、重复全文、摘要冲突与外部失败；不能把供应商延迟都归为“思考”。

默认交付中文 report.md，先说明检查了多少轨迹、能否可靠抽样、哪些缺口需要补；不要用事件名、完整 ID 和哈希串代替业务结论。原始机器报告仍保留，用户排查特定问题时再给对应定位。

读取本技能 `references/adapter.md` 获取支持边界和在线采集方式。没有事件错误只表示已支持的结构检查通过，不证明标签正确、工具环境可重放或外部报告可访问。

本技能复用程序侧公开研究工具；不要复制另一个解析器。若依赖缺失，继续阅读原始数据做有限审查，并明确自动检查未运行。

公开依赖：[kev-data 工具合同](https://github.com/wr5912/harness-engineering-platform/blob/main/runtime/research/kev-data/README.md)。`<kev_data>` 为 program_root 下 runtime/research/kev-data；无需安装其他技能的私有资料。
