import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load env vars from .env.local — necesarios para auth.setup.ts
// (TEST_USER_EMAIL, TEST_USER_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, etc.)
dotenv.config({ path: '.env.local' });

const AUTH_FILE = 'e2e/.auth/user.json';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  // No webServer: stack debe estar corriendo (Supabase + API + Web) antes de
  // ejecutar tests. Ver e2e/README.md.

  projects: [
    // 1. Setup: crea el test user (idempotente via admin API) + sign-in,
    //    guarda storageState en e2e/.auth/user.json.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts$/,
    },

    // 2. Unauthenticated tests — no dependen del setup.
    {
      name: 'chromium-public',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.public\.spec\.ts$/,
    },

    // 3. Authenticated tests — usan el storageState guardado por setup.
    {
      name: 'chromium-auth',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.auth\.spec\.ts$/,
    },
  ],
});
