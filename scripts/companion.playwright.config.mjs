import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const python = process.env.PYTHON || (existsSync('.venv/Scripts/python.exe') ? '.venv/Scripts/python.exe' : existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python');
export default defineConfig({
  testDir: '.', testMatch: 'voice-companion.e2e.mjs', timeout: 180000, expect: { timeout: 30000 }, workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4318', viewport: { width: 1440, height: 1000 }, deviceScaleFactor: process.env.CI ? .5 : 1, serviceWorkers: 'block',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: [
    { command: `"${python}" -m uvicorn backend.main:app --host 127.0.0.1 --port 8011`, cwd: '..',
      url: 'http://127.0.0.1:8011/api/health', reuseExistingServer: false,
      env: { GROQ_API_KEY: '', REPANATOMY_ALLOWED_ORIGINS: 'http://127.0.0.1:4318' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 4318 --strictPort', cwd: '..',
      url: 'http://127.0.0.1:4318', reuseExistingServer: false,
      env: { REPANATOMY_API_TARGET: 'http://127.0.0.1:8011' } },
  ],
});
