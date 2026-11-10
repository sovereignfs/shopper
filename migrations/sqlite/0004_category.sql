CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`starter_key` text,
	`sealed` text,
	`icon` text,
	`position` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_household_starter_key_idx` ON `category` (`household_id`,`starter_key`);--> statement-breakpoint
CREATE INDEX `category_household_seq_idx` ON `category` (`household_id`,`seq`);