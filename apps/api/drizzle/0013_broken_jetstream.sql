CREATE TABLE "compendium_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE TABLE "compendium_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'condition' NOT NULL,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE TABLE "compendium_languages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"script" text,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_actions_slug_source" ON "compendium_actions" USING btree ("slug","source");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conditions_slug_source" ON "compendium_conditions" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_conditions_kind" ON "compendium_conditions" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_languages_slug_source" ON "compendium_languages" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_languages_type" ON "compendium_languages" USING btree ("type");