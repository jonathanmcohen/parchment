import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  // A6: a disabled user keeps all rows but can never authenticate. null = active.
  // Enforced server-side in getUserByToken/authenticateRequest (defense in depth).
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
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
    starred: boolean('starred').notNull().default(false),
    diskPath: text('disk_path'),
    // F2: sha256 of the markdown last known to be in-sync between DB and disk.
    // The reverse-sync watcher uses it to classify external file changes
    // (echo vs. external edit vs. conflict).
    diskSyncedHash: text('disk_synced_hash'),
    // G9: arbitrary doc-level metadata (watermark config, etc.) stored as jsonb.
    // Added in migration 0015 (the column did not previously exist).
    meta: jsonb('meta'),
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

// ─── Document permissions (A4) — per-user ACL layered over public/password links ─
// A row grants `user` a `role` on `doc`. The doc OWNER is implicit (no row needed)
// and always has full control. `role` is a doc-scoped capability, distinct from the
// workspace `users.role`: viewer (read) < commenter (read+comment) < editor (write).
// Composite PK (doc_id, user_id) — one role per (doc, user). Both FKs cascade so a
// deleted doc or user leaves no dangling grant. Enforced server-side by
// canAccessDoc/resolveDocAccess — NEVER a UI-only gate.
export const documentPermissions = pgTable(
  'document_permissions',
  {
    docId: uuid('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('viewer'), // viewer | commenter | editor
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.docId, t.userId] }),
    index('document_permissions_user_idx').on(t.userId),
  ],
)

// ─── Invites (A5) — pending user invitations; accepted → a real user + password ─
// An invite is created by an admin/owner with a target email + workspace role. The
// `tokenHash` is the sha256 of the single-use accept token carried in the email
// link (the plaintext token is shown/sent once and never persisted). Accepting
// within `expiresAt` creates the user (or sets the password on a pre-created
// disabled placeholder) and deletes the invite. `acceptedAt` marks consumed.
export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    role: text('role').notNull().default('editor'), // workspace role to grant on accept; canonical default is 'editor' (never 'member')
    tokenHash: text('token_hash').notNull().unique(), // sha256 of the accept token
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }), // null until consumed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('invites_email_idx').on(t.email)],
)

// ─── Audit log (A4 / I5 / Phase 0 §1d) — append-only, hash-chained ───
// `action` is the merged AuditAction union (see src/lib/audit/index.ts): the legacy
// flat verbs (create|delete|share|export|login|setup) plus A's + G's dotted verbs.
// `targetId` is text (migration 0021, was uuid) so any identifier — user/doc id, OIDC
// subject, session hash, config key — stores without a cast. `ip` is the caller's
// best-effort client IP. `prevHash`/`entryHash` form the sha256 integrity chain
// (entry_hash is computed from the PERSISTED created_at and back-filled by logAudit;
// the append-only trigger permits ONLY that NULL->hash transition). verifyAuditChain
// re-derives and compares the chain.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    meta: jsonb('meta'),
    ip: text('ip'),
    prevHash: text('prev_hash'),
    entryHash: text('entry_hash'),
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
    // I7: a session minted after the password step but BEFORE a second factor is
    // 'mfaPending'. The auth guard treats such a session as unauthenticated for
    // app/API routes; ONLY the 2FA-verify / passkey-auth routes accept it, and
    // they clear the flag on success to promote it to a full session.
    mfaPending: boolean('mfa_pending').notNull().default(false),
    // I7 (hardening): count of failed second-factor attempts against this pending
    // session. The 2FA-verify route increments it on each wrong TOTP/recovery
    // code and destroys the pending session once it exceeds MFA_MAX_ATTEMPTS, so
    // an attacker who has the password cannot brute-force the second factor for
    // the whole pending TTL — they get a hard, bounded number of guesses.
    failedMfaAttempts: integer('failed_mfa_attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

// ─── MFA / TOTP (I7) — one row per user once they begin/complete TOTP enroll ──
// `totpSecret` (base32) is set provisionally at /init and remains until disabled;
// `totpEnabledAt` is null until a valid code confirms enrollment at /enable.
// `recoveryCodes` is a jsonb array of argon2-HASHED single-use codes — a consumed
// code is removed from the array. The plaintext codes are shown to the user
// exactly once at enrollment and never persisted or returned again.
export const userMfa = pgTable('user_mfa', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  totpSecret: text('totp_secret'), // base32; null until TOTP enrollment begins
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }), // null until confirmed
  recoveryCodes: jsonb('recovery_codes').notNull().default([]), // string[] of argon2 hashes
  // I7 (hardening): the highest TOTP time-step already accepted for this user.
  // RFC-6238 §5.2 says a verifier SHOULD reject a previously-accepted OTP within
  // its validity window. verifyTotp returns the matched absolute step; the verify
  // route persists it here and rejects any token whose step is <= this value, so
  // a phished/shoulder-surfed live code cannot be replayed within its ~90s window.
  lastTotpStep: bigint('last_totp_step', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ─── Passkeys (I7) — WebAuthn credentials, one row per registered authenticator ─
// `id` is the credential ID (base64url). `publicKey` is the COSE public key
// (base64url). `counter` is the signature counter (bigint; some authenticators
// exceed 2^31). `transports` is the hint array from registration. Cascades on
// user delete so a removed user leaves no orphaned credentials.
export const passkeys = pgTable(
  'passkeys',
  {
    id: text('id').primaryKey(), // credential ID, base64url
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    publicKey: text('public_key').notNull(), // COSE public key, base64url
    counter: bigint('counter', { mode: 'number' }).notNull().default(0),
    transports: jsonb('transports'), // AuthenticatorTransport[] | null
    label: text('label').notNull().default('Passkey'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('passkeys_user_idx').on(t.userId)],
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

// ─── Webhooks (J7 / J4) — HMAC-signed HTTP callbacks on workspace events ───
// The owner registers a webhook that fires on `events` (a subset of
// WEBHOOK_EVENTS: document.saved | document.published | comment.created).
// `kind` selects the request shaping: 'generic' POSTs the raw JSON payload with
// an `X-Parchment-Signature` HMAC header the receiver verifies with `secret`;
// 'slack'/'discord' POST a formatted message body to an incoming-webhook URL (no
// signature header — the URL itself is the secret). `secret` is CSPRNG-generated
// server-side and is NEVER returned to the client (the list endpoint masks it).
// Inherently off-by-default: with no rows, no calls are ever made.
export const webhooks = pgTable(
  'webhooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    secret: text('secret').notNull(), // HMAC signing key (generic); server-only
    kind: text('kind').notNull().default('generic'), // generic | slack | discord
    events: jsonb('events').notNull().default([]), // string[] of subscribed event ids
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('webhooks_owner_idx').on(t.ownerId)],
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

// ─── Smart Folders (E3) — live saved searches ────────────────────────────────
export const smartFolders = pgTable(
  'smart_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    criteria: jsonb('criteria').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('smart_folders_owner_idx').on(t.ownerId)],
)

// ─── Settings (E11) — generic owner key-value store ──────────────────────────
export const settings = pgTable(
  'settings',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.key] })],
)

// ─── Tags (E4) — color-coded labels, many-to-many with documents ─────────────
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('slate'), // a tag-colors palette name
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tags_owner_idx').on(t.ownerId)],
)

export const documentTags = pgTable(
  'document_tags',
  {
    docId: uuid('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.docId, t.tagId] }), index('document_tags_tag_idx').on(t.tagId)],
)

// ─── Shares (G1) — capability-link sharing for a doc ─────────────────────────
// A row is a shareable link to a single doc. `token` is the capability carried
// in the public URL (32 random bytes, base64url — see shares-repo). The link
// existing == "anyone with the link" on; revoking deletes the row. `permission`
// stores the owner's intent (view|comment|edit|suggest) but v0.1 only RENDERS
// read-only on the public route — anonymous writes are an explicit v0.2 GAP.
// `passwordHash` (argon2, null = no password) and `expiresAt` (null = never) are
// enforced SERVER-SIDE in resolveShare / verifySharePassword and the API; the
// public data path NEVER returns the hash or any owner/other-doc data.
export const shares = pgTable(
  'shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    docId: uuid('doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(), // 32-byte base64url; the URL capability
    permission: text('permission').notNull().default('view'), // view|comment|edit|suggest
    passwordHash: text('password_hash'), // argon2, null = no password
    expiresAt: timestamp('expires_at', { withTimezone: true }), // null = never
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('shares_doc_idx').on(t.docId), index('shares_token_idx').on(t.token)],
)

// ─── Doc links (F6) — wiki-link graph: source doc → target doc ───────────────
// A row per directed [[wiki]] link from sourceDoc to targetDoc. The composite
// PK dedupes multiple links to the same target. doc_links_target_idx powers the
// backlinks query (who links to this doc?). Both FKs cascade on doc delete so
// the link index never dangles.
export const docLinks = pgTable(
  'doc_links',
  {
    sourceDocId: uuid('source_doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    targetDocId: uuid('target_doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.sourceDocId, t.targetDocId] }),
    index('doc_links_target_idx').on(t.targetDocId),
  ],
)

// ─── Cairn links (J1) — cross-link graph: source doc → EXTERNAL Cairn page ────
// A row per directed [[cairn://page-id]] link from a Parchment doc to a page in
// the user's other self-hosted app (Cairn). The target is an external pageId
// STRING, not a documents FK — Cairn pages are unknown to Parchment, so unlike
// doc_links there is no targetDocId FK. The composite PK (sourceDocId, pageId)
// dedupes multiple links to the same Cairn page. cairn_links_page_idx powers the
// backlinks query (which docs link this Cairn page?) that Cairn polls. The
// sourceDocId FK cascades on doc delete so the index never dangles.
export const cairnLinks = pgTable(
  'cairn_links',
  {
    sourceDocId: uuid('source_doc_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    pageId: text('page_id').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sourceDocId, t.pageId] }),
    index('cairn_links_page_idx').on(t.pageId),
  ],
)

// ─── Templates (G2) — reusable document starting points ──────────────────────
// Bundled templates ship in code (src/lib/docs/builtin-templates.ts); this table
// holds the user's own saved templates. `content` is ProseMirror `doc` JSON,
// instantiated into a fresh document by the from-template route. Owner-scoped via
// templates_owner_idx; cascades on user delete.
export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    content: jsonb('content'), // ProseMirror JSON
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('templates_owner_idx').on(t.ownerId)],
)

// ─── app_config (Phase 0, §1b) — instance-level ENCRYPTED config ─────────────
// All instance secrets (SMTP, S3, git-sync, OIDC client secret, etc.) live here
// encrypted via src/lib/crypto/secret-box.ts and accessed ONLY through
// src/lib/config/repo.ts. Created in migration 0020 (hand-written, NOT drizzle-kit
// managed). No other module reads/writes this table directly.
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Hint for the migration generator: ensure extensions exist.
export const _extensions = sql`create extension if not exists vector;`
