import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// 本测试固定源码级不变量，防止 Hook 在条件返回后注册；真实 pending→result 浏览器生命周期仍由业务 Run 验收。
const source = readFileSync(join(import.meta.dirname, '../client.entry.js'), 'utf8')
const start = source.indexOf('function InspectionTool(')
const end = source.indexOf('function statusText(', start)
const component = source.slice(start, end)

test('InspectionTool 所有Hook在条件返回前，payload不按block引用缓存', () => {
  const firstConditional = component.indexOf("if (phase !== 'result')")
  assert.ok(firstConditional > 0)
  for (const hook of ['React.useState(', 'React.useMemo(', 'React.useRef(', 'React.useEffect(']) {
    let index = component.indexOf(hook)
    assert.ok(index > 0, hook)
    while (index > 0) {
      assert.ok(index < firstConditional, `${hook} 位于条件返回之后`)
      index = component.indexOf(hook, index + 1)
    }
  }
  assert.doesNotMatch(component, /useMemo\(\(\) => inspectionPayloadOf\(block\), \[block\]\)/)
  assert.match(component, /useEffect\([\s\S]*phase !== 'result' \|\| !model/)
  assert.match(component, /\}, \[model, phase\]\)/)
})
