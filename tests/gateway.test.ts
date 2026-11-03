import { describe, expect, it, vi } from 'vitest'
import { Gateway, validateBaseUrl, type Connection } from '../electron/gateway'
import type { Attachment, ProviderId } from '../src/shared/types'

const file: Attachment = { id: 'image', name: 'blueprint.png', mime: 'image/png', data: 'aW1hZ2U=', size: 5 }
const notes: Attachment = { id: 'notes', name: 'notes.txt', mime: 'text/plain', text: 'Measured: 12 teeth.', size: 19 }
function mock(body: unknown, status = 200) { return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status })) }
function connection(id: ProviderId): Connection { return { id, key: 'secret-key', baseUrl: 'https://provider.example/v1' } }
const turns = [{ role: 'user' as const, content: 'Explain this mechanism', attachments: [file, notes] }]

describe('provider request and response contracts', () => {
  it('uses the native Ollama Cloud API with Bearer authentication and base64 images', async () => {
    const fetcher = mock({ message: { content: 'A gear train.' } })
    expect(await new Gateway(fetcher).generate(connection('ollama-cloud'), 'new-model', 'instructions', turns)).toBe('A gear train.')
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://provider.example/v1/api/chat')
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer secret-key' })
    const body = JSON.parse(init!.body as string)
    expect(body).toMatchObject({ model: 'new-model', stream: false })
    expect(body.messages[1].images).toEqual([file.data])
    expect(body.messages[1].content).toContain('Measured: 12 teeth.')
  })
  it('uses OpenAI Responses without storing remote conversation state', async () => {
    const fetcher = mock({ status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: 'Verified answer.' }] }] })
    expect(await new Gateway(fetcher).generate(connection('openai'), 'latest-id', 'instructions', turns)).toBe('Verified answer.')
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string)
    expect(body.store).toBe(false)
    expect(body.input[0].content[1].image_url).toBe('data:image/png;base64,aW1hZ2U=')
  })
  it('uses Anthropic image blocks and API version header', async () => {
    const fetcher = mock({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'private' }, { type: 'text', text: 'Result.' }] })
    expect(await new Gateway(fetcher).generate(connection('anthropic'), 'claude-new', 'instructions', turns)).toBe('Result.')
    const init = fetcher.mock.calls[0][1]!
    expect(init.headers).toMatchObject({ 'x-api-key': 'secret-key', 'anthropic-version': '2023-06-01' })
    expect(JSON.parse(init.body as string).messages[0].content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/png' } })
  })
  it('uses Gemini inline images, model roles, and excludes thinking parts', async () => {
    const fetcher = mock({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'private', thought: true }, { text: 'The answer.' }] } }] })
    expect(await new Gateway(fetcher).generate(connection('google'), 'gemini-next', 'instructions', turns)).toBe('The answer.')
    expect(fetcher.mock.calls[0][1]!.headers).toMatchObject({ 'x-goog-api-key': 'secret-key' })
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).contents[0].parts[1]).toMatchObject({ inlineData: { mimeType: 'image/png' } })
  })
  it.each(['openrouter', 'xai', 'deepseek', 'mistral', 'groq', 'together', 'custom'] as ProviderId[])('uses Chat Completions for %s', async id => {
    const fetcher = mock({ choices: [{ message: { content: 'Compatible result' }, finish_reason: 'stop' }] })
    expect(await new Gateway(fetcher).generate(connection(id), 'fresh-model', 'instructions', turns)).toBe('Compatible result')
    expect(fetcher.mock.calls[0][0]).toBe('https://provider.example/v1/chat/completions')
  })
  it('fetches model IDs from the API rather than pinning a stale catalog', async () => {
    const fetcher = mock({ models: [{ name: 'future-model:cloud' }] })
    expect(await new Gateway(fetcher).models(connection('ollama-cloud'))).toEqual(['future-model:cloud'])
  })
  it('paginates Gemini and excludes non-generative models', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'models/gemini-a', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }], nextPageToken: 'next page' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'models/gemini-b', supportedGenerationMethods: ['generateContent'] }] })))
    expect(await new Gateway(fetcher).models(connection('google'))).toEqual(['gemini-a', 'gemini-b'])
    expect(fetcher.mock.calls[1][0]).toContain('pageToken=next%20page')
  })
  it('redacts provider errors and never follows key-bearing redirects', async () => {
    const fetcher = mock({ error: { message: 'Invalid credential secret-key' } }, 401)
    await expect(new Gateway(fetcher).generate(connection('openai'), 'model', '', turns)).rejects.toThrow('Invalid credential [redacted]')
    expect(fetcher.mock.calls[0][1]!.redirect).toBe('error')
  })
  it('rejects truncated and empty responses instead of claiming completion', async () => {
    await expect(new Gateway(mock({ status: 'incomplete', output: [] })).generate(connection('openai'), 'model', '', turns)).rejects.toThrow('exhausted')
    await expect(new Gateway(mock({ choices: [{ message: { content: '' } }] })).generate(connection('custom'), 'model', '', turns)).rejects.toThrow('no answer')
  })
  it('does not return an answer after cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(new Gateway(mock({ message: { content: 'late answer' } })).generate(connection('ollama-cloud'), 'model', '', turns, controller.signal)).rejects.toThrow('cancelled')
  })
})

describe('endpoint trust', () => {
  it.each(['http://untrusted.example/v1', 'https://user:password@example.com', 'https://example.com?key=secret', 'file:///tmp/data'])('rejects %s', url => {
    expect(() => validateBaseUrl(url)).toThrow()
  })
  it('accepts loopback HTTP and requires loopback for local Ollama', () => {
    expect(validateBaseUrl('http://127.0.0.1:11434/', true)).toBe('http://127.0.0.1:11434')
    expect(() => validateBaseUrl('https://remote.example', true)).toThrow('loopback')
  })
})
