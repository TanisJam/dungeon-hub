import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Tests de integración hacen requests reales a GoTrue + Postgres, dales tiempo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Bounded parallelism — maxForks:4 cuts wall-clock ~90s→~51s (measured). The
    // per-fork startup overhead only amortizes at 4 forks (maxForks:2 was slower
    // than sequential). GoTrue user-creation races are made safe by createTestUser
    // polling for the public.users mirror trigger. Exploration #2057 (Strategy D).
    pool: 'forks',
    poolOptions: { forks: { singleFork: false, maxForks: 4, minForks: 1 } },
    // Cargar el .env del API
    env: {
      NODE_ENV: 'test',
    },
  },
});
