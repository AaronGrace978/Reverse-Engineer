import { PROVIDERS } from '../src/shared/providers'
import type { Attachment, ProviderId } from '../src/shared/types'

export interface Turn { role: 'user' | 'assistant'; content: string; attachments?: Attachment[] }
export interface Connection { id: ProviderId; key: string; baseUrl: string }
type Fetch = typeof globalThis.fetch

export function validateBaseUrl(input: string, local = false): string {
  const url = new URL(input)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('Use an HTTPS endpoint, or HTTP on localhost. Credentials, queries, and fragments are not allowed in the URL.')
  }
  if (local && !loopback) throw new Error('Ollama Local must use a loopback address. Use a custom HTTPS endpoint for remote servers.')
  return url.toString().replace(/\/$/, '')
}
function textWithFiles(turn: Turn) {
  return [turn.content, ...(turn.attachments ?? []).filter(a => a.text !== undefined).map(a => `\n<reference-file name=${JSON.stringify(a.name)}>\n${a.text}\n</reference-file>`)].join('\n')
}
function images(turn: Turn) { return (turn.attachments ?? []).filter(a => a.mime.startsWith('image/') && a.data) }

export class Gateway {
  constructor(private fetcher: Fetch = globalThis.fetch) {}
  private async request(connection: Connection, path: string, body?: unknown, signal?: AbortSignal) {
    const def = PROVIDERS.find(p => p.id === connection.id)!
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (connection.key) {
      if (def.protocol === 'anthropic') headers['x-api-key'] = connection.key
      else if (def.protocol === 'google') headers['x-goog-api-key'] = connection.key
      else headers.Authorization = `Bearer ${connection.key}`
    }
    if (def.protocol === 'anthropic') headers['anthropic-version'] = '2023-06-01'
    const timeout = AbortSignal.timeout(body ? 240_000 : 30_000)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let response: Response
    try {
      response = await this.fetcher(`${connection.baseUrl}${path}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: combined, redirect: 'error' })
    } catch (error) {
      if (signal?.aborted) throw new Error('Run cancelled. No partial answer was saved.')
      if (combined.aborted) throw new Error('Provider timed out. Try a smaller context or another model.')
      throw new Error(`Cannot reach ${def.name}. Check your connection, endpoint, and network policy. ${error instanceof Error ? error.message : ''}`)
    }
    const reader = response.body?.getReader()
    let size = 0
    const chunks: Uint8Array[] = []
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 12 * 1024 * 1024) { await reader.cancel(); throw new Error('Provider response exceeded the 12 MiB limit.') }
        chunks.push(value)
      }
    }
    const raw = Buffer.concat(chunks).toString('utf8')
    let data: any
    try { data = JSON.parse(raw) } catch { throw new Error(`${def.name} returned a non-JSON response (HTTP ${response.status}). Check the endpoint.`) }
    if (!response.ok || data.error) {
      const detail = typeof data.error === 'string' ? data.error : data.error?.message ?? response.statusText
      const sanitized = connection.key ? String(detail).split(connection.key).join('[redacted]') : String(detail)
      throw new Error(`${def.name} (${response.status}): ${sanitized.slice(0, 400)}`)
    }
    return data
  }

  async models(connection: Connection): Promise<string[]> {
    const def = PROVIDERS.find(p => p.id === connection.id)!
    const ids: string[] = []
    let path = def.protocol === 'ollama' ? '/api/tags' : '/models'
    if (def.protocol === 'google') path += '?pageSize=1000'
    // Some catalogs paginate. Follow only opaque tokens, on the same fixed origin.
    for (let page = 0; page < 20; page++) {
      const data = await this.request(connection, path)
      if (def.protocol === 'ollama') ids.push(...(data.models ?? []).map((m: any) => m.name ?? m.model))
      else if (def.protocol === 'google') ids.push(...(data.models ?? []).filter((m: any) => m.supportedGenerationMethods?.includes('generateContent')).map((m: any) => m.name.replace(/^models\//, '')))
      else ids.push(...(data.data ?? []).map((m: any) => m.id))
      if (def.protocol === 'google' && data.nextPageToken) path = `/models?pageSize=1000&pageToken=${encodeURIComponent(data.nextPageToken)}`
      else if (def.protocol === 'anthropic' && data.has_more && data.last_id) path = `/models?after_id=${encodeURIComponent(data.last_id)}`
      else break
    }
    return [...new Set(ids.filter(id => typeof id === 'string' && id.length < 300))].sort((a, b) => a.localeCompare(b))
  }

  async generate(connection: Connection, model: string, system: string, turns: Turn[], signal?: AbortSignal): Promise<string> {
    const def = PROVIDERS.find(p => p.id === connection.id)!
    let data: any
    let answer: string | undefined
    if (def.protocol === 'ollama') {
      data = await this.request(connection, '/api/chat', {
        model, stream: false, messages: [{ role: 'system', content: system }, ...turns.map(t => ({ role: t.role, content: textWithFiles(t), ...(images(t).length ? { images: images(t).map(a => a.data) } : {}) }))],
      }, signal)
      answer = data.message?.content
    } else if (def.protocol === 'anthropic') {
      data = await this.request(connection, '/messages', {
        model, system, max_tokens: 8192,
        messages: turns.map(t => ({ role: t.role, content: [...images(t).map(a => ({ type: 'image', source: { type: 'base64', media_type: a.mime, data: a.data } })), { type: 'text', text: textWithFiles(t) }] })),
      }, signal)
      answer = data.content?.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    } else if (def.protocol === 'google') {
      data = await this.request(connection, `/models/${encodeURIComponent(model)}:generateContent`, {
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: textWithFiles(t) }, ...images(t).map(a => ({ inlineData: { mimeType: a.mime, data: a.data } }))] })),
        generationConfig: { maxOutputTokens: 16384 },
      }, signal)
      answer = data.candidates?.[0]?.content?.parts?.filter((p: any) => p.text && !p.thought).map((p: any) => p.text).join('\n')
    } else if (connection.id === 'openai') {
      data = await this.request(connection, '/responses', {
        model, instructions: system, max_output_tokens: 16384, store: false,
        input: turns.map(t => ({ role: t.role, content: t.role === 'assistant' ? [{ type: 'output_text', text: t.content }] : [{ type: 'input_text', text: textWithFiles(t) }, ...images(t).map(a => ({ type: 'input_image', image_url: `data:${a.mime};base64,${a.data}`, detail: 'auto' }))] })),
      }, signal)
      answer = data.output?.filter((o: any) => o.type === 'message').flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text' || c.type === 'refusal').map((c: any) => c.text ?? c.refusal).join('\n')
      if (data.status === 'incomplete') throw new Error('OpenAI exhausted its output budget before completing. Try a smaller question or another model.')
    } else {
      data = await this.request(connection, '/chat/completions', {
        model, stream: false,
        messages: [{ role: 'system', content: system }, ...turns.map(t => ({ role: t.role, content: images(t).length ? [{ type: 'text', text: textWithFiles(t) }, ...images(t).map(a => ({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${a.data}` } }))] : textWithFiles(t) }))],
      }, signal)
      answer = data.choices?.[0]?.message?.content
      if (data.choices?.[0]?.finish_reason === 'length') throw new Error('The provider truncated the answer. Try a smaller question or another model.')
    }
    if (signal?.aborted) throw new Error('Run cancelled. No partial answer was saved.')
    if (typeof answer !== 'string' || !answer.trim()) throw new Error(`${def.name} returned no answer. The model may not support this input, may have exhausted its reasoning budget, or may have blocked the request.`)
    if (def.protocol === 'anthropic' && data.stop_reason === 'max_tokens' || def.protocol === 'google' && data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      throw new Error('The provider truncated the answer. Try a smaller question or another model.')
    }
    return answer.trim()
  }
}
