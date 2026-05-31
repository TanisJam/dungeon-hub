CREATE TABLE "character_concentration" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"concentration_token" text NOT NULL,
	"store" text NOT NULL,
	"spell_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_concentration" ADD CONSTRAINT "character_concentration_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cc_token" ON "character_concentration" USING btree ("concentration_token");