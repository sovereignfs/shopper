CREATE TABLE `inventory_item` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`starter_key` text,
	`name_key` text NOT NULL,
	`sealed` text,
	`encrypted` text,
	`category_id` text,
	`icon` text,
	`unit` text,
	`quantity` text,
	`recurring` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`deleted_at` integer,
	`seq` integer DEFAULT 0 NOT NULL,
	`fseq` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_name_key_idx` ON `inventory_item` (`household_id`,`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_starter_key_idx` ON `inventory_item` (`household_id`,`starter_key`);--> statement-breakpoint
CREATE INDEX `inventory_item_household_seq_idx` ON `inventory_item` (`household_id`,`seq`);