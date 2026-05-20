import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/infra/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Solo administramos el schema `public`.
  // `auth` lo maneja Supabase GoTrue y nuestro user `postgres` no tiene
  // permisos para CREATE en él. La FK desde public.users → auth.users sigue
  // funcionando porque es solo una referencia.
  schemaFilter: ['public'],
  verbose: true,
  strict: true,
});
