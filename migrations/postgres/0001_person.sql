CREATE TABLE "shopper"."person" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text,
	"core_sub" text,
	"kind" text DEFAULT 'account' NOT NULL,
	"sealed" text NOT NULL,
	"deleted_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "person_account_id_idx" ON "shopper"."person" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "person_core_sub_idx" ON "shopper"."person" USING btree ("core_sub");