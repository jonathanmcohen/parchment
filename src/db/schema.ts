import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'

// Postgres tsvector — drizzle has no native type, so declare a thin custom one.
// Populated/maintained by a generated column + trigger in the migration SQL.
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

// Postgres bytea — drizzle has no native type. Used for binary Yjs document
// updates (collab_state). node-postgres maps Buffer params/results to bytea.
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

// ─── Users (single owner at v0.1; table shape ready for multi-user v0.2) ───
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'), // null until owner sets a password
  role: text('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Folders (nested via parentId) ───
export const folders = pgTable(
  'folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    parentId: uuid('parent_id'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('folders_parent_idx').on(t.parentId)],
)

// ─── Documents ───
// `content` = Yjs/ProseMirror JSON; `markdown` = canonical disk-mirror form (Plan F).
// `embedding` = pgvector (semantic search, Plan E9); `searchVector` = tsvector (FTS).
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull().default('Untitled'),
    folderId: uuid('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: jsonb('content'),
    markdown: text('markdown').notNull().default(''),
    embedding: vector('embedding', { dimensions: 768 }),
    searchVector: tsvector('search_vector'),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('documents_folder_idx').on(t.folderId),
    index('documents_owner_idx').on(t.ownerId),
    index('documents_search_idx').using('gin', t.searchVector),
    index('documents_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
)

// ─── Audit log (A4 / I5) — append-only ───
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // create | delete | share | export | login
    targetType: text('target_type'),
    targetId: uuid('target_id'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
)

// ─── Sessions (A2) — opaque cookie tokens; only the sha256 hash is stored ───
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

// ─── Personal access tokens (A2) — Bearer auth for the API ───
// Plaintext token is shown once at creation; only the sha256 hash is persisted.
export const pats = pgTable(
  'pats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPrefix: text('token_prefix').notNull(), // 'pat_' + first 6 chars, for display
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('pats_owner_idx').on(t.ownerId)],
)

// ─── Collab state (Yjs document snapshots, written by parchment-collab) ───
export const collabState = pgTable('collab_state', {
  name: text('name').primaryKey(),
  state: bytea('state'), // binary Yjs document update, written by parchment-collab
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Comments (D1) — threaded, anchored to a ProseMirror selection range ───
// The root comment has threadId == id. Replies share the root's threadId.
// anchorFrom/anchorTo store the ProseMirror positions of the highlighted range
// (only set on root comments; null for replies). `resolved` lives on the root
// comment and applies to the whole thread.
export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: uuid('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id').notNull(),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    mentions: jsonb('mentions').notNull().default([]),
    anchorFrom: integer('anchor_from'),
    anchorTo: integer('anchor_to'),
    resolved: boolean('resolved').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comments_doc_idx').on(t.docId), index('comments_thread_idx').on(t.threadId)],
)

// ─── Document version history (D3) ──────────────────────────────────────────
// `kind` = 'auto' (30-second autosave) | 'named' (user-labelled snapshot).
// `content` = ProseMirror JSON at the time of the snapshot.
// `markdown` = serialized markdown (for diffing).
// `label` = null for autosaves; non-null for named snapshots.
export const docVersions = pgTable(
  'doc_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: uuid('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    label: text('label'), // null for autosaves
    kind: text('kind').notNull().default('auto'), // 'auto' | 'named'
    content: jsonb('content'), // ProseMirror JSON snapshot
    markdown: text('markdown').notNull().default(''),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('doc_versions_doc_created_idx').on(t.docId, t.createdAt)],
)

// Hint for the migration generator: ensure extensions exist.
export const _extensions = sql`create extension if not exists vector;`
