CREATE TABLE `account_settings` (
	`account_id` text PRIMARY KEY NOT NULL,
	`last_list_id` text,
	`inbox_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
