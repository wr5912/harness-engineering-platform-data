// 仅供离线版式/交互测试的合成资料；不查询SOC、不冒充真实业务Run，不使用用户参考附件中的业务数据。
export const DEMO_NOTE = '离线格式测试样例：合成资料，未查询SOC、未执行新的业务运行，不作为现场巡检或故障结论。'
export function inspectionFixture() {
  const scope = { count: 3, frozen_at: '2026-01-02T03:00:00Z', requested: { assetIds: [1001,1002,1003] } }
  const asset = (assetId,ip,hostname,status,message,facts={}) => ({assetId,ip,hostname,status,message,observed_at:'2026-01-02T02:55:00Z',facts})
  const result = { kind:'routine', status:'incomplete',run_id:'STYLE-DEMO-NOT-A-BUSINESS-RUN',message:DEMO_NOTE,generated_at:'2026-01-02T03:01:00Z',scope,
    checks:{
      status:{kind:'status',status:'incomplete',scope,counts:{normal:1,abnormal:1,unknown:1,not_applicable:0,failed:0},items:[
        asset(1001,'192.0.2.10','示例业务节点甲','normal','样例上报状态在线；不是当前现场状态',{online:'online',onlineBasis:'REPORTED',stateEvidence:{online:'online',timeBasis:'UTC',evaluatedAt:'2026-01-02T02:55:00Z',signals:[{validity:'CURRENT',supportsOnline:true,observedAt:'2026-01-02T02:54:00Z'}]}}),
        asset(1002,'192.0.2.20','示例接入节点乙','abnormal','样例已保存离线标记；原因未确定',{online:'offline'}),
        asset(1003,'192.0.2.30','示例设备丙','unknown','没有足够状态证据，保留未知'),
      ]},
      baseline:{kind:'baseline',status:'incomplete',scope,counts:{normal:1,abnormal:1,unknown:1,not_applicable:0,failed:0},items:[
        asset(1001,'192.0.2.10','示例业务节点甲','normal','样例明确核查结论通过',{report:{assetId:1001,templateId:101,passFlag:true},readiness:{assetId:1001,templateId:101,applicableCount:3,memberCount:3}}),
        asset(1002,'192.0.2.20','示例接入节点乙','abnormal','样例明确核查结论未通过',{report:{assetId:1002,templateId:101,passFlag:false},readiness:{assetId:1002,templateId:101,applicableCount:3,memberCount:3}}),
        asset(1003,'192.0.2.30','示例设备丙','unknown','未返回本次核查报告，不能计为通过',{readiness:{assetId:1003,templateId:null,coverageReason:'未分配模板'}}),
      ]},
      vulnerabilities:{kind:'vulnerabilities',status:'completed',scope,counts:{normal:1,abnormal:1,unknown:0,not_applicable:0,failed:0},items:[
        asset(1002,'192.0.2.20','示例接入节点乙','abnormal','有一条样例关联漏洞记录',{vulnerabilities:[{id:'VULN-DEMO-01',cveId:'DEMO-CVE',severity:'样例风险'}]}),
        asset(1001,'192.0.2.10','示例业务节点甲','normal','样例查询未返回关联记录；不代表现场没有漏洞'),
      ],findings:[{identity:'VULN-DEMO-01',observations:[{sourceAssetId:1002,record:{id:'VULN-DEMO-01',vulnerabilityId:'VULN-DEMO-01',cveId:'DEMO-CVE',severity:'样例风险'}}]}]},
      reachability:{kind:'reachability',status:'incomplete',scope,counts:{normal:0,abnormal:1,unknown:1,not_applicable:1,failed:0},items:[
        {ruleId:'RULE-DEMO-A',ruleName:'样例业务分区规则',status:'abnormal',srcIp:'192.0.2.10',dstIp:'192.0.2.20',protocol:'tcp',port:443,message:'已存模型结论不符合样例规则；不是主动连通性验证',facts:{path:{reachable:false,verdict:'DENY',reason:'样例配置模型结论'}}},
        {ruleId:'RULE-DEMO-B',ruleName:'样例证据缺口规则',status:'unknown',message:'样例缺少完整路径证据，不能判断'},
        {ruleId:'RULE-DEMO-C',ruleName:'样例不适用规则',status:'not_applicable',message:'已存适用性结论为不适用，不作正常计数'},
      ]},
    },
  }
  // 按生产assess的真实公开输出结构组织资料，而非根据参考附件拼字段。
  for (const entry of result.checks.baseline.items.slice(0, 2)) {
    entry.facts.report.run = { assetId:entry.assetId,templateId:101,passFlag:entry.status==='normal'?'1':'0' }
    delete entry.facts.report.passFlag
    Object.assign(entry.facts.readiness,{assetType:'host',templateScopeMatched:true,coverageReason:'APPLICABLE_ITEMS_PRESENT',items:[1,2,3].map(itemId=>({itemId,applicable:true,applicabilityReason:'MATCHED'}))})
  }
  const vulnerabilities=result.checks.vulnerabilities
  vulnerabilities.items[0].findings=vulnerabilities.findings
  vulnerabilities.items[0].sources=[{assetId:1002,observed_at:'2026-01-02T02:55:00Z',records:1}]
  vulnerabilities.items[0].errors=[]
  vulnerabilities.items[0].coverage='existing_records_only'
  delete vulnerabilities.items[0].facts.vulnerabilities
  delete vulnerabilities.findings
  vulnerabilities.items[1].status='unknown'
  vulnerabilities.items[1].findings=[]
  vulnerabilities.status='incomplete'
  vulnerabilities.counts={normal:0,abnormal:1,unknown:1,not_applicable:0,failed:0}
  return result
}
export function faultFixture() {
  const run='STYLE-DEMO-NOT-A-BUSINESS-RUN',from='2026-01-02T00:00:00Z',to='2026-01-02T03:00:00Z'
  const item=(id,check,status,message,extra={})=>({id,node_id:id,run_id:run,check,status,message,recorded_at:'2026-01-02T03:00:00Z',observed_at:null,source_timezone:'unknown',execution_point:{kind:'SOC_READONLY',services:['mock-source']},raw_receipt_refs:[{run_id:run,node_id:id,receipt_id:`ref-${id}`}],...extra})
  return {kind:'business-access',run_id:run,status:'incomplete',generated_at:'2026-01-02T03:01:00Z',message:DEMO_NOTE,
    input:{source:{assetId:1001,ip:'192.0.2.10'},target:{assetId:1002,ip:'192.0.2.20'},protocol:'tcp',port:443,from,to},
    scope:{source:{assetId:1001,ip:'192.0.2.10'},target:{assetId:1002,ip:'192.0.2.20'},frozen_at:to},
    symptoms:[{id:'SYMPTOM-DEMO',title:'样例报障：访问超时',message:'仅用于版式演示的已保存报障，不代表实际现场故障'}],
    metrics:{symptoms:1,pending_verification:1},
    items:[item('demo-source','source-soc-state','observed','样例平台保存在线标签；不证明业务正常',{online:'online',onlineBasis:'REPORTED'}),
      item('demo-path','configuration-path','unknown','路径模型缺少完整快照；不能判断实际连接或因果',{model:{verdict:'UNKNOWN'}}),
      item('demo-tcp','current-source-tcp','unavailable','没有本次源端响应原子，未执行主动TCP',{executed:false})],
    causes:[{id:'CAUSE-DEMO-A',title:'待验证：目标响应证据不足',status:'unknown',message:'样例已保存候选，不能确定为根因',
      support_conditions:[{field:'response_status',operator:'equals',expected:'TIMEOUT',actual:null,status:'unknown',evidence_refs:['ref-demo-tcp']}],
      rebuttal_conditions:[{field:'online',operator:'equals',expected:'online',actual:'online',status:'unknown',message:'平台在线不能反驳应用故障'}]},
      {id:'CAUSE-DEMO-B',title:'待验证：路径观测缺失',status:'unknown',support_conditions:[{field:'verdict',operator:'equals',expected:'ALLOW',actual:'UNKNOWN',status:'unknown'}]}],
    gaps:[{check:'current-source-tcp',status:'unavailable',reason:'未执行主动检查，缺真实响应'}],active_checks_executed:false,
    next_check:'样例后续建议：沿原对象补充所需只读证据；未执行，不自动改变设备或配置。',
  }
}
export function offlineFixture() {
  const result=faultFixture()
  result.kind='device-offline';result.input={asset:{assetId:1002,ip:'192.0.2.20'},observer:{assetId:1001,ip:'192.0.2.10'},from:result.input.from,to:result.input.to}
  result.scope={asset:result.input.asset,observer:result.input.observer,frozen_at:result.scope.frozen_at}
  result.items=[{...result.items[0],check:'soc-state',reported_state:'offline'}, {...result.items[2],check:'management-observation',status:'unknown',message:'样例未记录本次管理响应；不能推断设备断电'}]
  delete result.causes
  return result
}
