import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const storage = vi.hoisted(() => ({ available: true, backend: 'gnome_libsecret' }))
vi.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: () => storage.available,
  getSelectedStorageBackend: () => storage.backend,
  encryptString: (text: string) => Buffer.from(text.split('').reverse().join('')),
  decryptString: (bytes: Buffer) => bytes.toString().split('').reverse().join(''),
} }))
import { Store } from '../electron/store'

describe('local credential and workspace persistence', () => {
  const paths: string[] = []
  function directory() { const path = mkdtempSync(join(tmpdir(), 're-store-')); paths.push(path); return path }
  afterEach(() => { paths.forEach(path => rmSync(path, { recursive: true, force: true })); storage.available = true; storage.backend = 'gnome_libsecret' })
  it('persists encrypted keys and never returns secrets to the renderer', () => {
    const path = directory()
    const store = new Store(path)
    const statuses = store.setProvider('ollama-cloud', 'my-private-key')
    expect(JSON.stringify(statuses)).not.toContain('my-private-key')
    expect(readFileSync(join(path, 'settings.json'), 'utf8')).not.toContain('my-private-key')
    expect(new Store(path).connection('ollama-cloud').key).toBe('my-private-key')
  })
  it('keeps keys in memory when Linux falls back to basic_text', () => {
    storage.backend = 'basic_text'
    const path = directory()
    const store = new Store(path)
    expect(store.secureStorage).toBe(false)
    expect(store.setProvider('anthropic', 'session-private-key').find(p => p.id === 'anthropic')?.keyStorage).toBe('session')
    expect(store.connection('anthropic').key).toBe('session-private-key')
    expect(readFileSync(join(path, 'settings.json'), 'utf8')).not.toContain('session-private-key')
    expect(() => new Store(path).connection('anthropic')).toThrow('Connect')
  })
  it('requires a new key when changing a custom endpoint', () => {
    const store = new Store(directory())
    store.setProvider('custom', 'first-key', 'https://first.example/v1')
    expect(() => store.setProvider('custom', '', 'https://other.example/v1')).toThrow('Enter a key')
    expect(store.connection('custom').baseUrl).toBe('https://first.example/v1')
  })
  it('round-trips saved lessons and can forget saved credentials', () => {
    const path = directory()
    const store = new Store(path)
    store.workspace.lessons.push({ id: 'id', text: 'Check units.', createdAt: 'now' })
    store.save()
    expect(new Store(path).workspace.lessons[0].text).toBe('Check units.')
    store.setProvider('deepseek', 'local-key')
    store.clearProvider('deepseek')
    expect(() => store.connection('deepseek')).toThrow('Connect')
  })
})
