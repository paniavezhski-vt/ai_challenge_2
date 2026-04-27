import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages: set VITE_BASE_PATH=/your-repo/ in CI (see .github/workflows/pages.yml)
const raw = process.env.VITE_BASE_PATH?.trim()
const base =
  raw && raw !== '/'
    ? (raw.endsWith('/') ? raw : `${raw}/`)
    : '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
