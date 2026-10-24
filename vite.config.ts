import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { labApi } from './server/plugin.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), labApi()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { host: '127.0.0.1', port: 4300, strictPort: true },
})
