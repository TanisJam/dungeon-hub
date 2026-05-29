CREATE TABLE "modifier_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"rule_doc" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_moddefs_slug" ON "modifier_definitions" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_moddefs_kind" ON "modifier_definitions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_moddefs_source" ON "modifier_definitions" USING btree ("source");