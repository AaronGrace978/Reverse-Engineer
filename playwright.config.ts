import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1480, height: 980 }, launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CI ? ['--no-sandbox'] : [] }, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev:web', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
})
