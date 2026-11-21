DROP INDEX "shopper"."product_household_name_key_idx";--> statement-breakpoint
ALTER TABLE "shopper"."product" ADD COLUMN "list_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "product_list_name_key_idx" ON "shopper"."product" USING btree ("household_id","list_id","name_key");