CREATE TABLE `list_key` (
	`list_id` text NOT NULL,
	`person_id` text NOT NULL,
	`household_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`record` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`list_id`, `person_id`)
);
--> statement-breakpoint
CREATE INDEX `list_key_person_idx` ON `list_key` (`person_id`);