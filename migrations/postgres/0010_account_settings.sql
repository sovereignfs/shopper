CREATE TABLE "shopper"."account_settings" (
	"account_id" text PRIMARY KEY NOT NULL,
	"last_list_id" text,
	"inbox_seen_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
