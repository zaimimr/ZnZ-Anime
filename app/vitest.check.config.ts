import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'node', include: ['src/**/*.check.ts'], testTimeout: 60_000 } })
