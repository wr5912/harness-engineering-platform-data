// 实例级启动配置：只读专用HOME文件，不生成密钥，不输出私有材料。
import { readFileSync, statSync } from 'node:fs'
import { createPrivateKey, createPublicKey } from 'node:crypto'

export const name = 'instance-confirmation-config'
export const CONFIG_PATH = '/var/lib/dsh/.confirmation/signing.json'
const PUBLIC_KEYS = Object.freeze([
  'PLATFORM_CONFIRMATION_ISSUER', 'AI_PLATFORM_URL',
  'AI_WORKBENCH_EMERGENCY_TENANT_ID', 'AI_WORKBENCH_EMERGENCY_WORKSPACE_ID',
  'EMERGENCY_CONFIRMATION_ACTOR_ID',
])
const PRIVATE_KEY = 'EMERGENCY_CONFIRMATION_PRIVATE_KEY_B64'
const text = value => typeof value === 'string' && value.trim() === value
  && value.length > 0 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/u.test(value)

export function parseConfirmationConfiguration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.schema_version !== 'instance-confirmation/v1'
    || PUBLIC_KEYS.some(key => !text(value[key]))
    || typeof value[PRIVATE_KEY] !== 'string' || !value[PRIVATE_KEY]) {
    throw new Error('实例确认配置缺失或格式无效')
  }
  let url, privateKey
  try {
    url = new URL(value.AI_PLATFORM_URL)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error()
    privateKey = createPrivateKey(Buffer.from(value[PRIVATE_KEY], 'base64'))
    if (privateKey.asymmetricKeyType !== 'rsa') throw new Error()
  } catch { throw new Error('实例确认服务地址或现有签发密钥无效') }
  const environment = Object.fromEntries([...PUBLIC_KEYS, PRIVATE_KEY].map(key => [key, value[key]]))
  const publicConfiguration = Object.fromEntries(PUBLIC_KEYS.map(key => [key, value[key]]))
  const publicKeyPem = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString()
  return { environment, publicConfiguration, publicKeyPem }
}

export function apply() {
  let parsed
  try {
    if (statSync(CONFIG_PATH).mode & 0o077) throw new Error()
    parsed = parseConfirmationConfiguration(JSON.parse(readFileSync(CONFIG_PATH, 'utf8')))
  } catch { throw new Error('实例确认专用配置未就绪：需要只对实例用户可读的有效配置文件') }
  // 保持现有确认插件的process.env接口；仅注入这六项，不影响模型或MCP凭据。
  Object.assign(process.env, parsed.environment)
  console.info('[instance-confirmation-config] ' + JSON.stringify({
    status: 'loaded', ...parsed.publicConfiguration, public_key_pem: parsed.publicKeyPem,
  }))
}
