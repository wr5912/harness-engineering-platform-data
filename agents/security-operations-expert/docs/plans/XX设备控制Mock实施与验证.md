# XX设备控制 Mock 实施与验证

## 范围与状态

实施对象为 `EXP-security-operations-expert-027-f-r92ea65e6316b`（16B）的现有特性 Candidate，按用户授权继续开发，不提交或推送 Git，不主动重载原有业务实例。

本期只有开发模拟服务的两个外部接口：按 IP 查询主机、提交设备控制指令。新旧服务选择、策略模板修改和真实设备操作不在范围内。映射只保存 ID 到中文名称，不增加内部动作键。

**任务状态已固定：本期开发收尾完成，待内网真实接口联调。源码已保存至16B：三小写字符串写字段、11项用户指定UUID样式映射、共同流程按MCP来源调用、新工具沿当前Agent原生绑定目录接入，不再追加固定工具名名单。最终核心45项及直接关联部门72项回归均通过，合计117项、0失败、0跳过；这是接口/SDK/角色与本地模拟验证，不是当前最终源码的模型端到端、人工UI、真实内网或生产验收。旧原生交互证据对应调整前合同并保留边界。专用验证实例仍停止，未操作真实设备、未重载原业务实例、未提交或推送Git。当前任务不再追加开发或测试，后续按用户指定的新任务继续。**

## 当前合同调整（2026-11-07）

- 流程复用：查询、草案展示、DSH原生确认、提交及回执解释按同一流程处理，只按已选来源使用对应MCP工具。SOC自身的prepare、草案号、签名及提交合同保留，不把这些业务专用接口当成XX必须调用的通用步骤。
- 主Agent新增MCP工具现改为复用实际绑定的原生可见注册目录和原生权限，不再通过XX固定工具名或根角色静态allow表接入；根可见性只保留旧禁用/子专用项的原生deny，子角色继续原有allow。原有SOC专用确认轮、签名、永久禁用及真实别名匹配优先保留；其余已在当前Agent原生目录注册的MCP不因名字未列旧表而被本Guard额外拒绝，未注册工具仍拒绝，也不越过其他原生权限或Guard。MCP管理启用并绑定来源、实际发现工具后，不必在本Guard再次追加新工具名；新增工具同组放在policy-configuration也不代表套用旧SOC策略合同。ask本体未修改、不新增确认控制器、不另设来源互斥。匿名模式仍按原有逻辑不安装此Guard。本次仅保存Candidate，未重载原业务实例；运行旧代码/旧scope限制的会话不能冒称已生效，需正常装载新版并以实际目录回执核对。
- 写字段及类型以[服务Schema与执行校验](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/xx-device-control-mock.mjs#L65-L107)为唯一实现来源：三个小写字段、全部字符串；ID支持UUID样式并原样匹配，不转数字、不更改大小写或前导零，也不强制UUID版本。查询合同未改。
- [唯一映射](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/xx-device-command-map.json)仍只维护11项ID到名称，已按用户明确指定的UUID样式及原动作顺序，将开发ID统一替换为后缀a1至a11；a10/a11按字符串原样保留，不额外限定标准UUID长度。此为用户指定的开发对应表，不冒称现场真实映射；现场取得真实对应关系后仍只替换各项ID，重建对应MCP服务并重新发现目录后生效。[整表替换后的相关回归](../../../../.local/artifacts/xx-device-control-uuid-map-20261107-tests.txt)33项通过、0失败、0跳过，官方SDK已从实际新表读取ID完成Mock调用。
- [本次相关测试原始结果](../../../../.local/artifacts/xx-device-control-string-contract-20261107-tests.txt)：33项通过、0失败、0跳过，包含UUID样式/前导零原样传递、拒绝数字与旧camelCase写字段、主机配对、11项指令、回执及重放、两种官方SDK协商、来源共存和旧确认保护；原生交互测试客户端同步新合同并通过语法检查。未安装依赖、未新增真实设备调用、未执行浏览器或全旧SOC端到端回归。
- 最终接入收敛回归：[核心45项](../../../../.local/artifacts/xx-device-control-mcp-bindings-closeout-20261107-tests.txt)与[直接关联部门72项](../../../../.local/artifacts/xx-device-control-mcp-bindings-department-closeout-20261107-tests.txt)全部通过。包含policy-configuration组下两新工具、任意新group的a/b、运行后新增/移除注册项、未注册拒绝、旧SOC真实别名及确认保护、原生root deny与child allow边界。两份部门测试仅同步根可见性由固定allow改为保留原生目录的断言，原业务、挂载等待/重试和子角色条件保留。当前目录可用性的测试使用公开API合同下的本地目录夹具，不冒称真实MCP管理配置及目标实例已经装载验证；未扩展浏览器、模型或真实设备测试。
- 共享用例仅更新U-EMG-014的此次写合同与来源共存口径并已回读，其余XX用例及旧SOC用例未改，历史Run保持原貌。

## 实施步骤

以下表格中的目标模型与原生交互结果属于字段调整前的历史验证；当前新合同与MCP接入收敛的证据范围以上述接口相关回归为准，不改写历史运行。

| 阶段 | 内容 | 目前取得的证据 |
| --- | --- | --- |
| 1 | 维护11项映射及自然语言识别规则 | 配置已保存、解析校验通过；动作目录由同一配置生成 |
| 2 | Mock 读接口及查询分支 | 真实 stdio MCP 初始化、发现和查询测试通过 |
| 3 | 查询后准备和展示草案 | 已在真实模型会话中查询并展示正确设备与动作，草案、无设备、查询失败三条路径通过 |
| 4 | 原生确认与取消 | 官方客户端模拟原生答案，已验证确认后一次写入、取消与自由输入零写入；没有增加业务确认控制器 |
| 5 | Mock 写接口及回执 | 11项指令、参数核对、回执及传输重放测试通过；目标模型原生确认后实际三参数提交并收到Mock SUCCESS |
| 6 | 装载与业务验证 | 基础3条模型路径及4项原生协议交互核对通过；本地46项45通过、1项既有测试不一致单列；历史API/browser无法判定记录保留，不冒充人工UI验收 |

## 唯一资产与入口

以下均属于同一 Candidate，不在本方案复制映射或接口 Schema：

- [ID—名称映射](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/xx-device-command-map.json)
- [开发模拟数据](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/xx-device-control-fixtures.json)
- [Mock MCP 服务及接口定义](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/xx-device-control-mock.mjs)
- [业务 Skill：识别、草案、确认、取消与回执](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/workspace/.agents/skills/xx-device-control/SKILL.md)
- [主 Preset 装配](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/presets/security-operations-expert/agent.cordis.yml)
- [协议与接口测试](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/xx-device-control-mock.test.mjs)
- [接线检查](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/xx-device-control-wiring.test.mjs)
- [官方 SDK 兼容性测试](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/xx-device-control-sdk.test.mjs)

业务验收口径继续在 [evaluation.md](../../evaluation.md) 维护，本期已新增 `U-EMG-011` 至 `U-EMG-015`，本方案不复制其输入和预期。

## 验证记录与限制

- [首轮完整本地测试原始日志](../../../../.local/artifacts/xx-device-control-20261106-tests.txt)：21项通过，包含官方 SDK 两种协商方式；不代表目标实例已经装载或业务通过。
- [首轮平台 Run 报告](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-84e6e84c-d8e6-4707-bd86-a9201b4f328e/report.md)：来源封存核对匹配，但在 `target-session-create` 失败，未生成模型回答和工具轨迹，结论为 `inconclusive`。
- [装载错误回执](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-84e6e84c-d8e6-4707-bd86-a9201b4f328e/evidence/U-EMG-011/checks.json)：新增 MCP 和原生提问条目均报告 `never started`；该诊断本身不足以确定根因。
- [修复后本地复测日志](../../../../.local/artifacts/xx-device-control-20261106-after-fixes.txt)：22项通过，新增非法JSON-RPC请求ID零写入检查，并复测官方SDK、接口与装配引用。
- 装载修复：两条新插件引用改为锁定镜像内官方模块的绝对入口，未增加新依赖、确认控制器或工具过滤层。另已补齐受理状态文案及精确单选、无自由输入的确认规则。
- [第二轮平台 Run 报告](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-f2fd3a39-5344-41a1-bb5a-c9eb9683e418/report.md)：来源封存核对匹配，Preset已ready并产生真实模型调用，但工具目录未暴露新的Mock读写能力，未查询主机、未生成草案，用例判为失败。取消不写、确认后写等交互尚未被该用例覆盖。
- [第二轮装载检查](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-f2fd3a39-5344-41a1-bb5a-c9eb9683e418/evidence/U-EMG-011/checks.json)与[实际工具调用](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-f2fd3a39-5344-41a1-bb5a-c9eb9683e418/evidence/U-EMG-011/tools.jsonl)分别支持装载状态及未调用Mock接口的观察，不把资源列表为空冒充工具列表查询。
- 本期平台评测使用同一显式 `mcp_fixture` 临时停用旧的8个远端 MCP 连接，只投影隔离评测，不修改原连接配置；各轮实例是否已停止按其实际回执分别记录。
- 曾通过平台创建专用开发验证实例 `xx-device-mock-16b`，未操作原有业务实例。启动返回运行状态，但加载回执仍unknown，日志有既有签名确认配置未就绪警告，不能当作已装载通过。前一轮已停止并保留HOME；2026-11-07按原登记恢复此专用实例，经过统一网关、无需登录的开发模式完成原生协议功能测试，保持平台绑定的 `xiaomi-token-plan-cn / mimo-v2.6-flash / off`，不读取实例凭据、不改认证设置。测试后再次通过平台停止该专用实例并保留HOME，未重载或停止原有业务实例。既有签名配置警告与整体装载unknown未被伪装成全部插件就绪；本期功能的实际调用证据另行保存。

用户已明确授权补齐16B既有业务角色配置，仅纳入本期两个Mock接口与原生提问，不放宽旧SOC提交、审批等限制、不增加权限层。该增量已写入[原有Guard](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/security-operations-guard.mjs)及[角色矩阵](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/role-tool-matrix.yaml)，[新增角色测试](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/xx-device-control-role-guard.test.mjs)7项通过。官方stdio工具不经过旧HTTP manager的别名表，仅本期两项固定已装配名称直接识别，其余来源仍保留原身份校验和未知工具拒绝。

[补齐后的安全回归原始日志](../../../../.local/artifacts/xx-device-control-20261106-role-regression.txt)合计46项，45项通过，1项既有子Agent测试失败：预期同一Session第二次研判调用被拒，但当前子Guard没有这项计数逻辑。该[子Guard源码](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/security-operations-child-guard.mjs)SHA-256与角色增量前的[第二轮封存清单](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-f2fd3a39-5344-41a1-bb5a-c9eb9683e418/inputs.lock.json#L1446-L1450)一致，本轮未修改子Guard或对应测试，不把该项记为通过，也不擅自改变其他业务行为。

[第三轮平台Run](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-025403a7-6036-40ae-aed4-0080fa61123d/report.md)已完成，`U-EMG-011`、`U-EMG-012`、`U-EMG-013`三项自动判定通过；已回读草案的直接查询回执与助手输出，证实实际调用了Mock读接口并展示正确设备和动作。其余两项分别返回正常空结果及`QUERY_FAILED`，不能互相替代。该轮使用原版本绑定模型，不是独立模型或人工复核，也不证明确认/取消完成。

随后收紧Mock身份映射：两项固定stdio名称排除在旧HTTP别名表之外，并新增HTTP别名冒充拒绝测试，角色专项测试现7项通过。已保存并回读原生确认、原生取消用例 `U-EMG-014`、`U-EMG-015`，与前三项在最新源码Run `run-d50030c1-abde-44c9-9a91-aafcc220fca4`中重新验证。确认或取消必须取得原生结构化答案，不能把普通聊天文字或仅仅未写入算作交互通过。

[第四轮API评测报告](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-d50030c1-abde-44c9-9a91-aafcc220fca4/report.md)已封存，当前Candidate来源匹配：3项通过、2项无法判定。确认用例已完成查询、正常助手消息草案和原生提问调用，但没有原生答案；取消用例被标记跳过、没有验收结果。因API文本多轮不能替代原生选项答案，已取消等待并核实评测实例停止；这是停止研究运行，不是业务取消测试通过。

[原生提问调用证据](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-d50030c1-abde-44c9-9a91-aafcc220fca4/evidence/U-EMG-014/tools.jsonl#L3-L5)和[草案消息证据](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-d50030c1-abde-44c9-9a91-aafcc220fca4/evidence/U-EMG-014/trace.jsonl#L28)证明本次目标模型实际走到原生确认，不证明用户已经答复或写入已经发生。当前API评测公开合同没有已核实的结构化答题入口，不伪造参数、不改Skill接受聊天确认，也不开发平台程序绕过。

[第五轮浏览器评测报告](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/runs/run-8a7b33fc-4cda-4bea-bb33-58e396086fe1/report.md)已于2026-11-06 23:55（Asia/Shanghai）结束，两个用例均执行错误、无法判定，0项通过；实例已停止，不是持续后台验证中。已核对的现有浏览器驱动仅向普通聊天输入框发文本并等待轮次稳定，没有原生选项答题分支，因此不能取得本次要求的结构化确认/取消答案。宿主未发现现成公开浏览器测试依赖，没有安装新依赖或另建驱动。2026-11-07重新查询状态后已更新本记录；任务仍处在第6阶段，继续推进最后两项原生交互验证，不将其标为完成。

## 原生协议功能验证补充（2026-11-07）

现已核对并实测官方Node客户端及公开Remote贡献可用。专用客户端通过正常匿名统一网关建立自己的会话，以公开 `user-questions/request` waterfall 返回测试选项，原生工具自行生成真实答案结果，再由目标模型决定是否调用Mock接口；客户端不直接调用MCP读写、不伪造工具结果、不改业务确认逻辑、不读取凭据或关闭认证。自动输入只表示测试客户端模拟用户，所有记录标记 `humanApproval:false`，不是人工审批。

- 正向确认：[原始会话证据](../../../../.local/artifacts/xx-device-native-20261107/confirm/native-session-efe3b000-42d9-43a2-adf3-98239b76df7a.jsonl)显示原生答案后恰好一次三参数写入，随后收到Mock SUCCESS并向用户报告模拟结果。[离线核对结果](../../../../.local/artifacts/xx-device-native-20261107/confirm/verified-summary-efe3b000.json)通过。首次测试采集脚本把公开的结构化完成原因误作字符串，导致业务完成后脚本误报失败；已按公开合同修正，原失败原样保留，核对过程没有重放该次写入。
- 原生取消及随后普通文字再次确认：[两轮会话证据](../../../../.local/artifacts/xx-device-native-20261107/cancel/native-session-c7648ed0-5f0c-476d-80d5-531532177f35.jsonl)通过，Mock写入0次。
- 自由输入“确认执行”而不点选确认：[会话证据](../../../../.local/artifacts/xx-device-native-20261107/free-input/native-session-c3527e91-dc52-4403-9c81-aa0849a7dde9.jsonl)通过，Mock写入0次。

- 成功提交后再次普通文字确认：[补充核对结果](../../../../.local/artifacts/xx-device-native-20261107/submitted-repeat/recovered-duplicate-verification.json)通过。对原已成功会话发送普通“确认执行”，本轮新增工具调用0次、新增写入0次，助手明确不重复提交。另一独立补充场景曾发生WebSocket断开；已用公开会话读取接口只读核对该中断会话的写入0次并保留失败记录，没有盲目重放请求。成功后的重复确认核对在原成功会话完成，未重新提交完整重启请求。

上述是目标业务模型、原生问答与Mock接口的真实协议级往返，不是浏览器自动点击或真人审批；历史API和browser Run的无法判定结论保持原样。[测试客户端源码](../../../../evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/xx-device-control-native-client.mjs)已持久保存到本Candidate，作为唯一维护来源。首次保存时与[执行时临时副本](../../../../.local/artifacts/xx-device-control-native-client-20261107.mjs)逐字节一致；该副本只读保留，属于旧合同执行证据。本次Candidate源码已同步新字符串合同并通过语法检查，不能再拿旧副本代表当前源码。客户端公开依赖通过 `DSH_NATIVE_CLIENT_PACKAGE` 定位，不安装新依赖；连接、输入、模拟选项、唯一映射、预期目标及输出位置均由显式测试参数提供，不作为业务Preset或工具部署。

本期实现与功能验证已收尾，不再追加测试范围。保留的限制为：既有1项子Agent计数测试与源码不一致；整体实例签名配置/加载回执尚有既有警告；未进行真人UI点击、真实设备或生产验证。

原生提问返回结构化用户答案，业务 Skill 规定确认后才写入；这不构成模型外的真实设备审批保证。Mock 服务永远只记录模拟提交，不控制设备。同一 MCP 请求 ID 的传输重放复用回包，但不提供跨新请求的全局业务幂等；结果未知时不得自动重发。

## 内网交接

接入真实服务前，须核对真实查询和写入工具的名称、参数类型、包装及回执合同，填充并核对唯一映射资产，再验证真实授权、确认和异常边界。不能把更换地址、Mock 成功或本地测试通过直接当作内网设备执行通过。
