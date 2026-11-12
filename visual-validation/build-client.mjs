// 统一构建：把原型的三维库、设备场景、大脑首帧与矢量字体内联进插件客户端。
import { readFileSync, writeFileSync } from 'node:fs'

const proto = '.local/platform-home/attachments/v1/files/da/dac4c806e0a9080120e42a5ffcd8dbb6fa80071b82e81a8ea1fbef7a90b6c97a/AI-SOC-V6.0-大版本更新-语义动效增强版.html'
const html = readFileSync(proto, 'utf8')
const lines = html.split('\n')

const three = lines.slice(965, 973).join('\n').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '')
const device = lines.slice(1609, 2291).join('\n')
const brain = readFileSync('visual-validation/brain-frame.txt', 'utf8').trim()
// 第 1604 行是 window.SOC6_FONT=...;（矢量字形），三维标签文字依赖它，必须与设备场景一起内联。
const fontLine = lines[1603].replace(/<\/script>\s*$/, '').trim()

let out = readFileSync('visual-validation/sns-client.template.js', 'utf8')
out = out.replace("'__BRAIN_URI__'", () => JSON.stringify(brain))
  .replace("'__THREE_SRC__'", () => JSON.stringify(three))
  .replace("'__DEVICE_SRC__'", () => JSON.stringify(device))
// 字体在插件模块加载时注入全局，供工厂内的三维标签生成字形。
out = fontLine + '\n' + out
writeFileSync('visual-validation/sns-client.js', out)
console.log('bytes', out.length, 'font', fontLine.length)
