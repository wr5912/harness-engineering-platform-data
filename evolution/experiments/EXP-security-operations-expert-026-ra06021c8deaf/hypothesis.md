# 巡检评测 MCP 与当前业务配置对齐

## 固定来源与范围

完整继承 v24（EXP-security-operations-expert-024-rad80a907c628），固定父版 git:c5d0a2f2904233cd61e42d5796892fcd00311261。保留现行业务实例 sec-ops-v024-qwen35-4b-open、v24、并行 v25 及所有历史 Run；不合并与本次巡检连接无关的并行行为。父版及继承链见 [change.yaml](change.yaml)。

业务连接配置以本次 platform_mcp configuration 回读为准，revision=658cf3e217041237bb5c494d572818300765721b0ae98dfb310db6f7bb5ffa20。只对齐七个巡检用例需要的 inspection、sec-ops 和 inspection-readonly 分组；不复制实例身份、签名、凭据、运行 HOME 或 Session，不新增无关服务。

## 可证伪假设与最小变更

原 API 评测独立实例使用旧 MCP seed；将 inspection 改为 http://172.16.138.228:26000/mcp/inspection，sec-ops 改为 http://172.16.138.228:50500/mcp/security-operations-expert，保持两服务已启用、空 headers 及原工具模式；inspection-readonly 对齐平台现有 list_executable_inspections、get_inspection_result、start_inspection 三项。组名不代表实际只读性，start_inspection 会启动真实巡检；是否调用仍遵循上游范围展示和用户确认合同，不放宽业务守卫或标准答案。

假设是新运行可以发现巡检工具并取得真实目录调用回执；若仍 disconnected，则地址对齐不足，不能据此断言网络或全部运行环境已修复。业务实例走受控业务通道，而独立评测沿用原生 MCP 客户端，二者不是完全等价的运行环境。

## 固定比较与验收

选择原 U-INS-001 至 U-INS-007，保持 Agent evaluation.md 的输入及预期不变，目标模型 qwen / Qwen3.5-4B，executor=api、review=none，保存全新 Run。历史比较起点为 run-a331f9ed-8dce-4b18-82a5-12ca948ab2c6；外部服务和业务平台配置已改变，比较仅作描述性观察，不把通过数变化单独归因为 Harness。

分别检查资产保存回读、静态校验、实际模型路由、巡检工具注册与调用回执、各 Case 业务效果及 judge 可判定性。judge-output-not-json 与业务失败分别记录，定时创建不能替代到期执行证据。保持原预期，不为通过改写 Case。

## 停止条件与已知限制

缺少可用模型路由、运行环境必填项、MCP 连接失败或接口不支持时，记录具体缺口，不绕过平台入口或覆盖全局并行改动。当前回读全局业务默认已为 local / Qwen3.8-27B，与既有目标实例的 qwen / Qwen3.5-4B 不同；不得静默覆盖全局默认，评测必须核实实际路由后才可视作目标比较。
