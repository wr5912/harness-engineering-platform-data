# XX设备策略模板 Mock 实施与验证

## 当前状态与范围

目标为现有16B Candidate `EXP-security-operations-expert-027-f-r92ea65e6316b`，所属智能体为 `security-operations-expert`。本任务与已收尾的固定指令下发分开，新增策略模板专用的一读一写两工具；不修改旧指令映射、工具实现或Guard权限。

当前状态：基础实现及一条模型原生确认Mock闭环已完成。16项限定接口/SDK/装配检查通过；实际模型完成一次模板读取、普通助手草案、原生确认、一次五字段写入与模拟成功回复。三个map仍为各一项的临时占位，具体字段和真实接口后续由用户确定。不处理并发、模板版本、多网卡、后台新建/合并/应用、复杂回执或设备效果验证。不提交推送Git，不重载原业务实例；本次仅启动并停止专属验证实例，HOME和证据保留。

## 实施步骤

1. 增加独立策略Mock服务及三map占位数据。读接口提供主机身份与模板；写接口只接收本次修改的实体并返回模拟下发成功。
2. 增加策略模板Skill，接入已有官方MCP Client及原生提问。自然语言识别与改值由Skill承担，参数格式以工具Schema为准；不把策略项转换成11项固定指令，不新增工具允许名单或确认控制器。
3. 完成读取 → 定位目标字段 → 展示修改 → 原生确认 → 写入五字段 → 模拟成功的基础闭环；取消不写入。
4. 运行限定接口/SDK检查和一条模型原生交互正向验证，保存实际证据后收尾。不扩展后台业务或复杂状态测试。

## 当前事实源

- [策略工具实现与Schema](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/xx-device-policy-mock.mjs)：读写工具、参数及临时配置项含义的唯一实现来源。
- [模拟设备与三map模板](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/xx-device-policy-fixtures.json)：开发占位数据，不作为现场真实模板。
- [策略配置Skill](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/workspace/.agents/skills/xx-device-policy/SKILL.md)：基础交互及调用流程。
- [主角色装配](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/presets/security-operations-expert/agent.cordis.yml)：独立Mock来源，共用既有原生提问插件。

临时写入采用增量：两个主机字段原样来自本次读取，三个map仅目标map填本次变更项，其余为空对象。该临时约定仅用于基础闭环，最终格式由用户后续确定。写接口只接收参数，不模拟后台模板创建或设备应用。

## 验证结果

- [限定接口/SDK/装配检查](../../../../.local/artifacts/xx-device-policy-basic-20261107-tests.txt)：16项通过、0失败、0跳过；包括策略两工具、三个map读取、增量传参、模拟成功、实际stdio与两种官方SDK协商、原指令装配保留。原生测试客户端通过语法检查。
- [真实模型原生交互证据](../../../../.local/artifacts/xx-device-policy-native-20261107/confirm/native-policy-session-80ded4b6-7064-4a18-a107-19a23b61cdd7.jsonl)：Session `session-13f62916-7ddc-4c62-aa43-5adb7bc5d97c`，实际模型 `xiaomi-token-plan-cn / mimo-v2.6-flash`。一次读取取得主机与模板；普通助手草案展示无线网卡禁用到启用；真实原生问题由官方公开客户端模拟选择确认；模型在结构化答复后一次提交五字段实体，仅目标map含修改，其余两个map为空；取得成功回执并回复模拟下发成功。未调用固定指令或旧SOC写接口。
- 原生答案是测试输入，证据保留 `humanApproval:false`，不是人工点击验收；[客户端源码](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/xx-device-policy-native-client.mjs)只使用公开Session/原生问答接口，不直接调用MCP写入或伪造工具结果。
- 使用已登记专属实例 `xx-device-mock-16b` 正常启动验证后已停止，HOME保留；原业务实例未动。启动时整体装载回执仍为unknown，本次真实工具调用证明新策略工具与Skill在该会话可用，不据此宣称所有旧SOC能力装载通过。
- 共享业务用例已通过平台新增并回读 `U-POL-023`；本次正向验证使用上述真实原生客户端，不将普通聊天文本冒充原生选择，也未重复尝试已知不能提交原生答案的评测路径。无真实后台、真实设备或浏览器人工点击验证；本阶段按用户要求不继续扩展。
