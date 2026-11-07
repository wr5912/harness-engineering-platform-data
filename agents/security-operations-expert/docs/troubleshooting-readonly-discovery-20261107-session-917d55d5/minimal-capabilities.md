# 迁移前最小能力与证据清单

清点已收口。本条仅保存上一阶段已取得的真实发现和研发交接，不新增外部查询，不读取其他 Run，不修改 Candidate、Case、编排或配置，不重载实例、不主动探测、不启动评测。

固定 Agent `security-operations-expert`、版本 `EXP-security-operations-expert-027-f-r3ba4799b0cb7`、实例 `inspection-027-schedule-acceptance`。[真实回执](<receipts.json>)保留原输入、业务结果、来源与时间；[必要Schema](<schemas.json>)只作本次取证摘录，不是新的工具配置。原始采样窗口为 2026-11-07 03:09–03:15 UTC（2026-11-06 19:09–19:15 America/Los_Angeles），不把它描述为持续刷新后的现状。

## 已验证的最小只读能力

“已验证”仅指下列目录/调用/结果层次，不代表完整根因诊断或目标实例业务通过。

| 能力与真实操作 | 业务证据 | 采用边界 |
| --- | --- | --- |
| Master `list_soc_asset`：限定对象解析、读取已有SOC状态 | R03/R04：172.16.200.11→3617609；172.16.138.226→3617426；各total=1 | IP为模糊筛选，仍精确比对并读全分页；SOC在线不是本次真实响应 |
| Ingest `get_ingest_devices_by_asset_by_asset_id`；Master `get_soc_asset_collection_capability` | R04：3617609无采集设备、modelId=null、groups=[]；3617426关联唯一deviceId=dev-71fb60c9bc57 | 关联只证明台账关系；不推断设备电源、采集正常或管理侧响应 |
| Ingest `get_admin_ingest_devices_run_state`、`get_admin_ingest_devices_plugin_configs` | R04：对上述已关联源设备查询，两者data=[] | 空结果不当正常；设备存在不等于有插件绑定；未读取凭据 |
| Detect `list_detect_alert`：限定资产与固定快照 | R05：3617609近24小时totalGroups=0、totalAlerts=0、truncated=false；snapshotId及UTC起止已保存 | 此次零组已读全；非空组页/成员分页只有Schema发现，尚未实测；零告警不等于无故障 |
| Graph `get_graph_path_query`：精确连接的只读配置模型 | R06：226→200.11/TCP443返回UNKNOWN、NO_DATA、nat_snapshot_pending、portEvaluated=false | 此连接为合同核验样本，不冒充已确认的用户故障连接；不能用reachable=false判阻断 |
| Master `get_soc_asset_port_evidence`：已有端口记录 | R09：200.11/TCP443为NO_RECORD，时间和来源均null | 不证明当前未监听或端口关闭 |

这些业务查询对应的五个相关SOC连接均已真实发现Schema。仅发现Schema、没有业务调用的采集运行历史、告警组成员和原requestId查询，不混入“已验证执行能力”。业务名称“版本”的原筛选未命中（R10），仅保留该事实，不再展开检索。

## 真实动作冲突：不列为已验证执行能力

- Response动作 `diagnose-source-tcp` v4确实存在，但它是动作目录项，不是同名独立MCP工具。其description仍称“当前停用：待完成型号模板参数校验与真实执行验收”，同时 `enabled=true`、`agentExecutable=true`（R07）。
- 真实候选包含源资产3617426／172.16.138.226／`dev-71fb60c9bc57`；型号7有启用SSH实现v5，动作能力映射查询却为空（R08）。实现清单与能力映射是不同合同，不能由空映射直接否定已有实现，也不能由模板存在认定可执行。
- 必填 `sourceIp/targetIp/port`，IPv4、端口1–65535、禁止额外字段；实际源必须属于所选执行设备。输入/输出Schema已保存在R07并由[Schema摘录](<schemas.json>)引用。
- 本次没有预览、提交或执行，没有原requestId/taskId/executionId或真机探测输出。冲突未消解前保留“待验证／未执行”；不得以任务成功代替端口可达。未知写回执先查询原requestId，不自动重放。

## 影响首版结论的必要缺口

1. SOC状态 `DATABASE_LOCAL` 没有已核时区；R03的原始心跳为NOT_OBSERVED、状态同步UNKNOWN。保留原值，不能用查询时间、evaluatedAt或资产更新时间补成源观测。
2. 尚未核得可用的DNS、应用、目标当前监听/服务、源当前路由、ICMP及管理电源/网卡原子。旧服务说明不算新平台能力；明确“未执行”，不扩展外部开发或以bash/HTTP替代。
3. 既有Run/节点/分页/HTML读取路径可复用（R11已存历史验证），但两目标LFX登记、逐项落事实后释放后继、局部汇合及故障组合Run的原HTML接入仍需后续定向实施。现有fault导出只接受本会话已完成直接子会话，不接受fault的run_id（R12）。
4. 当前业务实例工具可见性尚无本轮完整发现证据；管理侧目录成功不替代实例装载与业务通过。

## 研发进度与实例状态

**本条用户提供的研发进度**：指定实例复用评测字段 `instance_name` 已完成实现、正在验证；此前观察到的 `instance-assets` 差异来自此次并行研发。这是研发交接，不冒称本管理会话已经重新验证合同、重载或完成基线。

**保留原采样回执R01**：实例运行中，来源精确匹配指定版本；最后装载时间 `2026-11-07T02:53:01.203Z`，loaded digest为 `sha256:76852d15f33ff97bc98d289215aa7a9d645a07c1cb48804d0bca83ef9a47f364`。03:15:49 UTC采样为 `pending_reload`，相对装载的差异含适配器和故障Skill。后者的具体修改归因本条没有新增证据，不与已确认的适配器来源混同。

R13“此前describe未声明实例字段”保留为历史观察；不再将它写成“研发尚未实现”。本条不重新探查接口，不猜未验证的启动参数，也不创建其他评测实例。

## 历史引用与下一交接

历史fault报告Run仅保留已有引用：`run-47f129c0-d733-41f2-a06f-31721b95c8fc`、`run-039c1d04-3550-4c18-bb69-f3f7fb3c6c3d` 的U-FLT-013均为inconclusive，分别有workspace-connect超时和target-trace-export失败（R12）。它们仅作历史参考基线，不证明当前指定实例的迁移效果；本条未重读或扩大读取其他Run。

**接下来按用户安排：定向重载同一指定实例 → 核对真实装载及instance_name复用入口 → 保存本次迁移基线。** 本条没有执行这些步骤，也不预留新Run。取得本次真实基线后，继续同一版本的两条原生LFX编排与Harness实施：单项事实先保存、结果驱动后继、有界并发、慢支不阻塞、缺原子明确标记，保留既有报告路径和并行修改。无需再次授权，不切换版本或实例。
