CREATE TABLE `item` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`list_id` text NOT NULL,
	`product_id` text NOT NULL,
	`sealed` text NOT NULL,
	`quantity` text NOT NULL,
	`unit` text,
	`category_id` text,
	`icon` text,
	`position` text NOT NULL,
	`added_by` text NOT NULL,
	`added_at` integer NOT NULL,
	`bought_at` integer,
	`bought_by` text,
	`cleared_at` integer,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_household_seq_idx` ON `item` (`household_id`,`seq`);--> statement-breakpoint
CREATE INDEX `item_list_idx` ON `item` (`list_id`);