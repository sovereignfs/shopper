ALTER TABLE "shopper"."invitation" ADD COLUMN "card_id" text;--> statement-breakpoint
CREATE INDEX "invitation_card_idx" ON "shopper"."invitation" USING btree ("card_id");