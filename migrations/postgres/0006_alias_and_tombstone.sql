CREATE TABLE "shopper"."alias" (
	"household_id" text NOT NULL,
	"table_name" text NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "alias_household_id_table_name_from_id_pk" PRIMARY KEY("household_id","table_name","from_id")
);
--> statement-breakpoint
CREATE TABLE "shopper"."tombstone" (
	"household_id" text NOT NULL,
	"table_name" text NOT NULL,
	"id" text NOT NULL,
	"seq" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "tombstone_household_id_table_name_id_pk" PRIMARY KEY("household_id","table_name","id")
);
--> statement-breakpoint
CREATE INDEX "alias_household_seq_idx" ON "shopper"."alias" USING btree ("household_id","seq");--> statement-breakpoint
CREATE INDEX "tombstone_household_seq_idx" ON "shopper"."tombstone" USING btree ("household_id","seq");