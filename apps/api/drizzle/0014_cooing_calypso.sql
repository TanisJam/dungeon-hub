ALTER TABLE "compendium_spells" ADD COLUMN "ritual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compendium_spells" ADD COLUMN "concentration" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compendium_spells" ADD COLUMN "components_m" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "compendium_spells" ADD COLUMN "components_m_cost" integer;