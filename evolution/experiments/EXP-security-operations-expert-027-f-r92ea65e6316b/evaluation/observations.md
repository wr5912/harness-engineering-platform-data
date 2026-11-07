# 原实例定向修复记录

当前交付策略已按用户明确选择恢复旧版兼容流程，见文末“用户确认恢复旧版兼容交付”；前述阶段记录按发生时间保留，不作为当前交付门禁。

用户明确授权“同步原分支并重载原实例”。已从独立修复研究同步最终两项运行资产到本分支，主线及其他实例不改动：可读正文中的显式实体编号列表在本轮冻结映射唯一时展开；命令/路径/原生标识、非显式、未知或重复编号继续失败；保留模型原文、证据原值、结构化目标及全部原校验，不恢复旧版校验失败仍completed的兜底。

保存、摘要回读及静态合同检查通过，独立只读复核关闭两项实现风险。合成组件回归保留在修复研究中，未执行；两次受控真实评测启动被平台预览参数冲突阻塞，均无真实Run，预留均已取消。

仅执行一次threat-analysis-003的reload。回执为operation_failed/status=unknown，缺少本次进程加载回执；后续detail显示新进程运行，原HOME、18500端口、模型、来源和统一网关入口保留，asset_status仍unknown。日志显示Web监听，另有instance-confirmation-config因实例确认专用配置未就绪而未激活；未读取凭据或修改该配置，未盲目重试重载。

本次不声明实际加载或业务复验通过。旧Run不改写，完整原事件的新Run与正式报告仍待验证。来源、历史引入证据、修复边界及实际回执见[独立修复研究记录](<evolution/experiments/EXP-security-operations-expert-027-f-r78d4eab2e727/evaluation/observations.md>)。

## 后续：按用户要求恢复SAVE直接交付链接

用户随后明确要求仅配置save_persistence_result即可完成报告保存和下载链接交付。在当前已授权独立027分支续修，仅修改[报告保存模块](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/threat-analysis/result_storage.py>)：移除强制GET及其身份/摘要回读门槛，从SAVE成功回执直接取有效id和HTTP(S)下载地址；仍保留可信revision、大小限制、结果未知不重试、缺失链接不编造、无效存储ID不报成功。未改模型、研判校验、SOC认领/写回、名单、规则或其他版本，也未新增MCP分组权限。

新增[仅SAVE组件回归](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/test_threat_report_save_only.py>)，5个测试方法覆盖无GET条件下的一次保存、链接投影、缺失/非法链接、未知回执不重试、缺失ID和提交前限制。测试已保存回读，未执行。旧[自动化测试](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/test_threat_analysis_automation.py>)仍含旧GET断言，但平台edit/read因测试Bearer字符串将其标为redacted/不可编辑；未用原生文件写入绕过该限制，旧套件口径迁移仍待可编辑入口恢复。

源代码已保存回读，SHA-256为ed226d95c3e214d1dbebc1581d4af0dff83310ec8b37294a9f186a4e74c868d0；平台research/validate合同通过，无错误/警告。一次U-NEW-011受控复测预览通过，启动run-ac18c57c-f883-42ba-866f-64bb32dbc75b时仍返回conflict“预览参数已变化”，未创建真实评测Run，随后按状态查询与取消处理。不能称组件或真实下载验证通过。

装载方式已核对：[业务入口](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/threat-analysis.mjs#L500-L536>)每轮启动新的Python进程读取原挂载来源，因此本次Python模块修改无需重启整个实例或平台。本次未再次重载，未重写旧Run或重复上传已有报告；只对后续新Run提供新逻辑。实际新Run的SAVE回执和下载成功仍需另取证。

## 后续：认证事实混入分类说明导致误拦

本次故障为run-6d3683f6-a758-4374-aa3a-7d03a8cd7edc、事件INC-20261103-000003，F03同时包含实际认证记录和“事件类型为MALWARE_EXECUTION”。[冻结观测](<.local/instances/threat-analysis-003/dsh-home/threat-analysis/run-6d3683f6-a758-4374-aa3a-7d03a8cd7edc/fusion/five-source-output.json#L168-L207>)同一主实体活动段的同一认证行确有源IP、会话ID和该分类原值。

[旧运行结果](<.local/instances/test-zhouyang-disp14/dsh-home/threat-analysis/run-c49c1af9-da3c-438a-91e8-095a69290ba9/result.json#L6-L16>)已在北京时间2026-10-28 14:56出现同类declaration校验失败，却仍completed。当前026历史资产也已有“事件类型为”拦截标记；027去掉校验失败仍completed的旧兜底后，此类失败不再出正式报告。不能据此断言短语拦截首次引入的精确提交；不是本会话实体编号或SAVE-only修复新增了该标记。

在本独立分支增加[认证事实归一化](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/threat-analysis/fact_attributes.py>)并接到[单次模型推理入口](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/threat-analysis/model_inference.py>)：只处理已观察的完整认证句型，来源固定edr_detail白名单认证集合，要求唯一主实体活动片段、唯一同条原生event_type/source_ip/session_id逐字匹配；只分离分类子句，保留实际认证、源IP、会话、事实ID及来源。错域、跨记录、跨片段、纯类型、额外结论、命令/路径/引号字面量、隐藏原始目标、裸E及禁止来源均不被静默修复。不是通用文本重写器，不保证未知句型自动修正。

原模型输出、输入及其他业务字段不变；归一化前后和精确观测路径另存独立审计，纳入冻结文件防覆盖清单。最终正式对象仍执行同一个完整原validator，失败仍失败，不改runner门禁。未改提示词、模型、温度或SAVE-only流程，没有额外模型调用，没有改写历史Run。

新增[分类说明组件回归](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/test_threat_fact_attributes.py>)，包含6个测试方法及错域、缺值/错类型、跨行、错容器、非主实体、重复行、双片段、额外断言、字面量和其他完整校验失败等反例；已保存回读，未执行。共用业务口径新增U-NEW-012，预期不固定威胁结论。平台合同检查通过，保存不等于测试或业务通过。

已知受控eval/start预览参数冲突尚无修复证据，本轮未重复启动不可用入口或绕过接口运行程序测试。仍需在可用入口用新Run验证原事件、必要反例及报告链路；既有Run不补写为通过。修改为每轮新Python进程读取的模块，不需要重启整个实例；实际本轮新逻辑装载和端到端效果尚未取得新运行证据。

## 用户确认恢复旧版兼容交付

用户明确选择按旧版可解析对象兜底执行，并由SOC根据真实校验值判断结果。此次恢复依据及共用业务口径单处维护于[业务评测口径](<agents/security-operations-expert/evaluation.md>)：U-THREAT-FULL原本允许有效结果保留交付，U-THREAT-CONTRACT仍独立评价合同质量；本次同步U-NEW-011/012，不改历史冻结用例或把旧失败Run改成通过。

仅恢复[runner候选回流](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/threat-analysis/dsh_runner.py#L559-L588>)及[completed阅读门禁](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/dsh/managed/threat-analysis/result_delivery.py#L287-L294>)。正式交付继续使用宿主run/judgement身份，validation.failed/error及SOC validationStatus保持真实，不改为passed，不伪造forced-analysis-output。模型请求失败、缺解析制品、损坏JSON和非对象不走回流。报告样式沿原口径，不额外展示校验提示；既有SOC短摘要复核后缀不变。SAVE-only不变，无规则实际写入或处置权限增加，主线及其他实例不动。

两源文件保存摘要分别为96f1df81d95b622cc01f01235a40edb23a377e0c7392c7305dfb11e002ea2865和44d8147fca13101cc5a3c69b0057d0bd97be2d70f2d53e07e7cf10d6c0aeb5c3；预览仅有预期差异，已保存回读、平台合同检查通过，两份只读复核未发现新增实质阻塞。

新增[兼容交付组件回归](<evolution/experiments/EXP-security-operations-expert-027-f-r92ea65e6316b/candidate/tests/test_threat_compat_delivery.py>)，4个方法覆盖字典回流、无制品/坏JSON/非对象/请求失败不回流、JSON与SOC保留failed、报告不加提示、单次SAVE。已保存回读但未执行。原自动化测试仍因平台脱敏标为不可编辑，含旧拒绝回流、拒绝failed渲染及强GET断言，未绕过接口修改，不能声称完整套件通过。

按最新eval合同，仅尝试一次U-NEW-012受控复测：preview成功；start对run-cb578e50-9f08-4137-aaf3-17cf78325891仍返回conflict“预览参数已变化”。状态查询确认run_created=false，预留已取消；没有真实模型/SOC/下载复验。实例detail确认仍运行于本分支原挂载来源，HOME、端口、模型及入口未改；资产观察仍unknown，不据此报已装载通过。Python按新运行读取源文件，无需重启整个平台，但本次真实业务效果仍待新Run取证，旧Run保持原样。
