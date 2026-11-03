import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import { watch } from 'node:fs'
import electron from 'electron'
import './build-electron.mjs'

const server = await createServer()
await server.listen()
let desktop
function start() {
  desktop = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173' } })
  desktop.on('exit', () => { if (!restarting) shutdown() })
}
let restarting = false
let timer
watch('electron', { recursive: true }, () => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    restarting = true
    desktop.kill()
    const build = spawn(process.execPath, ['scripts/build-electron.mjs'], { stdio: 'inherit' })
    build.on('exit', code => { restarting = false; if (code === 0) start(); else shutdown() })
  }, 250)
})
async function shutdown() { desktop?.kill(); await server.close(); process.exit() }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
start()
