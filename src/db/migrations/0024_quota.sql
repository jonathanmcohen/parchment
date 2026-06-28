-- Migration 0024: per-user quota (I2)
-- Adds quota_mb to users. 0 = unlimited (default).
-- Applied automatically by migrate.sh on startup.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quota_mb" integer NOT NULL DEFAULT 0;
