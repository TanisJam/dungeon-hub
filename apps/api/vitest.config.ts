import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Tests de integración hacen requests reales a GoTrue + Postgres, dales tiempo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Bounded parallelism — maxForks:2 keeps GoTrue admin API concurrency safe
    // while cutting wall-clock from ~84s to ~45s. Exploration #2057 (Strategy D).
    pool: 'forks',
    poolOptions: { forks: { singleFork: false, maxForks: 2, minForks: 1 } },
    // Cargar el .env del API
    env: {
      NODE_ENV: 'test',
    },
  },
});
