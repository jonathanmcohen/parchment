ALTER TABLE "sessions" ADD COLUMN "failed_mfa_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_mfa" ADD COLUMN "last_totp_step" bigint;