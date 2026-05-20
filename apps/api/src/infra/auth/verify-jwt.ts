import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { env } from '../../env.js';

/**
 * Shape del JWT que firma Supabase GoTrue.
 * https://supabase.com/docs/guides/auth/jwts
 */
export interface SupabaseJwtPayload {
  sub: string; // user id (UUID, matches auth.users.id)
  email?: string;
  role: string; // 'authenticated' | 'anon' | 'service_role'
  aud: string;
  exp: number;
  iat: number;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: SupabaseJwtPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const supabaseAuthPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyJwt, {
    secret: env.SUPABASE_JWT_SECRET,
    verify: {
      // Supabase emite tokens con aud: 'authenticated'
      allowedAud: 'authenticated',
    },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify<SupabaseJwtPayload>();
      request.user = payload;
    } catch {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or missing token' });
    }
  });
};

export default fp(supabaseAuthPlugin, { name: 'supabase-auth' });
