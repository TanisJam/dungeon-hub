import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),

  // Postgres (apunta al Postgres de Supabase self-hosted)
  DATABASE_URL: z.string().url(),

  // Supabase Auth (GoTrue)
  SUPABASE_JWT_SECRET: z.string().min(32, 'JWT secret debe tener al menos 32 caracteres'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // URL pública de la web app — usada para generar links del flow Discord
  // /link. La web app debe levantar una página en {WEB_APP_URL}/link/<token>
  // que pida confirmación y llame a POST /auth/link/confirm.
  WEB_APP_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env: Env = parsed.data;
