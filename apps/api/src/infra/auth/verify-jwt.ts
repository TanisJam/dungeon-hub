import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { and, eq } from 'drizzle-orm';
import { env } from '../../env.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';

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

// @fastify/jwt does its own module augmentation of FastifyRequest.user
// (defaults to string | object | Buffer). Extending FastifyJWT.user is the
// canonical way to give every `request.user` access the correct payload type.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: SupabaseJwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Set cuando el request entró con header X-Acting-As-Discord-Id y la
     * impersonation fue autorizada. Contiene el user_id del bot/servicio que
     * inició la acción. `request.user.sub` apunta al user impersonado.
     */
    impersonatedBy?: string;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const IMPERSONATE_HEADER = 'x-acting-as-discord-id';

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

    // ---- Impersonation via X-Acting-As-Discord-Id -----------------------
    // Solo accounts con can_impersonate=true (típicamente el bot) pueden
    // mandar este header. El backend reemplaza request.user.sub con el user
    // real para que todos los handlers downstream apliquen el RBAC del usuario
    // impersonado sin ningún cambio en su lógica.
    const headerVal = request.headers[IMPERSONATE_HEADER];
    const discordId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (!discordId) return;

    const requester = await db
      .select({ id: users.id, canImpersonate: users.canImpersonate })
      .from(users)
      .where(eq(users.id, request.user.sub))
      .limit(1);
    const requesterRow = requester[0];

    if (!requesterRow || !requesterRow.canImpersonate) {
      return reply.code(403).send({
        error: 'IMPERSONATION_NOT_ALLOWED',
        message: 'Tu account no tiene permiso para actuar en nombre de otros users',
      });
    }

    const target = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.discordId, discordId)))
      .limit(1);
    const targetRow = target[0];

    if (!targetRow) {
      return reply.code(403).send({
        error: 'DISCORD_USER_NOT_LINKED',
        message: `No hay ningún user backend vinculado al Discord ID "${discordId}". Hacé /link primero.`,
      });
    }

    // Override: el rest del request corre como el user impersonado.
    request.impersonatedBy = requesterRow.id;
    request.user = { ...request.user, sub: targetRow.id };
  });
};

export default fp(supabaseAuthPlugin, { name: 'supabase-auth' });
