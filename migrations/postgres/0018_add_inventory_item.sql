CREATE TABLE "shopper"."inventory_item" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"starter_key" text,
	"name_key" text NOT NULL,
	"sealed" text,
	"encrypted" text,
	"category_id" text,
	"icon" text,
	"unit" text,
	"quantity" text,
	"recurring" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"deleted_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL,
	"fseq" text DEFAULT '{}' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_name_key_idx" ON "shopper"."inventory_item" USING btree ("household_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_item_starter_key_idx" ON "shopper"."inventory_item" USING btree ("household_id","starter_key");--> statement-breakpoint
CREATE INDEX "inventory_item_household_seq_idx" ON "shopper"."inventory_item" USING btree ("household_id","seq");