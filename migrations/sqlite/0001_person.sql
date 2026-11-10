CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text,
	`core_sub` text,
	`kind` text DEFAULT 'account' NOT NULL,
	`sealed` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `person_account_id_idx` ON `person` (`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_core_sub_idx` ON `person` (`core_sub`);