CREATE TABLE `invitation` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_by` text,
	`accepted_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitation_token_hash_idx` ON `invitation` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitation_household_idx` ON `invitation` (`household_id`);