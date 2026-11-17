import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // bind ke semua interface IPv4 (0.0.0.0) supaya 127.0.0.1 + Caddy bisa akses,
    // bukan cuma ::1 seperti default 'localhost' di Windows
    host: true,
    port: 5173,
    strictPort: true,
    // Vite 6+ memblokir Host header yang tidak dikenal (termasuk domain hosts file)
    allowedHosts: ['mossifier.millenium.ai', 'server.ai', '.millenium.ai'],
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
})