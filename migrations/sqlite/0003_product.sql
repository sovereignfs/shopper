CREATE TABLE `product` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name_key` text NOT NULL,
	`sealed` text NOT NULL,
	`category_id` text,
	`icon` text,
	`default_quantity` text,
	`default_unit` text,
	`times_bought` integer DEFAULT 0 NOT NULL,
	`last_bought_at` integer,
	`last_added_at` integer,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_household_name_key_idx` ON `product` (`household_id`,`name_key`);--> statement-breakpoint
CREATE INDEX `product_household_seq_idx` ON `product` (`household_id`,`seq`);