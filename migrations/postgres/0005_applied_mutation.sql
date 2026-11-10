CREATE TABLE "shopper"."applied_mutation" (
	"account_id" text NOT NULL,
	"id" text NOT NULL,
	"household_id" text NOT NULL,
	"seq" bigint NOT NULL,
	"created_at" bigint NOT NULL,
	CONSTRAINT "applied_mutation_account_id_id_pk" PRIMARY KEY("account_id","id")
);
