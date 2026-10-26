# DSH v4 适配与在线采集

## 已支持的子集

wrapper: {session_log,event}，或直接 session event。header type=session/version=4/id，无 seq；后续 seq 连续。user/message 的消息在 data，其余 system/developer/assistant/tool-result 在 data.message。source.kind=user 才是当前人类用户请求来源之一；agent-instructions/runtime-context/skill-catalog/time-context 是注入上下文。

按 surfaceOp=append 或支持的 replace 投影；replace 用当前 surface 的 startSeq/endSeq 闭区间，并检查 sourceEventSeqs 覆盖。保存完整 text/tool-call/tool-removal/tool-addition block。保留最近 request/header 的 config 与 tools；不可从未来 header 回填早期候选。

工具配对使用 session、turn、step、callId，检查 model tool-call、tool/call、tool/result.toolCallId/source.callId 和 sourceEventSeqs。stream 与 inbox 是不同记录层，不能重复计数。无法匹配的记录产生问题清单。

本版不执行插件投影，不处理任意未知必需事件。未知 block、seq 缺口、非法替换或未适配 compaction 控制事件会阻断受影响的后续快照。显式 ignorable=true 的扩展可记录后忽略。不要擅自扩大支持声明。

## 准确性等级

输出称 reconstructed_provider_neutral_input。它不等于 provider 真实 HTTP payload；replayState、toolHistory、图像/文件、provider serializer 和插件仍依赖目标 DSH 版本。只有 session version=4 不能推出具体应用 commit。

## 推荐的在线捕获位置

按目标 DSH 版本实现只读 llm/stream waterfall 观察插件：记录完整冻结的 GenerateOptions，然后 next()。不要修改 messages/tools/config。捕获 sessionId、独立 request_index、cut_seq、最近 header_seq、有序 message ids/blocks、tools schema hash、版本、purpose，以及请求完成/失败/取消状态。区分 loop 请求与 compaction/session-title 等辅助调用，核对官方请求身份 helper。

agent/request 在当前文档中已 deprecated，调用时本轮 user/system 可能尚未提交，因此不适合冒充最终输入。tools/pre-execute 接收已经选择和记录的工具及参数，适合执行前验证，不是节省此前选择调用的 hook。

这里提供的是接入规格，不含未经目标 DSH 环境验证的插件实现。不要把样例接口伪装成已安装采集器。

依据：见 sources.md 的 DSH session、surface、llm-streaming、agent-loop 与 tools 一手文档。
