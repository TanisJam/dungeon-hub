-- campaign-archive — soft close/reopen. text+CHECK mirrors quests 0038.
-- Adds status column (default 'active') + CHECK constraint to campaigns table.
-- All existing rows are backfilled to 'active' by the DEFAULT.
-- campaign-archive SDD spec #1933, design #1934, tasks #1935.

--> statement-breakpoint

ALTER TABLE "campaigns" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;

--> statement-breakpoint

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_status_check" CHECK (status IN ('active','archived'));
