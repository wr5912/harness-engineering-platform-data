import { invariant, QWEN_HTTP_GENERATION } from './language-understanding.ts'
import type { QwenModelIdentity } from './language-understanding.ts'
import { LlmError, attributionHeaders } from '@harness-platform/workflow-runtime'

/** 将真实Transformers HTTP端点接入DSH公开LLM适配器；调用、取消和用量由原生SDK观察。 */
export function registerQwenHttpAdapter(ctx: any, options: { endpoint: string; model: QwenModelIdentity; expected_response_model: string; apiKey?: () => string | undefined }) {
  const endpoint = new URL(options.endpoint)
  invariant(['http:', 'https:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, 'QWEN_ENDPOINT_INVALID')
  const identity = Object.freeze({ ...options.model })
  invariant(typeof options.expected_response_model === 'string' && !!options.expected_response_model.trim()
    && options.expected_response_model.trim() === options.expected_response_model, 'QWEN_EXPECTED_RESPONSE_MODEL_REQUIRED')
  const expectedResponseModel = options.expected_response_model
  const text = (content: any): string => {
    if (typeof content === 'string') return content
    invariant(Array.isArray(content) && content.every(block => block?.type === 'text' && typeof block.text === 'string'), 'QWEN_NON_TEXT_INPUT_UNSUPPORTED')
    return content.map(block => block.text).join('\n')
  }
  const card = { provider: identity.provider, id: identity.model, name: 'Qwen3.5-2B', reasoning: { efforts: [{ id: 'off', name: '关闭' }] } }
  return ctx.llm.registerAdapter([identity.provider], {
    providerInfo: (provider: string) => ({ id: provider, name: 'Transformers Qwen3.5-2B' }), providerRetryPolicy: () => undefined, imageRequestPricing: () => undefined,
    async listModels() { return [card] },
    async resolveModel(provider: string, model: string) { invariant(provider === identity.provider && model === identity.model, 'QWEN_ROUTE_MISMATCH'); return card },
    async prepareCall(provider: string, model: string) {
      invariant(provider === identity.provider && model === identity.model, 'QWEN_ROUTE_MISMATCH')
      return { model: card, async *stream(request: any) {
        request.signal.throwIfAborted()
        invariant(Array.isArray(request.messages), 'QWEN_MESSAGES_REQUIRED')
        const messages = [...(request.system === undefined ? [] : [{ role: 'system', content: text(request.system) }]),
          ...request.messages.map((message: any) => { invariant(['user', 'assistant', 'system'].includes(message.role), 'QWEN_MESSAGE_ROLE_UNSUPPORTED'); return { role: message.role, content: text(message.content) } })]
        const apiKey = options.apiKey?.()
        const response = await fetch(new URL('/v1/chat/completions', endpoint), { method: 'POST', signal: request.signal, redirect: 'error',
          headers: { ...attributionHeaders(), 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({ model: identity.model, messages, ...QWEN_HTTP_GENERATION }) })
        let value: any
        const headerRequestId = response.headers.get('x-request-id')?.trim()
        const failed = (code: string, requestId = headerRequestId, cause?: unknown) => new LlmError(code, code, {
          status: response.status, ...(requestId ? { requestId } : {}), ...(cause === undefined ? {} : { cause }) })
        try { value = await response.json() } catch (error) { throw failed('QWEN_RESPONSE_NOT_JSON', headerRequestId, error) }
        const requestId = typeof value?.id === 'string' && value.id.trim() ? value.id : headerRequestId
        const usage = value?.usage
        // 已收到HTTP回执时，合法用量先进入原生观察器；后续校验失败仍保留实际失败调用。
        if (usage && Number.isSafeInteger(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isSafeInteger(usage.completion_tokens) && usage.completion_tokens >= 0
          && (usage.total_tokens === undefined || Number.isSafeInteger(usage.total_tokens) && usage.total_tokens === usage.prompt_tokens + usage.completion_tokens)) {
          yield { type: 'usage', usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens,
            ...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }) } }
        }
        if (!response.ok) throw failed(`QWEN_HTTP_${response.status}`, requestId)
        const choice = value?.choices?.[0]
        if (!(value?.model === expectedResponseModel && typeof value.id === 'string' && value.id.trim() && choice?.finish_reason === 'stop'
          && typeof choice.message?.content === 'string' && !choice.message.tool_calls?.length)) throw failed('QWEN_RESPONSE_IDENTITY_OR_FINISH_INVALID', requestId)
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: choice.message.content }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: choice.message.content } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } }
    },
  })
}
