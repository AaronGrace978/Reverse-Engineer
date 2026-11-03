import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { calculate } from '../electron/calculator'
import { readAttachment, exportMarkdown } from '../electron/files'
import { systemPrompt } from '../electron/prompts'
import { scoreAnswer } from '../src/shared/evaluations'

describe('independent numeric calculator', () => {
  it('checks the gear-ratio example and high-precision decimal arithmetic', () => {
    expect(calculate('120 * 12 / 36')).toBe('40')
    expect(calculate('0.1 + 0.2')).toBe('0.3')
    expect(calculate('sqrt(144)')).toBe('12')
    expect(calculate('sin(pi / 2)')).toBe('1')
  })
  it.each(['a=1', 'import("fs")', 'evaluate("2+2")', '[1,2]', 'sqrt.constructor', '1;2', '2!', '9999999999'])('rejects nonnumeric or unrestricted evaluation: %s', value => {
    expect(() => calculate(value)).toThrow()
  })
})
describe('evidence ingestion', () => {
  let directory = ''
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })
  it('reads text and checks image signatures', async () => {
    directory = await mkdtemp(join(tmpdir(), 're-test-'))
    const path = join(directory, 'measurement.txt')
    await writeFile(path, 'Diameter: 24 mm')
    expect(await readAttachment(path)).toMatchObject({ name: 'measurement.txt', text: 'Diameter: 24 mm', mime: 'text/plain' })
    await writeFile(join(directory, 'false.png'), 'this is not an image')
    await expect(readAttachment(join(directory, 'false.png'))).rejects.toThrow('does not match')
  })
  it('rejects binary text and oversized images before provider calls', async () => {
    directory = await mkdtemp(join(tmpdir(), 're-test-'))
    await writeFile(join(directory, 'binary.txt'), Buffer.from([1, 0, 1]))
    await expect(readAttachment(join(directory, 'binary.txt'))).rejects.toThrow('binary')
    await writeFile(join(directory, 'large.png'), Buffer.alloc(4 * 1024 * 1024 + 1))
    await expect(readAttachment(join(directory, 'large.png'))).rejects.toThrow('too large')
  })
  it('extracts PDF text and labels the absence of visual diagram analysis', async () => {
    directory = await mkdtemp(join(tmpdir(), 're-test-'))
    const stream = 'BT /F1 12 Tf 40 100 Td (Measured motor winding) Tj ET'
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` })
    const start = Buffer.byteLength(pdf)
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
    const path = join(directory, 'drawing.pdf')
    await writeFile(path, pdf)
    const evidence = await readAttachment(path)
    expect(evidence.text).toContain('Measured motor winding')
    expect(evidence.note).toContain('Diagrams and page layout are not sent')
  })
  it('exports model provenance and critiques with the conversation', () => {
    const output = exportMarkdown({ id: 'id', title: 'Gears', mode: 'engineer', createdAt: 'now', attachments: [], messages: [{ id: 'm', role: 'assistant', content: '40 rpm', model: 'model-id', critique: 'Check direction.', createdAt: 'now' }] })
    expect(output).toContain('model-id')
    expect(output).toContain('Check direction.')
  })
})
describe('evaluation and reference memory', () => {
  it('keeps expected matches explicit and does not hide failures', () => {
    expect(scoreAnswer('The answer is 40 rpm, opposite direction.', ['40', 'opposite'])).toMatchObject({ passed: true })
    expect(scoreAnswer('I do not know.', ['40', 'opposite'])).toMatchObject({ passed: false, matched: [] })
  })
  it('limits included lessons and labels them as fallible references', () => {
    const lessons = Array.from({ length: 15 }, (_, i) => ({ id: String(i), text: `lesson-${i}`, createdAt: 'now' }))
    const prompt = systemPrompt('mathematics', lessons)
    expect(prompt).toContain('fallible')
    expect(prompt).not.toContain('- lesson-0\n')
    expect(prompt).toContain('- lesson-14')
    expect(prompt).toContain('proof')
  })
})
