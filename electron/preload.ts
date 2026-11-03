import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi, Progress, UpdateState } from '../src/shared/types'

const api: DesktopApi = {
  initialize: () => ipcRenderer.invoke('initialize'),
  createInvestigation: mode => ipcRenderer.invoke('create-investigation', mode),
  deleteInvestigation: id => ipcRenderer.invoke('delete-investigation', id),
  renameInvestigation: (id, title) => ipcRenderer.invoke('rename-investigation', id, title),
  importFiles: id => ipcRenderer.invoke('import-files', id),
  removeAttachment: (id, fileId) => ipcRenderer.invoke('remove-attachment', id, fileId),
  run: input => ipcRenderer.invoke('run', input),
  cancel: () => ipcRenderer.invoke('cancel'),
  saveProvider: (id, key, url) => ipcRenderer.invoke('save-provider', id, key, url),
  clearProvider: id => ipcRenderer.invoke('clear-provider', id),
  models: id => ipcRenderer.invoke('models', id),
  feedback: (id, messageId, value) => ipcRenderer.invoke('feedback', id, messageId, value),
  saveLesson: (text, sourceId) => ipcRenderer.invoke('save-lesson', text, sourceId),
  suggestLesson: (id, messageId, provider, model) => ipcRenderer.invoke('suggest-lesson', id, messageId, provider, model),
  deleteLesson: id => ipcRenderer.invoke('delete-lesson', id),
  runEvaluations: (provider, model, lessons) => ipcRenderer.invoke('run-evaluations', provider, model, lessons),
  calculate: expression => ipcRenderer.invoke('calculate', expression),
  copyText: text => ipcRenderer.invoke('copy-text', text),
  exportInvestigation: id => ipcRenderer.invoke('export-investigation', id),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  onProgress: callback => {
    const listener = (_: unknown, value: Progress) => callback(value)
    ipcRenderer.on('progress', listener)
    return () => ipcRenderer.removeListener('progress', listener)
  },
  onUpdate: callback => {
    const listener = (_: unknown, value: UpdateState) => callback(value)
    ipcRenderer.on('update', listener)
    return () => ipcRenderer.removeListener('update', listener)
  },
}
contextBridge.exposeInMainWorld('desktop', api)
