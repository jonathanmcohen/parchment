import { sql } from 'drizzle-orm'
import {
  customType,
  index,
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

// ─── Collab state (Yjs document snapshots, written by parchment-collab) ───
export const collabState = pgTable('collab_state', {
  name: text('name').primaryKey(),
  state: text('state'), // bytea in SQL; see migration. Stored as binary Yjs update.
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Hint for the migration generator: ensure extensions exist.
export const _extensions = sql`create extension if not exists vector;`
