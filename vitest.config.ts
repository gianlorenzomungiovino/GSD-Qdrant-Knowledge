import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['scripts/**/*.js'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '*.config.js',
        '*.config.ts',
      ],
    },
  },
});