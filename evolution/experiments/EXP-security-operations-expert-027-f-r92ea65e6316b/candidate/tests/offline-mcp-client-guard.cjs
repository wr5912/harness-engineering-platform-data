'use strict'
// 仅用于显式 THREAT_ANALYSIS_OFFLINE_MCP=1 的离线 Host 集成。
// 唯一替换对象为外部 @modelcontextprotocol/client；不替换本地插件/helper。
function forbidden(name) {
  throw new Error(`OFFLINE_EXTERNAL_SDK_FORBIDDEN: ${name}`)
}
class UriTemplate { constructor() { forbidden('UriTemplate') } }
class Client { constructor() { forbidden('Client') } }
class StreamableHTTPClientTransport { constructor() { forbidden('StreamableHTTPClientTransport') } }
module.exports = new Proxy({ UriTemplate, Client, StreamableHTTPClientTransport }, {
  get(target, key) {
    if (key === '__esModule') return false
    if (Object.hasOwn(target, key)) return target[key]
    return forbidden(`unknown export ${String(key)}`)
  },
})
