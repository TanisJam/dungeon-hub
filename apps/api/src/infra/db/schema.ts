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
// campaigns — Rules Profile vive acá (JSONB)
// ---------------------------------------------------------------------------
export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  gmUserId: uuid('gm_user_id')
    .notNull()
    .references(() => users.id),
  rulesProfile: jsonb('rules_profile').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
// characters — snapshot completo en data JSONB; inventory aparte para queries
// ---------------------------------------------------------------------------
export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
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
    index('idx_characters_campaign').on(table.campaignId),
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
// hexes — Hexcrawl Map. Una world map implícita por campaña (no `maps` table
// aparte, YAGNI). Si más adelante hay dungeons/settlements como mapas
// separados, agregamos `mapId`.
//
// Modelo parent-child para soportar subdivisión (region → sub-region → local
// → city, etc.):
//   - parentHexId NULL = hex top-level (mapa regional global de la campaña).
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
// ---------------------------------------------------------------------------
export const hexes = pgTable(
  'hexes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    /** NULL = top-level. Self-FK con cascade: borrar un parent borra sus hijos. */
    parentHexId: uuid('parent_hex_id').references((): AnyPgColumn => hexes.id, {
      onDelete: 'cascade',
    }),
    /** Etiqueta semántica abierta: 'region', 'sub-region', 'local', 'city', etc. */
    scale: text('scale'),
    /** Coords axiales — locales al parent si tiene; globales en campaña si NULL. */
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
    // El unique sobre (campaignId, parentHexId, q, r) con NULLS NOT DISTINCT
    // se aplica via custom SQL migration (drizzle 0.38 no expone .nullsNotDistinct()).
    // Ver apps/api/drizzle/custom/0002-hexes-unique-nulls-not-distinct.sql
    index('idx_hexes_campaign_parent').on(t.campaignId, t.parentHexId),
    index('idx_hexes_status').on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// pois — Points of Interest dentro de un hex.
//
// Status canonical (DM lo setea libremente, sugerido):
//   unknown → discovered → cleared
//
// Visibility (sigue el patrón de hex):
//   - DM ve todos los POIs (incluyendo unknown + dmNotes).
//   - Players solo ven `status != 'unknown'`, NUNCA `dmNotes`.
//   - Cascade: si el hex parent NO es visible al player, los POIs tampoco.
//
// Coords (worldX, worldY) opcionales — pin placement fino dentro del hex
// cuando llegue el render continuo (Leaflet/MapLibre). Usualmente caen dentro
// del bbox del hex pero no es hard-rule.
// ---------------------------------------------------------------------------
export const pois = pgTable(
  'pois',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    hexId: uuid('hex_id')
      .notNull()
      .references(() => hexes.id, { onDelete: 'cascade' }),
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
    index('idx_pois_hex').on(t.hexId),
    index('idx_pois_status').on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// factions — grupos políticos / organizaciones del mundo.
//
// Reputation es per-CAMPAÑA (relación compartida del party con la facción),
// no per-character. Es un int signado: positivo = aliados, negativo = enemigos.
// El DM lo mueve manualmente; no hay auto-update por eventos en este slice.
//
// Visibility (igual que hex/POI):
//   - DM ve todo, incluyendo dmNotes.
//   - Players ven name, description, state, reputation. NUNCA dmNotes.
// ---------------------------------------------------------------------------
export const factions = pgTable(
  'factions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    dmNotes: text('dm_notes'),
    state: text('state', {
      enum: ['active', 'dormant', 'destroyed', 'disbanded'],
    })
      .notNull()
      .default('active'),
    /** Reputación del party con la facción. Signed: + aliados, - enemigos. */
    reputation: integer('reputation').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_factions_campaign').on(t.campaignId)],
);

// ---------------------------------------------------------------------------
// npcs — personajes no-jugadores del mundo.
//
// `factionId` y `hexId` son FK opcionales:
//   - factionId NULL = NPC independiente (no afiliado).
//   - factionId → faction: ON DELETE SET NULL (borrar facción no borra al NPC,
//     el NPC sobrevive sin afiliación).
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
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    race: text('race'),
    description: text('description'),
    dmNotes: text('dm_notes'),
    factionId: uuid('faction_id').references(() => factions.id, { onDelete: 'set null' }),
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
    index('idx_npcs_campaign').on(t.campaignId),
    index('idx_npcs_faction').on(t.factionId),
    index('idx_npcs_hex').on(t.hexId),
  ],
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
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
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
    index('idx_world_events_campaign_time').on(t.campaignId, t.occurredAt),
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
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
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
    index('idx_journal_campaign_updated').on(t.campaignId, t.updatedAt),
    index('idx_journal_tags').using('gin', t.tags),
  ],
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
