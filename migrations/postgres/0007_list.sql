CREATE TABLE "shopper"."list" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"sealed" text NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	"clearing" text DEFAULT 'manual' NOT NULL,
	"archived_at" bigint,
	"deleted_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL,
	"fseq" text DEFAULT '{}' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "list_household_seq_idx" ON "shopper"."list" USING btree ("household_id","seq");