CREATE TABLE `list` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`sealed` text NOT NULL,
	`position` text NOT NULL,
	`clearing` text DEFAULT 'manual' NOT NULL,
	`archived_at` integer,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `list_household_seq_idx` ON `list` (`household_id`,`seq`);