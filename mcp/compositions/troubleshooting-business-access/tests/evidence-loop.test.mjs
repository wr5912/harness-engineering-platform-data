import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceLoop } from '../src/evidence-loop.ts'

globalThis.fetch = () => { throw new Error('禁止上游网络') }
function fixture() {
 const shared = { diagnostic_loop: { round: 0, round_limit: 4, attempts: {}, pending: null }, scope: { requested: { source: 'fixture' }, time: { fault_started_at: null, query_window: null } }, assets: {}, facts: {}, receipts: {}, causes: [], rounds: [], request_count: 0 }
 const context = { runId: 'fixture-only', nodeId: 'execute', shared, progress(value) { shared.fixture_progress = value } }
 let calls = 0
 const components = { resolve() { calls++; shared.assets = { source: { assetId: 1 }, target: { assetId: 2 } }; shared.diagnostic_loop.staged.push({ fact: { id: 'f1', atoms: [], gaps: ['fixture-gap'] }, receipts: [] }); return { ready: true } }, sourceState() { calls++; return { status: 'unknown' } }, blockedResult() { return { status: 'incomplete' } } }
 const loop = evidenceLoop(components, { request_limit: 48 }, () => { shared.rounds.push({ fixture: true }) })
 return { shared, context, loop, calls: () => calls }
}
test('分步追加及候选更新发生在实际画布节点；规则回边不生成固定清单', async () => {
 const f=fixture();f.loop.loopFirst({}, {}, f.context)
 await f.loop.loopExecute({}, {}, f.context)
 assert.equal(Object.keys(f.shared.facts).length,0)
 f.loop.loopAppend({}, {}, f.context);assert.equal(Object.keys(f.shared.facts).length,1)
 assert.equal(f.shared.rounds.length,0)
 f.loop.loopCandidates({}, {}, f.context);assert.equal(f.shared.rounds.length,1)
 assert.equal(f.shared.fixture_progress.result.items.length,1)
 assert.equal(f.shared.fixture_progress.result.rounds.length,1)
 const decision=f.loop.loopDecision({}, {}, f.context);assert.equal(decision.route,'rule')
 f.loop.loopRule(decision,{},f.context);await f.loop.loopExecute({}, {}, f.context)
 assert.equal(f.loop.loopDecision({}, {}, f.context).route,'proposal')
 assert.equal((await f.loop.loopProposal({}, {}, f.context)).route,'stop')
 assert.equal(f.calls(),2)
})
test('重复、预算、证据冲突与充分条件明确且不请求上游', async () => {
 const f=fixture();f.loop.loopFirst({}, {}, f.context);await f.loop.loopExecute({}, {}, f.context)
 assert.equal(f.loop.loopRule({check:'identity'}, {},f.context).route,'stop')
 const b=fixture();b.shared.request_count=48;assert.equal(b.loop.loopFirst({}, {},b.context).route,'stop')
 const c=fixture();c.shared.causes=[{status:'conflict'}];assert.equal(c.loop.loopDecision({}, {},c.context).route,'proposal')
 c.shared.causes=[{status:'confirmed'}];assert.equal(c.loop.loopDecision({}, {},c.context).route,'sufficient')
})

function independentFixture() {
 const f=fixture(), calls=[]
 f.shared.scope.requested={source:{ip:'192.0.2.1'},target:{ip:'192.0.2.2'},protocol:'tcp',port:8834}
 f.shared.diagnostic_loop.round_limit=24
 f.shared.causes=['source-abnormal','target-offline','service-not-listening','policy-block','link-abnormal'].map(id=>({id,status:'unknown'}))
 const atomless = check => {
  calls.push(check)
  const id=`fixture:${f.shared.diagnostic_loop.round}`
  f.shared.diagnostic_loop.staged.push({fact:{id,check,status:'unknown',atoms:[],source_timezone:'DB_LOCAL',gaps:['观测时区未知']},receipts:[{id:`receipt:${id}`}]})
  return {status:'unknown'}
 }
 f.loop=evidenceLoop({
  resolve(){f.shared.assets={source:{assetId:1},target:{assetId:2}};atomless('identity');return {ready:true}},
  sourceState:()=>atomless('sourceState'),targetState:()=>atomless('targetState'),
  readonlyEvidence:input=>atomless(input.check),sourceAlerts:()=>atomless('sourceAlerts'),targetAlerts:()=>atomless('targetAlerts'),
 },{request_limit:48},(_context,fact)=>f.shared.rounds.push({id:fact.id,evidence_ids:[fact.id]}))
 return {...f,calls}
}
async function advance(f, choice) {
 if(choice) f.loop.loopRule(choice,{},f.context)
 await f.loop.loopExecute({}, {},f.context)
 f.loop.loopAppend({}, {},f.context);f.loop.loopCandidates({}, {},f.context)
 return f.loop.loopDecision({}, {},f.context)
}
test('fixture零上游：源状态时区未知不阻断独立目标、监听、策略、路径与路由；累计事实不覆盖',async()=>{
 const f=independentFixture();f.loop.loopFirst({}, {},f.context)
 let choice=await advance(f)
 while(choice.route==='rule') choice=await advance(f,choice)
 assert.deepEqual(f.calls,['identity','sourceState','targetState','portEvidence','policyEvidence','pathEvidence','routeEvidence'])
 assert.equal(choice.route,'proposal');assert.match((await f.loop.loopProposal({}, {},f.context)).reason,/无公开受控提议/)
 assert.equal(Object.keys(f.shared.facts).length,7);assert.equal(Object.keys(f.shared.receipts).length,7);assert.equal(f.shared.rounds.length,7)
 assert.equal(f.shared.fixture_progress.result.items.length,7)
 assert.equal(f.shared.scope.time.fault_started_at,null);assert.equal(f.shared.scope.time.query_window,null)
 assert.ok(Object.values(f.shared.facts).every(fact=>fact.atoms.length===0))
})
test('fixture零上游：规则按候选重算，首轮复用本Run已核身份，冲突/预算独立停转',async()=>{
 const f=independentFixture();f.shared.assets={source:{assetId:1},target:{assetId:2}}
 f.shared.facts.identity={id:'identity',check:'unique-endpoints',status:'observed'}
 f.shared.causes.find(c=>c.id==='source-abnormal').status='refuted'
 assert.equal(f.loop.loopFirst({}, {},f.context).check,'targetState')
 let choice=await advance(f);assert.equal(choice.check,'portEvidence')
 f.shared.causes.find(c=>c.id==='service-not-listening').status='refuted'
 assert.equal(f.loop.loopDecision({}, {},f.context).check,'policyEvidence')
 f.shared.causes[0].status='conflict';assert.equal(f.loop.loopDecision({}, {},f.context).route,'proposal')
 f.shared.request_count=48;assert.match(f.loop.loopDecision({}, {},f.context).reason,/预算/)
 const raw=independentFixture();raw.shared.assets={source:{assetId:1},target:{assetId:2}}
 assert.equal(raw.loop.loopFirst({}, {},raw.context).check,'identity')
})

test('fixture：SOC401独立停点，不反复取证或替换身份', () => {
 const f=fixture();f.shared.facts.auth={id:'auth',message:'401 API Key 无效、过期、已撤销或不适用于当前服务'}
 const result=f.loop.loopDecision({}, {},f.context)
 assert.equal(result.route,'stop');assert.match(result.reason,/不自动重试/)
 assert.equal(f.shared.diagnostic_loop.blocker.retryable,false)
 assert.equal(f.calls(),0)
})
