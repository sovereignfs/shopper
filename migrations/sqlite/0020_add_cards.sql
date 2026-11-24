CREATE TABLE `card` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`sealed` text,
	`encrypted` text,
	`position` text NOT NULL,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `card_household_seq_idx` ON `card` (`household_id`,`seq`);--> statement-breakpoint
CREATE TABLE `card_key` (
	`card_id` text NOT NULL,
	`person_id` text NOT NULL,
	`household_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`record` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `person_id`)
);
--> statement-breakpoint
CREATE INDEX `card_key_person_idx` ON `card_key` (`person_id`);--> statement-breakpoint
CREATE TABLE `card_member` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`card_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	`seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `card_member_card_person_idx` ON `card_member` (`card_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `card_member_person_idx` ON `card_member` (`person_id`);--> statement-breakpoint
CREATE INDEX `card_member_household_seq_idx` ON `card_member` (`household_id`,`seq`);--> statement-breakpoint
ALTER TABLE `tombstone` ADD `card_id` text;