import test from 'node:test'
import assert from 'node:assert/strict'
import {create} from '../src/index.ts'
globalThis.fetch=()=>{throw new Error('零上游fixture')}
test('生产组件路径fixture：离线逐轮状态、管理缺口、路径停点；同node事实累计不覆盖',async()=>{
 const calls=[],soc=async(_c,op,args)=>{calls.push(op);if(op==='list_soc_asset')return {code:200,rows:[{ip:args.ip,assetId:args.ip==='192.0.2.1'?1:2}],total:1};if(op==='get_soc_asset_by_asset_id')return {code:200,data:{assetId:1,ip:'192.0.2.1',online:false}};throw new Error('403 没有业务访问权限')}
 const w=create(soc),cfg={connections:{master:'fixture',graph:'fixture',detect:'fixture'}},shared=w.prepare({asset:{ip:'192.0.2.1'},observer:{ip:'192.0.2.2'}},cfg),ctx={runId:'run-fixture',nodeId:'root/execute',shared,signal:new AbortController().signal,progress(){},call:fn=>fn()}
 let value=w.components.loopFirst({},cfg,ctx),count=0
 do{await w.components.loopExecute(value,cfg,ctx);w.components.loopAppend({},cfg,ctx);w.components.loopCandidates({},cfg,ctx);value=w.components.loopDecision({},cfg,ctx);if(value.route==='rule')w.components.loopRule(value,cfg,ctx);assert.ok(++count<10)}while(value.route==='rule')
 assert.equal(value.route,'stop');assert.equal(shared.diagnostic_loop.round,4);assert.equal(Object.keys(shared.facts).length,4)
 assert.equal(new Set(Object.values(shared.receipts).map(x=>x.id)).size,Object.keys(shared.receipts).length)
 assert.equal(shared.causes.some(x=>x.status==='confirmed'),false)
 const result=w.components.loopStop({},cfg,ctx);assert.equal(result.items.length,4);assert.equal(result.rounds.length,4)
 assert.ok(result.rounds.some(x=>x.next_check&&x.reason));assert.ok(calls.every(x=>!x.includes('probe')))
})
