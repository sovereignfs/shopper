CREATE TABLE "shopper"."product" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name_key" text NOT NULL,
	"sealed" text NOT NULL,
	"category_id" text,
	"icon" text,
	"default_quantity" text,
	"default_unit" text,
	"times_bought" bigint DEFAULT 0 NOT NULL,
	"last_bought_at" bigint,
	"last_added_at" bigint,
	"deleted_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL,
	"fseq" text DEFAULT '{}' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_household_name_key_idx" ON "shopper"."product" USING btree ("household_id","name_key");--> statement-breakpoint
CREATE INDEX "product_household_seq_idx" ON "shopper"."product" USING btree ("household_id","seq");