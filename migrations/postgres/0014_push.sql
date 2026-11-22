CREATE TABLE "shopper"."push_device" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"sealed" text NOT NULL,
	"saved_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopper"."push_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"message" text NOT NULL,
	"attempts" bigint DEFAULT 0 NOT NULL,
	"due_at" bigint NOT NULL,
	"claimed_until" bigint DEFAULT 0 NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "push_device_account_idx" ON "shopper"."push_device" USING btree ("account_id","saved_at");--> statement-breakpoint
CREATE INDEX "push_outbox_due_idx" ON "shopper"."push_outbox" USING btree ("due_at","claimed_until");--> statement-breakpoint
CREATE INDEX "push_outbox_endpoint_idx" ON "shopper"."push_outbox" USING btree ("endpoint");