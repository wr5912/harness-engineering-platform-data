import { readFile } from 'node:fs/promises'
import { prepareInitialDecisionReplay, replayInitialDecision } from './decision-replay.ts'

/** 输入来自18120回执。只回放首轮业务动作前（可有skill装载）；先前目录读取也跳过。
 * 本入口不请求模型、不写Candidate、不填标签。旧questions/targets可从输入投影省略。
 */
async function main() {
  const [mode, inputPath, receiptPath] = process.argv.slice(2)
  if (!['prepare', 'finish'].includes(mode ?? '') || !inputPath || mode === 'finish' && !receiptPath) {
    throw new Error('usage: decision-replay-cli.ts prepare INPUT.json | finish INPUT.json BOUND_QWEN_RECEIPT.json')
  }
  const { input, config } = JSON.parse(await readFile(inputPath, 'utf8'))
  const result = mode === 'prepare' ? prepareInitialDecisionReplay(input, config)
    : await replayInitialDecision(input, config, async () => JSON.parse(await readFile(receiptPath!, 'utf8')))
  process.stdout.write(JSON.stringify(result) + '\n')
  if (!['ready', 'unlabeled'].includes(result.status)) process.exitCode = 2
}
main().catch(error => { process.stderr.write(JSON.stringify({ status: 'failed', error_type: error?.name ?? 'Error' }) + '\n'); process.exitCode = 1 })
