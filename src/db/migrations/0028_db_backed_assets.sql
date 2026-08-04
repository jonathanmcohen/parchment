-- 0028: DB-backed assets.
--
-- Assets were disk-only under ${filesRoot}/.assets/<docId>/, invisible to Postgres.
-- A database restore therefore returned documents with broken images, because the
-- bytes lived only in the container volume.
--
-- This table becomes the source of truth for asset bytes and metadata. The disk
-- copy beside the .md is a MIRROR of this table, written one-directionally.
--
-- bytea rather than large objects: transactional, simpler, and these are document
-- images. Deployments with BACKUP_S3_* configured keep using S3 for bytes; the row
-- is still written so metadata, quota, and the mirror have a single source.

CREATE TABLE IF NOT EXISTS assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  mime        text NOT NULL,
  byte_size   integer NOT NULL,
  sha256      text NOT NULL,
  -- NULL when bytes live in S3 (isS3Configured); populated for the default store.
  bytes       bytea,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assets_doc_filename_uniq UNIQUE (doc_id, filename)
);

CREATE INDEX IF NOT EXISTS assets_doc_idx ON assets (doc_id);
CREATE INDEX IF NOT EXISTS assets_sha_idx ON assets (sha256);
