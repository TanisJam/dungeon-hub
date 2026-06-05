-- quests — MVP gap #3.7 (world content). World-scoped DM quest tracking.
--
-- NOT a PHB/5e rules concept — app-level DM tooling (clone of journal_entries).
-- status CHECK: available | active | completed | abandoned (convención del modelo).
-- visibility CHECK: public | dm-only (mirrors journal/world_events).
-- world_id FK ON DELETE CASCADE (quests die with the world).
-- author_user_id FK → users (RESTRICT/NO ACTION default, mirrors journal_entries).
-- INDEX(world_id, updated_at) → 'sin tocar' widget hot-path.
--
-- quests SDD spec #1890, design #1891.

--> statement-breakpoint

CREATE TABLE "quests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "world_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "dm_notes" text,
  "status" text DEFAULT 'available' NOT NULL,
  "visibility" text DEFAULT 'public' NOT NULL,
  "author_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "quests_status_check" CHECK (status IN ('available','active','completed','abandoned')),
  CONSTRAINT "quests_visibility_check" CHECK (visibility IN ('public','dm-only'))
);

--> statement-breakpoint

ALTER TABLE "quests"
  ADD CONSTRAINT "quests_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

--> statement-breakpoint

ALTER TABLE "quests"
  ADD CONSTRAINT "quests_author_user_id_users_id_fk"
  FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

--> statement-breakpoint

CREATE INDEX "idx_quests_world_updated" ON "quests" ("world_id", "updated_at");
