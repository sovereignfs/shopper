CREATE TABLE `household_key` (
	`household_id` text NOT NULL,
	`person_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`record` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`household_id`, `person_id`)
);
--> statement-breakpoint
ALTER TABLE `category` ADD `encrypted` text;--> statement-breakpoint
ALTER TABLE `household` ADD `encrypted` text;--> statement-breakpoint
ALTER TABLE `household` ADD `encryption` text DEFAULT 'sealed' NOT NULL;--> statement-breakpoint
ALTER TABLE `household` ADD `epoch` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `item` ADD `encrypted` text;--> statement-breakpoint
ALTER TABLE `list` ADD `encrypted` text;--> statement-breakpoint
ALTER TABLE `product` ADD `encrypted` text;