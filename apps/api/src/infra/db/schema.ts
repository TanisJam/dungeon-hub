import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  doublePrecision,
  boolean,
  primaryKey,
  uniqueIndex,
  index,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// public.users — mirror de auth.users con columnas app-specific.
//
// La tabla auth.users la maneja Supabase GoTrue (otro schema, otros permisos).
// La FK entre public.users.id → auth.users.id se aplica vía SQL manual en
// apps/api/drizzle/custom/0001-auth-mirror-trigger.sql para no chocar con los
// permisos del schema auth ni que Drizzle intente crearlo.
//
// La tabla se popula automáticamente al hacer signup en GoTrue gracias al
// trigger definido en el mismo archivo custom.
// ---------------------------------------------------------------------------
export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  username: text('username').notNull().unique(),
  // Discord identity — populated cuando el user vincula su cuenta via /link flow.
  discordId: text('discord_id').unique(),
  discordUsername: text('discord_username'),
  role: text('role', { enum: ['player', 'gm', 'admin'] }).notNull().default('player'),
  // Service flag — cuando true, este user puede actuar en nombre de otros via
  // header X-Acting-As-Discord-Id. Reservado para el bot account.
  canImpersonate: boolean('can_impersonate').notNull().default(false),
  // codex-knowledge FORK 5: per-user server-side bypass for the knowledge gate.
  // devMode=true → user sees all codex entries regardless of character_knowledge rows.
  // NOT an env var (per-user), NOT a world setting (different semantic).
  // REQ-CK-DEV-01, REQ-CK-DEV-02.
  devMode: boolean('dev_mode').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// discord_link_tokens — magic links de un solo uso para vincular Discord ↔ user.
//
// Flow: el bot llama POST /auth/link/request con el discord_id del usuario que
// quiere vincularse → backend genera un token random, lo guarda acá, devuelve la
// URL. El usuario abre la URL en la web (autenticado con Supabase), clickea
// confirmar → backend valida el token, lo consume, setea users.discord_id.
//
// TTL corto (10 min). Una sola consumición permitida. El bot no puede usar el
// token (no tiene la JWT del user real) — solo lo genera.
// ---------------------------------------------------------------------------
export const discordLinkTokens = pgTable('discord_link_tokens', {
  token: text('token').primaryKey(),
  discordId: text('discord_id').notNull(),
  discordUsername: text('discord_username'),
  requestedByUserId: uuid('requested_by_user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  consumedByUserId: uuid('consumed_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// worlds — top-level ownership entity.
//
// A world groups campaigns + characters under a shared authority axis.
// `rules_profile` (formerly on campaigns) lives here — one rules set per world.
// `owner_user_id` is the world creator; actual authority is via worldMembers.
// ON DELETE RESTRICT: deleting a user requires explicit world cleanup first.
// ---------------------------------------------------------------------------
export const worlds = pgTable(
  'worlds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    rulesProfile: jsonb('rules_profile').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_worlds_slug').on(t.slug),
    index('idx_worlds_owner').on(t.ownerUserId),
  ],
);

// ---------------------------------------------------------------------------
// world_members — many-to-many: users ↔ worlds with role.
//
// role: 'gm' = world-level GM authority; 'player' = member.
// PK (world_id, user_id) — one membership per user per world.
// ON DELETE CASCADE on both FKs: removing a user removes their memberships;
// removing a world removes its entire membership graph.
// Index on (user_id) for "my worlds" dashboard query.
// ---------------------------------------------------------------------------
export const worldMembers = pgTable(
  'world_members',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['gm', 'player'] }).notNull(),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.userId] }),
    index('idx_world_members_user').on(t.userId),
    check('world_members_role_check', sql`role IN ('gm', 'player')`),
  ],
);

// ---------------------------------------------------------------------------
// campaigns — world_id added; rules_profile DROPPED (moved to worlds).
// gm_user_id RETAINED — session-runner identity (locked decision #774).
// status: 'active' | 'archived' — soft close/reopen (campaign-archive SDD).
// ---------------------------------------------------------------------------
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    gmUserId: uuid('gm_user_id')
      .notNull()
      .references(() => users.id),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status', { enum: ['active', 'archived'] }).notNull().default('active'),
  },
  (t) => [check('campaigns_status_check', sql`status IN ('active', 'archived')`)],
);

// ---------------------------------------------------------------------------
// campaign_members — un user puede jugar en varias campañas
// ---------------------------------------------------------------------------
export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['player', 'gm'] }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.campaignId, table.userId] })],
);

// ---------------------------------------------------------------------------
// campaign_invite_tokens — shareable invite links for campaigns.
//
// Flow: GM calls POST /campaigns/:id/invite → backend generates a 48-hex token,
// stores it here, returns the URL. A player opens the URL, authenticates, and
// calls POST /invites/confirm → atomic dual-write to worldMembers + campaignMembers.
//
// Single-use default (maxUses=1, set by use-case); multi-use opt-in via maxUses=null.
// revokedAt is schema-ready; no revoke UI in this change.
// ---------------------------------------------------------------------------
export const campaignInviteTokens = pgTable(
  'campaign_invite_tokens',
  {
    token: text('token').primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['gm', 'player'] }).notNull().default('player'),
    // NULL = unlimited (multi-use). Use-case sets 1 for single-use, null for multi-use.
    maxUses: integer('max_uses'),
    useCount: integer('use_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_campaign_invite_tokens_campaign').on(t.campaignId)],
);

// ---------------------------------------------------------------------------
// characters — snapshot completo en data JSONB; inventory aparte para queries.
//
// campaign_id DROPPED (locked decision #774); world_id added.
// Characters belong to a world, not directly to a campaign.
// ---------------------------------------------------------------------------
export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status', { enum: ['draft', 'active', 'retired', 'dead', 'pending_approval'] })
      .notNull()
      .default('draft'),
    data: jsonb('data').notNull(),
    inventory: jsonb('inventory').notNull().default(sql`'[]'::jsonb`),
    xp: integer('xp').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_characters_user').on(table.userId),
    index('idx_characters_world').on(table.worldId),
  ],
);

// ---------------------------------------------------------------------------
// sessions — West Marches Session Manager.
//
// Una sesión es una entidad VIVA (no metadata pasiva): el DM la crea como
// draft/scheduled, la pone active al empezar a jugar, pause/resume durante,
// y completed cuando termina (con distribución de rewards en ese cierre).
//
// State machine:
//   scheduled → active ⇄ paused → completed
//                          ↘ cancelled
//
// Campos privados al DM: `dm_notes` (preparación, encuentros, secretos).
// Las respuestas filtran este campo según el rol del caller.
//
// Constraint runtime (no DB — para evitar partial-unique-index complejo):
//   un mismo character_id puede tener ≤ 1 fila en session_participants
//   cuyo session.status ∈ (active, paused) AND left_at IS NULL.
// ---------------------------------------------------------------------------
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    gmUserId: uuid('gm_user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    /** Descripción pública (qué se sabe de la sesión ANTES de jugarla). */
    description: text('description'),
    /** Notas privadas del DM (preparación, secretos). NUNCA en respuestas non-GM. */
    dmNotes: text('dm_notes'),
    status: text('status', {
      enum: ['scheduled', 'active', 'paused', 'completed', 'cancelled'],
    })
      .notNull()
      .default('scheduled'),
    /** Fecha planeada. Nullable para drafts. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    /** Cuándo arrancó (state → active la primera vez). */
    startedAt: timestamp('started_at', { withTimezone: true }),
    /** Cuándo cerró (state → completed/cancelled). */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** Mínimo nivel sugerido para participar. Soft, solo informativo. */
    levelMin: integer('level_min'),
    levelMax: integer('level_max'),
    /** Tope de jugadores. Hard: el join falla si se alcanza. Nullable = sin tope. */
    maxPlayers: integer('max_players'),
    /** Hex ID del mapa donde sucede. Soft FK (el map vive aparte, slice futuro). */
    locationHexId: text('location_hex_id'),
    /** Resumen post-cierre. Se genera/edita en `complete`. */
    summary: text('summary'),
    /** Rewards distribuidos al cerrar: { xpPerPlayer, goldPerPlayer, items: [{characterId, slug, source}] } */
    rewards: jsonb('rewards'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_sessions_campaign').on(t.campaignId),
    index('idx_sessions_status').on(t.status),
    index('idx_sessions_gm').on(t.gmUserId),
  ],
);

// ---------------------------------------------------------------------------
// session_participants — link de characters a una sesión.
//
// `leftAt` permite que un jugador drop mid-session sin perder el historial.
// El char "activo" en la sesión es el que tiene left_at IS NULL.
// ---------------------------------------------------------------------------
export const sessionParticipants = pgTable(
  'session_participants',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    /** Denormalizado de characters.user_id para queries (acceso, visibility). */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.characterId] }),
    index('idx_sp_character').on(t.characterId),
    index('idx_sp_session').on(t.sessionId),
  ],
);

// ---------------------------------------------------------------------------
// session_events — log append-only de eventos durante una sesión.
//
// Cada event captura algo que pasó: notas, descubrimientos, cambios de HP,
// XP otorgada, items granted, hexes revelados, viajes, etc.
//
// `actorUserId` es null en system events (auto-generados por rewards on
// complete, recharges, etc.).
//
// `visibility`:
//   - 'public': visible para todos los participants + campaign members.
//   - 'dm-only': visible solo para el GM de la sesión.
//
// El log es APPEND-ONLY. No hay PATCH ni DELETE de events — son historia.
// Si el DM tipea mal, agrega un event nuevo de tipo 'note' aclarando.
// ---------------------------------------------------------------------------
export const sessionEvents = pgTable(
  'session_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** Cuándo pasó (puede ser != createdAt si se logueó post-facto). */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** Quién lo registró. null = system event (auto-generado). */
    actorUserId: uuid('actor_user_id').references(() => users.id),
    /**
     * Tipo de event. Canonical types: 'note', 'hex_revealed', 'poi_discovered',
     * 'npc_met', 'travel', 'xp_award', 'gold_grant', 'item_grant', 'hp_change',
     * 'rest_short', 'rest_long', 'level_up', 'condition', 'inventory_change',
     * 'consume', 'spell_slot_used'. Open-ended — el caller puede mandar otros.
     */
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    visibility: text('visibility', { enum: ['public', 'dm-only'] })
      .notNull()
      .default('public'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_session_events_timeline').on(t.sessionId, t.occurredAt),
    index('idx_session_events_type').on(t.sessionId, t.eventType),
  ],
);

// ---------------------------------------------------------------------------
// hexes — Hexcrawl Map. Una world map implícita por world (no `maps` table
// aparte, YAGNI). Si más adelante hay dungeons/settlements como mapas
// separados, agregamos `mapId`.
//
// Modelo parent-child para soportar subdivisión (region → sub-region → local
// → city, etc.):
//   - parentHexId NULL = hex top-level (mapa regional global del world).
//   - parentHexId != NULL = sub-hex DENTRO del padre. (q, r) son locales al padre.
//
// Coordenadas:
//   - (q, r) axiales — quantized, para travel/exploration rules de D&D.
//   - (worldX, worldY) FLOAT opcionales — coords continuas para futuro
//     render Google Maps-style (Leaflet/MapLibre overlay). El backend razona
//     en (q, r); el frontend lee (worldX, worldY) si quiere posicionar pins
//     en un plano continuo.
//
// Status (libre, el DM decide, pero progresión sugerida):
//   unexplored → rumored → explored → cleared
//
// Visibility:
//   - DM ve todos los hexes (incluyendo unexplored + dmNotes).
//   - Players solo ven status != 'unexplored', NUNCA dmNotes. Sub-hexes de
//     un parent oculto también quedan ocultos (cascade en la query).
//
// Re-parented from campaign_id to world_id (world-first-model Slice 1).
// campaign_id dropped; migration 0031 backfills world_id from campaigns.world_id.
// ---------------------------------------------------------------------------
export const hexes = pgTable(
  'hexes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    /** NULL = top-level. Self-FK con cascade: borrar un parent borra sus hijos. */
    parentHexId: uuid('parent_hex_id').references((): AnyPgColumn => hexes.id, {
      onDelete: 'cascade',
    }),
    /** Etiqueta semántica abierta: 'region', 'sub-region', 'local', 'city', etc. */
    scale: text('scale'),
    /** Coords axiales — locales al parent si tiene; globales en world si NULL. */
    q: integer('q').notNull(),
    r: integer('r').notNull(),
    /** Coords continuas opcionales para render continuo (Leaflet, etc.). */
    worldX: doublePrecision('world_x'),
    worldY: doublePrecision('world_y'),
    name: text('name'),
    /** Terrain libre: 'forest', 'mountain', 'plains', 'town', 'ruins'... */
    terrain: text('terrain'),
    status: text('status', {
      enum: ['unexplored', 'rumored', 'explored', 'cleared'],
    })
      .notNull()
      .default('unexplored'),
    /** Notas DM-only. NUNCA en responses para non-GM. */
    dmNotes: text('dm_notes'),
    /** Notas visibles para players (lo que "saben" del hex). */
    playerNotes: text('player_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // El unique sobre (worldId, parentHexId, q, r) con NULLS NOT DISTINCT
    // se aplica via custom SQL migration (drizzle 0.38 no expone .nullsNotDistinct()).
    // Ver apps/api/drizzle/custom/0003-hexes-unique-world-nulls-not-distinct.sql
    index('idx_hexes_world_parent').on(t.worldId, t.parentHexId),
    index('idx_hexes_status').on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// pois — Points of Interest del mundo (hexcrawl + free-floating).
//
// poi-world-level (PR#1): re-anchored from hex → world directly.
//   worldId: NOT NULL FK → worlds(id) ON DELETE CASCADE (primary parent).
//   hexId:   NULLABLE FK → hexes(id) ON DELETE SET NULL (last-known location,
//            NPC model — DM work survives hex deletion).
//
// Free-floating POIs (hexId = null) are valid; they appear in world-scope
// queries but are not gated by hex visibility cascade.
//
// Status canonical (DM lo setea libremente, sugerido):
//   unknown → discovered → cleared
//
// Visibility (hybrid model — poi-world-level):
//   - DM ve todos los POIs (incluyendo unknown + dmNotes).
//   - Players ven status != 'unknown', NUNCA dmNotes.
//   - Hex-bound POIs (hexId set): cascade from parent hex status.
//   - Free-floating POIs (hexId null): status gate only.
//
// Coords (worldX, worldY) opcionales — pin placement fino.
// ---------------------------------------------------------------------------
export const pois = pgTable(
  'pois',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    hexId: uuid('hex_id').references(() => hexes.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    /** Descripción visible para players (lo que se sabe del POI). */
    description: text('description'),
    /** Notas DM-only (secretos, encounters planeados, loot tables). */
    dmNotes: text('dm_notes'),
    status: text('status', {
      enum: ['unknown', 'discovered', 'cleared'],
    })
      .notNull()
      .default('unknown'),
    /** Pin coords opcionales para el render continuo (Leaflet). */
    worldX: doublePrecision('world_x'),
    worldY: doublePrecision('world_y'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_pois_world').on(t.worldId),
    index('idx_pois_hex').on(t.hexId),
    index('idx_pois_status').on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// factions — grupos políticos / organizaciones del mundo.
//
// Re-parented to world_id (world-first-model Slice 2a).
// Party-level reputation column dropped; per-character×faction reputation
// lands in Slice 2b as character_faction_reputation table.
//
// Visibility (igual que hex/POI):
//   - DM ve todo, incluyendo dmNotes.
//   - Players ven name, description, state. NUNCA dmNotes.
// ---------------------------------------------------------------------------
export const factions = pgTable(
  'factions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    dmNotes: text('dm_notes'),
    state: text('state', {
      enum: ['active', 'dormant', 'destroyed', 'disbanded'],
    })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_factions_world').on(t.worldId)],
);

// ---------------------------------------------------------------------------
// npcs — personajes no-jugadores del mundo.
//
// Re-parented from campaign_id → world_id (world-first-model Slice 2b).
// faction_id direct FK dropped; NPC↔Faction membership now lives in npc_factions
// join table (N:M). hexId remains optional: última ubicación conocida.
//
//   - hexId = última ubicación conocida. ON DELETE SET NULL (si el DM borra
//     el hex, el NPC queda "sin ubicación", no se pierde el NPC).
//
// `status` ('alive' default) puede cambiar con eventos del mundo.
// `worldX/Y` para futuro pin en render continuo.
// ---------------------------------------------------------------------------
export const npcs = pgTable(
  'npcs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    race: text('race'),
    description: text('description'),
    dmNotes: text('dm_notes'),
    hexId: uuid('hex_id').references(() => hexes.id, { onDelete: 'set null' }),
    status: text('status', {
      enum: ['alive', 'dead', 'missing', 'unknown'],
    })
      .notNull()
      .default('alive'),
    worldX: doublePrecision('world_x'),
    worldY: doublePrecision('world_y'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_npcs_world').on(t.worldId),
    index('idx_npcs_hex').on(t.hexId),
  ],
);

// ---------------------------------------------------------------------------
// npc_factions — join table for NPC↔Faction N:M membership.
//
// An NPC may belong to 0..N factions; a faction may have 0..N NPCs.
// Both npc and faction MUST belong to the same world (enforced at use-case layer).
// Composite PK prevents duplicate membership.
// ON DELETE CASCADE on both ends: removing either npc or faction removes membership rows.
// ---------------------------------------------------------------------------
export const npcFactions = pgTable(
  'npc_factions',
  {
    npcId: uuid('npc_id')
      .notNull()
      .references(() => npcs.id, { onDelete: 'cascade' }),
    factionId: uuid('faction_id')
      .notNull()
      .references(() => factions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.npcId, t.factionId] })],
);

// ---------------------------------------------------------------------------
// character_faction_reputation — per-(character×faction) reputation value.
//
// Signed integer; NO domain cap (any integer valid — world-first-model ADR-6).
// Both character and faction MUST belong to the same world (enforced at use-case layer).
// PK (character_id, faction_id) → upsert semantics: one row per pair.
// ON DELETE CASCADE on both ends: removing character or faction removes reputation rows.
// ---------------------------------------------------------------------------
export const characterFactionReputation = pgTable(
  'character_faction_reputation',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    factionId: uuid('faction_id')
      .notNull()
      .references(() => factions.id, { onDelete: 'cascade' }),
    value: integer('value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.factionId] })],
);

// ---------------------------------------------------------------------------
// world_events — timeline DURABLE de cambios del mundo por campaña.
//
// IMPORTANTE: distintos de session_events.
//   - session_events: per-sesión, en-game, ruido fino (HP changes, notes,
//     hex_revealed, etc.). Vive y muere con la sesión.
//   - world_events: per-campaña, persistentes, "historia oficial" del mundo.
//     Una sesión que cierra puede generar 0+ world_events vía el field
//     `worldChanges` en session.complete.
//
// Cada world event puede tener `sourceSessionId` (FK nullable, SET NULL) que
// apunta a la sesión que lo gatilló. NULL = creado manualmente por el DM
// fuera de partida (e.g. "los reyes firmaron una tregua").
//
// `tags` array es free-form: ['faction', 'death', 'discovery', 'war', ...].
// El frontend puede filtrar por tag para renderizar timelines temáticos.
// ---------------------------------------------------------------------------
export const worldEvents = pgTable(
  'world_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // world-first-model Slice 3: campaign_id → world_id (migration 0034)
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dmNotes: text('dm_notes'),
    /** Cuándo pasó (in-world o real-time, lo decide el DM). */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** Sesión que lo gatilló. NULL = creado manual fuera de partida. */
    sourceSessionId: uuid('source_session_id').references(() => sessions.id, {
      onDelete: 'set null',
    }),
    visibility: text('visibility', { enum: ['public', 'dm-only'] })
      .notNull()
      .default('public'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_world_events_world_time').on(t.worldId, t.occurredAt),
    index('idx_world_events_source').on(t.sourceSessionId),
    index('idx_world_events_tags').using('gin', t.tags),
  ],
);

// ---------------------------------------------------------------------------
// journal_entries — wiki/lore interna del mundo, per-campaña.
//
// El DM documenta historia, geografía, facciones, rumores. Cada entry tiene
// visibility ('public' visible para todos los miembros, 'dm-only' visible
// solo para GMs).
//
// `tags` array libre: ['geography', 'history', 'faction', 'lore', 'rumor', ...].
// `authorUserId` track quién escribió (típicamente el GM creador).
//
// No hay versioning/history en MVP — el body se sobreescribe en PATCH.
// ---------------------------------------------------------------------------
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // world-first-model Slice 3: campaign_id → world_id (migration 0034)
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body'),
    visibility: text('visibility', { enum: ['public', 'dm-only'] })
      .notNull()
      .default('public'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_journal_world_updated').on(t.worldId, t.updatedAt),
    index('idx_journal_tags').using('gin', t.tags),
  ],
);

// ---------------------------------------------------------------------------
// quests — world-scoped DM quest tracking (MVP gap #3.7 — world content).
//
// NOT a PHB/5e rules concept — app-level DM content tooling, like journal_entries.
// visibility: 'public' visible a todos los miembros; 'dm-only' solo GMs.
// status: available | active | completed | abandoned (sin RAW; convención del modelo).
// dmNotes: prep secreto del GM — SIEMPRE se omite en respuestas a players,
//   incluso en quests 'public' (strip per-field en el use-case/route, NO en cliente).
// 'sin tocar' widget = status IN ('available','active') ORDER BY updated_at ASC.
// quests SDD spec #1890, design #1891.
// ---------------------------------------------------------------------------
export const quests = pgTable(
  'quests',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dmNotes: text('dm_notes'),
    status: text('status', { enum: ['available', 'active', 'completed', 'abandoned'] })
      .notNull()
      .default('available'),
    visibility: text('visibility', { enum: ['public', 'dm-only'] })
      .notNull()
      .default('public'),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_quests_world_updated').on(t.worldId, t.updatedAt)],
);

// ===========================================================================
// COMPENDIUM — data importada desde 5etools.
//
// Convención por tabla:
//   - id UUID PK auto-generado (para joins / FKs)
//   - (slug, source) UNIQUE — clave natural ("longsword" + "PHB")
//   - name TEXT NOT NULL — nombre tal cual aparece en 5etools
//   - data JSONB NOT NULL — payload completo de 5etools
//   - reprinted_as TEXT[] — si esta entidad fue reimpresa, slugs|source de los reemplazos
//
// La data se importa via `pnpm import:5etools` (idempotente, upsert por (slug, source)).
// ===========================================================================

export const compendiumRaces = pgTable(
  'compendium_races',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
    isSubrace: boolean('is_subrace').notNull().default(false),
    parentSlug: text('parent_slug'),
    parentSource: text('parent_source'),
  },
  (t) => [
    uniqueIndex('uq_races_slug_source').on(t.slug, t.source),
    index('idx_races_name').on(t.name),
  ],
);

export const compendiumClasses = pgTable(
  'compendium_classes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [uniqueIndex('uq_classes_slug_source').on(t.slug, t.source)],
);

export const compendiumSubclasses = pgTable(
  'compendium_subclasses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    classSlug: text('class_slug').notNull(),
    classSource: text('class_source').notNull(),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [
    uniqueIndex('uq_subclasses_slug_source').on(t.slug, t.source),
    index('idx_subclasses_class').on(t.classSlug, t.classSource),
  ],
);

export const compendiumBackgrounds = pgTable(
  'compendium_backgrounds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [uniqueIndex('uq_backgrounds_slug_source').on(t.slug, t.source)],
);

export const compendiumSpells = pgTable(
  'compendium_spells',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    level: integer('level').notNull(), // 0 = cantrip
    school: text('school').notNull(), // 'A' | 'C' | 'D' | 'E' | 'I' | 'N' | 'T' | 'V' (5etools codes)
    /**
     * Clases BASE que tienen el spell en su lista canónica (PHB Appendix B / class
     * spell list). Ej. Fireball → ['sorcerer', 'wizard']. NO incluye subclases
     * que lo otorgan como bonus spell (eso vive en subclassGrants).
     */
    classes: text('classes').array().notNull().default(sql`'{}'::text[]`),
    /**
     * Subclases que otorgan el spell como bonus/extra (NO está en la lista
     * base de la clase). Ej. Fireball → [{classSlug: 'cleric', subclassSlug:
     * 'light', subclassName: 'Light Domain', ...}, ...].
     * Shape de cada entry:
     *   { classSlug, classSource, subclassSlug, subclassSource, subclassName }
     */
    subclassGrants: jsonb('subclass_grants').notNull().default(sql`'[]'::jsonb`),
    ritual: boolean('ritual').notNull().default(false),
    concentration: boolean('concentration').notNull().default(false),
    componentsM: boolean('components_m').notNull().default(false),
    componentsMCost: integer('components_m_cost'),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [
    uniqueIndex('uq_spells_slug_source').on(t.slug, t.source),
    index('idx_spells_level').on(t.level),
    index('idx_spells_school').on(t.school),
    index('idx_spells_classes').using('gin', t.classes),
  ],
);

export const compendiumItems = pgTable(
  'compendium_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    type: text('type'), // weapon, armor, gear, etc. (puede ser null en magic variants)
    weight: numeric('weight'), // libras
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [
    uniqueIndex('uq_items_slug_source').on(t.slug, t.source),
    index('idx_items_type').on(t.type),
  ],
);

export const compendiumMonsters = pgTable(
  'compendium_monsters',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    /** CR como string para preservar fracciones: "0", "1/8", "1/4", "1/2", "1", ..., "30". */
    cr: text('cr'),
    /**
     * CR numérico para filtrar/ordenar (1/8 = 0.125, 1/4 = 0.25, etc.). NULL si
     * el monster no tiene CR definido (templates, summons sin CR fijo).
     */
    crNumeric: numeric('cr_numeric'),
    /** Type primario: "dragon", "fiend", "beast", etc. Sin tags. */
    type: text('type'),
    /** Size code: "T", "S", "M", "L", "H", "G". Si el monster es multi-size, primero. */
    size: text('size'),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [
    uniqueIndex('uq_monsters_slug_source').on(t.slug, t.source),
    index('idx_monsters_cr_numeric').on(t.crNumeric),
    index('idx_monsters_type').on(t.type),
    index('idx_monsters_name').on(t.name),
  ],
);

export const compendiumFeats = pgTable(
  'compendium_feats',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    prerequisites: jsonb('prerequisites'), // array de objetos con ability / race / etc.
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [uniqueIndex('uq_feats_slug_source').on(t.slug, t.source)],
);

// ---------------------------------------------------------------------------
// compendium_optional_features — TCE Optional Class Features + invocations,
// fighting styles, maneuvers, arcane shots, etc.
//
// `featureType` es un array de tags (5etools) tipo "FS:F" (Fighting Style:
// Fighter), "MV:B" (Maneuver: Battle Master), "EI" (Eldritch Invocation).
// Una feature puede aplicar a varios types (ej. "Archery" está en FS:F y FS:R).
//
// El Rules Profile filtra por source habilitada Y, para entries con
// `source: 'TCE'`, también requiere `variantRules.tashasOptionalClassFeatures = true`.
// ---------------------------------------------------------------------------
export const compendiumOptionalFeatures = pgTable(
  'compendium_optional_features',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    /** Tags de tipo (FS:F, MV:B, EI, etc.). GIN-indexed para filtros. */
    featureType: text('feature_type').array().notNull(),
    prerequisites: jsonb('prerequisites'), // mismo shape que feats
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [
    uniqueIndex('uq_optfeats_slug_source').on(t.slug, t.source),
    index('idx_optfeats_feature_type').using('gin', t.featureType),
  ],
);

export const compendiumConditions = pgTable(
  'compendium_conditions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    /** 'condition' (Blinded, Charmed, …) | 'status' (Concentration, Surprised). */
    kind: text('kind', { enum: ['condition', 'status'] }).notNull().default('condition'),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [
    uniqueIndex('uq_conditions_slug_source').on(t.slug, t.source),
    index('idx_conditions_kind').on(t.kind),
  ],
);

export const compendiumLanguages = pgTable(
  'compendium_languages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    /** 'standard' | 'exotic' | 'secret' | null */
    type: text('type'),
    /** Script family: 'Common', 'Elvish', 'Draconic', 'Dwarvish', etc. Null for scriptless (Druidic, Thieves' Cant). */
    script: text('script'),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [
    uniqueIndex('uq_languages_slug_source').on(t.slug, t.source),
    index('idx_languages_type').on(t.type),
  ],
);

export const compendiumActions = pgTable(
  'compendium_actions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    data: jsonb('data').notNull(),
    reprintedAs: text('reprinted_as').array(),
  },
  (t) => [uniqueIndex('uq_actions_slug_source').on(t.slug, t.source)],
);

// ---------------------------------------------------------------------------
// encounters — DM initiative tracker (SDD encuentros-v3).
//
// One encounter per "combat scene". `current_combatant_id` points to whose
// turn it is; advanced via POST /encounters/:id/advance-turn (domain pure
// function `advanceTurn`).
//
// Optimistic concurrency: every advance/HP-patch increments `version`. Stale
// `version` in the client → 409 conflict. Avoids `SELECT FOR UPDATE` headaches.
//
// `current_combatant_id` is a soft reference (no FK) — adding a FK to
// `encounter_combatants` would create a cycle since combatants reference back.
// Runtime invariant: it MUST point at a valid combatant of THIS encounter.
//
// `pending_reaction` — server-authoritative suspend state for the two-step Shield
// reaction flow (engine-reaction-bus). Stored at suspend time by
// `performWeaponAttackApply`; read and cleared atomically in `resolveAttackReaction`.
// Shape: { defenderCombatantId, attackerCombatantId, toHitTotal, targetAc,
//          rolledDamage, damageType, encVersion } | null.
// Writing pending_reaction does NOT bump `version` — it is bookkeeping, not a
// game-state change. The CAS version in `encVersion` binds the pending state to
// a specific optimistic epoch; if the encounter version advances (via a concurrent
// request) before the client resolves, the CAS guard in resolveAttackReaction will
// reject the stale pending state (version mismatch → VERSION_CONFLICT).
// ---------------------------------------------------------------------------
export const encounters = pgTable(
  'encounters',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    round: integer('round').notNull().default(1),
    currentCombatantId: uuid('current_combatant_id'),
    status: text('status', { enum: ['active', 'completed'] }).notNull().default('active'),
    version: integer('version').notNull().default(1),
    /**
     * Server-authoritative pending reaction state for the two-step Shield flow.
     * Nullable — null means no reaction is pending. Written at suspend time,
     * cleared in the same CAS tx that commits the resolve outcome.
     * NOT used for CAS version — does not bump `version` on write.
     */
    pendingReaction: jsonb('pending_reaction'),
    /**
     * Server-authoritative pending cast state for the interceptable cast-spell flow.
     * Shape: { casterCombatantId, spellName, spellLevel, targets:[id], dartCount,
     *          serverRolledDamage:{ total, perDart:number[] }, encVersion }
     * Nullable — null means no cast is pending. Written at suspend time (no version bump),
     * cleared atomically in resolve-cast-reaction CAS tx.
     * engine-spell-cast-suspend — ADR-2, REQ-RB-02.
     */
    pendingCast: jsonb('pending_cast'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_encounters_campaign').on(t.campaignId),
    index('idx_encounters_status').on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// encounter_combatants — one row per combatant in an encounter.
//
// `character_id` is NULL for NPCs and the SOFT REFERENCE for PCs (we don't
// CASCADE-delete combatants when a character is deleted — the encounter is
// historical record of "who was in this fight"). `name` is a snapshot so PC
// renames don't retroactively rewrite history.
//
// `insertion_order` breaks initiative ties deterministically (PHB tiebreaker
// by Dex modifier is deferred).
//
// `hp_current = 0` is the dead-state marker (no separate column).
// ---------------------------------------------------------------------------
export const encounterCombatants = pgTable(
  'encounter_combatants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    encounterId: uuid('encounter_id')
      .notNull()
      .references(() => encounters.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['pc', 'npc'] }).notNull(),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    initiative: integer('initiative').notNull(),
    hpCurrent: integer('hp_current').notNull(),
    hpMax: integer('hp_max').notNull(),
    ac: integer('ac'),
    insertionOrder: integer('insertion_order').notNull(),
    // engine-reaction-bus: reaction economy tracking.
    // PHB p.190 — "You can take only one reaction per round."
    // DEFAULT false backfills legacy rows; read-path tolerant (REQ-ERB-ECON-02).
    reactionUsed: boolean('reaction_used').notNull().default(false),
    // engine-action-economy: per-turn action budget tracking (REQ-AE-01, REQ-AE-09).
    // PHB p.189 — one action and one bonus action per turn.
    // DEFAULT false/0 backfills legacy rows; read-path tolerant (REQ-AE-10).
    // attacks_remaining: additional weapon attacks still allowed under the Attack action
    // currently in progress. 0 = resting state (no Attack action in progress, or spent).
    // action_used disambiguates "0 = haven't attacked" vs "0 = action spent".
    actionUsed: boolean('action_used').notNull().default(false),
    bonusActionUsed: boolean('bonus_action_used').notNull().default(false),
    attacksRemaining: integer('attacks_remaining').notNull().default(0),
    // engine-rage: Rage event ledger — single-reset-point (advance-encounter-turn).
    // DEFAULT false ensures legacy rows load as non-raging (REQ-RAGE-11).
    // raged_attacked_hostile: set TRUE when this combatant makes an attack against
    //   a hostile target this turn. Reset at this combatant's turn-end.
    // raged_took_damage: set TRUE when this combatant takes any damage (since last turn).
    //   Spans inter-turn boundary; reset at this combatant's turn-end.
    // PHB p.48: end-early if neither attacked hostile nor took damage since last turn.
    ragedAttackedHostile: boolean('raged_attacked_hostile').notNull().default(false),
    ragedTookDamage: boolean('raged_took_damage').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_combatants_encounter').on(t.encounterId)],
);

// ---------------------------------------------------------------------------
// encounter_combatant_conditions — active conditions on encounter combatants.
//
// One row per condition instance applied to a combatant. Append-only in 3a
// (no removal; turn-anchor expiry sweep lands in 3b).
//
// Idempotency is APP-LEVEL (no DB unique constraint) — performForcedCheck
// queries existing rows before insert and skips if already present.
// A partial unique on (combatant_id, condition_name) would block future
// stacking from different sources (3b+), so the constraint is intentionally absent.
//
// Turn-anchor columns (turn_anchor_entity_id, turn_anchor_boundary, turns_remaining)
// are nullable and UNUSED in 3a. They ship now so 3b adds zero migrations.
//
// applied_by_combatant_id: soft FK (nullable, no referential constraint) to the
// combatant that caused the condition. Used for dual-row correlation in 3b removal.
//
// Design ref: sdd/engine-forced-check-3a/design — ADR-3 (conditions table + idempotency),
//             ADR-4 (dual-insert Stunned+Incapacitated, appliedBy correlation).
// ---------------------------------------------------------------------------
export const encounterCombatantConditions = pgTable(
  'encounter_combatant_conditions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    combatantId: uuid('combatant_id')
      .notNull()
      .references(() => encounterCombatants.id, { onDelete: 'cascade' }),
    conditionName: text('condition_name').notNull(),
    appliedByCombatantId: uuid('applied_by_combatant_id'), // nullable, soft FK (source may leave)
    // Turn-anchor columns — nullable, UNUSED in 3a; 3b adds zero migrations:
    turnAnchorEntityId: uuid('turn_anchor_entity_id'),           // nullable
    turnAnchorBoundary: text('turn_anchor_boundary', { enum: ['start', 'end'] }), // nullable
    turnsRemaining: integer('turns_remaining'),                   // nullable
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_cond_combatant').on(t.combatantId)],
);

// ---------------------------------------------------------------------------
// encounter_combatant_effects — server-owned per-target effect state (engine-combatant-effects Slice A).
//
// Records active caster-sourced effects on a target combatant (e.g. Hex, Hunter's Mark).
// One row = one effect instance on a target, with optional source combatant for predicate matching.
//
// Key design decisions (ADR-1):
//   combatant_id: HARD FK CASCADE — target deleted → effect is meaningless → drop rows.
//   source_combatant_id: HARD FK SET NULL — source leaves encounter → effect survives but
//     source becomes null → hasEffectFromSelf predicate correctly stops matching (null !== UUID).
//     This is STRICTLY BETTER than soft-FK conditions pattern: source identity is LOAD-BEARING
//     for the predicate (conditions' appliedBy is correlation-only).
//   effect_name: open text, no DB enum — supports homebrew effects (§1.2).
//   concentration_token: nullable, UNUSED V1 — seats future concentration-enforcement SDD
//     with zero migration (intentional dead column).
//   NO unique constraint on (combatant_id, effect_name) — app-level idempotency on the
//     TRIPLE (combatant_id, effect_name, source_combatant_id). Allows future multi-source
//     stacking (distinct sources can both mark the same target).
//
// Design ref: sdd/engine-combatant-effects/design — ADR-1, ADR-5.
// ---------------------------------------------------------------------------
export const encounterCombatantEffects = pgTable(
  'encounter_combatant_effects',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // The AFFECTED/TARGET combatant (the Hexed one). Hard FK CASCADE.
    combatantId: uuid('combatant_id')
      .notNull()
      .references(() => encounterCombatants.id, { onDelete: 'cascade' }),
    effectName: text('effect_name').notNull(), // open text, no enum (§1.2 homebrew)
    // The CASTER/SOURCE combatant. Hard FK SET NULL — source may leave; effect survives.
    sourceCombatantId: uuid('source_combatant_id')
      .references(() => encounterCombatants.id, { onDelete: 'set null' }),
    // Nullable, UNUSED V1 — intentional dead column for future concentration-enforcement SDD.
    concentrationToken: text('concentration_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_cef_combatant').on(t.combatantId),
    index('idx_cef_source').on(t.sourceCombatantId),
    index('idx_cef_conc_token').on(t.concentrationToken),
    // NO unique constraint on (combatant_id, effect_name) — app-level idempotency (ADR-1).
  ],
);

// ---------------------------------------------------------------------------
// modifier_definitions — DB-backed catalog of RuleDoc templates (Slice 6).
//
// Each row is ONE RuleDoc (the compile-time template for a modifier rule).
// The `ruleDoc` column is a full JSONB blob; promoted columns (slug, source,
// name, kind) are query handles.
//
// Design decisions (SDD sdd/engine-catalog/design #1142):
//   D1: JSONB-polymorphic — ruleDoc is opaque; slug/source/name/kind are
//       promoted for indexed lookups. NO FK to compendium_items (homebrew
//       slugs must work without a compendium row, §1.2).
//   D1: kind is OPEN text (no pg enum) — homebrew can introduce novel kinds
//       without a schema migration.
//   D2: seed via `pnpm seed-modifier-definitions` (idempotent upsert on slug).
//
// Unique constraint on slug (global for this slice; relaxed to slug+world_id
// in Slice 8 when world-scoping lands).
// ---------------------------------------------------------------------------
export const modifierDefinitions = pgTable(
  'modifier_definitions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    source: text('source').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(), // OPEN text, no enum (§1.2)
    ruleDoc: jsonb('rule_doc').notNull(), // full RuleDoc blob
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_moddefs_slug').on(t.slug),
    index('idx_moddefs_kind').on(t.kind),
    index('idx_moddefs_source').on(t.source),
  ],
);

// ---------------------------------------------------------------------------
// modifier_instances — persisted live modifier instances (Slice 5: Bless).
//
// Each row represents ONE emitted ModifierInstance from the engine registry,
// persisted so it survives across requests (stateful engine substrate).
//
// Design decisions (SDD sdd/engine-stateful/design #1131):
//   D1: JSONB-polymorphic — def/scope/predicate/duration are opaque blobs;
//       lifecycle columns (owner, target, concentrationToken) are promoted
//       to real columns + indexed for efficient SQL DELETE/SELECT.
//   D2: targetCharacterId NOT NULL this slice — Bless is always cross-entity
//       (axis='entities'). Nullable relaxation deferred to Slice 6+ (self-axis).
//   D3: One row per (target × stat) instance — buildBlessModifiers emits 2
//       instances per target (attack-roll + saving-throw), each mapped 1:1.
//
// FKs cascade — deleting caster or ally drops their emitted/received rows.
// ---------------------------------------------------------------------------
export const modifierInstances = pgTable(
  'modifier_instances',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ownerCharacterId: uuid('owner_character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    targetCharacterId: uuid('target_character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }), // D2: NOT NULL this slice
    concentrationToken: text('concentration_token'), // nullable — not all mods concentrate
    def: jsonb('def').notNull(),
    scope: jsonb('scope').notNull(),
    predicate: jsonb('predicate'),
    duration: jsonb('duration'),
    label: text('label'),
    /** Encounter round at cast time. NULL = non-encounter cast or legacy row → never round-expires.
     *  Design ref: sdd/engine-timeline-duration/design — ADR-1 (lifecycle column promotion). */
    startRound: integer('start_round'), // nullable; no DEFAULT — legacy rows stay NULL
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_mi_owner').on(t.ownerCharacterId),
    index('idx_mi_target').on(t.targetCharacterId),
    index('idx_mi_conc_token').on(t.concentrationToken),
  ],
);

// ---------------------------------------------------------------------------
// character_concentration — per-caster concentration registry (Slice 1).
//
// PHB p.203: "You lose concentration on a spell if you cast another spell that
// requires concentration." ONE row per concentrating CHARACTER (PK = characterId),
// holding the active server-minted token + which store holds the live rows.
//
// Design decisions (SDD sdd/engine-concentration-authority/design #1430):
//   ADR-1: Dedicated table over a derived view — PK on characterId is a physical
//          invariant that guarantees at most ONE concentration row per caster.
//          A derived view cannot enforce or represent "the current one" cleanly
//          without scanning both stores with different caster key columns.
//   ADR-5: store column drives cross-store drop dispatch: modifier_instances vs
//          encounter_combatant_effects. Dispatch-by-store is precise; the registry
//          row names exactly which store holds the live rows.
//   ADR-6: Legacy rows in either store (client-supplied tokens, no registry row)
//          are read-tolerated and removable — the registry is write-side only.
//   NPC gap: Registry keyed by CHARACTER id (PC only). NPC casters (characterId=null
//            on encounter_combatants) are NOT tracked in Slice 1. Deferred.
//
// FK: CASCADE on character delete — when a character is removed all their
//     concentration tracking is gone too.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// character_knowledge — per-character knowledge/discovery layer (character-codex S1).
//
// HOUSE RULE — anti-metagaming: players only see compendium entries their
// character has explicitly encountered. DM grants manually; Slice 2 auto-unlocks
// on encounter combatant-add-with-slug. No RAW basis (PHB p.177-179 has no gate).
//
// Polymorphic via `kind`: bestiary | item | spell | npc | faction | location | lore.
// Slice 1 proves the architecture with 'bestiary'. Wave 2 adds other kinds.
//
// UNIQUE(characterId, kind, refKey, refSource) → idempotent upsert (ON CONFLICT DO NOTHING).
// INDEX(characterId, kind) → hot-path for player-bestiary query.
//
// source: 'dm-grant' | 'encounter' (how the knowledge was acquired).
// grantedByUserId: NULL for system-generated rows (auto-unlock from encounter).
// ---------------------------------------------------------------------------
export const characterKnowledge = pgTable(
  'character_knowledge',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    /** Entry kind. Slice 1: 'bestiary'. Wave 2 adds other kinds. */
    kind: text('kind', {
      enum: ['bestiary', 'item', 'spell', 'npc', 'faction', 'location', 'lore'],
    }).notNull(),
    /** Compendium slug (e.g. 'goblin', 'longsword'). */
    refKey: text('ref_key').notNull(),
    /** Compendium source (e.g. 'mm', 'PHB'). */
    refSource: text('ref_source').notNull(),
    /** How this knowledge was acquired: 'dm-grant' | 'encounter'. */
    source: text('source').notNull(),
    /** User who granted this knowledge. NULL for system-generated rows. */
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Idempotent upsert: ON CONFLICT (characterId, kind, refKey, refSource) DO NOTHING
    uniqueIndex('uq_character_knowledge').on(t.characterId, t.kind, t.refKey, t.refSource),
    // Hot-path for player-bestiary query
    index('idx_ck_character_kind').on(t.characterId, t.kind),
    index('idx_ck_world').on(t.worldId),
  ],
);

// ---------------------------------------------------------------------------
// guild_contributions — append-only player/guild knowledge notes (codex-knowledge Slice 1).
//
// DESIGN INTENT: West Marches misinformation-as-feature. Players can record
// sightings, rumors, notes about world entities they've encountered. DM can
// seal (confirm/debunk) them. FORK 4 decision: guild_contributions from day 1,
// not a throwaway character_notes table.
//
// APPEND-ONLY INVARIANT: body/contributionType/authorUserId NEVER UPDATEd.
// Only sealedStatus/sealedBy/sealedAt/visibility MAY be updated.
// No DELETE route, no content PATCH route.
//
// contribution_type: OPEN text (§1.2 homebrew; domain validates vs seed list).
// ref_entity_kind / ref_entity_id: OPEN text / NO FK (polymorphic by-key).
// sealed_status / visibility: CLOSED enums (lifecycle semantics, locked FORK 4).
//
// codex-knowledge SDD spec #1947, design #1948, decisions #1944.
// ---------------------------------------------------------------------------
export const guildContributions = pgTable(
  'guild_contributions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    /** OPEN text — validated at domain layer against seed list. TODO #513: project from DB. */
    contributionType: text('contribution_type').notNull(),
    /** Narrative body. NEVER UPDATEd (append-only). */
    body: text('body').notNull(),
    /**
     * OPEN text — aligns to character_knowledge.kind taxonomy:
     * bestiary|item|spell|npc|faction|location|lore. Nullable (not all notes tag an entity).
     */
    refEntityKind: text('ref_entity_kind'),
    /**
     * Polymorphic by-key — compendium slug OR world-entity UUID.
     * NO FK constraint (heterogeneous targets). Tolerate dangling at read.
     */
    refEntityId: text('ref_entity_id'),
    /**
     * CLOSED enum: null=rumor (unsealed), 'confirmed', 'debunked'.
     * Only sealed_* columns mutate (D3 audit).
     */
    sealedStatus: text('sealed_status', { enum: ['confirmed', 'debunked'] }),
    sealedBy: uuid('sealed_by').references(() => users.id, { onDelete: 'set null' }),
    sealedAt: timestamp('sealed_at', { withTimezone: true }),
    /**
     * CLOSED enum: 'personal' (author-only) | 'guild' (all members) | 'canonical'.
     * Default: 'personal'. REQ-CK-GC-04.
     */
    visibility: text('visibility', { enum: ['personal', 'guild', 'canonical'] })
      .notNull()
      .default('personal'),
    /** Author-set in/out-world time. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** Immutable insert time. */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Feed query: most recent contributions for a world
    index('idx_gc_world_occurred').on(t.worldId, t.occurredAt),
    // Codex reverse-lookup: notes for a specific entity
    index('idx_gc_ref').on(t.refEntityKind, t.refEntityId),
    // Canonical/rumor filter
    index('idx_gc_world_sealed').on(t.worldId, t.sealedStatus),
    // Per-user queries
    index('idx_gc_author').on(t.authorUserId),
  ],
);

// ---------------------------------------------------------------------------
// bitacora_pages — player-authored personal bitácora pages (bitacora-personal W2)
//
// Mutable personal notes. Each page can have an optional title, a required body,
// an optional list of entity refs (kind='monster' only this wave), and tags
// (⊆ KNOWLEDGE_TAGS vocabulary).
//
// UNLIKE guild_contributions (append-only), these pages are fully editable:
// title/body/refs/tags all mutable via PATCH. Personal pages belong to the player.
//
// refs: JSONB array of { kind, refKey, refSource }. Validated at write.
// tags: text[] GIN-indexed for ?tag= filter. ⊆ KNOWLEDGE_TAGS.
// visibility: 'personal' (default) | 'guild' | 'canonical' — W3 promotion path.
// world_id: scopes future guild-share; cascades on world delete (mirrors character_knowledge).
//
// bitacora-personal SDD spec #1974, design #1975 §ADR-1.
// ---------------------------------------------------------------------------
export const bitacoraPages = pgTable(
  'bitacora_pages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    /** Optional title. Free-form notes may be untitled. */
    title: text('title'),
    /** Narrative body. Required column; empty string on insert is allowed by DB but rejected by domain. */
    body: text('body').notNull().default(''),
    /**
     * JSONB array of { kind, refKey, refSource }.
     * Only kind='monster' validated this wave. Stored tolerantly; validated at write.
     */
    refs: jsonb('refs').notNull().default([]),
    /**
     * text[] ⊆ KNOWLEDGE_TAGS. GIN-indexed for ?tag= filter.
     * Validated at write by domain validateBitacoraPage.
     */
    tags: text('tags').array().notNull().default(sql`'{}'`),
    /**
     * CLOSED enum: 'personal' (default) | 'guild' | 'canonical'.
     * W3 guild-share promotion path. Only 'personal' used this wave.
     */
    visibility: text('visibility', { enum: ['personal', 'guild', 'canonical'] })
      .notNull()
      .default('personal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Hot-path: list a character's pages
    index('idx_bp_character').on(t.characterId),
    // Tag filter in SQL
    index('idx_bp_tags').using('gin', t.tags),
  ],
);

export const characterConcentration = pgTable(
  'character_concentration',
  {
    // ONE row per concentrating character → PK = characterId is the invariant.
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    // Server-minted token (crypto.randomUUID). Links back to store rows.
    concentrationToken: text('concentration_token').notNull(),
    // Which store holds the live child rows for this concentration.
    store: text('store', {
      enum: ['modifier_instances', 'encounter_combatant_effects'],
    }).notNull(),
    // Open text — no DB enum (§1.2 homebrew support, e.g. custom concentration spells).
    spellName: text('spell_name').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Secondary index so the service can look up "who owns this token" efficiently.
    index('idx_cc_token').on(t.concentrationToken),
  ],
);
