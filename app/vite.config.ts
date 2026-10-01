import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version) },
  plugins: [react()],
  build: { target: 'chrome85', cssTarget: 'chrome85' },
  server: {
    proxy: {
      '/x/miruro': { target: 'https://www.miruro.to', changeOrigin: true, rewrite: (p) => p.replace(/^\/x\/miruro/, '') },
      '/x/mal': { target: 'https://api.myanimelist.net', changeOrigin: true, rewrite: (p) => p.replace(/^\/x\/mal/, '') },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    env: { VITE_AUTH_URL: 'https://auth.test' },
  },
})
