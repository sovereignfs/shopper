CREATE TABLE "shopper"."household" (
	"id" text PRIMARY KEY NOT NULL,
	"own_of" text,
	"sealed" text,
	"seq" bigint DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopper"."member" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" bigint NOT NULL,
	"left_at" bigint,
	"seq" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "household_own_of_idx" ON "shopper"."household" USING btree ("own_of");--> statement-breakpoint
CREATE UNIQUE INDEX "member_household_person_idx" ON "shopper"."member" USING btree ("household_id","person_id");--> statement-breakpoint
CREATE INDEX "member_person_idx" ON "shopper"."member" USING btree ("person_id");