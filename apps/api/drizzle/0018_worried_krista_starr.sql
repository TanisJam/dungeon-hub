CREATE TABLE "modifier_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_character_id" uuid NOT NULL,
	"target_character_id" uuid NOT NULL,
	"concentration_token" text,
	"def" jsonb NOT NULL,
	"scope" jsonb NOT NULL,
	"predicate" jsonb,
	"duration" jsonb,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modifier_instances" ADD CONSTRAINT "modifier_instances_owner_character_id_characters_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_instances" ADD CONSTRAINT "modifier_instances_target_character_id_characters_id_fk" FOREIGN KEY ("target_character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mi_owner" ON "modifier_instances" USING btree ("owner_character_id");--> statement-breakpoint
CREATE INDEX "idx_mi_target" ON "modifier_instances" USING btree ("target_character_id");--> statement-breakpoint
CREATE INDEX "idx_mi_conc_token" ON "modifier_instances" USING btree ("concentration_token");