import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { safeStorage } from 'electron'
import { PROVIDERS } from '../src/shared/providers'
import type { ProviderId, ProviderStatus, Workspace } from '../src/shared/types'
import { validateBaseUrl, type Connection } from './gateway'

interface Settings { providers: Partial<Record<ProviderId, { encryptedKey?: string; baseUrl?: string }>> }
export class Store {
  workspace: Workspace
  private settings: Settings
  private sessionKeys = new Map<ProviderId, string>()
  constructor(private directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.workspace = this.read('workspace.json', { investigations: [], lessons: [], evalRuns: [] })
    if (!Array.isArray(this.workspace.investigations) || !Array.isArray(this.workspace.lessons) || !Array.isArray(this.workspace.evalRuns)) throw new Error('Workspace format is invalid. Preserve workspace.json before repairing it.')
    this.settings = this.read('settings.json', { providers: {} })
  }
  private read<T>(name: string, fallback: T): T {
    const path = join(this.directory, name)
    if (!existsSync(path)) return fallback
    try { return JSON.parse(readFileSync(path, 'utf8')) } catch { throw new Error(`Cannot read ${name}. The original file has been preserved.`) }
  }
  private write(name: string, value: unknown) {
    const path = join(this.directory, name)
    writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 })
    renameSync(`${path}.tmp`, path)
  }
  save() { this.write('workspace.json', this.workspace); return this.workspace }
  get secureStorage() { return safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text') }
  private key(id: ProviderId) {
    if (this.sessionKeys.has(id)) return this.sessionKeys.get(id)!
    const saved = this.settings.providers[id]?.encryptedKey
    if (saved && this.secureStorage) {
      try { return safeStorage.decryptString(Buffer.from(saved, 'base64')) } catch { throw new Error('The saved API key cannot be decrypted on this machine. Re-enter it in Providers.') }
    }
    return process.env[PROVIDERS.find(p => p.id === id)!.envKey] ?? ''
  }
  connection(id: ProviderId): Connection {
    const definition = PROVIDERS.find(p => p.id === id)!
    const key = this.key(id)
    if (!key && id !== 'ollama-local') throw new Error(`Connect ${definition.name} in Providers first.`)
    const baseUrl = this.settings.providers[id]?.baseUrl ?? definition.baseUrl
    if (id === 'custom' && new URL(baseUrl).hostname === 'api.example.com') throw new Error('Set your custom API endpoint in Providers first.')
    return { id, key, baseUrl }
  }
  statuses(): ProviderStatus[] {
    return PROVIDERS.map(p => {
      let key = ''
      try { key = this.key(p.id) } catch { /* Keep UI available so the user can replace an undecryptable key. */ }
      const entry = this.settings.providers[p.id]
      const storage = this.sessionKeys.has(p.id) ? 'session' : entry?.encryptedKey && this.secureStorage ? 'encrypted' : key ? 'environment' : 'none'
      return { id: p.id, configured: !!key || p.id === 'ollama-local', baseUrl: entry?.baseUrl ?? p.baseUrl, keyStorage: storage }
    })
  }
  setProvider(id: ProviderId, key: string, baseUrl?: string) {
    const entry = { ...this.settings.providers[id] }
    if (baseUrl !== undefined) {
      if (id !== 'custom' && id !== 'ollama-local') throw new Error('This provider uses a fixed, trusted endpoint.')
      const normalized = validateBaseUrl(baseUrl, id === 'ollama-local')
      // Never forward an existing key to a different custom endpoint.
      if (id === 'custom' && normalized !== (entry.baseUrl ?? PROVIDERS.find(p => p.id === id)!.baseUrl) && !key) throw new Error('Enter a key when changing the custom endpoint.')
      entry.baseUrl = normalized
    }
    if (key) {
      if (this.secureStorage) { entry.encryptedKey = safeStorage.encryptString(key).toString('base64'); this.sessionKeys.delete(id) }
      else { this.sessionKeys.set(id, key); delete entry.encryptedKey }
    }
    this.settings.providers[id] = entry
    this.write('settings.json', this.settings)
    return this.statuses()
  }
  clearProvider(id: ProviderId) {
    this.sessionKeys.delete(id)
    if (this.settings.providers[id]) delete this.settings.providers[id]!.encryptedKey
    this.write('settings.json', this.settings)
    return this.statuses()
  }
}
