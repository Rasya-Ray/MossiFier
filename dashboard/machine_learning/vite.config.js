import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Selama pengembangan, semua permintaan /api, /video, dan /snapshot
// diteruskan ke backend Python (py server.py) di port 8000.
const BACKEND = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,

    allowedHosts: [
      'mossifier.millenium.ai'
    ],

    proxy: {
      '/api': BACKEND,
      '/video': BACKEND,
      '/snapshot': BACKEND,
    },
  },
})