CREATE TABLE `list_member` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`list_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	`seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_member_list_person_idx` ON `list_member` (`list_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `list_member_person_idx` ON `list_member` (`person_id`);--> statement-breakpoint
CREATE INDEX `list_member_household_seq_idx` ON `list_member` (`household_id`,`seq`);--> statement-breakpoint
ALTER TABLE `alias` ADD `list_id` text;--> statement-breakpoint
ALTER TABLE `invitation` ADD `list_id` text;--> statement-breakpoint
ALTER TABLE `tombstone` ADD `list_id` text;