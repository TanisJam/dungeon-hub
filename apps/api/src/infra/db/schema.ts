import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  numeric,
  boolean,
  primaryKey,
  uniqueIndex,
  index,
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
  discordId: text('discord_id').unique(),
  role: text('role', { enum: ['player', 'gm', 'admin'] }).notNull().default('player'),
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
    status: text('status', { enum: ['draft', 'active', 'retired', 'dead'] })
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
    classes: text('classes').array().notNull().default(sql`'{}'::text[]`),
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
