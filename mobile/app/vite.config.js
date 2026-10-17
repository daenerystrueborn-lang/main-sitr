import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const apiBase = (process.env.ASTRAL_API_BASE || 'https://astral-bot-production-afb0.up.railway.app').replace(/\/+$/, '')
const open = !!process.env.PREVIEW_OPEN
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')

/** The React build replaces www wholesale, so the site art the app still
 *  uses (mode cards, season hero) has to ride along. */
function copySiteArt() {
  return {
    name: 'astral-copy-art',
    closeBundle() {
      const out = path.resolve(here, '..', 'www')
      for (const rel of ['img/modes', 'img/season']) {
        const src = path.join(repo, 'assets', rel)
        if (fs.existsSync(src)) fs.cpSync(src, path.join(out, 'assets', rel), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  root: here,
  base: './',
  plugins: [
    react(),
    copySiteArt(),
    {
      name: 'astral-inject',
      transformIndexHtml(html) {
        return html
          .replace('__API_BASE__', JSON.stringify(apiBase))
          .replace('__BUILD__', JSON.stringify(stamp))
          .replace('__OPEN__', open ? '1' : '0')
      },
    },
  ],
  resolve: { alias: { '@site': repo } },
  build: { outDir: path.resolve(here, '..', 'www'), emptyOutDir: true, target: 'es2019' },
})
