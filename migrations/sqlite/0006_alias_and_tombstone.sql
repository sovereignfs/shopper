CREATE TABLE `alias` (
	`household_id` text NOT NULL,
	`table_name` text NOT NULL,
	`from_id` text NOT NULL,
	`to_id` text NOT NULL,
	`seq` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`household_id`, `table_name`, `from_id`)
);
--> statement-breakpoint
CREATE INDEX `alias_household_seq_idx` ON `alias` (`household_id`,`seq`);--> statement-breakpoint
CREATE TABLE `tombstone` (
	`household_id` text NOT NULL,
	`table_name` text NOT NULL,
	`id` text NOT NULL,
	`seq` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`household_id`, `table_name`, `id`)
);
--> statement-breakpoint
CREATE INDEX `tombstone_household_seq_idx` ON `tombstone` (`household_id`,`seq`);