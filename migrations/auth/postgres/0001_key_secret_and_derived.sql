ALTER TABLE "shopper_auth"."account" ADD COLUMN "password_derived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shopper_auth"."session" ADD COLUMN "key_secret" text;