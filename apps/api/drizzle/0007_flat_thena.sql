CREATE TABLE "factions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"dm_notes" text,
	"state" text DEFAULT 'active' NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"race" text,
	"description" text,
	"dm_notes" text,
	"faction_id" uuid,
	"hex_id" uuid,
	"status" text DEFAULT 'alive' NOT NULL,
	"world_x" double precision,
	"world_y" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "factions" ADD CONSTRAINT "factions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_hex_id_hexes_id_fk" FOREIGN KEY ("hex_id") REFERENCES "public"."hexes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_factions_campaign" ON "factions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_npcs_campaign" ON "npcs" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_npcs_faction" ON "npcs" USING btree ("faction_id");--> statement-breakpoint
CREATE INDEX "idx_npcs_hex" ON "npcs" USING btree ("hex_id");