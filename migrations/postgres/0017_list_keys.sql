CREATE TABLE "shopper"."list_key" (
	"list_id" text NOT NULL,
	"person_id" text NOT NULL,
	"household_id" text NOT NULL,
	"epoch" bigint NOT NULL,
	"record" text NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "list_key_list_id_person_id_pk" PRIMARY KEY("list_id","person_id")
);
--> statement-breakpoint
CREATE INDEX "list_key_person_idx" ON "shopper"."list_key" USING btree ("person_id");