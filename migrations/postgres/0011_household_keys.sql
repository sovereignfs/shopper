CREATE TABLE "shopper"."household_key" (
	"household_id" text NOT NULL,
	"person_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"record" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "household_key_household_id_person_id_pk" PRIMARY KEY("household_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "shopper"."category" ADD COLUMN "encrypted" text;--> statement-breakpoint
ALTER TABLE "shopper"."household" ADD COLUMN "encrypted" text;--> statement-breakpoint
ALTER TABLE "shopper"."household" ADD COLUMN "encryption" text DEFAULT 'sealed' NOT NULL;--> statement-breakpoint
ALTER TABLE "shopper"."household" ADD COLUMN "epoch" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shopper"."item" ADD COLUMN "encrypted" text;--> statement-breakpoint
ALTER TABLE "shopper"."list" ADD COLUMN "encrypted" text;--> statement-breakpoint
ALTER TABLE "shopper"."product" ADD COLUMN "encrypted" text;