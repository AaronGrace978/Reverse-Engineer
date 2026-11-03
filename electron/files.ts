import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Attachment, Investigation } from '../src/shared/types'

const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
export async function readAttachment(path: string): Promise<Attachment> {
  const size = (await stat(path)).size
  const ext = extname(path).toLowerCase()
  const image = IMAGE_TYPES[ext]
  if (size > (image ? 4 * 1024 * 1024 : 10 * 1024 * 1024)) throw new Error(`${basename(path)} is too large. Images: 4 MiB; PDFs: 10 MiB; text: 512 KiB.`)
  const base = { id: randomUUID(), name: basename(path), size }
  const bytes = await readFile(path)
  if (image) {
    const valid = image === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : image === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    if (!valid) throw new Error(`${base.name} does not match its image file type.`)
    return { ...base, mime: image, data: bytes.toString('base64') }
  }
  if (ext === '.pdf') {
    const { extractText } = await import('unpdf')
    const { text } = await extractText(new Uint8Array(bytes), { mergePages: true })
    if (!text.trim()) throw new Error(`${base.name} has no readable text. Export scanned pages or blueprint diagrams as PNG/JPEG/WebP images for visual analysis.`)
    if (text.length > 100_000) throw new Error(`${base.name} has too much text. Import a smaller PDF (up to 100,000 extracted characters).`)
    return { ...base, mime: 'application/pdf', text, note: 'Text extracted only. Diagrams and page layout are not sent. Export diagram pages as images.' }
  }
  if (!['.txt', '.md', '.csv', '.json', '.log'].includes(ext)) throw new Error(`Unsupported file type: ${ext}`)
  if (size > 512 * 1024) throw new Error(`${base.name} exceeds the 512 KiB text limit.`)
  if (bytes.includes(0)) throw new Error(`${base.name} appears to be binary, not a text file.`)
  return { ...base, mime: 'text/plain', text: bytes.toString('utf8') }
}
export function exportMarkdown(investigation: Investigation) {
  return `# ${investigation.title}\n\nMode: ${investigation.mode}\nCreated: ${investigation.createdAt}\n\n${investigation.messages.map(m => `## ${m.role === 'user' ? 'You' : 'Reverse Engineer'}${m.model ? ` · ${m.model}` : ''}\n\n${m.content}\n${m.attachmentIds?.length ? `\nAttachments: ${m.attachmentIds.map(id => investigation.attachments.find(a => a.id === id)?.name ?? 'removed').join(', ')}\n` : ''}${m.critique ? `\n### Critique\n\n${m.critique}\n` : ''}`).join('\n---\n\n')}`
}
