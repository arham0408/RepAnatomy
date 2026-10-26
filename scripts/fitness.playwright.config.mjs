import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const python = process.env.PYTHON || (existsSync('.venv/Scripts/python.exe') ? '.venv/Scripts/python.exe' : existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python');
const production=process.env.REPANATOMY_PRODUCTION_TEST==='1';
export default defineConfig({
  testDir: '.', testMatch: 'fitness.e2e.mjs', timeout: 90000, expect:{timeout:20000}, workers:1, reporter:'list',
  use:{baseURL:production?'http://127.0.0.1:8013':'http://127.0.0.1:4320',viewport:{width:1440,height:1100},serviceWorkers:'block',
    launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}},
  webServer:[
    {command:`"${python}" -m uvicorn backend.main:app --host 127.0.0.1 --port 8013`,cwd:'..',url:'http://127.0.0.1:8013/api/fitness/capabilities',reuseExistingServer:false,env:{GROQ_API_KEY:'',REPANATOMY_SERVE_WEB:production?'1':'0',REPANATOMY_ALLOWED_ORIGINS:production?'http://127.0.0.1:8013':'http://127.0.0.1:4320'}},
    ...production?[]:[{command:'npm run dev -- --host 127.0.0.1 --port 4320 --strictPort',cwd:'..',url:'http://127.0.0.1:4320',reuseExistingServer:false,env:{REPANATOMY_API_TARGET:'http://127.0.0.1:8013'}}],
  ],
});
