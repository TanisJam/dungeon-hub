CREATE TABLE "compendium_backgrounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE TABLE "compendium_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE TABLE "compendium_feats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"prerequisites" jsonb,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE TABLE "compendium_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"weight" numeric,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE TABLE "compendium_races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"reprinted_as" text[],
	"is_subrace" boolean DEFAULT false NOT NULL,
	"parent_slug" text,
	"parent_source" text
);
--> statement-breakpoint
CREATE TABLE "compendium_spells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"school" text NOT NULL,
	"classes" text[] DEFAULT '{}'::text[] NOT NULL,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE TABLE "compendium_subclasses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"class_slug" text NOT NULL,
	"class_source" text NOT NULL,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_backgrounds_slug_source" ON "compendium_backgrounds" USING btree ("slug","source");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_classes_slug_source" ON "compendium_classes" USING btree ("slug","source");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_feats_slug_source" ON "compendium_feats" USING btree ("slug","source");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_items_slug_source" ON "compendium_items" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_items_type" ON "compendium_items" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_races_slug_source" ON "compendium_races" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_races_name" ON "compendium_races" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_spells_slug_source" ON "compendium_spells" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_spells_level" ON "compendium_spells" USING btree ("level");--> statement-breakpoint
CREATE INDEX "idx_spells_school" ON "compendium_spells" USING btree ("school");--> statement-breakpoint
CREATE INDEX "idx_spells_classes" ON "compendium_spells" USING gin ("classes");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subclasses_slug_source" ON "compendium_subclasses" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_subclasses_class" ON "compendium_subclasses" USING btree ("class_slug","class_source");