-- codex-knowledge Slice 1, Sub-slice A: guild_contributions + users.devMode
--
-- guild_contributions: append-only player/guild knowledge notes.
-- APPEND-ONLY INVARIANT: body/contributionType/authorUserId NEVER UPDATEd.
-- Only sealedStatus/sealedBy/sealedAt/visibility MAY be updated after insert.
-- No DELETE route, no content PATCH route at API layer.
--
-- users.devMode: per-user server-side bypass for the knowledge gate (FORK 5).
-- devMode=true → user sees all codex entries regardless of character_knowledge rows.
--
-- codex-knowledge SDD spec #1947, design #1948, decisions #1944, tasks #1950.

--> statement-breakpoint

CREATE TABLE "guild_contributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "world_id" uuid NOT NULL,
  "author_user_id" uuid NOT NULL,
  -- OPEN text (no pg enum; domain validates vs seed list; TODO #513: project from DB)
  "contribution_type" text NOT NULL,
  -- NEVER UPDATEd (append-only invariant)
  "body" text NOT NULL,
  -- OPEN text; aligns to character_knowledge.kind taxonomy; nullable (not all notes tag an entity)
  "ref_entity_kind" text,
  -- Polymorphic by-key (compendium slug OR world-entity UUID); NO FK (heterogeneous)
  "ref_entity_id" text,
  -- CLOSED enum; null=rumor (unsealed)
  "sealed_status" text,
  "sealed_by" uuid,
  "sealed_at" timestamp with time zone,
  -- CLOSED enum; default personal (REQ-CK-GC-04)
  "visibility" text DEFAULT 'personal' NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "gc_sealed_status_check" CHECK (sealed_status IN ('confirmed', 'debunked')),
  CONSTRAINT "gc_visibility_check" CHECK (visibility IN ('personal', 'guild', 'canonical'))
);

--> statement-breakpoint

ALTER TABLE "guild_contributions"
  ADD CONSTRAINT "guild_contributions_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

ALTER TABLE "guild_contributions"
  ADD CONSTRAINT "guild_contributions_author_user_id_users_id_fk"
  FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

--> statement-breakpoint

ALTER TABLE "guild_contributions"
  ADD CONSTRAINT "guild_contributions_sealed_by_users_id_fk"
  FOREIGN KEY ("sealed_by") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

--> statement-breakpoint

-- Feed query: most recent contributions for a world
CREATE INDEX "idx_gc_world_occurred" ON "guild_contributions" ("world_id", "occurred_at");

--> statement-breakpoint

-- Codex reverse-lookup: notes for a specific entity
CREATE INDEX "idx_gc_ref" ON "guild_contributions" ("ref_entity_kind", "ref_entity_id");

--> statement-breakpoint

-- Canonical/rumor filter
CREATE INDEX "idx_gc_world_sealed" ON "guild_contributions" ("world_id", "sealed_status");

--> statement-breakpoint

-- Per-user queries
CREATE INDEX "idx_gc_author" ON "guild_contributions" ("author_user_id");

--> statement-breakpoint

-- users.devMode: per-user server-side knowledge gate bypass (codex-knowledge FORK 5)
-- REQ-CK-DEV-01, REQ-CK-GC-08
ALTER TABLE "users" ADD COLUMN "dev_mode" boolean DEFAULT false NOT NULL;
