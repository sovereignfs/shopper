ALTER TABLE `invitation` ADD `card_id` text;--> statement-breakpoint
CREATE INDEX `invitation_card_idx` ON `invitation` (`card_id`);