import { canonical } from '../../../src/diagnostic-context.ts'
type V=Record<string,any>

/** 每个方法对应一个原生画布节点，调度回边仅由LFX执行。 */
export function offlineEvidenceLoop(components:V,reassess:(context:any,fact:V)=>void){
 const loop=(c:V)=>c.shared.diagnostic_loop
 const out=(c:V,v:V={})=>({diagnostic_id:c.shared.diagnostic_id??c.runId,round:loop(c).round,...v})
 const stop=(c:V,reason:string)=>{loop(c).stop_reason=reason;return out(c,{route:'stop',reason})}
 const checks:V={identity:{component:'resolve',reason:'唯一核对冻结设备及可选观察源',value:100},status:{component:'status',reason:'读取同设备SOC状态及真实来源时区',value:90},management:{component:'management',reason:'核对当前管理原子能力，缺来源不替代探测',value:80},alerts:{component:'alerts',reason:'读取明确历史窗内同设备告警',value:60},path:{component:'unknownPath',reason:'读取已核观察源至原设备的已有配置路径',value:50},capability:{component:'capability',reason:'真实响应后核对采集适用性',value:75},bindings:{component:'bindings',reason:'已核真实响应后读取唯一采集绑定',value:70},runState:{component:'runState',reason:'读取唯一采集设备运行状态',value:65},configState:{component:'configState',reason:'读取唯一采集设备配置状态',value:64},heartbeat:{component:'heartbeat',reason:'核对原始心跳能力而非替换为lastSeenAt',value:40},synchronization:{component:'synchronization',reason:'核对源事件到SOC同步能力',value:39}}
 const key=(name:string,c:V)=>canonical([name,c.shared.scope.requested,checks[name].reason])
 function prereq(name:string,c:V){
  if(name==='identity')return true
  if(!c.shared.scope.asset)return false
  if(name==='alerts')return !!c.shared.scope.time.query_window
  if(name==='path')return !!c.shared.scope.observer
  if(['capability','bindings'].includes(name))return !!loop(c).management?.response_verified
  if(['runState','configState','heartbeat','synchronization'].includes(name))return !!loop(c).binding?.deviceId&&!!loop(c).binding?.response_verified
  return true
 }
 function select(c:V){return Object.keys(checks).filter(n=>n!=='identity'&&prereq(n,c)&&!loop(c).attempts[key(n,c)]).sort((a,b)=>checks[b].value-checks[a].value).map(check=>({check,reason:checks[check].reason}))[0]}
 function validate(v:V,c:V){
  if(!checks[v.check]||!prereq(v.check,c))return stop(c,'检查不在剧本或前置/执行点未核')
  if(c.shared.request_count>=48||loop(c).round>=24)return stop(c,'预算耗尽')
  const k=key(v.check,c);if(loop(c).attempts[k])return stop(c,'重复/未知检查已抑制；先核原执行，不自动重发')
  loop(c).pending={check:v.check,key:k,reason:v.reason??checks[v.check].reason}
  c.shared.rounds.at(-1)&&(Object.assign(c.shared.rounds.at(-1),{next_check:v.check,reason:loop(c).pending.reason}))
  c.progress({status:'completed',result:{kind:'diagnostic-selection',round:loop(c).round+1,pending:loop(c).pending}})
  return out(c,{validated:true,check:v.check})
 }
 const report=(c:V,config:V)=>({...components.loopFinalReport({terminal:loop(c).stop_reason?'evidence-loop-stopped':'evidence-loop-report'},config,c),diagnostic_loop:structuredClone(loop(c)),stop_reason:loop(c).stop_reason})
 return {
  loopAccept:(_v:V,_cfg:V,c:V)=>out(c,{scope:c.shared.scope}),
  loopContext:(_v:V,_cfg:V,c:V)=>out(c,{request_limit:48,round_limit:24}),
  loopFirst:(_v:V,_cfg:V,c:V)=>loop(c).stop_reason?stop(c,loop(c).stop_reason):select(c)||!c.shared.scope.asset?validate({check:c.shared.scope.asset?select(c).check:'identity'},c):stop(c,'已核原诊断，无新可执行检查；保留原事实不重发'),
  async loopExecute(_v:V,config:V,c:V){
   const s=loop(c),p=s.pending;if(!p||s.stop_reason)return stop(c,s.stop_reason??'无已校验检查')
   s.attempts[p.key]={status:'unknown',round:++s.round,node_id:c.nodeId};s.staged=[];s.defer_append=true
   c.progress({status:'completed',result:{kind:'diagnostic-attempt',diagnostic_loop:structuredClone(s)}})
   let result
   try{result=await components[checks[p.check].component](p.check==='bindings'||p.check==='capability'?s.management??{}:['runState','configState','heartbeat','synchronization'].includes(p.check)?s.binding??{}:{},config,c)}finally{s.defer_append=false}
   if(p.check==='management')s.management=result
   if(p.check==='bindings')s.binding=result
   s.last={check:p.check,result,fact_ids:s.staged.map((x:V)=>x.fact.id)};s.attempts[p.key].status='returned';s.pending=null
   return out(c,s.last)
  },
  loopAppend:(_v:V,_cfg:V,c:V)=>{for(const {fact,receipts} of loop(c).staged??[]){c.shared.facts[fact.id]=fact;for(const r of receipts)c.shared.receipts[r.id]=r}return out(c,{facts:Object.values(c.shared.facts)})},
  loopCandidates:(_v:V,_cfg:V,c:V)=>{for(const {fact}of loop(c).staged??[])reassess(c,fact);loop(c).staged=[];c.progress({status:'completed',result:{kind:'fault-check',items:Object.values(c.shared.facts),rounds:c.shared.rounds,causes:c.shared.causes,diagnostic_loop:structuredClone(loop(c))}});return out(c,{candidates:c.shared.causes})},
  loopDecision(_v:V,_cfg:V,c:V){
   const s=loop(c);if(s.stop_reason)return stop(c,s.stop_reason)
   if(c.shared.authentication_blocker)return stop(c,'SOC认证/业务权限停点；保留原文/来源，不自动重试，不判设备根因')
   if(c.shared.causes.some((x:V)=>x.status==='confirmed')&&!c.shared.causes.some((x:V)=>x.status==='conflict'))return out(c,{route:'sufficient'})
   if(c.shared.request_count>=48||s.round>=24)return stop(c,'预算耗尽')
   if(s.last?.check==='identity'&&!s.last.result.ready)return stop(c,'冻结对象未唯一核实')
   if(c.shared.causes.some((x:V)=>x.status==='conflict'))return out(c,{route:'proposal',reason:'冲突需区分检查'})
   const rule=select(c);return out(c,rule?{route:'rule',...rule}:{route:'proposal',reason:'无明确未尝试后继'})
  },
  loopRule:(v:V,_cfg:V,c:V)=>validate(v,c),
  async loopProposal(_v:V,config:V,c:V){
   if(c.shared.request_count>=48||loop(c).round>=24)return stop(c,'预算耗尽')
   const available_checks=Object.keys(checks).filter(n=>n!=='identity'&&prereq(n,c)&&!loop(c).attempts[key(n,c)])
   try{const p=await components.controlledProposal({available_checks},config,c);return p?.check?validate(p,c):stop(c,p?.reason??'无可执行区分检查')}catch(e:any){const aborted=Boolean(c.signal?.aborted);loop(c).proposal_error={message:String(e?.message??e),aborted,at:new Date().toISOString()};return stop(c,aborted?'本轮在受控提议阶段被外部中止（实例重载或请求取消）；已保存事实保留，停止并输出 unknown 报告':'受控提议未通过：'+String(e?.message??e)+'；不执行不重试')}
  },
  loopReport:(_v:V,config:V,c:V)=>report(c,config),loopStop:(_v:V,config:V,c:V)=>report(c,config),
 }
}
