-- Migration 0025: durable comment anchors (H1)
-- Adds Yjs RelativePosition JSON anchor columns to comments (additive, nullable;
-- integer anchor_from/anchor_to stay as the non-collab + published-page fallback).
-- Adds the (doc_id, resolved) index the sidebar open/resolved filter hits.
-- Applied automatically by migrate.sh on startup.

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "anchor_start" jsonb;
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "anchor_end" jsonb;
CREATE INDEX IF NOT EXISTS "comments_doc_resolved_idx" ON "comments" ("doc_id", "resolved");
