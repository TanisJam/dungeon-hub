CREATE TABLE "compendium_optional_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"feature_type" text[] NOT NULL,
	"prerequisites" jsonb,
	"data" jsonb NOT NULL,
	"reprinted_as" text[]
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_optfeats_slug_source" ON "compendium_optional_features" USING btree ("slug","source");--> statement-breakpoint
CREATE INDEX "idx_optfeats_feature_type" ON "compendium_optional_features" USING gin ("feature_type");