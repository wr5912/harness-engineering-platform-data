# 实际观察

尚未执行本版本真实业务评测。工具装载和任务效果分别记录，不以静态验证替代。

## 2026-10-16 真实业务链路与并发启动复验

本轮固定原有 `evaluation.md` 的 Case，使用真实 DSH API、标准镜像 `ai-agent-harness/dsh:21638c563-9b0b8da69314`（镜像 ID `sha256:060d338f4d4cfe18097d7c0ae72a4fb22d82c3fe8da11829bba0121686c458f8`），实际请求为 `deepseek-official/deepseek-flash`、`reasoningEffort: off`。所有临时评测实例均已停止；来源核验为 matched。机器判断、独立业务核查与真实上游验收分别说明。未开展人员复核。

初轮程序来源为 `001fd7c` 且工作树 dirty（17—19 个变化路径），相关评测实现文件指纹在 Run 内固定并核验。端口修复后的并发轮来自干净程序提交 `1f40ae06ded2ca0546b52a976b914fa5ccefdb20`。每个 Run 的数据来源、dirty 状态和完整摘要以 `inputs.lock.json` 为准，不将不同程序状态的结果作为同条件效果比较。

用量从原生 Session 的请求尝试结算及重试生命周期计数，按 Session ID/seq 去重；包含 target 和机器 judge，`review none` 不等于完全没有机器评判请求。当前没有外部请求总数的实时硬封顶（`hard_cap_supported: false`），未推算金额。

| Run | 固定 Case | 机器结果 | 实际模型调用（target / judge） | 总 token | 端口 |
|---|---|---|---|---|---|
| [run-3df5f417-c35e-491b-a917-5fb20a2c662c](../runs/run-3df5f417-c35e-491b-a917-5fb20a2c662c/report.md) | U-IDENTITY-001, U-RESEARCH-001 | passed | 7（5 / 2） | 45485 | 3085 |
| [run-5f178a71-522f-4e5f-af14-3d240cced704](../runs/run-5f178a71-522f-4e5f-af14-3d240cced704/report.md) | U-IDENTITY-001, U-RESEARCH-001 | inconclusive | 未知；已观测 0 | 未知 | 3082 |
| [run-c3b32564-7be2-4ce5-b8e6-72d07531a274](../runs/run-c3b32564-7be2-4ce5-b8e6-72d07531a274/report.md) | U-RESEARCH-001 | passed | 6（5 / 1） | 51134 | 3084 |

首次并行 Run `run-5f178a71-522f-4e5f-af14-3d240cced704` 与训练实例同时选择 3082。研究容器的启动日志记录 `EADDRINUSE`；Compose 命令虽返回成功，DSH 实际没有监听。评测错误地连接到训练端口，两个 Case 在 `target-session-create` 失败，未形成业务 Session。该失败 Run、请求阶段、异常和空轨迹状态原样保留；无轨迹的模型次数记为未知，不能当作精确零消耗。

串行补验及端口修复后的并发轮均实际调用 `task_research` 完成 start、两次 collect、report；两份资料为经过 SHA-256 校验的官方固定提交快照，本轮没有实时访问网站。autoresearch 来源固定为 `228791fb499afffb54b46200aca536f79142f117`，README 摘要为 `3958fd4195ac2f98ed35c4eaa4f3028a335165ee24945e96426c408d25793a41`；EvoFlow 来源固定为 `d921e63c6a771089db1c514a5dcd4cbc36cf95cf`，README 摘要为 `c0695756b1e44eabd15202868c1badde44527170206315bf35bc44c2c428a8bb`。报告保留原始来源链接、读取时点、MIT 与 PolyForm Noncommercial 使用边界。

独立检查发现，旧候选报告主要分段复述两份 README，横向比较和取舍说明不足。机器 passed 仅证明当前检查通过、工具与产物链路完成，不能据此判定“比较调研”业务质量已达标，也不代表两项目实际效果经过验证。后续候选改进需要保持原 Case 再验；本轮原始产物保留。

并发轮 `run-c3b32564-7be2-4ce5-b8e6-72d07531a274` 的报告来自真实工具完成回执，封存索引 `origin: tool-result`。运行期间独立通过实例 HTTP 下载报告：`2026-10-16T09:04:34Z`、HTTP 200、6393 字节，业务 ID `task-9afc6c26-590a-4690-82f9-2cd0976064ad`，SHA-256 `7a4a27457ab9fd2b543c2c08a592bc0becb330563f4b55c9a7b517d8d47c2744`；下载字节与实例文件、工具回执及 Run 产物一致。串行轮的自动下载观察没有捕获到入口，不能把其文件导出称为 HTTP 下载验收。

端口整改通过宿主启动互斥覆盖选端口、登记和实际监听，并核对目标容器进程持有的 socket；修复后研究/训练并发轮分别使用 3084/3086，均业务完成且停止确认，未再串入另一实例。独立进程、独立数据目录的并发回归和外部 HTTP 服务不能冒充就绪的测试已通过。该结果覆盖当前同宿主 Docker 环境，不代表外部研究产品或商业许可已获部署验收。
