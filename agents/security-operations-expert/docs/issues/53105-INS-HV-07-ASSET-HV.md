# 53105人工验收故障与发布冻结协调

当前协调状态：用户已明确“冻结已解除，待在途任务结束后继续真实验收”。以下暂停、冻结及改由用户发起的安排保留为当时记录，不作为当前发布禁令；由巡检维护会话核对在途任务结束后继续验收，未解决问题仍按原回执跟进。

对象：网络安全运营专家，EXP-security-operations-expert-027-f-r3ba4799b0cb7（陈飞）；现有实例 inspection-027-schedule-acceptance。业务入口为用户指定的53105聊天入口。本文记录本批人工验收与本管理会话操作，不替代原会话、原运行或平台审计。

## ASSET-HV-02：19:13新status补证与只读来源核对

**新证据归属**：用户从真实session-156acd06-4963-4d31-828d-8e0d33c0a3b7于19:13一次新status取得，非18:55旧失败；原对话完整值保留。本轮只读定位，仅补本交接记录；不改候选/权限/共享配置、不build/装载、不读HOME/Token、不新调用业务或替用户重放。HV04范围第一阶段已先完成；用户续授权的必要否定回归现已收口为20项Mock通过，当前指纹与具体交接见后文，不等待接线研究、不重复修getter。

### 19:12另一真实会话的资源作用域证据与候选绑定定位

用户新增：台账只读会话session-c40b6017-7500-4d45-a12b-dbd152885816在19:12本轮status同样六项0，随后按返回namespace调用list_mcp_resources(asset-management)与list_mcp_resource_templates(asset-management)，均返回`MCP resource server "asset-management" is unavailable in this agent’s scope`。这是该Agent的资源provider不可用证据，不是SOC HTTP数据查询结果或SOC缺接口；不与19:13的156新status混成同一次请求。

**本轮只读定位到的候选缺口**：

- [harness.yaml:16–18、47–55](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/harness.yaml#L16-L55>)仅声明asset能力与实际载入路径，不能替代MCP来源挂载。[主预设:39–42](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/presets/security-operations-expert/agent.cordis.yml#L39-L42>)启用的是高层asset-onboarding-runtime；完整主预设未声明资产MCP客户端。
- [Profile叠加:82–124](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-expert.patch.yml#L82-L124>)注册主/子预设，但未增加asset-management来源。对Candidate默认MCP声明只检索id/serverName/enabled/已知组路径这些非敏感字段，未读取headers或Token：[默认源元字段](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/web-profile.seed.patch.yml>)列policy-configuration、emergency-action、ai-soc-correlate、sec-ops、soc-readonly、inspection-compositions、troubleshooting、report-write及禁用的threat-analysis-runtime，没有asset-management的id/serverName，也未见其他alias指向该组v2路径。因此当前候选默认声明尚未补入该客户端，不是“候选已声明资产源只等加载”的已证状态。
- [当前Manager实际挂载代码:649–677](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.mjs#L649-L677>)遍历config.servers，为Preset作用域创建McpClient，serverName取server.serverName或id；不会把平台已保存的所有groups自动转成客户端。原始候选/资源名即使正确，也不能补足缺少客户端来源。候选缺口与两次scope unavailable吻合，但还不能仅凭它排除运行Profile另有手工来源或alias。

**实际装载边界更新**：2026-11-07T03:43:07.678Z实例detail为status=unknown，最近尝试2026-11-07T03:41:50.654879Z结果unknown，当前代次暂无已核回执；保留的最近成功回执仍03:34:50.391Z、b5582990…fb5e0df，不冒充当前代次。当前投影fe4ed3adb7a26ed880468627b3712ff242e2514e9809eb92dc019ee9e2aea59f，变化含business.patch及并行巡检/报告/Guard/矩阵等。由唯一协调方核验其实际生成绑定，不读实例HOME或生成文件，不补发装载；更不能倒填为19:12/19:13的配置。

**拟新增目录/权限的精确范围，未实施**：如果唯一协调方核实有效配置确无资产源，最小为仅向主预设接入1个原生MCP来源，本地serverName=asset-management，复用平台已保存asset-management组v2的受管地址/认证引用；只含下表既有6个operation及get_soc_discovery_tasks_by_task_id这1个任务资源模板。不增加SOC新接口、不给模型直接入库权限、不改角色允许集或匿名语义、不挂子预设。旧manager的servers循环会对各Preset挂载，不能未经角色范围核对就全局加条目。可落点为主预设的原生客户端绑定，或现有受管装配源绑定；与保留HOME的有效Profile如何合并须由协调方按公开入口确认，不能保证只改默认模板再reload就生效。

若唯一协调方实际生成配置已含该来源/不同alias，只交其核对装载与真实serverName，不重复改配置；若已注册但被隐藏，再针对实际参与的资产身份映射查证，不凭0增权限。本轮不实施上述新增目录；仍只缺与时刻/代次对应的一份有效MCP来源绑定/挂载回执来确定运行层，不要求重查SOC或重发status。HV04已独立交接，不受此补证阻塞。

### 用户提供字段摘录

| operation | registered_count | registered_names |
| --- | --- | --- |
| create_soc_asset_probe | 0 | [] |
| create_soc_discovery_identify | 0 | [] |
| create_soc_discovery_tasks | 0 | [] |
| start_soc_discovery_tasks | 0 | [] |
| create_soc_discovery_tasks_adopt | 0 | [] |
| create_soc_asset | 0 | [] |

其他原值：task_query_resource=unavailable，task_query_template_count=null，interfaces_loaded=false，tooling_ready=false，configured=null，configuration_check_supported=false；local_entry_loaded=true，evidence_scope=current_session_tooling_only，expected_namespace=asset-management，expected_member=ai-soc-master，group_id=asset-management，session_id=session-156acd06-4963-4d31-828d-8e0d33c0a3b7，schema_version=asset-onboarding/v1，business_verification=not_performed，registration_performed=false。此摘录不补造原回执未给的来源绑定或异常。

### 当前实际装载观察（不回填19:13）

2026-11-07T03:37:50.157Z公开实例detail：最近实际装载为2026-11-07T03:34:50.391Z，source_id仍为指定EXP，loaded.digest=sha256:b55829904a37cce034d06f167b19f16ac976fd56eb8f469ea08073b81fb5e0df，files_digest=sha256:f65e20325f5c3dfa63d8d3af5b232279f3bbbacba7360f82e16e02609afca069，runtime-observer/ok=true。当前投影digest=sha256:f4c908a1f7dc9fcf0b7898fa8f56cd28fc4a5c8a44bf62fb0b68d3d7787a2555，status=pending_reload，7项差异属于巡检/报告/Guard/矩阵等并行修改。本方未构建/重载，不覆盖这些差异，也不拿当前磁盘Guard推定已运行的过滤行为。

此装载晚于19:13新status，不能倒填为该次工具请求版本。只读受管实例日志tail=100仅返回Web启动及模型目录加载信息，没有资产MCP客户端挂载/注册回执；缺此日志不等于未挂载。公开实例detail只给来源/摘要，不给本地MCP连接名、注册工具身份或该Agent的过滤前后视图。

### 现在可证与仍不可证

- [现MJS resolver:861–871](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L861-L871>)只核固定asset-management外层命名空间及四组候选，再加旧manager直连resolveTool结果，并用get(name,agent)求交集。六项0精确说明这些候选在156该轮未匹配，不等于全注册表零工具、SOC无接口或源一定没挂载。旧manager把组ID当直连server的路径仍不正确；但代码还另查独立客户端候选，故不能仅此断言就是现场唯一根因。
- [任务模板目录:908–915](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L908-L915>)同样以server=asset-management访问本地资源provider。unavailable且count=null来自[status:945–951](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L945-L951>)异常被吞，区别于成功列目录后计数0；仍可能是目录工具不可见、provider名不对应或目录调用失败，不能直接判SOC缺模板。
- [status:953](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L953>)的configured=null、configuration_check_supported=false是该实现固定输出，不是新执行了后端配置检查，更不能证明运行服务缺某方法。
- DSH get(name,agent)是当前可见视图，隐藏与未注册均可表现为undefined；源绑定不明时不得改用global get、绕权限或补猜名前缀。当前平台组级listGroupTools/callGroupTool合同与候选旧同名服务差异仍在，不能从管理侧源码直接推定业务实例接口版本。

### 只缺的一份非敏感运行元数据

请用户或唯一协调方从UI可取得的记录补**资产组对应原生MCP客户端的来源绑定/挂载注册回执**，与时刻/运行代次对应：本地serverName或连接ID、实际绑定的groupId/去敏组路径、挂载结果及该来源的六项精确注册名；若UI能提供，同一记录附156作用域的可见性/限制结果。不要凭据、header、Token或HOME文件，也无需再重取同一个status。若UI只有过滤后的工具目录而无挂载注册结果，该视图仍不能独立区分隐藏与未挂载，须如实保留未知，不新增平台检查或私有取证。

这一个来源回执可决定最小落点：实际未注册则由唯一协调方补已有资产组原生接线；已注册但本地身份不同则仅修asset resolver/lookup/status及资源server绑定，使用已核local serverName+raw operation+group/member，不增候选；注册身份吻合但156不可见，才核并修实际参与的资产身份限制，不直接扩大权限。若已有可靠公开组级调用合同，按其真实版本收敛；缺合同时不从管理侧导入实现或加HTTP代理。本轮不选定尚无证据的分支，不宣称接线已修复。SOC目标仍223，发现仍仅用户授权228.1-254，不发业务验证。

## ASSET-HV-04源码小批交接：已保存及本地验证，未构建/装载

用户现已授权仅实施范围TS、直接测试及Skill说明。真实证据仍归session-156acd06-4963-4d31-828d-8e0d33c0a3b7的18:55最新请求172.16.228.1到172.16.228.254，不用旧非法输入或R1会话代替。ASSET02已收到156会话19:13新status，仍需的来源挂载补证见本文开头；不随本范围小批扩展。

### 实际修改与精确差异

| 文件 | 保存差异及SHA256 |
| --- | --- |
| [asset-onboarding-runtime.ts:37–119](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L37-L119>) | 新增共用normalizeRangeText及validateDiscoveryRanges；先规范再拆项/去重，完整token及包含/排除角色同值匹配；f98b3b00f79cb02784edb3dcf9c74a018fe1863b32dccae81e2c81a32dfc023d |
| [asset-onboarding-range.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-range.test.mjs>) | 新增直接import TS的本地Mock，不生成MJS；3bb09d760f8e1169255d6b64f95443fb847697e532d14ac1ecd82bd072797d20 |
| [资产Skill:14](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/asset-onboarding/SKILL.md#L14>) | 补到/至/-同端点等价及排除完整映射说明；c3f7d2c6fac77853d52f8182c8d3dd74fdee0252b965a5b153211663976bac1f |
| 本交接文档 | 记录差异/结果/限制，保留其他维护会话并行更新 |

[discover调用点:342–347](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L342-L347>)仅将原normalizeRange、排除存在性及原句includes四行替为`const { range, excluded } = validateDiscoveryRanges(identity.request, args.ranges, args.excluded_ranges)`。真实当前用户、意图/取消gate仍在其前，lookup及日记在其后。create/start/probe/identify的外部参数、autoAdopt=false、任务防重、完整预览和新确认/写入规则均不改。

仅对两个完整合法IPv4同一起止端点的“到”“至”“-”及两侧空白做无损规范；不拼散落IP、不补端点、不换算CIDR或借旧消息。包含/排除分别按完整显式片段匹配，不用子串授权。明确排除列表须完整消费，不能只取首项/末项或当包含；前置排除和后置除外同用完整列表规则。不明确连接词、列表续项或角色歧义保持失败关闭并澄清，不增加自然语言推断。原IPv4/CIDR对齐与4096上限保留。

### 检查结果（仅本地，无真实发现）

1. 先以`node --test tests/asset-onboarding-range.test.mjs`复现：初始14项4通过/10失败，退出1。修后14/14通过；只读审查再发现“排除C 和 D”及“C，D除外”的部分匹配，均按同根因修正，补3组直接回归，未把首轮绿色当充分证据。
2. 范围规范化第一阶段同命令17/17通过、0失败/跳过；必要否定回归收口后的当前结果为**20/20通过，0失败、0跳过**（详见下段）。覆盖到/至/-双向等价及空白、单IP/显式CIDR、越端点/0或255/138网段、散落IP/子串/CIDR借单IP、缺端点、排除漏项/错配/角色颠倒、带空白和及与及后置逗号/分号、无法准确映射的连接词、取消/咨询/否定扫描/排队取消/中止/旧消息和4096边界。审查提出的本补丁阻断项均已静态封闭；审查者未独立运行测试。
3. Node v24.21.0原生TS内存去类型直接导入当前源码，不调用tsc/esbuild或写编译物。高层正例在首次tools.get由Mock抛STOP，位于mkdir/业务日记及MCP调用之前；负例要求get计数0及授权/范围/取消类错误。无网络、扫描、任务创建、入库或额外业务评测。
4. 测试MJS的`node --check`通过。普通`node --check ...runtime.ts`按JS解析原有type Value时报SyntaxError、退出1，未算通过；没有为此构建或修改类型声明。TS实际导入/单测通过不等于TypeScript静态类型检查，后者留给统一受控构建。原生导入另有MODULE_TYPELESS_PACKAGE_JSON警告；未修改宿主package.json或安装依赖。

### 未实施项及统一交接

[受管生成MJS](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs>)仍为5a75cc137ca96a7687e4da88b645bf23f1cb58040807eac819e9154d5c968a4b；[附件模块](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-workbook.mjs>)仍为c444943009f00168b1f715d39ef738b892d95cd80f75e056b602be4522f7f8b3，均与此前已核字节一致。本批未build/改写MJS、装载、保存共享配置或触任何巡检报告/Guard/manager/权限/SOC/平台程序，未读HOME/Token；不是已装载或真实发现通过。

### 必要否定回归收口：已按用户续授权保存，仍未构建/装载

用户明确将“不要发现”缺词纳入本次取消/否定边界的必要回归；此前单列限制不再作为不修的现行安排。先新增3组定向检查复现：`node --test --test-name-pattern='不要发现同一起止|明确否定发现和扫描|只发现不入库' tests/asset-onboarding-range.test.mjs`，1通过/2失败，退出1。两个否定用例实际到达Mock首次工具查找STOP，但仍未进入MCP或FS；合法“只发现/不入库/明确排除”对照通过，未降低负例期望。

精确生产差异仅为[TS:342](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L342>)否定动作正则的一个分支：

```diff
-(?:不|别|暂不|无需|禁止)(?:要|再)?(?:探测|扫描|识别|执行|做任何动作)
+(?:不|别|暂不|无需|禁止|勿)\s*(?:要\s*)?(?:再\s*)?(?:探测|发现|扫描|识别|执行|做任何动作)
```

仅补“发现”、明确“勿”及“要/再”组合/空白；不推导句子语义或目标，不改其他取消/咨询判断、权限、MCP参数、确认规则或范围解析。复杂否定/转折不做通用NLP判断，也不以本地覆盖声称所有自然语言否定均已识别。

完整回归`node --test tests/asset-onboarding-range.test.mjs`最终20/20通过，0失败、0跳过；测试MJS的node --check通过。新增检查覆盖不要发现A到B/A至B/A-B、别/暂不/无需/禁止/请勿/不要再及带空白的明确否定发现/扫描，均要求首次lookup前拒绝；“只发现A，不入库”“只发现A，不要入库”“发现A至B且明确排除C”仍通过到Mock首次查找停点，无二次确认。所有验证只用本地Mock，未真实发现、扫描、创建任务或入库。

当前TS/测试指纹以本节表格更新值为准；Skill、受管MJS及getter模块保持前述字节，原MJS仍是旧gate，必须由唯一协调方随范围/报告补丁一次受管构建/类型检查/装载。本地必要回归已收口不等于已发布、已装载或业务通过；在统一检查和装载回执完成前，不宣称范围模块可发布。

请巡检维护会话在报告补丁及范围补丁齐后核上述三项指纹，由其一次受管类型检查/构建/装载；不要用旧MJS冒称范围补丁产物。本方不自行build或装载。ASSET02继续根据156原status的registered_count/names定因，不从范围Mock绿色推定接口可执行。原会话、旧失败、附件保留，所有真实复测仍只由用户从原业务会话发起。

## R2原业务反馈与只读定位（实施前记录）

本轮用户明确：六类巡检在途，巡检维护会话仍是53105唯一装载方；本管理会话只读定位并返回最小修复范围，暂不改Candidate/测试/Skill、不运行脚本或测试、不构建/装载、不保存共享MCP配置，不启动或代重放业务。唯一写入为本交接文档。先前冻结解除不构成本回合实施授权；无需恢复goal或旧队列。SOC环境仍223，发现范围仍172.16.228.1-172.16.228.254，不修改SOC或扩大目标。

### ASSET-HV-03：原Excel读取展示已通过，不重修getter

来源为用户提供的R2原业务回执：session-f0c27975-ab5f-49c8-b4bd-dbd6310a37b6已成功读取同一原Excel，digest_verified=true、complete=true、未截断，两条合成数据行完整展示；未入库、未探测。此处确认的是原附件读取/完整展示子项通过，不把合成行当真实设备、不扩展成登记或发现通过。本方未重读原附件、未重放工具，不再重复修改服务getter；原失败及本地修复证据保留。

### 本次只读现场边界

2026-11-07T02:58:43.734Z公开实例回执：current_digest与loaded.digest均为sha256:76852d15f33ff97bc98d289215aa7a9d645a07c1cb48804d0bca83ef9a47f364，status=current、changed_files=[]，与用户R2摘要吻合；loaded_at=2026-11-07T02:53:01.203Z，files_digest=sha256:39da6b86985ec95e6d1f6310eb97bf666e910c4409768cddbca94027738a5ff8。它是资产投影/装载证据，不是业务可执行性或原始工具报文证据。

本轮新读配置revision=9a75c92906f5c923e59db93124543c3920065e791aa8ce7dd7e33440cff376e2：asset-management成员仍ai-soc-master并选择既有六项operation；规范入口与所选任务模板均已指223:18087。因此不再以旧232模板解释本轮未就绪。规范入口、目录声明目标不等于实际SOC HTTP下游；没有实际请求/路由证据就不补造下游或SOC发现结果。

### ASSET-HV-04：等价起止范围归一化缺陷

**经用户核浏览器session/prompt记录校正的原回执归属**：本轮18:55发现请求实际发送到session-156acd06-4963-4d31-828d-8e0d33c0a3b7。该会话曾有旧非法IP用例，标题相似而被本地选中；本轮最新真实用户输入仍明确“对172.16.228.1到172.16.228.254执行一次真实设备发现…只此授权范围，先完整候选不入库”，不能用旧非法输入替代。工具传等价ASCII连字符范围时，被“包含与排除范围都必须逐项来自当前用户请求，不扩大网段”拒绝；改传中文范围又报格式无效。上述错误和本轮接口0回执均按用户校正归属于156这一轮，尚无taskId或SOC发现结果。

此前把该R2回执关联到R1会话session-1893b241-e09e-4206-a4c4-72585c5b2461属于证据索引误标；用户已更正测试索引。156与1893两个既有会话的原记录全部保留，不改写原始会话，不把本轮冒充成1893重放。本管理会话只按用户校正更新证据关联，未独立读取浏览器prompt或发起任何新请求。

**已证实的源码根因**：[normalizeRange:37–56](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L37-L56>)先按空白拆项，再只按ASCII“-”解析起止；[discover:279–285](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L279-L285>)又用identity.request.includes(part)比对原句。参数A-B与原句A到B不一致时，语法通过、授权字面校验失败；参数A到B则在语法层失败。当前实际构建物也保留对应逻辑：normalizeRange第712/730行、原句includes第968行。在当前投影与R2装载匹配的边界上，两次拒绝与此代码路径吻合；本方未独立读取原会话工具参数/完整事件序列。

**最小待修范围，未实施**：

- 同一runtime文件内共用纯规范化，只处理两个完整合法IPv4同一起止端点的ASCII“-”/中文“到”及两侧空白，在拆项前无损规范成A-B；参数和当前真实用户原句中的明确授权片段使用同一规则。包含/排除按对应角色逐项完整同值核对，不再用裸子串includes授权。不能把散落IP拼范围、不能以子串或覆盖关系放行，不能推导CIDR、补.0/.255或扩大228目标；排除不能明确映射仍拒绝。
- 直接相关的[现有单测](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-runtime.test.mjs#L285-L300>)缺此等价表达/授权联动覆盖，后续在该文件补针对性回归，不引入SOC或持久化测试。既有当前用户来源、取消/咨询/否定扫描、非法或倒置范围、CIDR对齐、4096上限、排除缺失或错配、autoAdopt=false及清单后新确认边界全部保持。
- [资产Skill:14](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/workspace/.agents/skills/asset-onboarding/SKILL.md#L14>)仅需同步无损等价规范化说明。生成MJS应在获准实施后受控生成，本轮不手改、不构建。ASSET-HV-04是范围校验阻断，本身不能证明发现接口通或不通。

### ASSET-HV-02：接口可见性/身份接线仍未闭环

**用户原status回执**按最新证据校正关联session-156acd06-4963-4d31-828d-8e0d33c0a3b7的18:55这一轮，interfaces_loaded=false、tooling_ready=false；用户另确认接口0回执同属此轮，但本管理会话尚未取得完整逐项interfaces原表，不补造各项数字。按当前实现，这只能证明至少一项未唯一可见，不能直接推成六项均为零，也不能区分零注册、多匹配或作用域隐藏；尚无taskId，不存在可引用的SOC发现结果。

**当前可证接口边界**：

1. [资产resolver:174–205](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts#L174-L205>)仍固定将asset-management当外层本地命名空间、枚举四套raw名，并取当前Agent可见定义；命名/哈希算法本身与锁定DSH一致，不是已证缺陷。SDK的外层serverName来自本地客户端配置，不能自动等同远端groupId、URL或serverInfo。
2. [候选旧manager:521–525](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/mcp-manager/index.ts#L521-L525>)的resolveTool(serverId,rawName)只查自身直连servers，不按groupId解析独立客户端，且返回值只证明任一activeAgent可见；不能把它当本会话组工具目录。不得读其currentGroup取Token补证。
3. 锁定[SDK get/schemas:682–712](</home/cmp/.local/share/hep-runtimes/dsh-0.2.1-rc.5/node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts#L682-L712>)均读取当前scope的visible视图；被restrict隐藏的继承工具，get也返回undefined。不能省略agent改取global视图或导入内部registry绕过。ToolDefinition.execute(args,exec)两参数合同是正确的，不将其误判为API参数错接。
4. [直接Guard映射:724–727、778–785](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-operations-guard.mjs#L724-L785>)仍只经旧manager算允许名称，与资产resolver四套候选不是同一事实源；存在注册身份/允许集不一致而隐藏继承工具的可证路径。但该Guard在匿名模式可直接退出，自身层工具也不由该restrict剔除，故缺少R2现场状态时不能断言本次一定被Guard隐藏。
5. 当前平台工作树的[分组v2绑定:323–397](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L323-L397>)发布原始sourceName，元数据io.deepseek.dsh/mcp-group-tool保留serverId/kind/sourceName/sourceUri；成员前缀只是旧别名。[v2调用:535–544](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L535-L544>)也走该绑定，不是孤立旧toolOwner前缀拆分。这只是当前平台工作树合同，不冒称53105注入了同版本接口；不再追加猜名或把旧候选manager的v2当现行平台合同。
6. 另有同名服务的版本合同差异：[现平台mcpSessionManager:750–789](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L750-L789>)除直连resolveTool外提供listGroupTools(id,version=2)及callGroupTool(id,version,name,args,meta,exec)，后者保留组摘要核对，配置要求时绑定原生Session/callId；目标候选旧服务没有这两项。它们是MCP业务服务合同，不是仅凭DSH SDK版本就能推出的能力。未核53105实际服务方法表前，不直接改成管理侧方法调用，不导入内部实现或读取currentGroup的Token。

**最小待修方向，未实施**：先由唯一协调方从该原回执取逐项registered_count/registered_names、task_query_resource/template_count，以及仅这六项实际精确注册名和非敏感本地sourceId/serverName、原rawName、group/member身份绑定；必要时再补实际服务是否提供listGroupTools/callGroupTool、对应挂载结果或restrict是否生效的布尔/脱敏错误码。工具schemas自身不保留平台来源_meta，不能靠反拆名称回推。仅使用已保存的原回执/目录元数据，不新启动业务，不索取凭据或读HOME。

若业务侧已经具备经核实的组级公开服务合同，优先在高层按组身份和真实目录复用该合同，不继续拼四套名称；若缺该合同，先列为业务MCP服务对齐/装配缺口，交唯一协调方处理，不能套用管理侧同名方法。若采用已有独立客户端且源未挂载，仅补现有资产组原生接线；若已挂载，则最小改asset resolver/lookup/status及确有参与时的直接Guard资产身份映射，统一已核绑定，保留唯一性、当前Agent作用域与模型底层直调拒绝。status只需必要的阶段/脱敏停点，不增探测。无Guard参与时不为猜测改Guard；不扩大其他允许集、不改匿名语义、不重建SDK/全局manager、不加HTTP路径。当前信息不足以唯一确定R2到底是哪一种，不能以Master目录URL、组已保存或current装载替代执行能力。

本轮实际只补本维护会话/交接记录，不修改上述候选、测试或Skill，不运行单元/业务评测、不构建/装载、不写共享配置、不主动探测或入库。六类巡检及其原报告、会话、附件和旧失败均保留；后续实施及装载时机只由用户与唯一协调方安排。

## 当前边界

用户已明确固定：本批SOC事实源沿用172.16.138.223；本轮真实发现及核对后待确认入库的目标范围已明确为172.16.228.1-172.16.228.254（228网段，不是138网段），不是SOC地址。用户已将范围补充到53105原“纳管一台设备”会话；先发现并展示完整清单，核对后由用户在同一会话新确认入库。本条范围更新不是对尚未展示清单的提交确认；不得修改已有资产或扩大目标。管理助手不代发或重放发现/入库，失败由用户交付真实回执。本次仅解除“尚未指定测试目标”前置，不等于接线已就绪、装载已核验或解除其他发布边界；53105仍由巡检维护会话作为唯一装载协调方。目录或配置出现232不构成改用232 SOC的授权。我方此前根据目录232改模板不能等同于获得该环境切换授权，此判断不严谨；现不以盲回滚掩盖不一致。

按用户INS-HV-07紧急要求，暂停本管理会话后续影响53105的MCP配置保存、接线发布和实例重载；不发起巡检、发现或资产登记，不用ALL扩大范围，不恢复历史错误配置，不改巡检报告修复及其他并行资产。后续业务验证由用户从53105聊天发起，旧隔离评测不计入本批业务通过。

## 并行变更阶段的历史只读快照

用户已确认：外部确实正在变更当前候选，尚未确认变更结束。这是已确认的并行变更事实，不再仅列为推测。本管理会话不覆盖相同候选文件、不保存共享MCP配置、不构建或重载53105、不启动或重放业务，不干预外部流程。仅补本协调记录；巡检维护会话仍为唯一装载协调方。下列为一次读取快照，不通过轮询、静默时长或零差异推断外部已结束。

### 当前候选资产投影与实际装载

观测时刻：2026-11-07T02:24:05.553Z（2026-11-06 18:24:05.553 America/Los_Angeles）。平台返回source_id仍为本候选，asset_status=current，changed_files=[]，运行代次与observer回执一致。

| 项目 | 本次公开回执 |
| --- | --- |
| 候选资产投影current_digest | sha256:9571d3b79314968c1ad81e535783d98137f32b6326aa8a9ab1fd6ca0cd47d525 |
| 实际装载digest | sha256:9571d3b79314968c1ad81e535783d98137f32b6326aa8a9ab1fd6ca0cd47d525 |
| 实际装载files_digest | sha256:ca57ddc21a76b3f76d789485a4df9197be470ad169d1fabde18ff992494975b3 |
| generation_digest | sha256:201b3764a045c61442b88033dc0901d4ab02946fef4e96911af0af5dc43962c6 |
| loaded_at | 2026-11-07T02:21:17.826Z（本地18:21:17.826） |
| 当前容器代次 | e882686948070d2a33b5d30bf3091b768f40673e5daaf7e81d025b125f540b3e，pid=7 |
| 核验 | runtime-observer，ok=true |

这是平台资产投影摘要，不是完整Candidate或Git发布摘要；仅证明采样时当前代次装载匹配，不证明外部变更结束、真实工具可用、Excel解析通过或业务验收通过。18:20曾为unknown的旧回执与此次current分别保留，不能改写为同一时刻状态。

### 实际SOC下游：已知与未知

本轮重新读取的公开MCP revision仍为41e63d2d83ffaada498567ac4b4becff51100cc3fc09fa8e0d33aace99627e80。已知配置为ai-soc-master规范入口http://172.16.138.223:18087/v3/api-docs/mcp；asset-management成员为ai-soc-master，所选任务模板仍为http://172.16.138.232:18087/soc/discovery/tasks/{taskId}。用户已将这项不一致同步给安全巡检会话；本方没有再修改。

接入/规范获取地址、转换目录声明的HTTP目标、实际发出的HTTP目的地及服务内部最终SOC下游是不同证据层。最近一次只读转换目录返回223任务URI，但本轮不刷新目录；它与当前接入配置都不能单独证明实际SOC HTTP事实源或代理内部下游。尚缺本次业务的脱敏request-target/服务路由及身份绑定证据，真实下游和不一致的业务因果仍未知。本批用户要求沿用223环境，不能因此把目录232视为切源授权，也不能把零范围说成SOC无数据或删除了资产。

### 我方已修改与未实施清单

**已修改/已办理的历史范围**：资产高层入口及受控xlsx模块、资产Skill、Mock测试源码、6份静态xlsx样本及manifest、U-ONBOARD-001至014定义和相关记录；最近的接线修正为当前Agent精确注册复核、状态证据分层及零/多匹配停点。平台组原有6项SOC操作与任务模板登记已办理；其中我方d46a90d1操作仅将该组一个任务模板223改232，未直接修改server地址或凭据。17:57:27我方受管重载发生于暂停指令前。具体原回执见下文，不把其后外部重载计为我方动作，也不以我方旧字节覆盖外部版本。

**截至该历史快照我方尚未实施**：把任务模板重新对齐223；Excel服务获取/inject缺陷修复及其构建发布；HV-01台账路由冲突修复与类型/部门图层新增公开能力或权限；本批新的发现、巡检、登记、实际Excel解析或业务评测。此处“我方未实施”不等于断言外部未修改；外部内容与验证结果由其交付。暂停后本方没有共享配置保存、候选文件覆盖、构建或实例重载，没有修改ai-lite-platform或平台源码。

### 可复验的版本稳定条件

1. 外部流程明确确认变更结束，并由唯一装载协调方交付固定来源及对应指纹；不能仅凭此次current/零差异或等待一段时间宣称版本稳定。
2. 接入绑定、规范/转换目录、资产组任务模板与已授权SOC环境一致；实际SOC HTTP下游及身份绑定有相称证据。223/232不一致由协调方核实修正，不以盲改URI掩盖错源。
3. 当前运行代次的实际装载回执绑定该固定来源与资产投影，状态为已核验，且没有未解释的漂移；需要复测的接线或Excel修复确已包含在该装载物中。当前业务会话只读目录还须能核对相应真实工具/模板，不用本地高层入口存在代替。
4. 满足上述前置后，仅由用户从原53105业务会话复测。发现范围固定172.16.228.1-172.16.228.254，先完整清单、核对后同会话新确认入库，不扩大目标或修改已有资产；Excel仅解析样本不入库。助手不代发、不重放，原报告、附件字节、会话与全部失败证据保留。

## INS-HV-07：同双IP从2台变为零范围

**用户报告**：业务会话 session-c5d4292c-f5f0-4802-883e-81cca3af18f0，17:54复测仅172.16.2.114、172.16.2.170，模型先去重。界面先出现“工具已更新，移除4个”，随后同参数两次返回“所选范围没有资产；本次未创建运行”。用户未修改业务配置或扩大范围，暂停追加巡检启动。

**已由公开接口回读的历史事实**：原运行 run-ef1d5e0f-e0f1-4f62-b5a2-92c82803f1ad，created_at=2026-11-07T01:28:57.867Z；input.scope.ips正是上述两个IP，冻结count=2、assetIds=[3617468,3617471]，执行completed、业务incomplete（异常1、未知1），不是“没有资产”。其报告和details产物均存在；只读取原产物，没有重新启动。定义是inspection-status，versionId=66ff38208cd4cd8ce58235ba0d9d190b06b60a9119e75eeebb58e471777eb7e6，connections.master=ai-soc-master。公开运行与details未给出当时实际连接URL，不能拿当前配置倒填历史来源。

### 本管理会话可核对的配置操作与漂移

| 观测/操作 | 非敏感事实 |
| --- | --- |
| 写入前公开revision f236fae80eaa8e96a152c9c367ee6b859977be1f3a882cf179a7d095554e88d0 | ai-soc-master、ai-soc-correlate、ai-soc-detect、ai-soc-event、ai-soc-graph、ai-soc-ingest的specUrl主机均为172.16.138.232；资产组任务查询模板仍为223。 |
| 我方saveConfiguration，proposal d46a90d1-bc1e-4a47-9677-663a460ac20b | 唯一请求op：set groups[5].members[0].resourceTemplates[0]，223:18087/soc/discovery/tasks/{taskId}改为当时真实目录返回的232同路径。未请求修改任何server、凭据、其他组或工具选择。 |
| 保存回执revision c9acc7c5883764e820e3f8de83da013b0f5b6ffdf0eb8d22414f39e704717714 | 上述6个server仍为232，资产组模板为232。该管理动作合同包含自动校验与重载；单字段请求不等于已经排除所有组的连带刷新影响。 |
| 后续公开revision 5c385fd10ccdc222adf1bae6569923b4e5a291f54fbf9e50071736ebfdf97202 | 上述6个server已为172.16.138.223；本管理会话没有请求此次地址切换，操作者与时刻尚未核实；本批正确目标后来已由用户固定为223。尚未据此回改资产模板。 |

追加只读观测：revision 41e63d2d83ffaada498567ac4b4becff51100cc3fc09fa8e0d33aace99627e80中，ai-soc-master.specUrl为http://172.16.138.223:18087/v3/api-docs/mcp，组asset-management仍绑定ai-soc-master但任务查询模板仍为232；当前resourceTemplates实际返回的get_soc_discovery_tasks_by_task_id是http://172.16.138.223:18087/soc/discovery/tasks/{taskId}。因此当前明确存在“223来源及转换目录／232组选择模板”不一致，暂停后未保存纠正。

232角色必须分层：当时公开配置把232:18087作为ai-soc-master的规范入口，返回模板232表示转换结果声明的HTTP base也在232；尚无证据确认它是原SOC、另一部署还是代理，更不能假定内部转发223。当前程序的[OpenAPI转换实现](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/openapi.ts#L171-L214>)先读取specUrl，再用规范servers[0].url（缺省为/）相对specUrl解析base；[工具执行](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/openapi.ts#L229-L250>)按该base拼接operation path，没有固定232→223重写。分组的resourceTemplates是精确选择键，不是URL重写器：它与当前源目录的完整URI相等才可发布；选择了232模板并不会直接改写server.specUrl或规范servers[0]，但会改变组目录与摘要，当前223目录下该232选择无法匹配。该绑定与派发规则见[分组选择](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L477-L501>)及[资源派发](</home/cmp/work/harness-engineering-platform/plugins/mcp-manager/index.ts#L589-L608>)。这是当前工作树静态规则，不是17:54真实报文。ASSET-HV-02未发业务请求，因此不存在该批已经向232执行发现或登记的证据；17:54巡检实际请求目的地址仍缺原始轨迹。

这里已确认的是配置观测发生漂移，不是已证明17:54两次调用去了哪台后端。需要区分连接/数据源、租户或权限目录、工具热更新及范围解析；不能据零范围断言SOC删除了资产。未读取或比较任何凭据值，配置“已配置”标志不证明身份与权限相同。

### 实际装载与暂停先后

收到INS-HV-07暂停指令前，我方已通过受管reload（proposal 36cc4458-5479-4579-8fad-f135237fe4c2）重载现有实例。真实observer回执：

- loaded_at：2026-11-07T01:57:27.016Z，即2026-11-06 17:57:27.016 America/Los_Angeles。
- loaded asset digest：sha256:4be72092cd296e77f88e5107e4d7e15a276b7f6a54b49b2daba90bfe8f0df5b7。
- files digest：sha256:2d2258c41073c7213beb07602e65ca59f09dd3ab5476ccfaba820e7ae31ecb7a。
- configuration digest：sha256:97c0be729d267a4a020afc2168941cc0b6b5fc40c4e6cb99d44cf04f7b8d8709。
- container：17e01dc94f916fd6fa8a3d398ff0a13871b3feffa8a496acc9e0d41b70d775ec；pid=7；verification=runtime-observer，ok=true。

HOME、会话数据、端口、模型和网关保留，但不能把保留数据说成在途请求不会中断。用户报告17:54先于此次17:57重载，因此不能直接把该次重载当作全部故障原因；此前配置保存的刷新影响另查。暂停后未再保存MCP配置、构建或重载。最后一次detail显示另有security-report-runtime.ts新增而pending_reload，属于并行报告修复，未由本任务修改或装载；旧加载摘要与当前磁盘摘要必须区分。

## ASSET-HV-02：发现接线失败

**用户确认的真实失败**：53105原会话标题“纳管一台设备”；授权范围172.16.228.1-172.16.228.254。高层返回create_soc_discovery_tasks“资产纳管分组接口未装载或存在命名歧义”，没有探测、taskId/findingId、待纳管清单或入库。原业务会话编号未由当前公开管理上下文返回，不编造编号。助手没有重放发现或登记。

**已实施的资产侧变更**：修正把组ID当作旧manager服务器ID的单一路径；按照锁定DSH公开命名合同处理本组及SOC Master已声明协议身份，再用当前Agent真实可见的精确工具注册复核，零匹配、多匹配均停止；不反拆哈希、不按后缀跨组搜、不新增HTTP路径、不重建manager。状态输出列实际匹配名与数量，不把本地入口、声明group_id、旧manager配置观测或目录可见当作SOC业务通过。原失败保留，当前原业务会话是否已唯一匹配仍待53105证据。

受控构建proposal 0a1c3efd-2c24-45ec-97d3-a473c0925edc；[入口源码](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts>)SHA256=90900b2025e32666365256a17a4c88a9aaf231b22932e53101ea8257db89adab；[构建物](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs>)SHA256=045a5bf6577895e5bb42e5e7d43bcb43048c90df7d22d4938f97d64dbe04a1e7。整体实际装载回执见上，不以此声称发现业务已通过。

## ASSET-HV-03：真实Excel解析失败

### 修复小批历史交接：已保存、检查及构建，后续R2原附件读取通过见本文开头

本小批前置来自用户确认：外部调整已完成，巡检维护会话已核9571d3b79314…cd47d525装载一致，R2双IP运行完成、9206字节报告已由浏览器实际下载，当前无本批在途业务。这些为用户提供的前置，不是本方新启动或重放的结果。本次授权只修本处及直接调用方；下列修改覆盖此前“我方尚未实施Excel修复”的阶段状态，其他旧问题不扩展。

**精确生产差异**仅为[附件模块:421–424](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-workbook.mjs#L421-L424>)服务获取表达式及两行说明：

```diff
-    const attachments = ctx?.attachments ?? ctx?.get?.('attachments')
+    // 锁定SDK允许通过公开get读取当前活动服务；不先触发未inject的属性getter。
+    // get返回undefined时仍交由verifiedBytes失败关闭，不回退触碰受限属性。
+    const attachments = typeof ctx?.get === 'function' ? ctx.get('attachments') : ctx?.attachments
```

锁定rc.5的[公开ctx.get合同](</home/cmp/.local/share/hep-runtimes/dsh-0.2.1-rc.5/node_modules/@deepseek-ai/cordis/lib/types/reflect.d.ts#L7-L16>)允许无inject读取当前活动服务；本次保留接收者且不传strict=false。get存在但服务未提供时不回退受限getter，仍由verifiedBytes返回ATTACHMENTS_UNAVAILABLE；只有无get的旧普通Mock上下文沿既有属性兼容路径。没有增加attachments为强制注入依赖，不让Excel可选服务缺失阻断其他纳管能力。

**实际修改文件**：

| 文件 | 修改范围与当前SHA256 |
| --- | --- |
| [asset-workbook.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-workbook.mjs>) | 上述唯一生产逻辑修复；c444943009f00168b1f715d39ef738b892d95cd80f75e056b602be4522f7f8b3 |
| [asset-onboarding-runtime.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.mjs#L650>) | 直接调用方经受控构建同步内嵌的新取法，不手改生成物；5a75cc137ca96a7687e4da88b645bf23f1cb58040807eac819e9154d5c968a4b |
| [asset-workbook.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-workbook.test.mjs#L168-L207>) | 新增3项服务获取回归，更新Mock测试说明；179d85b57fa41b136a2055dfc5bf660ad2f25bbb83281cdcda43715a89029fc1 |
| [asset-onboarding-runtime.test.mjs](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/asset-onboarding-runtime.test.mjs#L124-L155>) | 新增1项实际构建MJS高层调用回归及Node内置模块导入，更新说明；9252744f351f512fe5bb9460ac1d227453612146445bb2671988fb8b8e4d0b40 |
| 本协调记录 | 本次差异、检查结果、边界及交接；不作为第二份源码或接口定义 |

[高层TS入口](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/asset-onboarding-runtime.ts>)未修改，SHA256仍90900b2025e32666365256a17a4c88a9aaf231b22932e53101ea8257db89adab；inject列表、对外Schema和附件引用合同未改。原xlsx提取/ZIP/XML模块、6份样本、Skill、Guard、矩阵、MCP配置、巡检报告及平台程序未改；没有安装依赖或增加文件权限。当前会话真实用户附件、原生readFileStream(ref,signal)、大小及SHA验证、200行/64KiB预算、格式与公式宏外链拒绝、完整解析后返回、未授权导入等边界保持。

**受控构建回执**：proposal=b8a01c69-2a40-418f-a991-203e1f634a2d；TypeScript=5.9.3，esbuild=0.25.12；source_sha256=5afd7415e62523d695cc15b17f496001ab0b2336959d7f74a2e342c65353f764；build_digest=446207547a6e565077c2e4df78ccbf7848dc7ab52b8f3bcabcd31e91e31d727d；构建后Candidate摘要=98b7f401ac997032bfed1aef7a3a2b6e3d6bedc6d19a8f99b0ef71fc0699c2cf。它是该次构建快照，不冒称当前实例装载摘要。

**已执行检查与真实结果**（Node v24.21.0，仅本地Mock，不连接SOC/业务实例）：

1. 修前新增定向单测：`node --test --test-name-pattern='公开附件服务' tests/asset-workbook.test.mjs`，3项中1通过、2失败，退出1；读取触发通用错误、缺服务未按原码失败，附件列举仍通过。保留负例，不降低期望。
2. 修复模块后：`node --test tests/asset-workbook.test.mjs`，17/17通过，0失败；含服务缺失、跨会话/非用户来源、非法ID/旧格式、SHA与字节、ZIP路径及展开预算、200行/64KiB、公式宏外链等既有边界。
3. 未重编旧高层构建物时：定向read_excel高层测试1项失败、退出1，证明只改独立模块不能代替更新直接调用方产物。
4. 受控重编后：`node --test tests/asset-workbook.test.mjs tests/asset-onboarding-runtime.test.mjs`，52/52通过，0失败、0跳过。新增高层回归以既有basic.xlsx真实字节、SHA和两段Mock原生流进入真实Excel提取函数，返回完整3行；断言未访问受限getter、未查找MCP工具或调用mcpSessionManager.resolveTool、无导入授权。没有桩掉Excel解析器。
5. 对生产模块、生成MJS及两份测试分别执行`node --check`，全部通过；受控构建的类型检查通过，未新增依赖。只读复核未发现阻断问题，但不替代原附件与实际装载验证。

本次测试不读取原业务附件。工作簿纯单元夹具仍标明CRC=0；高层测试只读Candidate内既有静态basic.xlsx，不能据Mock流或该样本推定原HV附件/真实原生附件后端已通过。修复前失败、旧业务WORKBOOK_REJECTED和全部历史Run保持。

**交给安全巡检会话（可由用户转述）**：本方不保存共享MCP配置、不独立重载、不启动真实业务或额外业务评测。由唯一协调方核对上述两项生产文件指纹，按其授权仅对齐当前223任务查询模板，并将相关修复统一装载一次；新装载回执须与本次修复产物对应。之后由用户在原Excel会话以原attachment_id仅解析预览，不入库；发现仍由用户在原会话限定172.16.228.1-172.16.228.254，先完整清单再核对和新确认，不修改已有资产。HV-01新增能力方案保留，不纳入本小批。

### 原失败与最初诊断（保留）

**用户报告**：session-f0c27975-ab5f-49c8-b4bd-dbd6310a37b6；实际上传“HV-20261106-仅解析不入库.xlsx”，1662字节，attachment_id=sha256:e654a3319c764cf91b3be23b2a4fff701ba0430fa98b4c1d916848324ed5ac92。attachments成功列出，read_excel返回WORKBOOK_REJECTED、complete=false、无行；未探测未登记。人工两行样本只授权预览，不代表真实设备事实。用户核对ZIP CRC与OOXML主文件可读，不能因此断言完整兼容，也不能判文件坏。

**修前源码证实的接入缺陷**：旧模块SHA256=e10bb097cbc8a6e0817e3efe0c8e5bb24385e92ec8e4c51629554c9bfde9f747，其421行先求值ctx.attachments，而调用插件未声明attachments注入。锁定SDK的受限属性getter可抛普通Error，后面的ctx.get兜底不会执行；该异常会被旧443–448行折叠为WORKBOOK_REJECTED，且发生在读取字节前。附件列表分支不取服务，与已报告现象相符。readFileStream的ref/信号参数及extractWorkbook同步输出合同未发现错配。当前改后代码与检查结果见本节交接，不把修前描述当作现状。

原次错误被折叠、尚未取得原异常，不能仅凭原失败回执唯一归因。本处代码缺陷在该修复小批按公开ctx.get取法修复并通过本地检查，交接时未由本方装载；后续用户已报告R2原附件读取/完整展示通过，当前状态见本文开头，不再重复修getter。不得增加任意路径/Scope绕读，不放宽当前会话真实附件、字节数/SHA、公式/宏/外链、大小/行数/完整性限制。

[真实下载样本asset-basic.xlsx](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/fixtures/asset-onboarding/asset-basic.xlsx>)已通过文件交付卡提供，摘要与其他合成样本见[manifest](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/fixtures/asset-onboarding/manifest.json>)。文件生成及ZIP CRC检查不是业务解析验收，更不授权生产登记。

## 测试与本批适用范围

当前[业务用例](<../../evaluation.md#L1818-L1952>)已补充U-ONBOARD-007至014，共14条资产纳管用例；6份实际xlsx合成输入已保存，缺原生附件或隔离环境的正向用例不启动、不算通过。两份Mock源码此前48项在该阶段未执行；本修复小批新增及执行结果见ASSET-HV-03交接。数量、CRC检查或本地Mock通过均不代替53105真实业务验证。

旧隔离[run-5a068dbb](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-5a068dbb-f658-4698-a69b-f5b8e6937e16/report.md>)为1通过、1失败，保留“本地工具存在被误说成SOC已接入”真实失败；[run-59ef1585](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-59ef1585-8641-4de2-ab9c-7b63d499e46e/report.md>)为2通过，但status实际因缺sourceStatus方法报错，不称状态接口技术通过；[run-1791575e](<../../../../evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/runs/run-1791575e-eeb5-4676-a443-d7838263560a/report.md>)为1通过，支持其封存来源下准确报告未就绪，不是53105业务接线/发现/登记通过。上述均同一路由自评、未独立复核，且早于本批已装载的最终接线修正；不合并为本批通过率，不改历史Run。

## 与巡检维护会话的协调交接

当前管理工具没有向非本代理子会话直接发消息的入口；未假称已联系上另一维护会话。本记录是可共享的协调事实源，请巡检维护会话与操作者共同核对：

1. 17:28成功准备范围及17:54两次零范围请求的非敏感实际参数、调用入口、工具目录变更与来源绑定；已有原运行只读回查，不能重启。
2. 本批正确SOC目标已由用户固定为223，不再要求在223/232二选一。维护方应说明232的服务角色、地址切换责任与时刻，对照保存前后revision、规范servers与转换base；不能按旧地址盲回滚。最小待执行数据修复仅为将资产组的唯一任务查询模板对齐已核223目录，不改其他server、凭据、分组或工具选择；但当前保存合同会自动校验/重载，须先协调其他组和旧会话的刷新影响，发布冻结未解除前不执行。
3. 核对inspection-status当次版本与master绑定、当前范围解析；若范围解析异常，不降级ALL。若源/身份变化，先在统一来源修复，不挪用其他组。
4. 发布冻结解除后，先在53105同会话只读核对目录/接线及原资产范围，再由用户决定是否重试既定巡检或发现；Excel先仅解析预览。

缺少这些证据时保持原因未定，保留三条真实失败、原运行及报告。没有将任何隔离评测判分迁移为本批通过。

## INS-HV-01：spill终态误拒首轮历史（58项，后续兼容补核见下文）

本节保留首轮构建和失败证据，不是当前候选的最终指纹。该阶段“省略run_id只核最新启动再拒绝”的实现不符合原“最近已完成报告”契约，已纳入后续补核；不能把该中间实现描述当成原公共语义。

本节由巡检维护会话补充，范围仅报告来源选择、导出巡检分支、直接配套类型/测试和受管生成物；不覆盖前文资产维护改动。用户仍有业务聊天交付在途，本补丁不装载、不保存共享配置、不重放业务；原生轮询及any展示只挂单，不阻塞本补丁。

### 已证根因

原漏洞会话session-e62b8fee-1fe0-4527-8299-78f05a4c8857、run-4d74aebe-5bf3-4207-87ab-47d6bfef0082：seq109为本会话真实受理，seq114可完整解码且状态running；seq137展示头部已为completed，但包含spill省略，整条不再是完整JSON。旧选择器跳过无法解码的新回执，误取seq114的旧running，seq142遂报“原巡检尚未成功结束”。拒绝发生在读取报告之前，不归因为1738894字节报告过大，也不把业务incomplete当作执行未完成。原失败、原报告和全部运行保持原样。

### 局部实现与边界

1. 来源选择仅绑定当前会话真实成功巡检调用的run_id/workflow，保留原工具调用/回执配对、正确分组、继承前缀剔除及冲突拒绝；不再用聊天展示中的查询快照判断终态。当前resolver未精确确认启动工具身份时返回undefined并拒绝，不能回退旧canonical拼写猜源。没有可验证的真实启动来源仍拒绝，不从spill文件路径补读或凭模型run编号放行。省略run_id的原行为仍核本会话最近真实启动，不自动换成更早已完成者，参数说明同步澄清而不增参数。
2. 导出器通过原已注册inspection-compositions的get_composition_run，经公开ctx.tools.execute及既有策略管线获取本次canonical value，解开实际MCP content/structuredContent及ok/result包裹；严格检查同run、同流程、外层status=completed和唯一非空HTML产物，再按同run读取原artifact。value不是绕过政策的原协议响应，isError或无效完整结构仍拒绝，不回退聊天快照。业务result.status=incomplete不妨碍已completed运行的原报告导出。
3. 沿用原agent、signal、rootCallId及exec.token作为parent，逐项转交additionalContexts；查询或报告读取阶段取消/失败不继续保存。若取消恰落在原生保存已开始后，只等待原操作结束并拒绝成功返回，可能已留完整附件，不声称删除回滚。保留原参数/MCP契约、HTML完整性、32MiB上限、原生附件保存及路径获取；核对报告filename/contentType与同次元数据、实际UTF8字节数一致。没有任意文件读取、HTTP回退、跨组猜名、新权限或依赖。故障报告分支、Skill、Guard、矩阵、Preset、SOC事实及历史HTML未修改。

### 实际文件与构建指纹

| 文件 | 本补丁前SHA256 | 本补丁后SHA256 |
| --- | --- | --- |
| [security-report-source.mjs](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.mjs>) | c846335813fc2532c2ad2df7523a23aee231bf4e49d181a524022f1beca0659e | d68e8bcac67214009b683ec82e6855f24470b947bcd4d5dacd52b937326f5782 |
| [security-report-runtime.ts](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.ts>) | cc70fd732af6d98afe9446ab736247fea02607f2e0b5008e27cb35a52aef9444 | 3965e686bfd6c4e4a5fbcb3cfc7d905ae684b45d204cc79025281fada5f5b539 |
| [配套类型声明](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-source.d.mts>) | 178362fa1273fcf532c748421c9766c13e699043ba94113ae8b74516eebf31b4 | 73e70f37e62a811cb36eb3c093ff6ea80cede7b9a4b8b35556cdbb3157a55658 |
| [受管生成物](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/dsh/managed/security-report-runtime.mjs>) | f5ec1be10c458b1a46cfee9a2fb372a6794e1c94b9774657940cce440fa26208 | 6f84d8d25c227f5744004ffbb67abe3f360f6e19e8b0e828e64ef74928c4eab6 |
| [本地Mock回归](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/security-report-runtime.test.mjs>) | 新增；首份失败回归4b67a06823fdfc661b3d95abe83af7a23a80f40480ddfa5ee06c31cd5c1b205d | db563f934349a8d4c062220c40a2f06611af30b2655c8f6c897b271482bb5c0d |

最终受管assets/build回执89d276c8-f415-4f44-9f21-a8c57e86ac97；TypeScript5.9.3、esbuild0.25.12；source_sha256=c2140e71037d4d9605914d5ee34fdc1ae8ea12c3406338b7a3faa919e94b754f；build_digest=32d54d1f59a07911cef75d6291f267f23977bc99b3e6a5c863c53a0e9ae22ad1。构建后目录摘要6e81a198127442a21223ea92680fb6764a31c5091daf9175a7c7e48a3ed30665，仅为该次候选快照，不冒称Git固定版本或实际加载摘要。首次中间构建回执acd2ec3b-105a-47d0-b629-6d79b682b46c、ESM=c99743527d7b8b5fe1851ebc8f6e81ea3973738a13263719922661db27bea297支持当时48项Mock；之后的小范围只读审查发现原有未匹配resolver仍回退旧拼写的来源缺口，补充失败回归并修正后完成本次最终构建，不将中间生成物当作待装载产物。

### 修前失败与修后检查

- 先保存回归，再以旧生成物运行`node --test --test-name-pattern='spill' tests/security-report-runtime.test.mjs`：1项失败、退出1，错误正是“原巡检尚未成功结束”，失败未降低期望或删除。
- 小范围审查后追加`resolver`定向回归：在中间生成物上2项均失败、退出1，均为Missing expected rejection，证明原名回退不能当作已配对来源；未匹配改为undefined后纳入最终回归。补充artifact规范失败/截断及合法UserMessage上下文原对象、顺序、失败/取消转交检查，不新增依赖或权限。
- 最终修复及受管重编后，`node --test tests/security-report-runtime.test.mjs`：58/58通过、0失败、0跳过。覆盖普通/分段/structured完整回执与普通/分段/spill展示组合；accepted/running/failed/canceled/cancelled及缺状态拒绝；completed且业务incomplete允许；跨会话编号、错误分组/流程、继承来源、重复回执、原始回执失败/截断、唯一HTML元数据、大小报告UTF8原字节/SHA、32MiB上限、取消、缺注册入口/路径及任意路径参数拒绝。
- 生产helper、测试及受管生成物的`node --check`通过；受管构建类型检查通过。research/validate为valid=true、errors=[]，既有ACTIVE_OUTCOME告警原样保留。
- 全部为本地Mock和静态检查：未连接SOC、未运行模型、未读真实业务附件、未启动/重放巡检或额外业务评测，不是浏览器下载或生产导出已通过的证据。公开rc.5 SDK合同已复核，调用方只使用原有注册/执行与附件能力，不自行改权限/API。

### 待协调装载与真实复验

本补丁仅保存候选及受管构建，未进行任何实例装载。待用户明确业务交付结束、通知空闲后，再统一安排一次定向装载及实际摘要回读；不以构建通过代替生效。随后由用户在53105原会话对既有completed运行导出报告即可，不为修复验证重起巡检：漏洞、基线、可达、常规分别沿原run核完整下载及字节/SHA，状态已成功下载的398387字节/SHA95d1eddc7138a48869c8f1d2f251092dc109ca501fa3626f8b78bfef724a24be作为非回归对照；运行中/失败/取消和来源未核验仍不得作为已完成报告导出。

## 本次接续：INS-HV-08、默认兼容与统一构建检查（待资产接线后装载）

### 本方已完成的最小修复

- INS-HV-08原始单IP会话session-8e183463-00e5-420c-964f-e49fffb6df11、run-d7e55a76-6268-4774-a34f-a2fc50fac334已completed仍被“当前请求没有报告生成或下载意图”拒绝。根因是私有动词识别漏掉“给出”；本次补明确“给出/出具/发给我”等报告交付问法及前后顺序，保留咨询、否定/取消与无报告请求拒绝。原句已作为集成回归，不改原运行和报告。
- 兼容补核先以旧生成物执行INS08及默认选择4项，全部失败、退出1，失败保留。现默认只从本会话真实来源倒序候选读取当前完整canonical状态，跳过已知running/failed/canceled等非完成运行，选择最近已完成原报告；未知、读取错误、来源错配不跳过。显式run_id候选仅它自己，失败不切换旧ID。原Tool参数和权限不增项。
- 当前并行故障正文、原附件复用及troubleshooting原报告逻辑均保留。共享canonical映射允许故障“活动痕迹”识别的设计未覆盖；巡检分支单独使用同组resolver精确映射，未匹配仍拒绝，不用旧拼写猜源。

### 本次实际检查与指纹

| 对象 | 本次结果/指纹 |
| --- | --- |
| 报告TS | 731b5bb13679a42b3fd09ca78a1a0693a6e66946686c1cb7d0ad691fcd9239f6 |
| 报告来源MJS | 40daacb1af53693a15bb36e7b07d5d86838966bc0d7380de4026b0161190f288 |
| 配套声明 | e0e7c831647c9d3dcc050d52ff7cac8ea66d02d09d507a95f04e65321105a86c |
| 受管报告MJS | c358d85820ee8f2df7a80d39c871c2096a35ddb6b847d585aa2e5ebef2086161；build回执61595669-fb6e-48be-b891-c2b0b3083b11 |
| 巡检专用回归 | 源码模式及受管MJS模式各85/85通过，0失败/跳过；[回归源码](</home/cmp/harness-engineering-platform-data/evolution/experiments/EXP-security-operations-expert-027-f-r3ba4799b0cb7/candidate/tests/security-report-runtime.test.mjs>) SHA8168d4331c61b42d2df7854406a5bd0f415c7d649869bc01ed21b7380de70aa8 |
| 并行报告兼容 | 按[故障接入交接](</home/cmp/harness-engineering-platform-data/agents/security-operations-expert/docs/troubleshooting-candidate-integration-20261107.md>)指定4套测试，审过导入/副作用后明确列文件运行，300/300通过，0失败/跳过；覆盖入口、主助手/legacy、新故障来源和Client VM，不等于真实GUI下载或业务通过 |
| 已交接资产TS | f98b3b00f79cb02784edb3dcf9c74a018fe1863b32dccae81e2c81a32dfc023d；本方未重复修改其源码 |
| 受管资产MJS | d349ddd705a88e82496c3a8cb91c52443a56e60744b1fd33ad33f31f147d6a2c；build回执63aed2be-a1a3-4975-b3b0-8648e085713a |
| 资产范围/否定 | 既有直接TS的20项Mock由本方复核20/20通过；未调用MCP、未写业务日记；不是实际发现或入库结果 |

两个构建均通过固定TypeScript5.9.3/esbuild0.25.12类型检查，运行时依赖未新增；报告生成物仅node:crypto。报告/资产生成物及来源/测试语法检查通过。research/validate为valid=true、errors=[]，既有ACTIVE_OUTCOME告警保留。Node源码模式有MODULE_TYPELESS_PACKAGE_JSON警告，未为消除告警修改宿主配置或依赖。各组技术结果分列，不混成业务通过率。

### 时序及剩余前置

用户先要求等待资产业务窗口，后明确21:57原156会话discover止于本地注册查找、无SOC请求/taskId/扫描/入库，窗口已结束。该失败只按用户新证据保留，不反写成SOC拒绝。根会话随后授权继续受管构建与离线检查，但要求最终装载等待资产6项操作及1模板最小主助手接线交接。本方已先给准备回执并完成上述两项构建，未对实例发起新装载、未保存共享配置、未重放任何真实业务。

待资产接线交接齐备，只核该来源绑定及最新源码/生成物，不扩大报告研究；前置满足后一次定向装载并回读current/loaded一致，再由根会话在53105原业务会话发起真实六类与下载。多IP去重新run-a0173fcf-ebde-4bdf-a4f3-a109c0425992的2台/9209字节真实下载、CIDR新run-c386826e-9adb-486d-a856-414b86f09e2f的8台/32359字节真实下载，以及深度原运行completed复核均按用户回执保留，不计为本补丁装载后的验证。
