CREATE TABLE `push_device` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`sealed` text NOT NULL,
	`saved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_device_account_idx` ON `push_device` (`account_id`,`saved_at`);--> statement-breakpoint
CREATE TABLE `push_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`message` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`claimed_until` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_outbox_due_idx` ON `push_outbox` (`due_at`,`claimed_until`);--> statement-breakpoint
CREATE INDEX `push_outbox_endpoint_idx` ON `push_outbox` (`endpoint`);