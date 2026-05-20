import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../../infra/db/client.js';

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    let dbStatus: 'up' | 'down' = 'down';
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = 'up';
    } catch {
      dbStatus = 'down';
    }

    return {
      status: 'ok',
      db: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  });
};
