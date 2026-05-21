CREATE TABLE "pois" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hex_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"dm_notes" text,
	"status" text DEFAULT 'unknown' NOT NULL,
	"world_x" double precision,
	"world_y" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pois" ADD CONSTRAINT "pois_hex_id_hexes_id_fk" FOREIGN KEY ("hex_id") REFERENCES "public"."hexes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pois_hex" ON "pois" USING btree ("hex_id");--> statement-breakpoint
CREATE INDEX "idx_pois_status" ON "pois" USING btree ("status");