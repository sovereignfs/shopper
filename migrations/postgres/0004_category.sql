CREATE TABLE "shopper"."category" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"starter_key" text,
	"sealed" text,
	"icon" text,
	"position" text COLLATE "C" NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"deleted_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL,
	"fseq" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "category_household_starter_key_idx" ON "shopper"."category" USING btree ("household_id","starter_key");--> statement-breakpoint
CREATE INDEX "category_household_seq_idx" ON "shopper"."category" USING btree ("household_id","seq");