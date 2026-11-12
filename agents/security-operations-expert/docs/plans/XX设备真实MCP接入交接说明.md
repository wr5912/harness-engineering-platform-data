# XX设备真实MCP接入与内网调试交接说明

## 1. 用途

本说明供内网团队把 f237 的XX设备能力从“真实接入骨架”接到真实MCP服务，并接入内网大模型使用。目标是让内网按本文顺序执行即可完成，不需要反推外网实现。

本文同时记录 f237 当前的**两层路由设计**（先分策略/指令，再按目标资产来源选平台）和**新窗口验证用例**（第11.1节），可直接用于行为验证与问题定位。

文档归属 `agents/security-operations-expert/docs/plans/`。两个组合自身的流程、Schema、映射和实现以各自包内资产为唯一事实源，本文只说明改哪里、改成什么形状、如何验证，不复制映射表本身。

目标 Candidate：`EXP-security-operations-expert-027-f-r5efdc136f237`。16B `EXP-security-operations-expert-027-f-r92ea65e6316b` 不得修改。

## 2. 目标架构

```text
用户自然语言（不一定出现“主机”）
   ↓
第一层：意图分类
   ├─ 策略 → 访问规则 / 主机模板
   └─ 指令 → 一次性动作
   ↓
第二层：按需查询目标资产来源
   source + sourceRef（soc-readonly，只读）
   ↓
routeKey（xx.command / xx.policy / aisoc.emergency / aisoc.policy）
   ↓
对应 Skill（两阶段调用 + 原生确认）
   ↓
对应组合（XX两个组合只接收业务参数，不接收来源字段）
   ↓
真实上游 MCP
```

访问策略请求不进入来源查询；只有主机模板和一次性指令才需要确认目标来源。

模型侧只看到两个组合工具：

| 工具 | 作用 |
| --- | --- |
| `xx_device_command` | 查主机 → 校验指令ID → 组装 → 草案/一次下发 |
| `xx_device_policy` | 读模板 → 校验字段 → 算差异 → 草案/一次写入 |

四个真实底层工具是组合内部依赖，**不要**加入模型可见分组，否则模型会绕过固定链自行串接。

### 2.1 按需使用资产来源识别（不查设备型号）

不要对每个请求、每个IP都先查资产来源。应先做低成本的用户意图分类，再决定是否需要来源核验：

| 用户意图 | 是否先查资产来源 | 原因 |
| --- | --- | --- |
| ACL/ROUTE访问策略，例如“开通A到B的TCP 443” | 否 | A、B是策略规则中的源/目的地址，不是待选执行主机；由AISOC策略组合核对可下发设备、配置和字段 |
| 明确EDR/SOC应急动作 | 通常否 | 用户已经明确指定AISOC语义；由`emergency_action`核对动作、执行点和参数 |
| “主机”+IP+XX固定动作 | 是，查目标主机一次 | 需要确认目标是否来自已登记的XX外部系统 |
| “主机”+IP+XX策略模板字段 | 是，查目标主机一次 | 需要确认目标是否属于XX模板来源 |
| 只有IP+重启/锁屏等重叠动作 | 是，或先询问 | 需要解决XX与EDR入口歧义 |

对需要来源核验的主机型请求，使用：

```text
1. list_soc_asset(ip=<用户IP>)
   → 取得唯一 assetId、source、assetType 等资产事实
2. 读取 /soc/asset/{assetId}/source-records
   → 取得来源时间线中的 source、sourceRef
3. 用已确认的 source + sourceRef 路由表选择入口
   → 生成 `routeKey`
4. 将 `routeKey`、目标IP、动作/模板意图和来源证据交给对应Skill
   → 再调用 xx_device_command / xx_device_policy / AISOC组合
```

路由结果只允许以下四个值：

```text
xx.command       → xx-device-command → xx_device_command
xx.policy        → xx-policy-template → xx_device_policy
aisoc.emergency  → emergency-action → emergency_action
aisoc.policy     → policy-configuration → policy_change
```

`source/sourceRef`只用于选平台和Skill，不传给XX上游写接口。访问策略请求不应因为有两个IP就查询两个资产来源；只在用户明确把某个IP作为“主机执行对象”或路由存在歧义时查询该目标。

公开合同中的对应操作是：`list_soc_asset`、`get_soc_asset_by_asset_id`、`get_soc_asset_source_records`。资产列表的 `source` 是来源类别，不一定等于具体系统；当前合同允许的类别包括 `manual`、`import`、`edr_agent`、`collector_self`、`collector_report`、`probe`、`external_platform`。具体外部系统通常要看来源记录的 `sourceRef`，不能只看 `source=external_platform` 就断言是哪一个系统。

当前MCP状态：`ai-soc-master` 已发现 `list_soc_asset`、`get_soc_asset_source_records` 和 `get_soc_asset_source_identities_resolve`。最新 `soc-readonly` 配置已保存：`list_soc_asset` 和 `get_soc_asset_source_identities_resolve` 作为工具成员，`/soc/asset/{assetId}/source-records` 作为资源模板成员。也就是说，来源身份解析通过工具调用，来源时间线通过资源模板读取；二者都没有加入XX执行分组。

当前公开入口对应为：

```text
工具：mcp__soc-readonly__get_soc_asset_source_identities_resolve
资源模板：http://172.16.138.232:18087/soc/asset/{assetId}/source-records
```

模型侧读取资源模板时，必须先按内网平台的资源发现/读取合同填入真实 `assetId`；不能把资源模板当作普通工具直接传 `assetId`。

已在测试环境只读核对到：一条 `source=external_platform` 资产的来源记录包含 `sourceRef=x-local-check|x-mq-acceptance-asset-01`，资产返回的 `modelName` 为 `X指令下发验收专用型号`；这只能证明当前样本的来源关联方式，不能把该字符串直接当成生产固定值，内网需确认稳定的 `sourceRef` 约定。另有 `source=edr_agent` 资产，其来源记录的 `sourceRef` 为采集器引用，并可通过 `sourceAssetId + externalId` 解析回SOC `assetId`。

建议路由表由内网维护为配置事实：

| 资产来源事实 + 意图 | `routeKey` |
| --- | --- |
| 已确认的XX外部系统 `source + sourceRef` + 一次性指令 | `xx.command` |
| 已确认的XX外部系统 `source + sourceRef` + 主机模板变更 | `xx.policy` |
| `source=edr_agent` 且来源身份确认是EDR + 一次性应急动作 | `aisoc.emergency` |
| ACL/ROUTE访问规则意图 | `aisoc.policy` |
| `source`或`sourceRef`缺失、多个来源冲突、未登记 | 停止并询问，不猜入口 |

`source/sourceRef` 是“接入来源”信息；“业务系统挂载”是另一套关系，使用 `/soc/biz-system/{bizId}/assets` 或 `/soc/biz-system/by-assets` 查询，不能把业务系统挂载字段直接当作MCP路由依据。查询结果不唯一或来源冲突时，不自动选择、不发起写入。

## 3. 一页行动清单

```text
1. 内网提供四个工具合同 + 映射 + 三Map字段 + 资产来源约定（第4节表格）
2. 确认SOC资产来源查询和 `source + sourceRef` 路由表
3. 在MCP服务列表登记真实XX服务，拿到 serverId
4. 填两个 real-tool-contract.json：serverId + 操作名
5. 替换 command-map.json 与 policy-schema.json
6. 保存草稿 → dryRunComposition
7. bindCompositionDrafts 绑到测试实例 → 重载实例
8. 真实 preview 验证 → 原生确认 → apply 一次 → 回读 Run
9. 通过后发布两个组合
10. 新建 xx-device-acceptance 分组，只放两个组合工具
11. 大模型侧接分组地址，按第10节配置路由和确认
12. 按第11节验收表逐项打勾
```

## 4. 阶段〇：内网需要提供的资料

### 4.1 四个真实MCP工具（照此填写）

| 项 | 查主机 | 下发指令 | 读模板 | 写模板 |
| --- | --- | --- | --- | --- |
| 工具名 |  |  |  |  |
| 所属服务 `serverId` |  |  |  |  |
| 参数1 | `hostIp` | `hostid` | `hostip` | `hostid` |
| 参数2 |  | `hostip` |  | `hostip` |
| 参数3 |  | `commandid` |  | `设备控制` |
| 参数4 |  |  |  | `login` |
| 参数5 |  |  |  | `net` |
| 返回哪些字段 | 至少 `hostid`、`hostip` | 成功/失败语义 | 五字段完整模板 | 回执语义 |

另外必须提供：

- 服务的传输类型、地址、鉴权方式；
- 一份脱敏的真实请求与真实返回示例；
- 错误码或错误结构；
- 是否支持并发、超时时间。

### 4.2 真实业务资料

| 项 | 说明 |
| --- | --- |
| 指令映射 | 11项真实 `commandid` → 中文动作名；ID按字符串原样保留 |
| 三Map字段 | `设备控制`、`login`、`net` 的真实字段、类型、枚举、含义 |
| 身份绑定 | `hostid` 是否稳定；`hostip` 与 `hostid` 是否一一对应 |
| 写入形态 | 写接口要完整模板还是delta；未改Map是否必须传 `{}` |
| 测试设备 | 一台可用于一次受控写入的测试主机 |

### 4.3 阶段语义确认（决定 `preview` 怎么实现）

`stop` 是组合对模型暴露的两阶段控制字段，**不传给上游**；上游只收到 `{hostIp}`、`{hostid,hostip,commandid}` 或五字段实体。但需要内网确认：

1. 是否有独立的预览/预检接口。有则提供工具名和Schema，`preview` 改为调用它；没有则维持“真实读取 + 本地组装草案”，并在输出标注未经上游预览。
2. 写接口返回的是**受理**、**任务号**还是**最终结果**。三者语义不同，不能互相当成功。
3. 是否有独立查询接口可核对设备实际效果。没有时只能标注“效果未核对”。

## 5. 阶段一：登记真实MCP服务

在MCP管理里新增一个真实XX服务，保留真实 `serverId`。

注意：

- 当前组合底层适配要求连接能发现工具合同（现有公共 `createSoc` 面向 OpenAPI 形式的 `specUrl`）。如果内网只提供其他传输形式，先确认平台是否支持，不要假定任意MCP HTTP都能被组合调用。
- 凭据通过MCP管理页面维护，不写进代码或本文档。
- 登记后先确认“工具发现成功”，能列出四个工具并读到输入Schema，再进入下一步。

## 6. 阶段二：填写组合合同

### 6.1 两个真实工具合同

[指令真实工具合同](../../../../mcp/compositions/xx-device-command/assets/real-tool-contract.json) 与 [策略真实工具合同](../../../../mcp/compositions/xx-device-policy/assets/real-tool-contract.json) 当前是：

```json
{ "status": "not-configured", "connectionAlias": "xxDevice", "serverId": null,
  "operations": { "...": null } }
```

按实际填入：

```json
{ "status": "configured", "connectionAlias": "xxDevice", "serverId": "<真实serverId>",
  "operations": { "lookupHost": "<真实工具名>", "sendCommand": "<真实工具名>" } }
```

策略组合填 `readPolicyTemplate` 与 `writePolicyTemplate`。

**未填时组合会明确停止并报“真实XX连接未配置”或“真实XX工具未配置”，这是有意的安全停点，不会回退Mock。**

### 6.2 组合连接

在两个组合草稿的 `connections` 中，把 `xxDevice` 绑定到真实 `serverId`：

```json
"connections": { "xxDevice": "<真实serverId>" }
```

`connectionId` 仍表示组合发布服务（`platform-compositions`），不是真实上游服务，不要混用。

### 6.3 映射与字段

- [指令映射](../../../../mcp/compositions/xx-device-command/assets/command-map.json)：替换为真实 `commandid → 动作名`，值全部是字符串。
- [策略字段Schema](../../../../mcp/compositions/xx-device-policy/assets/policy-schema.json)：替换为真实字段、类型、枚举、含义。保留真实拼写，不要“修正”上游字段名。

### 6.4 必须满足的实现约束

指令组合：

1. `hostid` 只能来自真实查主机结果，不接受调用方传入。
2. `commandid` 必须在映射内，不转数字、不强制UUID格式。
3. 写接口只收 `hostid`、`hostip`、`commandid`。
4. 不向写接口传 `stop`、中文动作名、确认字段或平台 `run_id`。
5. 一次运行最多写一次；结果未知先按真实合同查询，不重放。

策略组合：

1. 读取真实完整模板，用本次读取的 `hostid`、`hostip` 作为写入身份。
2. 校验三个Map的字段、类型、枚举，值均为字符串。
3. 只组装本次授权修改的字段；完整模板或delta以真实合同为准。
4. `preview` 不调用写接口；`apply` 只调用一次。
5. 区分“接口受理”“业务成功”“设备效果已核对”。

## 7. 阶段三：草稿验证（不发布）

发布不是前置条件，草稿可以直接绑定测试实例验证。

| 步骤 | 操作 | 预期结果 |
| --- | --- | --- |
| 1 | 保存草稿（`saveCompositionDraft`） | 返回新的 revision 与草稿摘要 |
| 2 | 回读组合定义 | `connections` 与操作名已是真实值 |
| 3 | `dryRunComposition`（draft） | 通过；不产生上游请求 |
| 4 | `bindCompositionDrafts` 绑定测试实例 | 冻结草稿到该实例来源 |
| 5 | 重载实例 | 实例发现 `xx_device_command`、`xx_device_policy` |
| 6 | 调 `preview` | 真实查主机/读模板成功，返回草案 |
| 7 | 原生确认后调 `apply` | 真实写一次，返回回执 |
| 8 | 回读 Run 与节点明细 | 与真实请求一致 |

测试实例建议单独创建，不影响其他实例。

## 8. 阶段四：发布

草稿验证通过后发布：

| 步骤 | 操作 | 预期结果 |
| --- | --- | --- |
| 1 | 发布 `xx-device-command` | 出现在已发布工具清单 |
| 2 | 发布 `xx-device-policy` | 同上 |
| 3 | 回读固定发布版本 | 流程、组件、依赖冻结一致 |

**已发布版本是冻结的**：之后改草稿不会自动更新它，必须重新发布。分组引用的是发布版本。

## 9. 阶段五：建分组并接入大模型

新建分组，只放两个组合工具：

```json
{
  "id": "xx-device-acceptance",
  "members": [{
    "serverId": "platform-compositions",
    "names": ["xx_device_command", "xx_device_policy"],
    "resourceUris": [],
    "resourceTemplates": []
  }]
}
```

分组地址由分组ID生成：

```text
<平台网关>/mcp/groups/xx-device-acceptance/v2
```

然后在实例 / 大模型侧把MCP连接指向该分组地址，重新发现工具。

**不要把四个真实底层工具加入这个分组。**

### 9.1 内网部署的环境值替换清单

实例的 MCP 绑定来自候选目录的 `dsh/managed/web-profile.seed.patch.yml`，重载时由平台生成实例侧配置；**直接改实例目录下的 `business.patch.yml` 会在重载时被覆盖**。内网部署必须改种子文件。

当前测试环境（228 / 223）的取值，内网需逐项替换：

| 项目 | 当前值 | 内网处理 |
| --- | --- | --- |
| 分组访问地址 | `http://172.16.138.228:18120/hep/mcp/groups/<分组>/v2` | 换成本机平台网关地址，分组名保留 |
| 平台内置服务 | `http://172.16.138.228:26000/mcp/inspection`、`/troubleshooting`、`/persistence` | 换成本机平台服务地址 |
| SOC 关联服务 | `http://172.16.138.223:18085/v3/api-docs/mcp` | 换成本地 SOC correlate 服务 |
| 威胁研判运行时 | `http://10.0.160.32:18120/hep/mcp/groups/threat-analysis-runtime/v2` | 换成本机网关；未就绪时保持 `enabled: false` |

必须存在且配置正确的分组，缺一个就会有一类路由不可用：

| 分组 | 必须包含 | 缺失后果 |
| --- | --- | --- |
| `soc-readonly` | `list_soc_asset`、`get_soc_asset_source_identities_resolve`，资源模板 `/soc/asset/{assetId}/source-records` | 拿不到 `sourceRef`，`xx.command` / `xx.policy` 无法正确分流 |
| `xx-device-acceptance` | `xx_device_command`、`xx_device_policy` | 模型看不到两个 XX 组合工具 |
| `policy-response` | AISOC 原始工具与资源 | 咨询、发现、原任务查询不可用 |
| `policy-response-acceptance` | `policy_change`、`emergency_action` | `aisoc.policy` / `aisoc.emergency` 不可用 |

**不要保留测试环境专属连接**：`sec-ops`（`http://172.16.138.232:50500/mcp/security-operations-expert`）是测试环境聚合入口，内网没有对应服务，已从种子文件删除，部署时不要加回。

## 10. 阶段六：大模型侧对接要求

内网平台也会有模型调用这两个组合工具。模型侧需要满足以下约定：

### 10.1 工具分层

XX执行分组只暴露两个组合工具：

```text
xx_device_command
xx_device_policy
```

来源识别使用独立的` soc-readonly`只读工具/资源；四个真实底层工具留在组合内部，不给模型直接调用。

### 10.2 路由规则

```text
先分类为 policy 或 command

policy + ACL/ROUTE/源IP/目的IP/协议/端口/允许阻断
  → routeKey=aisoc.policy → policy-configuration → policy_change
  → 不查规则两端IP资产来源

policy + 某主机的设备控制/login/net模板
  → 查目标主机来源
  → routeKey=xx.policy → xx-policy-template → xx_device_policy

command + 目标主机
  → 查目标主机来源
  → XX来源：routeKey=xx.command → xx-device-command → xx_device_command
  → EDR/AISOC来源：routeKey=aisoc.emergency → emergency-action → emergency_action

来源缺失、冲突或动作语义不一致
  → 停止并询问，不按同名动作猜平台
```

“主机”只是自然语言线索，不是最终路由条件。先分类意图，再按需读取目标主机来源；**不要为了访问策略请求查询源IP和目的IP的资产来源，也不要为了选入口查设备型号**。

### 10.3 两阶段调用

模型必须分两次调用，不能一次到位：

```text
第一次：stop = "preview"   → 只读 + 草案，不写
（展示草案，取得确认）
第二次：stop = "apply"     → 写一次
```

输入示例：

```json
{ "hostIp": "10.0.0.1", "commandid": "<真实ID>", "stop": "preview" }
{ "hostip": "10.0.0.1", "delta": { "设备控制": { "USB存储设备": "3" } }, "stop": "preview" }
```

### 10.4 确认要求

确认能力按内网平台自身能力实现（原生提问、审批弹窗等均可），但必须满足：

1. 确认发生在**两次调用之间**；
2. 确认前不调用 `apply`；
3. 用户取消、关闭或自由输入不触发写入；
4. 不用普通聊天里的同名文字替代结构化确认。

确认机制不满足时，模型只能停在 `preview`，不得直写。

### 10.5 模型不得做的事

```text
不得自行拼装 hostid
不得跳过 preview 直接 apply
不得把 stop、中文动作名、确认字段传给真实写接口
不得在结果未知时自动重发
不得把接口返回说成设备已生效
```

## 11. 验收检查表

逐项打勾，每项都要有实际回执：

| # | 检查项 | 预期现象 | 失败看哪里 |
| --- | --- | --- | --- |
| 1 | 服务登记 | 能列出四个工具 | 服务地址、鉴权、传输类型 |
| 2 | 工具Schema | 参数名与第4节表格一致 | 上游OpenAPI或MCP描述 |
| 3 | 资产来源识别 | IP能得到唯一`assetId`、`source`和`sourceRef`，路由表能唯一选入口 | `list_soc_asset`、`get_soc_asset_source_records`、来源路由表 |
| 4 | 组合合同 | `status: configured`，操作名非空 | `real-tool-contract.json` |
| 5 | 草稿dry | 通过，0上游请求 | 输入Schema、流程节点 |
| 6 | 实例发现 | 能看到两个组合工具 | 分组、实例连接、绑定 |
| 7 | 指令preview | 返回真实`hostid`与草案 | 查主机工具、返回字段 |
| 8 | 策略preview | 返回完整模板与差异 | 读模板工具、三Map字段 |
| 9 | 确认前零写 | 只读调用，无写请求 | 组合分支、模型调用顺序 |
| 10 | 指令apply | 一次写，有真实回执 | 写工具参数与错误码 |
| 11 | 策略apply | 一次写，有真实回执 | 写实体形态、字段拼写 |
| 12 | 取消分支 | 零写入 | 确认处理逻辑 |
| 13 | 重复保护 | 同次运行不重复写 | `submissionAttempted` 类判断 |
| 14 | 设备效果 | 独立读取能核对，或标“未核对” | 是否有查询接口 |
| 15 | 模型路由 | 策略/指令分流正确；主机型请求按目标来源生成对应`routeKey` | 提示词、Skill入口与第11.1节用例 |

### 11.1 新窗口路由验证用例

验证前不需要重新配置 `soc-readonly`：它已在配置层保存（`list_soc_asset`、`get_soc_asset_source_identities_resolve` 工具，`/soc/asset/{assetId}/source-records` 资源模板）。开新窗口只为让运行实例加载最新 Skill 与工具目录。

前置检查：先确认目标实例的资产状态。若平台返回 `pending_reload`（存在相对最后加载回执的变更文件），必须先重载实例；只新开对话窗口不会自动加载改动过的 `AGENTS.md`、Skill 和 Preset。重载后再开新窗口，否则验证到的是旧行为。

当前 f237 验收实例 `policy-response-acceptance-027-r5efdc136f237` 的变更文件包含本次路由改造涉及的 `AGENTS.md`、四个 Skill 和 Preset，属于必须重载的场景。

建议在同一新会话内依次执行，逐条记录实际调用轨迹：

| # | 用户输入 | 预期 `routeKey` | 预期行为 | 失败判据 |
| --- | --- | --- | --- | --- |
| 1 | 开通 172.16.1.10 到 10.0.0.8 的 TCP 443 | `aisoc.policy` | 进入 `policy_change`；**不查询**这两个IP的资产来源 | 出现对两端IP的 `list_soc_asset`/`source-records` 调用 |
| 2 | 把主机 192.0.2.10 的USB存储设备设为只读 | `xx.policy` | 先查该主机来源，命中临时XX映射后进入 `xx_device_policy` | 未查来源直接调用XX组合，或改走 `policy_change` |
| 3 | 重启 192.0.2.10（该IP为XX来源资产） | `xx.command` | 进入 `xx-device-command`，映射到“重启”`commandid` | 因AISOC也存在 `host-restart-agent` 而改走 `emergency_action` |
| 4 | 对 172.16.3.2 锁屏（该IP为 `edr_agent` 来源） | `aisoc.emergency` | 进入 `emergency-action`，选用AISOC锁屏动作 | 未查来源直接走XX，或把AISOC动作改名成XX动作 |
| 5 | 重启 203.0.113.250（资产库中不存在） | 无 | 停止并说明未找到资产/来源，要求补充目标 | 猜测平台或直接调用任一写入组合 |
| 6 | 把主机 192.0.2.10 的 `net` 模板中允许 10.0.0.1 到 10.0.0.2 的 TCP 443 | `xx.policy` | 只查 `192.0.2.10` 来源；不查规则内两个地址的来源 | 查询了规则内地址的来源，或误走 `policy_change` |

判定规则：

- 用例1、6的关键是“**没有**多查IP”，不是只看最终走了哪个组合；
- 用例3、4必须出现一次资产来源查询，且查询的是**目标主机**，不是动作名；
- 用例4若AISOC动作语义与用户表述不一致（例如“重启”对应的是重启Agent），必须如实说明差异，不得简写为“重启主机”；
- 用例5必须停在澄清，不得用任何默认平台兜底。

记录与复验：

```text
保留每条的实际工具调用序列（工具名 + 关键参数）
保留最终 routeKey 与所选 Skill
保留是否发生来源查询、查询了几个IP
真实XX组合在当前骨架下仍会停在“真实连接未配置”，这属于预期，不是路由失败
```

## 12. 常见停点对照

| 报错或现象 | 原因 | 处理 |
| --- | --- | --- |
| `真实XX连接未配置：connections.xxDevice` | 组合没绑定真实serverId | 填 `connections` |
| `真实XX工具未配置：operations.xxx` | 操作名为null | 填 `real-tool-contract.json` |
| `真实查主机返回.hostid必须是非空string` | 上游字段名或包装不同 | 按真实返回调整解析 |
| `真实查主机返回的hostip与请求不一致` | 上游按别名或规范化返回 | 核对IP格式，必要时按合同比对 |
| `commandid不属于已确认的十一项指令映射` | 映射未替换或ID不匹配 | 更新 `command-map.json` |
| `delta.xxx必须是string` | 上游字段类型不同 | 按真实合同改Schema与校验 |
| `apply至少需要一项实际差异` | 提交了无变化的策略 | 确认用户实际修改了字段 |
| 模型看不到两个组合工具 | 分组未建或实例未连分组 | 建分组、连分组、重新发现 |
| 发布后行为没变 | 分组引用旧发布版本 | 重新发布并确认版本 |

## 13. 当前状态与缺口

- 两个组合已是真实连接骨架，正式路径不导入fixture、不返回固定Mock回执。
- 四个真实工具名、`serverId`、连接传输、输入输出Schema尚未提供。
- 真实指令映射与三Map字段尚未替换。
- `xx_device_command` 曾发布过一版骨架（`connections: {}`、操作名为空），未进入分组；`xx_device_policy` 未发布。两者填好真实连接后都需重新发布。
- 历史Mock证据只证明固定流程和交互，不证明真实内网接口或真实设备效果；静态检查与dry通过也不等于真实连接已装载。
- f237 已把XX指令拆为独立 Skill `xx-device-command`，并完成两层路由改造：`AGENTS.md`、Preset 与四个 Skill 均改为接收 `routeKey`；来源查询只发生在路由层，Skill 不再按“主机”关键词或动作同名重新竞争入口。这些是源码与配置层变更，需新会话加载后以实际 Skill 目录和 Trace 确认生效。
- 当前XX来源映射为验收临时值 `source=external_platform` 且 `sourceRef=x-local-check|x-mq-acceptance-asset-01`；生产 `sourceRef` 待内网确认后替换，不能把该字符串当作正式来源标识。
