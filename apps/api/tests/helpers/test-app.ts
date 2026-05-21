import 'dotenv/config';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';

let cached: FastifyInstance | null = null;

/**
 * Devuelve un Fastify in-process listo para hacer .inject(). Se cachea entre
 * tests para no re-inicializar plugins en cada uno.
 */
export async function getTestApp(): Promise<FastifyInstance> {
  if (cached) return cached;
  cached = await buildServer();
  await cached.ready();
  return cached;
}

export async function closeTestApp(): Promise<void> {
  if (cached) {
    await cached.close();
    cached = null;
  }
}
