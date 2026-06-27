-- Phase 0 §1d: harden audit_log for G's ip, hash-chain integrity, and append-only
-- enforcement. target_id is changed from uuid to text so non-uuid identifiers (OIDC
-- subject, session hash, config key) can be stored without casting.

-- 1. Add columns
ALTER TABLE "audit_log"
	ADD COLUMN "ip" text,
	ADD COLUMN "prev_hash" text,
	ADD COLUMN "entry_hash" text;
--> statement-breakpoint
-- 2. Change target_id from uuid to text (existing rows: ::text cast is identity).
--    Drop the FK to users first if one exists — target_id is intentionally untyped
--    for cross-entity use (it may hold a user id, a doc id, a config key, etc.).
ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_target_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log"
	ALTER COLUMN "target_id" TYPE text USING "target_id"::text;
--> statement-breakpoint
-- 3. Append-only trigger. DELETE is always rejected. UPDATE is rejected EXCEPT the
--    one-time entry_hash back-fill that logAudit performs (NULL -> sha256) — that
--    single transition is permitted and nothing else may change. This lets the
--    application user (which need NOT be a superuser) complete the two-step
--    insert-then-hash write while keeping every real mutation blocked. The tamper
--    test bypasses this with `SET session_replication_role = replica` (superuser).
CREATE OR REPLACE FUNCTION audit_log_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
	IF (TG_OP = 'DELETE') THEN
		RAISE EXCEPTION 'audit_log is append-only: DELETE is not permitted';
	END IF;
	-- TG_OP = 'UPDATE'. Allow ONLY the entry_hash NULL -> non-NULL back-fill with
	-- every other column unchanged; reject anything else.
	IF (
		OLD."entry_hash" IS NULL
		AND NEW."entry_hash" IS NOT NULL
		AND NEW."id" IS NOT DISTINCT FROM OLD."id"
		AND NEW."actor_id" IS NOT DISTINCT FROM OLD."actor_id"
		AND NEW."action" IS NOT DISTINCT FROM OLD."action"
		AND NEW."target_type" IS NOT DISTINCT FROM OLD."target_type"
		AND NEW."target_id" IS NOT DISTINCT FROM OLD."target_id"
		AND NEW."meta" IS NOT DISTINCT FROM OLD."meta"
		AND NEW."ip" IS NOT DISTINCT FROM OLD."ip"
		AND NEW."prev_hash" IS NOT DISTINCT FROM OLD."prev_hash"
		AND NEW."created_at" IS NOT DISTINCT FROM OLD."created_at"
	) THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'audit_log is append-only: UPDATE is not permitted';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_mutation
	BEFORE UPDATE OR DELETE ON "audit_log"
	FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
