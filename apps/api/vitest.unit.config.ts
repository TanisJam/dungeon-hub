import { defineConfig } from 'vitest/config';

// The default `vitest.config.ts` runs the *entire* apps/api suite, which is
// overwhelmingly integration tests (tests/integration/, 119 files) that make
// real requests to a live GoTrue + Postgres. `pnpm test` therefore cannot run
// on a fresh clone or in CI without that stack already provisioned.
//
// This config carves out the 7 files (tests/unit/ + src/ co-located tests)
// that need no live infrastructure at all, so they can run anywhere — a
// fresh clone, a laptop with no Supabase stack up, or CI.
//
// The env values below exist ONLY to satisfy the import-time zod validation
// in src/env.ts (it calls process.exit(1) if required vars are missing).
// Nothing in this suite opens a database connection or talks to GoTrue —
// any test that tried would fail against these placeholder values.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
      SUPABASE_JWT_SECRET: '0123456789012345678901234567890123456789',
      SUPABASE_URL: 'http://localhost:8000',
      SUPABASE_ANON_KEY: 'placeholder-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role-key',
    },
  },
});
