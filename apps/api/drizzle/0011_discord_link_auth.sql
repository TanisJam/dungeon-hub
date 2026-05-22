CREATE TABLE "discord_link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"discord_id" text NOT NULL,
	"discord_username" text,
	"requested_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "discord_username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "can_impersonate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "discord_link_tokens" ADD CONSTRAINT "discord_link_tokens_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_link_tokens" ADD CONSTRAINT "discord_link_tokens_consumed_by_user_id_users_id_fk" FOREIGN KEY ("consumed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;