import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './env.js';
import supabaseAuth from './infra/auth/verify-jwt.js';
import { healthRoute } from './http/routes/health.js';
import { authRoute } from './http/routes/auth.js';
import { campaignsRoute } from './http/routes/campaigns.js';
import { compendiumRoute } from './http/routes/compendium.js';
import { charactersRoute } from './http/routes/characters.js';
import { sessionsRoute } from './http/routes/sessions.js';
import { mapRoute } from './http/routes/map.js';
import { worldRoute } from './http/routes/world.js';
import { journalRoute } from './http/routes/journal.js';

export async function buildServer() {
  const isDev = env.NODE_ENV === 'development';
  // Spread transport conditionally so the key is OMITTED in non-dev — exactOptionalPropertyTypes
  // rejects an explicit `transport: undefined` against Fastify's typed config.
  const app = Fastify({
    logger: {
      level: isDev ? 'debug' : 'info',
      ...(isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss' },
            },
          }
        : {}),
    },
  });

  await app.register(sensible);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(supabaseAuth);

  await app.register(
    async (api) => {
      await api.register(healthRoute);
      await api.register(authRoute);
      await api.register(campaignsRoute);
      await api.register(compendiumRoute);
      await api.register(charactersRoute);
      await api.register(sessionsRoute);
      await api.register(mapRoute);
      await api.register(worldRoute);
      await api.register(journalRoute);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
