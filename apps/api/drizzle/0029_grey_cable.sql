ALTER TABLE "encounter_combatants" ADD COLUMN "action_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "encounter_combatants" ADD COLUMN "bonus_action_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "encounter_combatants" ADD COLUMN "attacks_remaining" integer DEFAULT 0 NOT NULL;