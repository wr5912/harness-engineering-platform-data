# XX 设备策略模板（真实接口接入骨架）

固定链由真实模板读取、delta校验、差异组装和一次真实写入组成；真实连接、工具名和回执合同尚未配置时明确停止，不回退本地Mock，不建立本地业务台账。公开工具名保持 `xx_device_policy`。

`preview`仅返回真实读取后的本地参数/差异草案；`apply`在原生确认后调用真实写工具一次。未改Map、地址、端口和字段拼写按真实Schema处理。

- [原生执行流程与画布](../flow.json)
- [真实连接工厂、公开输入Schema与停点](../src/index.ts)
- [字段、取值与含义唯一来源](../assets/policy-schema.json)
- [真实工具合同占位](../assets/real-tool-contract.json)
- [历史离线模板（不进入正式执行路径）](../assets/fixtures.json)
- [真实骨架静态检查](../tests/基础工厂测试.mjs)

测试材料不代表已执行；原生 LFX 装载、运行及业务实例验收须分别取得平台回执。
