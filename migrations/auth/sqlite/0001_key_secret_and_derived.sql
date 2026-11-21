ALTER TABLE `account` ADD `password_derived` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `session` ADD `key_secret` text;