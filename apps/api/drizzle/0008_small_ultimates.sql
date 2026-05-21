CREATE TABLE "world_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"dm_notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_session_id" uuid,
	"visibility" text DEFAULT 'public' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_events" ADD CONSTRAINT "world_events_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_world_events_campaign_time" ON "world_events" USING btree ("campaign_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_world_events_source" ON "world_events" USING btree ("source_session_id");--> statement-breakpoint
CREATE INDEX "idx_world_events_tags" ON "world_events" USING gin ("tags");