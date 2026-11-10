CREATE TABLE `household` (
	`id` text PRIMARY KEY NOT NULL,
	`own_of` text,
	`sealed` text,
	`seq` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_own_of_idx` ON `household` (`own_of`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	`seq` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_household_person_idx` ON `member` (`household_id`,`person_id`);--> statement-breakpoint
CREATE INDEX `member_person_idx` ON `member` (`person_id`);