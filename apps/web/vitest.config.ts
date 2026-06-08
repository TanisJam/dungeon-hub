import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to the lightweight node environment; jsdom setup is the dominant cost
    // of the web suite, so keep it off pure-logic .test.ts. Only component tests
    // (.test.tsx) and React-hook tests (use-*.test.ts, which call renderHook) need
    // jsdom. A DOM-using .test.ts not named use-* must add `// @vitest-environment jsdom`.
    environment: 'node',
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['**/use-*.test.ts', 'jsdom'],
    ],
    globals: false,
    include: ['components/**/*.test.{ts,tsx}', 'lib/**/*.test.{ts,tsx}', 'app/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(root, '.'),
    },
  },
});
