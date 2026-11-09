# XX设备真实MCP接入交接说明

## 归属与用途

本说明是 `security-operations-expert` 的跨组合实施交接文档，统一记录 f237 的 XX 固定指令与策略模板从开发Mock切换到真实上游 MCP 的边界、输入资料和受控接入步骤。文档归属 `agents/security-operations-expert/docs/plans/`；两个组合自身的流程、Schema、映射和实现仍以各自包内资产为唯一事实源，不在本文复制维护。

目标 Candidate：`EXP-security-operations-expert-027-f-r5efdc136f237`。16B `EXP-security-operations-expert-027-f-r92ea65e6316b` 不得修改。

## 目标架构

```text
用户输入
  -> f237 Skill 识别意图与原生确认
  -> MCP 分组 xx-device-acceptance
  -> xx_device_command 或 xx_device_policy 组合
  -> 原生 LFX 固定流程
  -> 四个真实上游 MCP 基础工具
  -> XX设备真实服务
```

模型侧仍只暴露两个组合工具：

- `xx_device_command`：固定指令查询、装配、确认和一次下发。
- `xx_device_policy`：模板读取、差异装配、确认和一次模板写入。

四个真实上游工具是组合内部依赖，不把固定链重新交给模型逐步串接，不恢复旧 Platform/Workbench 中间服务、确认控制器或本地业务台账。

## 当前已完成与保留范围

- 当前两个组合的 LFX 流程和 f237 Skill 路由已经按新架构完成并有Mock原生会话证据；历史Run和Session制品保持原样。
- 当前活跃组合包已切换为真实连接接入骨架：正式执行路径不再导入fixture或返回固定Mock回执；真实serverId和四个工具名仍待内网提供。用户确认的指令映射和策略字段Schema保留。
- 当前 `xx-device-acceptance` 分组只应暴露两个组合工具，不应把四个真实底层工具直接交给模型。
- 真实服务未登记前，不得发布、绑定为真实生产能力或声称可执行；连接缺失时组合应明确停止。

## 内网需要提供的资料

### 四个真实MCP基础工具

| 逻辑能力 | 需要提供的事实 |
| --- | --- |
| 查询主机 | 完整工具名、输入Schema、返回Schema、错误合同、目标身份字段 |
| 下发固定指令 | 完整工具名、写入参数、成功/失败回执、未知状态查询能力 |
| 读取策略模板 | 完整工具名、hostip参数、完整三Map返回合同 |
| 写入策略模板 | 完整工具名、完整实体或delta合同、回执和错误语义 |

同时需要真实服务的 `serverId`、传输类型、`specUrl`或受支持的MCP连接入口、鉴权方式和测试环境权限。不能只给四个字符串名称。

### 真实业务资料

- 11项真实 `commandid` 到动作名称映射；ID按字符串原样保留。
- 设备控制、`login`、`net`三Map的真实字段、类型、枚举和含义。
- `hostid`、`hostip`的读取与写入绑定规则。
- 策略写入是完整模板还是delta；未改Map是否必须显式传 `{}`。
- 一份脱敏读取结果、一份脱敏preview或写入请求示例及真实回执示例。
- 可用于一次受控写入和独立效果核对的测试设备；不得直接使用生产核心设备。

## 组合资产切换方式

### 指令组合

包内 [指令映射](../../../../mcp/compositions/xx-device-command/assets/command-map.json) 保留并替换为真实ID；[流程](../../../../mcp/compositions/xx-device-command/flow.json)保留 `input -> lookup -> assemble -> stop -> preview/apply` 控制边界；[实现](../../../../mcp/compositions/xx-device-command/src/index.ts)从本地fixture查询和固定Mock回执改为真实连接适配。

真实实现必须：

1. 用真实查主机工具取得并校验 `hostid`、`hostip`。
2. 用包内映射校验 `commandid`，不转数字、不强制RFC UUID。
3. 只向写工具传真实合同需要的 `hostid`、`hostip`、`commandid`。
4. 不向写工具传 `stop`、中文动作名、确认字段或平台 `run_id`。
5. 真实写结果未知时先按真实合同查询，不重放。

### 策略组合

包内 [策略Schema](../../../../mcp/compositions/xx-device-policy/assets/policy-schema.json)保留并按真实合同更新；[流程](../../../../mcp/compositions/xx-device-policy/flow.json)保留 `input -> read -> assemble -> stop -> preview/apply`；[实现](../../../../mcp/compositions/xx-device-policy/src/index.ts)从fixture读取和固定Mock回执改为真实读写适配。

真实实现必须：

1. 读取真实完整模板，并以本次读取的 `hostid`、`hostip`作为写入身份。
2. 依Schema校验三个Map、字段拼写、类型和枚举。
3. 只组装本次授权修改的字段；完整模板或delta形式以真实写合同为准。
4. `preview`不调用真实写工具；`apply`在原生结构化确认后只调用一次。
5. 返回真实回执并区分“接口受理”“业务成功”和“设备效果已核对”；没有独立效果证据时不得声称设备已生效。

## MCP管理与绑定

### 服务列表

将真实XX服务登记为独立MCP server，保留真实 `serverId`。连接类型和工具发现以平台公开合同为准；不能直接编辑运行平台内部配置或凭空假定任意MCP HTTP都能被组合执行器调用。

当前公共 `createSoc`适配要求可发现的OpenAPI连接和工具合同；如果内网只提供其他传输形式，先核对平台公开连接能力，不能用私有执行器或Shell绕过。

### 工具分组

`xx-device-acceptance` 分组继续只包含：

```text
platform-compositions:
  xx_device_command
  xx_device_policy
```

真实四个底层工具是否需要另设内部来源分组，取决于组合执行器的公开连接合同；不要因为模型需要两个组合就把四个底层工具加入模型可见分组。分组URL由分组ID生成：

```text
http://172.16.138.228:18120/hep/mcp/groups/xx-device-acceptance/v2
```

### 组合连接与实例绑定

更新两个组合草稿的 `connections`，将组合内部别名绑定到真实 `serverId`；`connectionId`仍表示组合发布服务，不等于真实上游服务。保存草稿后依次执行：

1. 回读当前组合定义和实现摘要。
2. `dryRunComposition`验证流程、Schema和连接声明。
3. 在专用f237实例上 `bindCompositionDrafts`冻结草稿。
4. 重载实例并回读实际工具目录。
5. 先做真实读取和preview，再在受控测试设备上执行一次apply。
6. 回读原Run、真实回执和独立效果证据。

不发布真实版本，直到四个工具合同、连接、读写和使用方原生会话全部通过。

## 验收顺序

1. 静态：组合源码无正式Mock执行路径，映射和Schema可解析，流程节点端口一致。
2. 连接：真实server登记、工具发现、Schema和鉴权可用。
3. 只读：指令查主机、策略读模板、目标身份和完整返回核对。
4. 草案：preview参数、差异和写实体核对，不产生写请求。
5. 交互：普通草案消息后使用DSH原生结构化确认；取消、自由输入和同名普通文字不触发写入。
6. 写入：测试设备一次apply，核对真实回执；未知状态先查询，不自动重发。
7. 效果：仅在真实服务提供独立读取或效果查询时核对设备状态，否则标记未验证。
8. 使用方：f237模型会话调用两个组合工具，不直接调用四个底层工具。

## 当前明确缺口

- 四个真实工具名称、serverId、连接传输和输入输出Schema尚未提供。
- 真实指令映射和三Map真实字段尚未替换进组合包。
- 当前组合草稿尚未发布；后续变更需重新保存、dry、绑定和验证。
- 历史Mock证据只证明固定流程和交互，不证明真实内网接口或真实设备效果；真实骨架静态检查通过也不等于真实连接已装载。
