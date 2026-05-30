CREATE TABLE "encounter_combatant_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combatant_id" uuid NOT NULL,
	"effect_name" text NOT NULL,
	"source_combatant_id" uuid,
	"concentration_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encounter_combatant_effects" ADD CONSTRAINT "encounter_combatant_effects_combatant_id_encounter_combatants_id_fk" FOREIGN KEY ("combatant_id") REFERENCES "public"."encounter_combatants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_combatant_effects" ADD CONSTRAINT "encounter_combatant_effects_source_combatant_id_encounter_combatants_id_fk" FOREIGN KEY ("source_combatant_id") REFERENCES "public"."encounter_combatants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cef_combatant" ON "encounter_combatant_effects" USING btree ("combatant_id");--> statement-breakpoint
CREATE INDEX "idx_cef_source" ON "encounter_combatant_effects" USING btree ("source_combatant_id");--> statement-breakpoint
CREATE INDEX "idx_cef_conc_token" ON "encounter_combatant_effects" USING btree ("concentration_token");