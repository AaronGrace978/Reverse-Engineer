import { _electron as electron } from '@playwright/test'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const expectedElectron = require('electron/package.json').version
const packaged = process.env.REVERSE_ENGINEER_EXECUTABLE

const directory = await mkdtemp(join(tmpdir(), 'reverse-engineer-smoke-'))
const calls = []
let hold = false
const server = createServer(async (req, res) => {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url === '/api/tags' ? { models: [{ name: 'fixture-vision' }] } : { data: [{ id: 'fixture-vision' }] }))
    return
  }
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = JSON.parse(raw)
  calls.push(body)
  if (hold) { req.on('close', () => res.destroy()); return }
  const last = body.messages.at(-1).content
  const answer = typeof last === 'string' && last.startsWith('Review the preceding') ? 'Check the gear direction and distinguish measured values from assumptions.' : 'The driven gear rotates at **40 rpm** in the **opposite** direction. Roots: 2 and 3. I cannot infer hidden dimensions without a measurement. Use a control and random assignment.\n\n$$120 \\times 12 / 36 = 40$$'
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ choices: [{ message: { content: answer }, finish_reason: 'stop' }] }))
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const endpoint = `http://127.0.0.1:${server.address().port}`
let app
async function launch() {
  app = await electron.launch({
    executablePath: packaged ? resolve(packaged) : undefined,
    args: [...(process.env.CI ? ['--no-sandbox'] : []), '--ozone-platform=headless', '--disable-gpu', ...(packaged ? [] : [resolve('.')])],
    env: { ...process.env, REVERSE_ENGINEER_SMOKE: '1', REVERSE_ENGINEER_DATA_DIR: directory, ELECTRON_RENDERER_URL: '' },
    timeout: 30_000,
  })
  const page = await app.firstWindow()
  await page.setViewportSize({ width: 1480, height: 980 })
  await page.getByRole('heading', { name: 'Make the unknown understandable.' }).waitFor()
  return page
}
try {
  const page = await launch()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const info = await page.evaluate(() => window.desktop.initialize())
  assert.equal(info.desktop, true)
  assert.equal(info.electronVersion, expectedElectron)
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/desktop-workbench.png' })
  assert.equal(await page.evaluate(() => window.desktop.calculate('120 * 12 / 36')), '40')
  await page.evaluate(() => window.desktop.copyText('Independent verification: 40 rpm'))
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'Independent verification: 40 rpm')
  await assert.rejects(page.evaluate(() => window.desktop.calculate('evaluate("2+2")')), /Unknown symbol|Unsupported/)
  console.log('PASS: native startup, isolated bridge, numeric calculator, blocked unsafe expression')
  await page.evaluate(async endpoint => {
    await window.desktop.saveProvider('custom', 'fixture-secret', `${endpoint}/v1`)
    await window.desktop.saveProvider('ollama-local', '', endpoint)
  }, endpoint)
  assert.deepEqual(await page.evaluate(() => window.desktop.models('ollama-local')), ['fixture-vision'])
  assert.deepEqual(await page.evaluate(() => window.desktop.models('custom')), ['fixture-vision'])
  const investigationId = await page.evaluate(async () => (await window.desktop.createInvestigation('engineer')).investigations[0].id)
  const imagePath = join(directory, 'evidence.png')
  await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0s8AAAAASUVORK5CYII=', 'base64'))
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, imagePath)
  const imported = await page.evaluate(id => window.desktop.importFiles(id), investigationId)
  const attachmentId = imported.investigations[0].attachments[0].id
  const input = { investigationId, provider: 'custom', model: 'fixture-vision', text: 'Analyze this gear. Driver: 12 teeth at 120 rpm. Driven: 36 teeth.', attachmentIds: [attachmentId], refine: true, useLessons: true }
  let result = await page.evaluate(input => window.desktop.run(input), input)
  assert.equal(calls.length, 3)
  assert.equal(result.investigations[0].messages.length, 2)
  assert.ok(result.investigations[0].messages[1].critique)
  assert.equal(calls[0].messages[1].content[1].type, 'image_url')
  const assistantId = result.investigations[0].messages[1].id
  const candidate = await page.evaluate(({ investigationId, assistantId }) => window.desktop.suggestLesson(investigationId, assistantId, 'custom', 'fixture-vision'), { investigationId, assistantId })
  assert.ok(candidate.length > 0)
  assert.equal((await page.evaluate(() => window.desktop.initialize())).workspace.lessons.length, 0)
  await page.evaluate(async ({ investigationId, assistantId }) => {
    await window.desktop.feedback(investigationId, assistantId, 'useful')
    await window.desktop.saveLesson('Verify gear ratios and units.', assistantId)
  }, { investigationId, assistantId })
  result = await page.evaluate(input => window.desktop.run({ ...input, text: 'Check again.', attachmentIds: [], refine: false }), input)
  assert.ok(calls.at(-1).messages[0].content.includes('Verify gear ratios and units.'))
  console.log('PASS: live loopback model discovery, native file import, image request, three-pass analysis, feedback and lesson retrieval')
  const evaluations = await page.evaluate(() => window.desktop.runEvaluations('custom', 'fixture-vision', true))
  assert.equal(evaluations.evalRuns[0].results.length, 4)
  assert.equal(evaluations.evalRuns[0].results.filter(r => r.passed).length, 4)
  const exportPath = join(directory, 'export.md')
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, exportPath)
  await page.evaluate(id => window.desktop.exportInvestigation(id), investigationId)
  assert.match(await readFile(exportPath, 'utf8'), /40 rpm/)
  hold = true
  const cancelled = page.evaluate(async input => {
    const promise = window.desktop.run({ ...input, text: 'Cancellation test', attachmentIds: [], refine: false })
    const caught = promise.then(() => 'unexpected-success', error => error.message)
    await new Promise(done => setTimeout(done, 200))
    await window.desktop.cancel()
    return caught
  }, input)
  assert.match(await cancelled, /cancel|abort/i)
  hold = false
  const afterCancel = await page.evaluate(() => window.desktop.initialize())
  assert.equal(afterCancel.workspace.investigations[0].messages.length, 4)
  assert.equal(JSON.stringify(afterCancel).includes('fixture-secret'), false)
  if (!packaged) assert.equal((await page.evaluate(() => window.desktop.checkUpdates())).status, 'unavailable')
  assert.deepEqual(pageErrors, [])
  console.log(`PASS: four-case evaluation, Markdown export, cancellation with no partial save, no key exposure${packaged ? '' : ', development updater guard'}`)
  await app.close(); app = undefined
  const reopened = await launch()
  const restored = await reopened.evaluate(() => window.desktop.initialize())
  assert.equal(restored.workspace.investigations[0].messages.length, 4)
  assert.equal(restored.workspace.lessons.length, 1)
  assert.equal(restored.workspace.evalRuns.length, 1)
  // Render actual persisted content through the UI, not just the IPC API.
  await reopened.getByRole('button', { name: /Analyze this gear/ }).click()
  await reopened.locator('.katex').first().waitFor()
  await reopened.screenshot({ path: 'test-results/desktop-investigation.png' })
  console.log('PASS: restart persistence and math rendering in a real Electron window')
} finally {
  await app?.close()
  server.closeAllConnections()
  await new Promise(done => server.close(done))
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
