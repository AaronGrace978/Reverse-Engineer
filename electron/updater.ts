import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../src/shared/types'

let state: UpdateState = { status: 'idle', message: 'Updates include the application and its bundled Electron runtime.' }
let checking: Promise<UpdateState> | undefined
function publish(next: UpdateState) {
  state = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update', state)
}
export function initializeUpdater() {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('checking-for-update', () => publish({ status: 'checking', message: 'Checking GitHub Releases…' }))
  autoUpdater.on('update-available', info => publish({ status: 'available', version: info.version, message: `Downloading ${info.version}…` }))
  autoUpdater.on('download-progress', info => publish({ status: 'available', percent: info.percent, message: `Downloading update · ${Math.round(info.percent)}%` }))
  autoUpdater.on('update-not-available', () => publish({ status: 'current', message: 'You have the latest published application release.' }))
  autoUpdater.on('update-downloaded', info => publish({ status: 'downloaded', version: info.version, message: `${info.version} is ready. Restart to install.` }))
  autoUpdater.on('error', () => publish({ status: 'error', message: 'Update check failed. A published release and reachable GitHub update feed are required.' }))
  if (app.isPackaged && process.env.REVERSE_ENGINEER_SMOKE !== '1') {
    setTimeout(() => void checkUpdates(), 10_000).unref()
    setInterval(() => void checkUpdates(), 6 * 60 * 60 * 1000).unref()
  }
}
export async function checkUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return { status: 'unavailable', message: 'Automatic updates are available in installed release builds. Development builds do not update.' }
  if (state.status === 'downloaded') return state
  if (checking) return checking
  checking = (async () => {
    try { await autoUpdater.checkForUpdates() } catch { /* The updater error event supplies a safe message. */ }
    return state
  })()
  try { return await checking } finally { checking = undefined }
}
export function installUpdate() {
  if (state.status !== 'downloaded') throw new Error('No update is ready to install.')
  autoUpdater.quitAndInstall()
}
