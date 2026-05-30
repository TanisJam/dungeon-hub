CREATE TABLE "encounter_combatant_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"combatant_id" uuid NOT NULL,
	"condition_name" text NOT NULL,
	"applied_by_combatant_id" uuid,
	"turn_anchor_entity_id" uuid,
	"turn_anchor_boundary" text,
	"turns_remaining" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encounter_combatant_conditions" ADD CONSTRAINT "encounter_combatant_conditions_combatant_id_encounter_combatants_id_fk" FOREIGN KEY ("combatant_id") REFERENCES "public"."encounter_combatants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cond_combatant" ON "encounter_combatant_conditions" USING btree ("combatant_id");