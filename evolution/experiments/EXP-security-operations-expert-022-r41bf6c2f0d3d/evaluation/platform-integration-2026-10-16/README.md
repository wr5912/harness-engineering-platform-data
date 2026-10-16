# 固定来源的平台接入验收

本记录是平台扩展接入验收，与上级目录的 Research Evaluation 分开。没有改写任何已封存 Run，也没有修改固定 Candidate。

实际来源为数据提交 `c903724269be0ef249182e2fd7024325c7124629` 下的 EXP-security-operations-expert-022-r41bf6c2f0d3d Candidate。通过原 Git archive 只读缓存装载，完整平台组合运行 `run-555d8f61-aa07-46f7-b202-3fd0114a48fa` 真实调用 DeepSeek Flash/max，四阶段 completed，原校验 passed 且 warnings=[]，SOC 摘要及报告 saved，实际下载 HTTP 200。基本模拟 Mock 端口为独立的 53017，测试平台端口为 3099；它们在验收后停止，不是长期业务入口。

[执行回执](execution.json) 保存实际发布组合及子版本、程序/工作区提交与 dirty 状态、实际扩展摘要、调用结果和下载响应。[context.json](context.json) 固定模型、连接目标和算法摘要；[冻结输入](fusion/five-source-output.json) 的文件 SHA-256 与 result.input_sha256 一致。模型请求元数据、原始响应和原校验结果分别保存在 model/，未包含 API Key。

最终源码还补齐了 Run 根及所需制品路径的符号链接检查。随后重启独立测试平台，仅回读旧失败运行及本次新运行：每个运行的 infer/writeback/report 三阶段均 replayed=true，没有新增模型采样或外部回写；旧未完成阶段跨版继续、绑定/模型冲突、缺失制品由确定性回归验证。[页面回读](readback.json) 中实际 HTTP 200、输出校验 passed、存储 saved、无 pageerror，见 [截图](readback.png)。一次旧定位器等待超时后改用实际响应与渲染字段确认，不将定位器超时写成业务失败或掩盖真实调用。

[扩展回归](extension-tests.log) 为最终实现 42/42，通过原 CLI 与四阶段等效、MCP catalog/报告绑定、取消、失败回写、只读缓存、跨版幂等和制品路径回归；随后迁入的[业务 Case 完整性测试](evaluation-source-test.log) 另为 1/1。同行发现的路径检查问题已关闭。

本验收只覆盖基本模拟边界。3081/3084 业务 Harness 与 MCP 配置没有切换；业务模型 off、其他威胁类型和完整业务能力不由本平台组合试次证明。旧制品检查验证 result/context 一致及必需文件存在可解析，不宣称能证明没有摘要的历史文件从未被改动。正式 3090 的统一部署与页面验收由平台总验收记录维护。
