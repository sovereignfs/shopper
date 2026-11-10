CREATE TABLE `applied_mutation` (
	`account_id` text NOT NULL,
	`id` text NOT NULL,
	`household_id` text NOT NULL,
	`seq` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`account_id`, `id`)
);
