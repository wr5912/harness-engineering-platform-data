# XX设备功能：f237 Skill＋MCP组合适配

## 当前目标与状态

用户已将唯一后续修改目标切换为 `EXP-security-operations-expert-027-f-r5efdc136f237`（f237，周杨分支）。16B停止修改；其中策略三Map字段升级在切换时中止，不作为完成版本。当前按f237已有的Skill＋原生LFX组合架构适配，不恢复旧Platform中间服务、签名确认器或本地业务台账。

**历史Mock阶段的四条基础模型＋原生交互＋LFX流程已通过；当前组合已切换为真实上游接入骨架。** 历史测试覆盖重启指令、设备控制USB只读、login.alogin与net.control，每条均有普通草案、一次原生结构化确认及一次模拟提交；历史证据保持不改。当前正式执行路径不再导入fixture或返回固定Mock回执，真实serverId、工具名和Schema待内网提供。两草稿未发布，16B未修改，真实设备未调用。

## 职责与流程

- Skill理解用户意图、按真实工具Schema选字段和值、表达草案并使用既有DSH原生提问；不在模型中手工重跑固定接口链。
- 两个XX组合分别承担固定读取、身份核对、映射/字段校验、实体组装、停止分支和一次提交。它们不是现有AISOC `policy_change` / `emergency_action` 的另一种参数；不套用ACL/ROUTE、actionKey、原任务、签名或审批合同。
- `preview`是读取后的本地请求/差异草案，不是上游真实渲染、预检或保存草稿。Skill展示后取得本次原生结构化确认，再以相同意图调用`apply`；普通同名聊天、取消或自由输入不作为该原生答案。
- 模型到组合走真实MCP分组入口及原生LFX执行；组合当前已改为真实上游连接适配骨架，未配置真实连接时明确停止，不访问本地fixture或回退Mock。两层分别判定，不存在额外中间服务或跨运行业务台账。真实连接类型、参数包装、授权及回执仍须按内网合同核对。

## 当前资产入口与唯一事实源

- [f237应急Skill](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r5efdc136f237/candidate/dsh/workspace/.agents/skills/emergency-action/SKILL.md)：XX固定指令分支在本包reference，AISOC原分支保留。
- [f237模板Skill](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r5efdc136f237/candidate/dsh/workspace/.agents/skills/xx-policy-template/SKILL.md)：设备控制、login、net模板请求；原访问策略Skill只作公开入口交接。
- [XX指令组合](../../../../mcp/compositions/xx-device-command/docs/README.md)：定义、flow、真实连接骨架、11项ID→中文名唯一映射和真实工具合同占位均属本包。写请求仍为hostid、hostip、commandid三个字符串，不能新增内部动作键或向上游传stop。
- [XX策略组合](../../../../mcp/compositions/xx-device-policy/docs/README.md)：定义、flow、真实连接骨架及[三Map字段Schema](../../../../mcp/compositions/xx-device-policy/assets/policy-schema.json)属本包。五字段实体为hostid、hostip、设备控制、login、net；Map内值均为字符串，未修改Map传空对象。第一Map使用用户确认的中文名称；osuer、proctocol原拼写保留。login编号含义和时间单位未提供，不推断。
- [主角色装配](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r5efdc136f237/candidate/dsh/presets/security-operations-expert/agent.cordis.yml)：复用官方原生提问插件，不修改其实现。主会话MCP接入沿原生真实注册目录，不追加XX专用代码名单；原有子角色与禁止接口边界保留。源配置、装载及真实权限仍需实际核对，不能凭Schema或源码宣称可用。

组合独有事实只在各包内维护；Skill不复制字段或映射表，不依赖兄弟组合私有文件。后台模板新建、合并、持久化应用、并发版本、复杂回执和设备效果验证仍不在本阶段范围。真实接口未配置时不执行；真实回执不自动等同设备效果；未知写入不自动重放。

## 历史验证与真实接入下一步

- [限定复测](../../../../.local/artifacts/xx-f237-skill-composition-20261107-focused.txt)：29项通过、0失败、0跳过。覆盖两个组合的工厂/纯函数、Map及字符串合同、只预览不写、模拟一次提交、静态图形态、主会话动态绑定、子角色及现有禁用边界。它不是官方LFX或模型集成通过。
- [首轮结果](../../../../.local/artifacts/xx-f237-skill-composition-20261107-unit.txt)：31项中29通过、2失败。新增目录识别测试暴露未知MCP名被旧canonical helper转为哨兵，已在f237适配层修复且复测通过；另一项是既有“威胁子Agent同Session只允许一次”测试与当前源码不符。通过平台固定来源 `git:240a196bd28b91203add24bcdf730f04fe5ba500` 回读证实子Guard源码原已无此计数，本任务未修改子Guard或该测试；保留失败，不将其记为通过。
- [早期dry错误](../../../../.local/artifacts/xx-f237-dry-results-20261107.json)保持原貌；随后刷新真实目录，两个workflow已登记并通过公开dry，再执行和冻结，未用Shell构建或内部执行器绕过。管理入口的指令与设备控制preview/apply也已分别成功；它们不是下列模型会话的替代证据。
- [本轮机器核验汇总](../../../../.local/artifacts/xx-f237-native-20261107/native-verification.json)从四份最终原生Session及真实工具结果生成，保存全部八个组合Run ID、实际模型、固定实现摘要及原始制品定位。模型为xiaomi-token-plan-cn/mimo-v2.6-flash；每条恰两次目标组合调用（preview/apply）、一条普通草案和一次原生问题，确认前零写，确认后一次模拟写。上游实体、字符串值、目标身份及preview/apply一致性均核对；不是主线程伪造业务回包。

| 最终基本场景 | 结果与原始会话核验 |
| --- | --- |
| XX重启指令 | [通过](../../../../.local/artifacts/xx-f237-native-20261107/command-fixed/native-composition-session-d0f01eeb-29bf-48f8-817b-6d761fe5514e.summary.json) |
| 设备控制：USB存储设备只读 | [通过](../../../../.local/artifacts/xx-f237-native-20261107/device-final/native-composition-session-141d4606-ae99-4881-a314-911235dc0b14.summary.json) |
| login：alogin字符串1 | [通过](../../../../.local/artifacts/xx-f237-native-20261107/login-fixed/native-composition-session-e4fb7353-48a3-4611-b98c-80da4f247605.summary.json) |
| net：control字符串1 | [通过](../../../../.local/artifacts/xx-f237-native-20261107/net-final/native-composition-session-c74e2c1a-7b5c-4cb1-adf4-573551db93a3.summary.json) |

本轮共9个独立模型Session：最终4条通过、另外2条中间验证通过、3条前置失败。失败记录分别为[设备Map输入](../../../../.local/artifacts/xx-f237-native-20261107/device/native-composition-session-83c07733-c6d1-4c44-a88a-ff7a09939be1.summary.json)、[指令未单独展示普通草案](../../../../.local/artifacts/xx-f237-native-20261107/command/native-composition-session-73ffbedf-e07b-4493-99bd-b2c003f82982.summary.json)、[login遗漏必填Map](../../../../.local/artifacts/xx-f237-native-20261107/login/native-composition-session-450fee22-61ec-4840-a9fc-c93becee60cd.summary.json)。三次均在apply前停止，未重放未知写入或改写失败。已明确指令先普通正文展示草案、再原生提问；模板调用须逐层按实际inputSchema填写required，不省略必填空Map。修复后仅重载专属f237实例、重新冻结实际来源，并在新Session复测及必要回归。

完整业务口径仍在[Agent验收用例](../../evaluation.md)维护。上述net测试只覆盖control单字段基础流程，不认领U-POL-023完整网络规则用例通过，也未重跑全部旧SOC业务。普通同名聊天输入不替代原生结构化答案。

### 当前限制

- 仅开发Mock及未发布的实例绑定草稿；专属实例使用anonymous/development，不能据此宣称authenticated权限或人工UI验收通过。客户端仅模拟自己的原生问题答案，humanApproval:false。
- 包内稀疏delta补齐优化已保存并通过9项策略工厂检查，但当前运行目录外层Schema仍要求三个Map必填，省略Map会在进入组合前被拒绝。本轮严格按现场Schema完整传入；不将该源码优化宣称为已生效的对外能力。后续须通过受支持的扩展装载同步Schema后再单独核对。
- login编号含义及单位未补猜；真实上游连接、设备效果、后台模板持久应用、全字段端到端及既有子Guard计数测试问题未纳入本期完成结论。

## 旧16B证据的保留范围

原先16B工作只作历史对照，不代表f237已经继承或验证：

- 指令最终参数/绑定收敛检查：[核心45项](../../../../.local/artifacts/xx-device-control-mcp-bindings-closeout-20261107-tests.txt)及[直接关联部门72项](../../../../.local/artifacts/xx-device-control-mcp-bindings-department-closeout-20261107-tests.txt)通过；为接口/SDK/角色及本地模拟证据，非当前f237模型或内网验收。
- 旧模型协议证据：[确认后一次写入](../../../../.local/artifacts/xx-device-native-20261107/confirm/native-session-efe3b000-42d9-43a2-adf3-98239b76df7a.jsonl)、[取消零写入](../../../../.local/artifacts/xx-device-native-20261107/cancel/native-session-c7648ed0-5f0c-476d-80d5-531532177f35.jsonl)、[自由输入零写入](../../../../.local/artifacts/xx-device-native-20261107/free-input/native-session-c3527e91-dc52-4403-9c81-aa0849a7dde9.jsonl)及[成功后普通文字不重发](../../../../.local/artifacts/xx-device-native-20261107/submitted-repeat/recovered-duplicate-verification.json)。对应调整前合同，自动答案标记humanApproval:false，不是人工点击或真人审批；失败与无法判定的历史Run保留原貌。
- 旧策略占位版：[16项基础检查](../../../../.local/artifacts/xx-device-policy-basic-20261107-tests.txt)和[一次模型原生确认Mock闭环](../../../../.local/artifacts/xx-device-policy-native-20261107/confirm/native-policy-session-80ded4b6-7064-4a18-a107-19a23b61cdd7.jsonl)通过；仅map1.wireless等旧占位结构，不代替本次三Map或新组合验收。

旧专用16B实例在验证后停止并保留HOME，用户切换后不再启动或修改。原始Run、Session制品与源码保留，过时的双份实施说明由本页收敛替代。
