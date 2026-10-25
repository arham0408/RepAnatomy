import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { atlasPwa } from './scripts/pwa-plugin.ts';
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  root: path('./web'),
  base: process.env.BASE_PATH || '/',
  publicDir: path('./public'),
  plugins: [react(), atlasPwa()],
  resolve: { alias: { '@': path('./') } },
  css: { postcss: { plugins: [tailwindcss()] } },
  build: { outDir: path('./dist'), emptyOutDir: true },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
