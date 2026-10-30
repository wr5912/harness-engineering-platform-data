# TypeScript SDK 接入

本智能体使用 DSH 官方 `@deepseek-ai/dsh-sdk-client`，应用和 DSH 在同一标准 Runtime 容器内运行。
示例为同目录的 `example.ts`；安装器生成 `HARNESS_SDK_OPTIONS` 指向的启动配置。

1. 在平台选择本版本，填写输入并执行“SDK 调试”。保存成功回执中的 `session_id`。
2. 在容器内运行 TypeScript 示例，通过 `DeepSeekHarness` 装载生成配置。
3. 同一 SDK 实例可多次调用；连续对话复用 `harness.session()` 返回的句柄。
4. 关闭后恢复时，沿用同一 HOME 和工作目录，并显式调用 `await harness.resumeSession(sessionId)`。
5. 使用 `await using` 或 `finally` 中的 `close()`，确保 DSH 子进程退出。

SDK 通过本地 stdio JSON-RPC 访问子进程，无需业务 Web 地址。事件通知不等于逐 token 文本流。
高层 `run()` 在根 Agent 首次空闲时返回；含子智能体的完整任务使用低层 `HarnessClient` 的 `session/wait`。
官方协议不支持逐轮取消，停止会关闭整个 Runtime。请求超时或连接中断不能直接认定业务失败，不自动重放。
需要 Web 人工审批或追问的路径未在 SDK 中承诺可用；可停止当前执行并核对事件。
模型、MCP、业务依赖由当前实例或独立安装配置提供，接口就绪和模型回复不等于业务通过。
