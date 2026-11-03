import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CI ? ['--no-sandbox'] : [] })
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } })
  await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block}</style>${await readFile('build/icon.svg', 'utf8')}`)
  await page.screenshot({ path: 'build/icon.png', omitBackground: true })
} finally { await browser.close() }
