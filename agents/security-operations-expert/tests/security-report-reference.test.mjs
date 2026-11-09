import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { safeProjection, statusLabel, statusTone, escapeHtml } from '../../../mcp/src/reports/common.ts'
import { renderInspectionReport } from '../../../mcp/src/reports/inspection.ts'
import { renderTroubleshootingReport } from '../../../mcp/src/reports/troubleshooting.ts'
import { artifacts as inspectionArtifacts } from '../../../mcp/src/inspection/index.ts'
import { create as createAccess } from '../../../mcp/compositions/troubleshooting-business-access/src/index.ts'
import { create as createOffline } from '../../../mcp/compositions/troubleshooting-device-offline/src/index.ts'
import { inspectionFixture, faultFixture, offlineFixture, DEMO_NOTE } from './security-report-reference-fixtures.mjs'

// 只核纯渲染、真实生产入口与隔离样式资料。没有SOC、官方LFX执行或实例交互。
const printHtml = html => {
  const found=html.match(/<script id="report-print-payload" type="application\/octet-stream">([A-Za-z0-9+/=]+)<\/script>/)
  assert.ok(found,'必须保存独立、全量UTF-8打印载荷')
  return Buffer.from(found[1],'base64').toString('utf8')
}
const producers = [
  ['巡检',inspectionFixture,renderInspectionReport],
  ['业务访问故障',faultFixture,renderTroubleshootingReport],
  ['设备不在线',offlineFixture,renderTroubleshootingReport],
]
for (const [name,fixture,render] of producers) {
  test(`${name}：独立完整HTML且纯函数不修改事实`,()=>{
    const input=fixture(),before=JSON.stringify(input),html=render(input)
    assert.equal(JSON.stringify(input),before)
    assert.match(html,/^<!doctype html>/)
    assert.match(html,/<html lang="zh-CN">/)
    assert.match(html,/<meta charset="utf-8">/)
    assert.match(html,/<\/body><\/html>$/)
    assert.match(html,/security-report-reference\/1/)
    assert.match(html,/安全展示投影 SHA-256/)
    assert.ok(!/\b(?:src|href)="https?:/i.test(html))
  })
  test(`${name}：可信脚本CSP与原生离线操作`,()=>{
    const html=render(fixture()),scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    assert.equal(scripts.length,2,'仅一个冻结数据块和一个自有交互脚本')
    const hash=createHash('sha256').update(scripts[1][1]).digest('base64')
    assert.ok(html.includes(`script-src 'sha256-${hash}'`))
    assert.ok(html.includes("connect-src 'none'"))
    assert.ok(!scripts[1][1].includes('fetch('))
    assert.ok(!scripts[1][1].includes('XMLHttpRequest'))
    assert.ok(!scripts[1][1].includes('eval('))
    assert.match(scripts[1][1],/popup\.opener=null/)
    assert.match(scripts[1][1],/revokeObjectURL/)
  })
  test(`${name}：打印是完整独立文档而非当前筛选DOM`,()=>{
    const html=render(fixture()),print=printHtml(html)
    assert.match(print,/全量打印版/)
    assert.match(print,/script-src 'none'/)
    assert.ok(!/<script\b/i.test(print))
    assert.ok(!/<template\b/i.test(print))
    assert.ok(!/<[^>]+\shidden(?:\s|>|=)/i.test(print))
    assert.ok(!/<details\b/i.test(print))
    assert.match(print,/未记录不等于不存在/)
    assert.match(print,/<\/html>$/)
  })
  test(`${name}：敏感和未知字段同时不进入页面及打印`,()=>{
    const input=fixture()
    input.raw_receipts=[{password:'NEVER_RAW_772',receipt:{unsafe:'NEVER_RESPONSE_772'}}]
    input.unlistedDebug={message:'NEVER_UNKNOWN_772'}
    input.apiKey='NEVER_KEY_772'
    input.items??=[]
    input.items.push({id:'safe-test',check:'unknown',status:'unknown',message:'token=NEVER_TOKEN_772; Bearer NEVER_BEARER_772',privateKey:'NEVER_PRIVATE_772',identity:'{"password":"NEVER_IDENTITY_772"}'})
    const html=render(input),print=printHtml(html)
    for(const value of ['NEVER_RAW_772','NEVER_RESPONSE_772','NEVER_UNKNOWN_772','NEVER_KEY_772','NEVER_TOKEN_772','NEVER_BEARER_772','NEVER_PRIVATE_772','NEVER_IDENTITY_772']){
      assert.ok(!html.includes(value),`页面泄漏${value}`)
      assert.ok(!print.includes(value),`打印载荷泄漏${value}`)
    }
  })
}

test('通用安全投影按明确字段克隆、遮蔽凭据并拒绝原响应identity',()=>{
  const source={status:'unknown',message:'password=SECRET_A, token:SECRET_B',facts:{online:'offline',unknownDebug:'DROP_C'},identity:'{"unknownDebug":"DROP_D"}',raw:'DROP_E',password:'DROP_F'}
  const before=JSON.stringify(source),result=safeProjection(source)
  assert.equal(JSON.stringify(source),before)
  assert.equal(result.status,'unknown')
  assert.equal(result.facts.online,'offline')
  assert.ok(!('unknownDebug' in result.facts))
  assert.ok(!('identity' in result))
  assert.ok(!('raw' in result))
  assert.ok(!('password' in result))
  assert.ok(!JSON.stringify(result).includes('SECRET_A'))
  assert.ok(!JSON.stringify(result).includes('SECRET_B'))
})
test('未知/未记录/不适用不套异常或正常颜色，执行完成不是恢复',()=>{
  assert.equal(statusTone('unknown'),'neutral')
  assert.equal(statusTone('not_applicable'),'neutral')
  assert.equal(statusTone('completed'),'neutral')
  assert.equal(statusTone('incomplete'),'warning')
  assert.equal(statusTone('abnormal'),'danger')
  assert.equal(statusLabel(undefined),'未记录')
  assert.equal(statusLabel('completed'),'执行完成')
})
test('故障报告提供四页签及全量八章，保留支持/反驳未知边界',()=>{
  const html=renderTroubleshootingReport(faultFixture()),print=printHtml(html)
  for(const tab of ['symptoms','chains','process','closure']) assert.ok(html.includes(`data-tab="${tab}"`))
  for(const text of ['1. 现象','2. 链路','3. 过程','4. 处置恢复','5. 完整判断依据','6. 完整安全证据','7. 缺口边界','8. 安全来源附录']) assert.ok(print.includes(text),text)
  assert.match(html,/支持条件不是确认根因；未知不是反驳/)
  assert.match(html,/未保存恢复验收记录/)
  assert.match(html,/未保存结构化故障链/)
  assert.ok(html.includes('data-cause-select="cause-0"'))
  assert.ok(html.includes('data-cause-select="cause-1"'))
  assert.ok(print.includes('待验证：目标响应证据不足'))
  assert.ok(print.includes('待验证：路径观测缺失'))
})
test('无业务路径、原因、观测时间或恢复字段时不补造',()=>{
  const result=offlineFixture(),html=renderTroubleshootingReport(result)
  assert.ok(!html.includes('data-cause-select='))
  assert.match(html,/未保存真实结构化 causes/)
  assert.match(html,/未保存结构化业务路径/)
  assert.match(html,/未记录报告保存路径/)
  assert.match(html,/scope 可在对象定位前保存/)
  assert.match(html,/记录时间不代表观测时间/)
})
test('巡检明细可筛选、有覆盖和基线，未知不归入通过分母',()=>{
  const html=renderInspectionReport(inspectionFixture()),print=printHtml(html)
  assert.match(html,/report-search/)
  assert.match(html,/data-filter=/)
  assert.match(html,/data-record=/)
  assert.match(html,/data-evidence-panel=/)
  assert.match(html,/基线/)
  assert.match(html,/覆盖/)
  assert.match(html,/50(?:\.0)?%/)
  assert.match(html,/不代表.*(?:通过|正常)/)
  assert.ok(print.includes('示例设备丙'))
  assert.ok(print.includes('样例不适用规则'))
})
test('巡检结果完整性不冒充外层运行执行状态',()=>{
  const result=inspectionFixture(),html=renderInspectionReport(result)
  assert.match(html,/执行状态（外层 Run）<\/dt><dd><span class="pill neutral">未提供外层执行回执/)
  assert.match(html,/源检查结果状态（非外层执行）/)
  result.execution_status='completed'
  assert.match(renderInspectionReport(result),/执行状态（外层 Run）<\/dt><dd><span class="pill neutral">执行完成/)
})
test('合成巡检资料使用真实生产基线及漏洞归一化结构',()=>{
  const result=inspectionFixture(),baseline=result.checks.baseline.items,vuln=result.checks.vulnerabilities.items
  assert.equal(baseline[0].facts.report.run.passFlag,'1')
  assert.equal(baseline[1].facts.report.run.passFlag,'0')
  assert.equal(vuln[0].findings.length,1)
  assert.equal(vuln[1].status,'unknown')
  const html=renderInspectionReport(result)
  assert.match(html,/去重.*(?:1|一).*观测|1 条/)
  assert.ok(!html.includes('<strong class="neutral">未返回观测</strong>'))
})
test('恶意文本只作为文本出现，不执行源字符串',()=>{
  const result=faultFixture(),malicious='</script><img src=x onerror="window.EVIL=1">'
  result.items[0].message=malicious
  const html=renderTroubleshootingReport(result),print=printHtml(html)
  assert.ok(!html.includes(malicious))
  assert.ok(!print.includes(malicious))
  assert.ok(html.includes('&lt;/script&gt;&lt;img'))
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;')
})
test('三条真实生产artifact入口采用新版模板，保留id/文件名/MIME/JSON合同',()=>{
  let calls=0
  const neverSoc=async()=>{calls++;throw new Error('渲染不能查询SOC')}
  const inputs=[inspectionFixture(),faultFixture(),offlineFixture()]
  const entries=[inspectionArtifacts,createAccess(neverSoc).artifacts,createOffline(neverSoc).artifacts]
  const names=['inspection-report.html','business-access-report.html','device-offline-report.html']
  entries.forEach((make,index)=>{
    const result=make(inputs[index]),report=result.find(entry=>entry.id==='report'),details=result.find(entry=>entry.id==='details')
    assert.equal(report.filename,names[index])
    assert.equal(report.contentType,'text/html; charset=utf-8')
    assert.match(report.body,/security-report-reference\/1/)
    assert.deepEqual(JSON.parse(details.body),inputs[index])
    assert.ok(report.body.length>1000)
  })
  assert.equal(calls,0)
})
