DROP INDEX `product_household_name_key_idx`;--> statement-breakpoint
ALTER TABLE `product` ADD `list_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `product_list_name_key_idx` ON `product` (`household_id`,`list_id`,`name_key`);