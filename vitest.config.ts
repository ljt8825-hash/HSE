import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'server/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: [
        'src/**/*.{ts,vue,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/main.ts',
        'src/plugins/**',
        'src/**/*.stories.ts',
      ],
      all: true,
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
    },
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
