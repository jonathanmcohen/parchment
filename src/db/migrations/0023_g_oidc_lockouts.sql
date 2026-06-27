-- Group G (security) migration 0023 — allocated centrally in the canonical
-- reconciliation §2. Adds EXACTLY three tables: oidc_identities, oidc_login_flows,
-- login_lockouts. It does NOT touch audit_log (that hardening — ip/prev_hash/
-- entry_hash, target_id uuid→text, the append-only trigger — is Phase 0's
-- migration 0021) and does NOT create app_config (Phase 0's 0020). Hand-numbered
-- against the integrated branch journal.

-- 1. oidc_identities — links a workspace user to an external IdP identity.
--    PK is (issuer, subject): the security-correct link anchor (subject is the
--    IdP's stable per-user id, issuer namespaces it). NOT email — email is mutable
--    at the IdP and stored for display/audit only.
CREATE TABLE "oidc_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "oidc_identities_issuer_subject_uq" UNIQUE("issuer","subject")
);
--> statement-breakpoint
-- 2. oidc_login_flows — short-lived server-side PKCE/state/nonce store. The row is
--    consumed atomically on callback (single-use) so verifier/nonce are never
--    client-trusted and a replayed callback finds nothing.
CREATE TABLE "oidc_login_flows" (
	"state" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"nonce" text NOT NULL,
	"redirect_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- 3. login_lockouts — per-account brute-force lockout. Keyed on a sha256 of the
--    normalised email (never the raw email) so it can't be mined for registered
--    addresses.
CREATE TABLE "login_lockouts" (
	"email_hash" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oidc_identities" ADD CONSTRAINT "oidc_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oidc_identities_user_idx" ON "oidc_identities" USING btree ("user_id");
