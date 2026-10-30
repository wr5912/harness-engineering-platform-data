import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'
import { readFileSync } from 'node:fs'

// 运行配置由安装器从同一版本生成；示例与 DSH 在同一标准容器内运行。
const options = JSON.parse(readFileSync(process.env.HARNESS_SDK_OPTIONS!, 'utf8'))
await using harness = new DeepSeekHarness(options)
const result = await harness.run(process.argv[2] ?? '你是谁？请用一句中文回答。')
console.log(result.sessionId, result.finalResponse)
