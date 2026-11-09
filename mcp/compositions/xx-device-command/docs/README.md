# XX设备固定指令（真实接口接入骨架）

保留明确主机IP与真实指令ID映射的固定链：真实查主机、核对映射、生成本地草案，原生确认后调用真实写工具一次。真实连接、工具名和回执合同尚未配置时明确停止，不回退本地Mock；不维护本地业务任务或台账。

- [原生流程](../flow.json)
- [真实连接工厂与参数校验](../src/index.ts)
- [唯一指令映射](../assets/command-map.json)
- [真实工具合同占位](../assets/real-tool-contract.json)
- [历史离线夹具（不进入正式执行路径）](../assets/fixtures.json)
- [真实骨架静态检查](../tests/基础工厂测试.mjs)
