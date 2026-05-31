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

/**
 * The transaction proxy type yielded inside db.transaction(async (tx) => { ... }).
 * PgTransaction extends PgDatabase — both support the same query interface.
 * Use `DbOrTx` as the parameter type when a function must work both standalone
 * and inside a caller-supplied transaction (WARNING-1 atomicity fix).
 */
export type DbTx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Accept either the top-level db or a transaction proxy. */
export type DbOrTx = Database | DbTx;
