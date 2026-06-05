-- campaign-invite-flow: campaign_invite_tokens table
--
-- Shareable invite links for campaigns. GMs generate tokens; players
-- accept via atomic dual-write to world_members + campaign_members.
--
-- Single-use by default (max_uses=1 set by use-case, NOT a DB default).
-- NULL max_uses = unlimited (multi-use / West Marches).
-- revoked_at: schema-ready, no revoke UI in this change.
--
-- SDD spec #1872, design #1873, tasks #1874.

--> statement-breakpoint

CREATE TABLE "campaign_invite_tokens" (
  "token" text PRIMARY KEY NOT NULL,
  "campaign_id" uuid NOT NULL,
  "world_id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "role" text DEFAULT 'player' NOT NULL,
  "max_uses" integer,
  "use_count" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

--> statement-breakpoint

ALTER TABLE "campaign_invite_tokens"
  ADD CONSTRAINT "campaign_invite_tokens_campaign_id_campaigns_id_fk"
  FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id")
  ON DELETE cascade ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "campaign_invite_tokens"
  ADD CONSTRAINT "campaign_invite_tokens_world_id_worlds_id_fk"
  FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id")
  ON DELETE cascade ON UPDATE no action;

--> statement-breakpoint

ALTER TABLE "campaign_invite_tokens"
  ADD CONSTRAINT "campaign_invite_tokens_created_by_user_id_users_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;

--> statement-breakpoint

CREATE INDEX "idx_campaign_invite_tokens_campaign"
  ON "campaign_invite_tokens" ("campaign_id");
