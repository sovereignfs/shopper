CREATE TABLE "shopper"."list_category" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"list_id" text NOT NULL,
	"source_key" text NOT NULL,
	"sealed" text,
	"encrypted" text,
	"icon" text,
	"position" text COLLATE "C" NOT NULL,
	"deleted_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL,
	"fseq" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "list_category_source_key_idx" ON "shopper"."list_category" USING btree ("list_id","source_key");--> statement-breakpoint
CREATE INDEX "list_category_household_seq_idx" ON "shopper"."list_category" USING btree ("household_id","seq");