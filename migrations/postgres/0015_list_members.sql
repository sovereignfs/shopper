CREATE TABLE "shopper"."list_member" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"list_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" bigint NOT NULL,
	"left_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopper"."alias" ADD COLUMN "list_id" text;--> statement-breakpoint
ALTER TABLE "shopper"."invitation" ADD COLUMN "list_id" text;--> statement-breakpoint
ALTER TABLE "shopper"."tombstone" ADD COLUMN "list_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "list_member_list_person_idx" ON "shopper"."list_member" USING btree ("list_id","person_id");--> statement-breakpoint
CREATE INDEX "list_member_person_idx" ON "shopper"."list_member" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "list_member_household_seq_idx" ON "shopper"."list_member" USING btree ("household_id","seq");