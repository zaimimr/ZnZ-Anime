import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020' },
  server: {
    proxy: {
      '/x/miruro': { target: 'https://www.miruro.to', changeOrigin: true, rewrite: (p) => p.replace(/^\/x\/miruro/, '') },
      '/x/mal': { target: 'https://api.myanimelist.net', changeOrigin: true, rewrite: (p) => p.replace(/^\/x\/mal/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    env: { VITE_AUTH_URL: 'https://auth.test' },
  },
})
