DROP INDEX IF EXISTS "documents_search_idx";
ALTER TABLE "documents" DROP COLUMN IF EXISTS "search_vector";
ALTER TABLE "documents" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("title",'') || ' ' || coalesce("markdown",''))) STORED;
CREATE INDEX "documents_search_idx" ON "documents" USING gin ("search_vector");
