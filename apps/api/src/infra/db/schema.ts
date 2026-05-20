import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  primaryKey,
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
