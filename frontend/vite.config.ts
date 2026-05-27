import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// When running inside Docker (frontend-dev service), BACKEND_URL is injected
// via docker-compose as http://backend:8000 so the proxy can reach the backend
// container by its service name.  Outside Docker it falls back to localhost.
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor':  ['react', 'react-dom', 'react-router-dom'],
          'query-vendor':  ['@tanstack/react-query'],
          'form-vendor':   ['react-hook-form', '@hookform/resolvers', 'zod'],
          'chart-vendor':  ['recharts'],
          'ui-vendor':     ['lucide-react', 'react-dropzone', 'react-hot-toast'],
          'store-vendor':  ['zustand', 'axios', 'date-fns'],
        },
      },
    },
  },
})
