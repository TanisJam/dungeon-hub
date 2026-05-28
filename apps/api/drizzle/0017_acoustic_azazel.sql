CREATE TABLE "encounter_combatants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encounter_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"character_id" uuid,
	"initiative" integer NOT NULL,
	"hp_current" integer NOT NULL,
	"hp_max" integer NOT NULL,
	"insertion_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid,
	"name" text NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"current_combatant_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encounter_combatants" ADD CONSTRAINT "encounter_combatants_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_combatants" ADD CONSTRAINT "encounter_combatants_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_combatants_encounter" ON "encounter_combatants" USING btree ("encounter_id");--> statement-breakpoint
CREATE INDEX "idx_encounters_campaign" ON "encounters" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_encounters_status" ON "encounters" USING btree ("status");