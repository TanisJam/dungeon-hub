CREATE TABLE "hexes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"parent_hex_id" uuid,
	"scale" text,
	"q" integer NOT NULL,
	"r" integer NOT NULL,
	"world_x" double precision,
	"world_y" double precision,
	"name" text,
	"terrain" text,
	"status" text DEFAULT 'unexplored' NOT NULL,
	"dm_notes" text,
	"player_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hexes" ADD CONSTRAINT "hexes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexes" ADD CONSTRAINT "hexes_parent_hex_id_hexes_id_fk" FOREIGN KEY ("parent_hex_id") REFERENCES "public"."hexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hexes_campaign_parent" ON "hexes" USING btree ("campaign_id","parent_hex_id");--> statement-breakpoint
CREATE INDEX "idx_hexes_status" ON "hexes" USING btree ("status");