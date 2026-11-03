import { app, BrowserWindow, clipboard, dialog, ipcMain, net, session, shell, type IpcMainInvokeEvent } from 'electron'
import { join, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { Store } from './store'
import { Gateway, type Turn } from './gateway'
import { systemPrompt, CRITIQUE, REFINE } from './prompts'
import { readAttachment, exportMarkdown } from './files'
import { initializeUpdater, checkUpdates, installUpdate } from './updater'
import { EVALUATIONS, scoreAnswer } from '../src/shared/evaluations'
import type { EvalRun, Mode, Progress, ProviderId } from '../src/shared/types'
import { PROVIDERS } from '../src/shared/providers'

let window: BrowserWindow
let store: Store
let active: AbortController | undefined
const providerSchema = z.enum(PROVIDERS.map(p => p.id) as [ProviderId, ...ProviderId[]])
const modeSchema = z.enum(['engineer', 'mathematics', 'discovery'])
const idSchema = z.string().uuid()
const modelSchema = z.string().trim().min(1).max(200)
const runSchema = z.object({ investigationId: idSchema, provider: providerSchema, model: modelSchema, text: z.string().trim().min(1).max(30_000), attachmentIds: z.array(idSchema).max(4), refine: z.boolean(), useLessons: z.boolean() })
const gateway = new Gateway((input, init) => net.fetch(input instanceof URL ? input.href : input, init))
const productionUrl = pathToFileURL(resolve(__dirname, '../dist/index.html')).href
const developmentUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL === 'http://127.0.0.1:5173' ? process.env.ELECTRON_RENDERER_URL : undefined

function requireIdle() { if (active) throw new Error('Wait for the current run to finish, or stop it first.') }
function investigation(id: string) {
  const result = store.workspace.investigations.find(i => i.id === idSchema.parse(id))
  if (!result) throw new Error('Investigation not found.')
  return result
}
function progress(value: Progress) { if (!window.isDestroyed()) window.webContents.send('progress', value) }
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    const frame = event.senderFrame
    const allowed = frame && (developmentUrl ? new URL(frame.url).origin === developmentUrl : frame.url === productionUrl)
    if (event.sender !== window.webContents || frame !== event.sender.mainFrame || !allowed) throw new Error('Untrusted IPC sender.')
    return fn(...args)
  })
}
function registerHandlers() {
  handle('initialize', () => ({ desktop: true, version: app.getVersion(), electronVersion: process.versions.electron, secureStorage: store.secureStorage, providers: store.statuses(), workspace: store.workspace }))
  handle('create-investigation', (raw: Mode) => {
    requireIdle()
    store.workspace.investigations.unshift({ id: randomUUID(), title: 'Untitled investigation', mode: modeSchema.parse(raw), createdAt: new Date().toISOString(), messages: [], attachments: [] })
    return store.save()
  })
  handle('delete-investigation', (id: string) => { requireIdle(); investigation(id); store.workspace.investigations = store.workspace.investigations.filter(i => i.id !== id); return store.save() })
  handle('rename-investigation', (id: string, title: string) => { investigation(id).title = z.string().trim().min(1).max(100).parse(title); return store.save() })
  handle('import-files', async (id: string) => {
    requireIdle()
    const target = investigation(id)
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: 'Add evidence', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Research files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'txt', 'md', 'csv', 'json', 'log'] }] })
    if (canceled) return store.workspace
    if (target.attachments.length + filePaths.length > 20) throw new Error('Use at most 20 files per investigation.')
    const attachments = await Promise.all(filePaths.map(readAttachment))
    requireIdle()
    investigation(id).attachments.push(...attachments)
    return store.save()
  })
  handle('remove-attachment', (id: string, fileId: string) => {
    requireIdle()
    const target = investigation(id)
    idSchema.parse(fileId)
    if (target.messages.some(m => m.attachmentIds?.includes(fileId))) throw new Error('This file is part of the investigation history. Delete the investigation to remove it.')
    target.attachments = target.attachments.filter(a => a.id !== fileId)
    return store.save()
  })
  handle('save-provider', (id: ProviderId, key: string, url?: string) => { requireIdle(); return store.setProvider(providerSchema.parse(id), z.string().trim().max(4000).parse(key), z.string().max(500).optional().parse(url)) })
  handle('clear-provider', (id: ProviderId) => { requireIdle(); return store.clearProvider(providerSchema.parse(id)) })
  handle('models', (id: ProviderId) => gateway.models(store.connection(providerSchema.parse(id))))
  handle('run', async (raw: unknown) => {
    requireIdle()
    const input = runSchema.parse(raw)
    const target = investigation(input.investigationId)
    const connection = store.connection(input.provider)
    const attachments = input.attachmentIds.map(id => {
      const file = target.attachments.find(a => a.id === id)
      if (!file) throw new Error('An attached file no longer exists.')
      return file
    })
    const turns: Turn[] = target.messages.map(m => ({ role: m.role, content: m.content, attachments: m.attachmentIds?.map(id => target.attachments.find(a => a.id === id)!).filter(Boolean) }))
    turns.push({ role: 'user', content: input.text, attachments })
    if (turns.reduce((n, t) => n + t.content.length + (t.attachments ?? []).reduce((v, a) => v + (a.text?.length ?? 0), 0), 0) > 200_000) throw new Error('This context exceeds 200,000 characters. Start a new investigation or use smaller files.')
    if (turns.reduce((n, t) => n + (t.attachments ?? []).filter(a => a.data).reduce((v, a) => v + a.size, 0), 0) > 8 * 1024 * 1024) throw new Error('Images in this conversation exceed 8 MiB. Start a new investigation or use smaller images.')
    active = new AbortController()
    const started = Date.now()
    const system = systemPrompt(target.mode, input.useLessons ? store.workspace.lessons : [])
    try {
      progress({ stage: 'Analyzing evidence', investigationId: target.id })
      let answer = await gateway.generate(connection, input.model, system, turns, active.signal)
      let critique: string | undefined
      if (input.refine) {
        progress({ stage: 'Reviewing the draft', investigationId: target.id })
        turns.push({ role: 'assistant', content: answer }, { role: 'user', content: CRITIQUE })
        critique = await gateway.generate(connection, input.model, system, turns, active.signal)
        progress({ stage: 'Refining the answer', investigationId: target.id })
        turns.push({ role: 'assistant', content: critique }, { role: 'user', content: REFINE })
        answer = await gateway.generate(connection, input.model, system, turns, active.signal)
      }
      target.messages.push(
        { id: randomUUID(), role: 'user', content: input.text, attachmentIds: input.attachmentIds, createdAt: new Date().toISOString() },
        { id: randomUUID(), role: 'assistant', content: answer, model: input.model, provider: input.provider, durationMs: Date.now() - started, critique, refined: input.refine, createdAt: new Date().toISOString() },
      )
      if (target.title === 'Untitled investigation') target.title = input.text.slice(0, 65)
      return store.save()
    } finally { active = undefined; progress({ stage: '' }) }
  })
  handle('cancel', () => active?.abort())
  handle('feedback', (id: string, messageId: string, value: 'useful' | 'incorrect') => {
    const message = investigation(id).messages.find(m => m.id === idSchema.parse(messageId) && m.role === 'assistant')
    if (!message) throw new Error('Answer not found.')
    message.feedback = z.enum(['useful', 'incorrect']).parse(value)
    return store.save()
  })
  handle('save-lesson', (text: string, sourceId?: string) => {
    if (store.workspace.lessons.length >= 100) throw new Error('The notebook holds up to 100 lessons. Remove unused entries first.')
    store.workspace.lessons.push({ id: randomUUID(), text: z.string().trim().min(1).max(2000).parse(text), sourceId: idSchema.optional().parse(sourceId), createdAt: new Date().toISOString() })
    return store.save()
  })
  handle('suggest-lesson', async (id: string, messageId: string, rawProvider: ProviderId, rawModel: string) => {
    requireIdle()
    const target = investigation(id)
    const index = target.messages.findIndex(m => m.id === idSchema.parse(messageId) && m.role === 'assistant')
    if (index < 0) throw new Error('The source answer is no longer available.')
    const source = target.messages[index]
    const connection = store.connection(providerSchema.parse(rawProvider))
    const model = modelSchema.parse(rawModel)
    active = new AbortController()
    progress({ stage: 'Drafting a research lesson', investigationId: id })
    try {
      const candidate = await gateway.generate(connection, model, `${systemPrompt(target.mode)}\nDraft a single reusable research lesson, under 1500 characters, from the provided exchange. Prefer verification methods and corrections over unverified factual claims. The user will review it before saving. Return only the lesson text. Do not claim evidence you have not seen.`, [{ role: 'user', content: JSON.stringify({ question: target.messages[index - 1]?.content, answer: source.content, critique: source.critique, feedback: source.feedback ?? 'unrated' }) }], active.signal)
      if (candidate.length > 2000) throw new Error('The suggested lesson is too long. Write a concise reviewed lesson manually instead.')
      return candidate
    } finally { active = undefined; progress({ stage: '' }) }
  })
  handle('delete-lesson', (id: string) => { idSchema.parse(id); store.workspace.lessons = store.workspace.lessons.filter(l => l.id !== id); return store.save() })
  handle('run-evaluations', async (id: ProviderId, rawModel: string, rawLessons: boolean) => {
    requireIdle()
    const provider = providerSchema.parse(id)
    const model = modelSchema.parse(rawModel)
    const useLessons = z.boolean().parse(rawLessons)
    const connection = store.connection(provider)
    active = new AbortController()
    const lessons = useLessons ? [...store.workspace.lessons] : []
    const run: EvalRun = { id: randomUUID(), provider, model, useLessons, createdAt: new Date().toISOString(), status: 'completed', results: [] }
    try {
      for (const test of EVALUATIONS) {
        const started = Date.now()
        progress({ stage: `Evaluating: ${test.name}`, caseId: test.id })
        try {
          const answer = await gateway.generate(connection, model, systemPrompt(test.mode, lessons), [{ role: 'user', content: test.prompt }], active.signal)
          run.results.push({ caseId: test.id, answer, ...scoreAnswer(answer, test.expected), durationMs: Date.now() - started })
        } catch (error) {
          if (active.signal.aborted) { run.status = 'cancelled'; break }
          run.results.push({ caseId: test.id, answer: '', passed: false, matched: [], expected: test.expected, error: error instanceof Error ? error.message : 'Evaluation failed.', durationMs: Date.now() - started })
        }
      }
      store.workspace.evalRuns.unshift(run)
      store.workspace.evalRuns = store.workspace.evalRuns.slice(0, 50)
      return store.save()
    } finally { active = undefined; progress({ stage: '' }) }
  })
  handle('calculate', (raw: string) => {
    const expression = z.string().min(1).max(300).parse(raw)
    return new Promise<string>((resolveResult, reject) => {
      const worker = new Worker(join(__dirname, 'calculator-worker.cjs'), { workerData: expression, resourceLimits: { maxOldGenerationSizeMb: 128 } })
      const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Calculation exceeded its time budget. Simplify the expression.')) }, 2000)
      worker.once('message', ({ result, error }) => { clearTimeout(timer); void worker.terminate(); error ? reject(new Error(error)) : resolveResult(result) })
      worker.once('error', error => { clearTimeout(timer); reject(error) })
      worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('Calculation stopped because it exceeded its resource budget.')) })
    })
  })
  handle('export-investigation', async (id: string) => {
    const target = investigation(id)
    const { canceled, filePath } = await dialog.showSaveDialog(window, { title: 'Export investigation', defaultPath: `${target.title.replace(/[^a-z0-9 _-]/gi, '').slice(0, 80) || 'investigation'}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] })
    if (canceled || !filePath) return false
    await writeFile(filePath, exportMarkdown(target), { mode: 0o600 })
    return true
  })
  handle('check-updates', checkUpdates)
  handle('copy-text', (text: string) => clipboard.writeText(z.string().max(2_000_000).parse(text)))
  handle('install-update', () => { requireIdle(); installUpdate() })
  handle('open-external', async (raw: string) => {
    const url = new URL(z.string().max(2000).parse(raw))
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only HTTPS links can be opened.')
    const result = await dialog.showMessageBox(window, { type: 'question', message: 'Open this link in your browser?', detail: url.href, buttons: ['Cancel', 'Open link'], defaultId: 0, cancelId: 0 })
    if (result.response === 1) await shell.openExternal(url.href)
  })
}

if (process.env.REVERSE_ENGINEER_SMOKE === '1' && process.env.REVERSE_ENGINEER_DATA_DIR) app.setPath('userData', process.env.REVERSE_ENGINEER_DATA_DIR)
const ownsWorkspace = app.requestSingleInstanceLock()
if (!ownsWorkspace) app.quit()
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.focus() } })
if (ownsWorkspace) app.whenReady().then(async () => {
  try {
    if (process.env.HTTPS_PROXY) await session.defaultSession.setProxy({ proxyRules: process.env.HTTPS_PROXY, proxyBypassRules: '<local>;127.0.0.1;localhost;[::1]' })
    store = new Store(join(app.getPath('userData'), 'workspace'))
    window = new BrowserWindow({ width: 1480, height: 980, minWidth: 1000, minHeight: 700, backgroundColor: '#111315', title: 'Reverse Engineer', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } })
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.on('close', event => {
      if (!active) return
      const choice = dialog.showMessageBoxSync(window, { type: 'question', message: 'A run is still in progress.', detail: 'Closing will cancel the run. Unfinished answers are not saved.', buttons: ['Keep working', 'Cancel run and close'], defaultId: 0, cancelId: 0 })
      if (choice === 0) event.preventDefault()
      else active.abort()
    })
    registerHandlers()
    initializeUpdater()
    if (developmentUrl) await window.loadURL(developmentUrl)
    else await window.loadURL(productionUrl)
  } catch (error) { dialog.showErrorBox('Reverse Engineer could not start', error instanceof Error ? error.message : String(error)); app.quit() }
})
app.on('window-all-closed', () => app.quit())
