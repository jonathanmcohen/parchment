-- Migration 0027: scoped personal access tokens (J8)
-- Adds a `scopes` text[] column to pats. Canonical scope strings are 'docs:read'
-- and 'docs:write' (bare 'read'/'write' are BANNED). Default '{}' (no scope) so an
-- un-migrated / scope-less token is treated as least-privilege by the guard.
-- Additive + idempotent. Applied automatically by migrate.sh on startup.

ALTER TABLE "pats" ADD COLUMN IF NOT EXISTS "scopes" text[] NOT NULL DEFAULT '{}';
