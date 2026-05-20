import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../../env.js';
import * as schema from './schema.js';

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle(queryClient, { schema, logger: env.NODE_ENV === 'development' });

export type Database = typeof db;
