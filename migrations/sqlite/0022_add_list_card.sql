CREATE TABLE `list_card` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`list_id` text NOT NULL,
	`card_id` text NOT NULL,
	`sealed` text,
	`encrypted` text,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_card_pair_idx` ON `list_card` (`list_id`,`card_id`);--> statement-breakpoint
CREATE INDEX `list_card_household_seq_idx` ON `list_card` (`household_id`,`seq`);--> statement-breakpoint
CREATE INDEX `list_card_card_idx` ON `list_card` (`card_id`);