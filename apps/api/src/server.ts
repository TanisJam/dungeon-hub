import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './env.js';
import supabaseAuth from './infra/auth/verify-jwt.js';
import { healthRoute } from './http/routes/health.js';
import { campaignsRoute } from './http/routes/campaigns.js';
import { compendiumRoute } from './http/routes/compendium.js';
import { charactersRoute } from './http/routes/characters.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'debug' : 'info',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
  });

  await app.register(sensible);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(supabaseAuth);

  await app.register(
    async (api) => {
      await api.register(healthRoute);
      await api.register(campaignsRoute);
      await api.register(compendiumRoute);
      await api.register(charactersRoute);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
