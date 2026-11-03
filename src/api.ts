import { PROVIDERS } from './shared/providers'
import packageInfo from '../package.json'
import type { DesktopApi, Workspace } from './shared/types'

// Browser mode is an explicitly labeled UI preview. Credentials and model calls
// are deliberately available only through Electron's isolated preload bridge.
let workspace: Workspace = { investigations: [], lessons: [], evalRuns: [] }
try { const saved = localStorage.getItem('re-preview-workspace'); if (saved) workspace = JSON.parse(saved) } catch { /* A new preview can start without previous browser state. */ }
const save = () => { localStorage.setItem('re-preview-workspace', JSON.stringify(workspace)); return structuredClone(workspace) }
async function desktopRequired(): Promise<never> { throw new Error('Launch the Electron app with npm run dev to use native files, secure credentials, model APIs, and updates.') }
const preview: DesktopApi = {
  initialize: async () => ({ desktop: false, version: packageInfo.version, electronVersion: 'Desktop app required', secureStorage: false, providers: PROVIDERS.map(p => ({ id: p.id, configured: false, baseUrl: p.baseUrl, keyStorage: 'none' })), workspace: structuredClone(workspace) }),
  createInvestigation: async mode => { workspace.investigations.unshift({ id: crypto.randomUUID(), mode, title: 'Untitled investigation', createdAt: new Date().toISOString(), messages: [], attachments: [] }); return save() },
  deleteInvestigation: async id => { workspace.investigations = workspace.investigations.filter(i => i.id !== id); return save() },
  renameInvestigation: async (id, title) => { const item = workspace.investigations.find(i => i.id === id); if (item) item.title = title; return save() },
  saveLesson: async (text, sourceId) => { workspace.lessons.push({ id: crypto.randomUUID(), text, sourceId, createdAt: new Date().toISOString() }); return save() },
  deleteLesson: async id => { workspace.lessons = workspace.lessons.filter(l => l.id !== id); return save() },
  importFiles: desktopRequired, removeAttachment: desktopRequired,
  run: desktopRequired, cancel: async () => {}, saveProvider: desktopRequired, clearProvider: desktopRequired, models: desktopRequired,
  feedback: desktopRequired, suggestLesson: desktopRequired, runEvaluations: desktopRequired, calculate: desktopRequired, exportInvestigation: desktopRequired,
  checkUpdates: async () => ({ status: 'unavailable', message: 'Updates are available in installed Electron release builds.' }),
  installUpdate: desktopRequired, openExternal: async url => { window.open(url, '_blank', 'noopener,noreferrer') },
  copyText: async text => navigator.clipboard.writeText(text),
  onProgress: () => () => {}, onUpdate: () => () => {},
}
export const api = window.desktop ?? preview
