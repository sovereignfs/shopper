CREATE TABLE "shopper"."card" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"sealed" text,
	"encrypted" text,
	"position" text COLLATE "C" NOT NULL,
	"deleted_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL,
	"fseq" text DEFAULT '{}' NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopper"."card_key" (
	"card_id" text NOT NULL,
	"person_id" text NOT NULL,
	"household_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"record" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "card_key_card_id_person_id_pk" PRIMARY KEY("card_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "shopper"."card_member" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"card_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" bigint NOT NULL,
	"left_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopper"."tombstone" ADD COLUMN "card_id" text;--> statement-breakpoint
CREATE INDEX "card_household_seq_idx" ON "shopper"."card" USING btree ("household_id","seq");--> statement-breakpoint
CREATE INDEX "card_key_person_idx" ON "shopper"."card_key" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_member_card_person_idx" ON "shopper"."card_member" USING btree ("card_id","person_id");--> statement-breakpoint
CREATE INDEX "card_member_person_idx" ON "shopper"."card_member" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "card_member_household_seq_idx" ON "shopper"."card_member" USING btree ("household_id","seq");