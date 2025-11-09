import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Custom plugin to ensure COOP/COEP headers are set
const crossOriginIsolation = () => ({
  name: 'cross-origin-isolation',
  configureServer: (server) => {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      next()
    })
  },
  configurePreviewServer: (server) => {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
      next()
    })
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    crossOriginIsolation(),
    react(),
    tailwindcss()
  ],
  optimizeDeps: {
    exclude: ['@webcontainer/api']
  }
})
