CREATE TABLE "compendium_monsters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"cr" text,
	"cr_numeric" numeric,
	"type" text,
	"size" text,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_monsters_slug_source" ON "compendium_monsters" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_monsters_cr_numeric" ON "compendium_monsters" USING btree ("cr_numeric");--> statement-breakpoint
CREATE INDEX "idx_monsters_type" ON "compendium_monsters" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_monsters_name" ON "compendium_monsters" USING btree ("name");