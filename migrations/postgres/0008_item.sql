CREATE TABLE "shopper"."item" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"list_id" text NOT NULL,
	"product_id" text NOT NULL,
	"sealed" text NOT NULL,
	"quantity" text NOT NULL,
	"unit" text,
	"category_id" text,
	"icon" text,
	"position" text COLLATE "C" NOT NULL,
	"added_by" text NOT NULL,
	"added_at" bigint NOT NULL,
	"bought_at" bigint,
	"bought_by" text,
	"cleared_at" bigint,
	"deleted_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL,
	"fseq" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "item_household_seq_idx" ON "shopper"."item" USING btree ("household_id","seq");--> statement-breakpoint
CREATE INDEX "item_list_idx" ON "shopper"."item" USING btree ("list_id");