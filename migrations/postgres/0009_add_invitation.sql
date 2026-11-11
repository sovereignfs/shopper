CREATE TABLE "shopper"."invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"accepted_by" text,
	"accepted_at" bigint,
	"revoked_at" bigint
);
--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_token_hash_idx" ON "shopper"."invitation" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitation_household_idx" ON "shopper"."invitation" USING btree ("household_id");