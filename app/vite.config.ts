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
      '/x/justanime': { target: 'https://core.justanime.to', changeOrigin: true, headers: { origin: 'https://justanime.to', 'user-agent': 'Mozilla/5.0' }, rewrite: (p) => p.replace(/^\/x\/justanime/, '/api') },
      '/x/animex/graphql': { target: 'https://graphql.animex.one', changeOrigin: true, headers: { origin: 'https://animex.one', referer: 'https://animex.one/', 'user-agent': 'Mozilla/5.0' }, rewrite: () => '/graphql' },
      '/x/animex': { target: 'https://pp.animex.one', changeOrigin: true, headers: { origin: 'https://animex.one', referer: 'https://animex.one/', 'user-agent': 'Mozilla/5.0' }, rewrite: (p) => p.replace(/^\/x\/animex/, '/rest/api') },
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
