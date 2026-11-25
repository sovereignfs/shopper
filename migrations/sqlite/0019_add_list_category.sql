CREATE TABLE `list_category` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`list_id` text NOT NULL,
	`source_key` text NOT NULL,
	`sealed` text,
	`encrypted` text,
	`icon` text,
	`position` text NOT NULL,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_category_source_key_idx` ON `list_category` (`list_id`,`source_key`);--> statement-breakpoint
CREATE INDEX `list_category_household_seq_idx` ON `list_category` (`household_id`,`seq`);