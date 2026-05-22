import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db } from '../../infra/db/client.js';
import { discordLinkTokens, users } from '../../infra/db/schema.js';
import { env } from '../../env.js';

/**
 * Endpoints para vincular accounts de Discord ↔ users del backend.
 *
 * Flow (canonical device-linking):
 * 1. Bot (con can_impersonate=true) llama POST /auth/link/request con el
 *    discord_id del usuario que quiere vincular. Backend genera token random
 *    (10 min TTL) y devuelve la URL completa de la web app.
 * 2. Bot manda la URL al usuario via ephemeral Discord message.
 * 3. Usuario abre URL en navegador, loguea en la web app con Supabase auth.
 * 4. Web app llama POST /auth/link/confirm con el token. Backend valida que
 *    el token exista, no haya expirado, no haya sido consumido, y setea
 *    users.discord_id del usuario autenticado.
 * 5. Bot, en futuras requests, manda header X-Acting-As-Discord-Id con el
 *    discord_id del usuario y todo funciona como si el usuario llamara directo.
 *
 * Anti-phishing: la web app DEBE mostrar el discord_username del token antes
 * de pedir confirmación, para que el usuario vea qué identidad está vinculando.
 */

const TOKEN_TTL_MINUTES = 10;
const TOKEN_BYTES = 24; // 192 bits → 48 hex chars

const RequestLinkBody = z.object({
  discord_id: z.string().min(1).max(64),
  discord_username: z.string().min(1).max(64).optional(),
});

const ConfirmLinkBody = z.object({
  token: z.string().min(1),
});

const StatusParams = z.object({
  token: z.string().min(1),
});

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

function buildLinkUrl(token: string): string {
  return `${env.WEB_APP_URL.replace(/\/$/, '')}/link/${token}`;
}

export const authRoute: FastifyPluginAsync = async (app) => {
  // ---- GET /auth/me --------------------------------------------------------
  // Devuelve el user efectivo (post-impersonation si aplica). Útil para que el
  // bot/web app sepan quién es el actor sin tener que parsear el JWT.
  app.get('/auth/me', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.user!.sub;
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        discordId: users.discordId,
        discordUsername: users.discordUsername,
        canImpersonate: users.canImpersonate,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!rows[0]) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { ...rows[0], impersonatedBy: request.impersonatedBy ?? null };
  });

  // ---- POST /auth/link/request ---------------------------------------------
  // Solo accounts con can_impersonate=true pueden generar tokens (el bot).
  // El user ya está validado por el middleware authenticate; acá solo
  // chequeamos can_impersonate sin pasar por el header impersonation flow.
  app.post('/auth/link/request', { preHandler: app.authenticate }, async (request, reply) => {
    // IMPORTANTE: si request.impersonatedBy está set, alguien quiso usar este
    // endpoint con header X-Acting-As-Discord-Id — rechazamos porque no tiene
    // sentido (sería bot impersonando user para pedir vincular a otro user).
    if (request.impersonatedBy) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'No usar X-Acting-As-Discord-Id en este endpoint',
      });
    }

    const body = RequestLinkBody.parse(request.body);
    const requesterId = request.user!.sub;

    const requester = await db
      .select({ id: users.id, canImpersonate: users.canImpersonate })
      .from(users)
      .where(eq(users.id, requesterId))
      .limit(1);
    if (!requester[0]?.canImpersonate) {
      return reply.code(403).send({
        error: 'FORBIDDEN',
        message: 'Solo accounts de servicio pueden generar link tokens',
      });
    }

    // Si ya hay un user con ese discord_id, devolvemos error temprano —
    // no tiene sentido generar el token si el flow va a fallar al confirmar.
    const existing = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.discordId, body.discord_id))
      .limit(1);
    if (existing[0]) {
      return reply.code(409).send({
        error: 'ALREADY_LINKED',
        message: `Ese Discord ID ya está vinculado al user "${existing[0].username}"`,
      });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000);

    await db.insert(discordLinkTokens).values({
      token,
      discordId: body.discord_id,
      discordUsername: body.discord_username ?? null,
      requestedByUserId: requesterId,
      expiresAt,
    });

    return reply.code(201).send({
      token,
      url: buildLinkUrl(token),
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: TOKEN_TTL_MINUTES * 60,
    });
  });

  // ---- GET /auth/link/status/:token ----------------------------------------
  // Útil para que la web app sepa si un token sigue válido y qué Discord ID
  // está pidiendo vincular ANTES de mostrar la confirmación.
  // Requiere auth (cualquier user logueado) — anti-enumeration.
  app.get(
    '/auth/link/status/:token',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { token } = StatusParams.parse(request.params);

      const row = await db
        .select({
          discordId: discordLinkTokens.discordId,
          discordUsername: discordLinkTokens.discordUsername,
          expiresAt: discordLinkTokens.expiresAt,
          consumedAt: discordLinkTokens.consumedAt,
        })
        .from(discordLinkTokens)
        .where(eq(discordLinkTokens.token, token))
        .limit(1);
      const tok = row[0];

      if (!tok) return reply.code(404).send({ error: 'NOT_FOUND', message: 'Token inválido' });

      const now = new Date();
      if (tok.consumedAt) {
        return reply.code(410).send({ error: 'CONSUMED', message: 'Token ya fue usado' });
      }
      if (tok.expiresAt < now) {
        return reply.code(410).send({ error: 'EXPIRED', message: 'Token expirado' });
      }

      return {
        discord_id: tok.discordId,
        discord_username: tok.discordUsername,
        expires_at: tok.expiresAt.toISOString(),
      };
    },
  );

  // ---- POST /auth/link/confirm ---------------------------------------------
  // El usuario autenticado consume el token y vincula su discord_id.
  // Idempotente por design: una vez consumido, futuras llamadas devuelven 410.
  app.post('/auth/link/confirm', { preHandler: app.authenticate }, async (request, reply) => {
    if (request.impersonatedBy) {
      return reply.code(400).send({
        error: 'BAD_REQUEST',
        message: 'No usar X-Acting-As-Discord-Id en este endpoint',
      });
    }

    const body = ConfirmLinkBody.parse(request.body);
    const userId = request.user!.sub;

    // Tomamos el token EN una sola query: not consumed, not expired.
    const now = new Date();
    const tokRows = await db
      .select()
      .from(discordLinkTokens)
      .where(
        and(
          eq(discordLinkTokens.token, body.token),
          isNull(discordLinkTokens.consumedAt),
          gt(discordLinkTokens.expiresAt, now),
        ),
      )
      .limit(1);
    const tok = tokRows[0];
    if (!tok) {
      return reply
        .code(410)
        .send({ error: 'INVALID_TOKEN', message: 'Token inválido, expirado o ya usado' });
    }

    // Verificar que el discord_id no se haya tomado entre la generación del
    // token y este confirm (race condition con otro user vinculando).
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.discordId, tok.discordId))
      .limit(1);
    if (existing[0] && existing[0].id !== userId) {
      return reply.code(409).send({
        error: 'ALREADY_LINKED',
        message: 'Ese Discord ID ya está vinculado a otro user',
      });
    }

    // Actualizar el user con su discord_id y marcar el token como consumido.
    // Idealmente esto sería una transacción — drizzle soporta db.transaction(),
    // pero con sucesivas UPDATEs en la misma request HTTP es suficiente para
    // este flow (el peor caso es token consumido pero user no actualizado, y
    // el user puede retry pidiendo otro token).
    await db
      .update(users)
      .set({ discordId: tok.discordId, discordUsername: tok.discordUsername })
      .where(eq(users.id, userId));

    await db
      .update(discordLinkTokens)
      .set({ consumedAt: now, consumedByUserId: userId })
      .where(eq(discordLinkTokens.token, body.token));

    return {
      ok: true,
      discord_id: tok.discordId,
      discord_username: tok.discordUsername,
    };
  });
};
