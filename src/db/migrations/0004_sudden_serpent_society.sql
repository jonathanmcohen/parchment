-- collab_state.state holds binary Yjs document updates, not text. Storing a
-- Buffer into a text column fails with "invalid byte sequence for encoding".
-- Convert the column to bytea. The table is effectively empty at this point
-- (Yjs state was never persistable), so decode() on the escape form is a safe
-- no-op for any stray rows.
ALTER TABLE "collab_state" ALTER COLUMN "state" SET DATA TYPE bytea USING decode("state", 'escape');
