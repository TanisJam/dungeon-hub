import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Tests de integración hacen requests reales a GoTrue + Postgres, dales tiempo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Correr secuencialmente — todos comparten el mismo Supabase local.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    // Cargar el .env del API
    env: {
      NODE_ENV: 'test',
    },
  },
});
