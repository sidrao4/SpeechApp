import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // same-origin setup as production: the browser only talks to the Vite
    // server, which forwards /api/* to the local backend (Vercel does this
    // in prod via vercel.json)
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
