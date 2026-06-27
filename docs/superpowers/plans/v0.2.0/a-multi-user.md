# Group A — Multi-user / User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Parchment from a single-owner app into a multi-user workspace with RBAC roles (owner > admin > editor > viewer), per-document sharing ACLs, an invite→accept→set-password flow, full user-account lifecycle (create/invite/disable/delete/reset/transfer-ownership), and server-enforced authorization on every document and settings route — without ever locking out or breaking the existing single owner.

**Architecture:** Three new tables (`document_permissions`, `invites`, plus a `users.disabledAt` column) layered on the existing schema. Authorization stays **per-route / per-repo** (there is no `middleware.ts`; the app uses `requireUser` / `requireAdmin` / `authenticateRequest` guards and uniform `ownerId`-scoped repo queries). We add two central authorization primitives — `getCurrentUser()` (already exists as `getCurrentUser` in `session.ts`; we re-export a stable alias) and a new `canAccessDoc(user, doc, action)` gate plus an `authorizeDoc(user, docId, action)` route helper — and route every document read/write through them so a viewer cannot write, a non-shared user gets 403/404, a disabled user cannot log in, and role escalation is blocked. The single owner is preserved bit-for-bit: the `role` column already defaults to `'owner'`, sessions are already per-`userId`, and existing owner-only repo functions keep their `ownerId`-scoped fast path (the owner always satisfies `canAccessDoc`).

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), TypeScript 6 strict, Drizzle ORM + node-postgres (Postgres 18 / pgvector), `@node-rs/argon2` for hashing, Vitest (unit + Testcontainers integration), Playwright (e2e a11y / DOM probes). Migrations are hand-applied sequential SQL in `src/db/migrations/` (A's assigned index is **0022** per the reconciliation migration block; Phase 0 owns 0020 and 0021), replayed file-by-file by the integration harness.

## Global Constraints

- **Release branch:** all work lands on `release/v0.2.0` in a single PR per the build-discipline feedback; multi-arch images on GH-hosted runners. (One v0.2.0 tag — internal build order is C → **A** → B → …; Group A may assume C's external Postgres is in place but must not depend on B/SMTP at build time.)
- **Latest stable deps:** pin newest stable for any new dependency; do not add a dep if an existing one suffices (no new deps are required by this plan).
- **Migrations are append-only sequential SQL.** Never edit a prior migration. Add `00NN_<name>.sql` AND append a matching entry to `src/db/migrations/meta/_journal.json` (idx, version `"7"`, `when` = epoch-ms, `tag`, `breakpoints: true`). Regenerate with `pnpm drizzle-kit generate` when possible, else hand-write to match the style in `src/db/migrations/0019_breezy_reptil.sql`.
- **Authorization is server-enforced, never UI-only.** Every guard MUST live in a Server Component, Server Action, route handler, or repo function. UI hiding is cosmetic and never the security boundary.
- **Secrets/hashes never leave the server.** Password hashes, session token hashes, and invite token hashes are never returned to any client (mirror the `shares-repo` / `sessions-repo` discipline).
- **The owner is never lockable-out.** No action may delete, disable, demote, or remove the last `owner`. Ownership transfer is atomic (old owner → admin, new owner → owner, single transaction).
- **Defense in depth.** Even where the UI gates an action by role, the server action / route handler MUST re-check the role. IDOR is prevented by always resolving the target row and verifying access against the *current* user, never trusting a client-supplied owner/role/user id.
- **Email is Group B.** A1/A5 invites SEND email via `sendInviteEmail()` in `src/lib/auth/email.ts`, which dynamically imports `sendEmail` + `inviteEmailPayload` from B's `@/lib/email/send` (§1e). Group A MUST function (create user, generate invite link, copyable in the UI) even when SMTP is unconfigured — email send is best-effort and never blocks invite creation. A does NOT define its own `OutboundEmail` type; it uses B's `EmailPayload`. The dynamic import + no-op fallback means A builds and runs before B is merged.
- **Audit everything sensitive.** Use `logAudit(action, opts)` from `src/lib/audit/index.ts` for user create/invite/disable/delete/role-change/transfer and for share grant/revoke. The `AuditAction` union is a closed set owned by Phase-0 (`src/lib/audit/index.ts`); A does NOT extend or redefine it — A only emits events by calling `logAudit` with verb strings already in the Phase-0 union (`user.create`, `user.disable`, `user.delete`, `user.role`, `ownership.transfer`, `doc.share`, `doc.unshare`). Task 1b verifies the import path and confirms call-site verb correctness.

---

## File Structure

New files (created by this plan):

- `src/db/migrations/0022_multi_user.sql` — `users.disabled_at`, `document_permissions`, `invites`. (Phase 0 owns 0020 `app_config` and 0021 `audit_log` — A does NOT create those.)
- `src/lib/auth/roles.ts` — the role lattice, `roleRank`, `hasRoleAtLeast`, `isAdmin` (re-home), role-change guards.
- `src/lib/auth/current-user.ts` — stable `getCurrentUser()` / `requireUser()` re-exports for cross-group consumption.
- `src/lib/authz/doc-access.ts` — `DocAction`, `canAccessDoc`, `resolveDocAccess`, `authorizeDoc`, `authorizeDocRoute`.
- `src/lib/auth/users-repo.ts` — user CRUD: `listUsers`, `getUser`, `createUser`, `setUserRole`, `setUserDisabled`, `deleteUser`, `transferOwnership`, `countOwners`.
- `src/lib/auth/invites-repo.ts` — `createInvite`, `getInviteByToken`, `acceptInvite`, `revokeInvite`, `listInvites`, `expireInvites`.
- `src/lib/auth/email.ts` — `sendInviteEmail()` using B's `sendEmail`+`inviteEmailPayload` from `@/lib/email/send` (dynamic import, no-op fallback); NO local `OutboundEmail` type.
- `src/lib/docs/doc-permissions-repo.ts` — `grantDocPermission`, `revokeDocPermission`, `listDocPermissions`, `getDocPermission`, `setDocPermission`.
- `src/app/(app)/settings/users/page.tsx` — admin user-management UI (list + create/invite forms + row actions).
- `src/app/(app)/settings/users/actions.ts` — Server Actions: create/invite/disable/enable/delete/setRole/transferOwnership.
- `src/app/(app)/settings/users/_user-row.tsx` — client row (disable/enable/delete/role-select, optimistic).
- `src/app/(auth)/accept/[token]/page.tsx` — invite-accept landing (validate token, render set-password form).
- `src/app/(auth)/accept/[token]/actions.ts` — `acceptInviteAction` (set password, consume invite, create session).
- `src/app/api/docs/[id]/permissions/route.ts` — ACL REST (GET list / POST grant / PATCH role / DELETE revoke), owner/admin-gated.
- `src/components/share/DocPermissionsPanel.tsx` — sharing ACL UI (people picker + role select + revoke).
- Tests:
  - `tests/unit/roles.test.ts`, `tests/unit/doc-access.test.ts` — pure RBAC + access-decision logic.
  - `tests/integration/users.test.ts`, `tests/integration/invites.test.ts`, `tests/integration/doc-permissions.test.ts` — repo logic vs. real Postgres.
  - `tests/integration/authz-routes.test.ts` — route-level authz (viewer cannot write, non-shared → 404/403, disabled cannot auth).
  - `tests/e2e/users.authed.spec.ts`, `tests/e2e/sharing.authed.spec.ts` — DOM/computed-probe UI verification.

Modified files:

- `src/db/schema.ts` — add `disabledAt` to `users`; add `documentPermissions` + `invites` tables.
- `src/lib/auth/guard.ts` — re-home `isAdmin`/`ADMIN_ROLES` onto `roles.ts`; add `requireRole`; make `authenticateRequest` reject disabled users.
- `src/lib/auth/session.ts` — `getUserByToken` / `getCurrentUser` reject disabled users (defense in depth, single chokepoint).
- `src/lib/docs/repo.ts` — add ACL-aware reads (`getAccessibleDocument`, `listAccessibleDocuments`) without changing owner-only writes' signatures.
- `src/app/api/docs/[id]/route.ts` — replace bare `doc.ownerId !== user.id` with `authorizeDocRoute(user, id, 'view' | 'edit')`.
- `src/app/setup/actions.ts` — unchanged behaviorally but gains a comment: setup still creates the FIRST owner only; subsequent users come from the admin UI.
- `src/lib/audit/index.ts` — Phase-0 owns this file and the `AuditAction` union. A does NOT modify it; A's call-sites import `logAudit` from `@/lib/audit` and emit the verbs already present in the Phase-0 union.
- `src/app/(app)/settings/_nav.tsx` + `src/app/(app)/settings/admin/page.tsx` — link the new Users page (admin-only).

---

## Interfaces other groups consume

These are the stable, public surfaces Groups B/G/H/I/J import. Their signatures are frozen by this plan:

```ts
// src/lib/auth/current-user.ts
export type SessionUser = typeof schema.users.$inferSelect   // includes role, disabledAt
export function getCurrentUser(): Promise<SessionUser | null> // null when unauth OR disabled
export function requireUser(): Promise<SessionUser>           // redirects to /login otherwise

// src/lib/auth/roles.ts
export type Role = 'owner' | 'admin' | 'editor' | 'viewer'
export const ROLE_RANK: Record<Role, number>                 // owner:3 admin:2 editor:1 viewer:0
export function roleRank(role: string): number               // unknown role -> -1
export function hasRoleAtLeast(user: { role: string }, min: Role): boolean
export function isAdmin(user: { role: string }): boolean      // owner|admin

// src/lib/authz/doc-access.ts
export type DocAction = 'view' | 'comment' | 'edit' | 'manage' // manage = share/delete/rename
export function canAccessDoc(
  user: { id: string; role: string },
  doc: { ownerId: string },
  action: DocAction,
  perm: { role: 'viewer' | 'commenter' | 'editor' } | null, // the user's document_permissions row, if any
): boolean
// Resolves the doc + the user's permission row, then decides. Returns the doc on success, null on deny.
export function resolveDocAccess(
  user: SessionUser, docId: string, action: DocAction,
): Promise<typeof schema.documents.$inferSelect | null>
// Route helper: 401 if no user, 404 if doc missing or access denied (no existence leak).
export function authorizeDocRoute(
  user: SessionUser | null, docId: string, action: DocAction,
): Promise<{ ok: true; doc: Doc } | { ok: false; status: 401 | 404 }>
// Capability-set for H (comments) and any consumer needing a union of session + share-grant.
// Pass user and/or shareGrant; at least one must be provided.
export function getDocAccess(
  principals: { user?: SessionUser | null; shareGrant?: { role: DocPermRole } | null },
  docId: string,
): Promise<{ canView: boolean; canComment: boolean; canEdit: boolean; canManage: boolean }>
// H MUST import getDocAccess and authorizeDocRoute from '@/lib/authz/doc-access'.
// H MUST NOT create src/lib/docs/access.ts. Both signatures are frozen before Task 6.
```

---

## Task 1: Schema + migration foundation (roles, disabled users, ACLs, invites)

> **Migration ownership:** A owns ONLY migration **0022** (`users.disabled_at`, `document_permissions`, `invites`). Migrations 0020 (`app_config`) and 0021 (`audit_log` hardening + append-only trigger) are owned by **Phase 0** — A does NOT create, modify, or reference those. A's migration hand-numbers as `0022` against the integrated branch journal where 0019 is the last on-disk migration from the prior release and Phase 0 has added 0020/0021 before A runs.

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/migrations/0022_multi_user.sql`
- Modify: `src/db/migrations/meta/_journal.json`
- Test: `tests/integration/migration.test.ts` (extend) — column/table presence

**Interfaces:**
- Consumes: existing `users`, `documents` tables.
- Produces: `schema.users.disabledAt`, `schema.documentPermissions`, `schema.invites` for every later task.

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/migration.test.ts` (this suite already spins a Testcontainers Postgres and replays every `src/db/migrations/*.sql` in sorted order — follow the pattern at the top of `tests/integration/shares.test.ts`):

```ts
it('0022 adds disabled_at, document_permissions, invites', async () => {
  const cols = await client.query(
    `select column_name from information_schema.columns where table_name='users'`,
  )
  expect(cols.rows.map((r) => r.column_name)).toContain('disabled_at')

  const tables = await client.query(
    `select table_name from information_schema.tables where table_schema='public'`,
  )
  const names = tables.rows.map((r) => r.table_name)
  expect(names).toContain('document_permissions')
  expect(names).toContain('invites')

  // document_permissions PK is (doc_id, user_id)
  const pk = await client.query(
    `select a.attname from pg_index i
       join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid='document_permissions'::regclass and i.indisprimary`,
  )
  expect(pk.rows.map((r) => r.attname).sort()).toEqual(['doc_id', 'user_id'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/migration.test.ts -t "0022 adds"`
Expected: FAIL — `disabled_at`/`document_permissions`/`invites` do not exist.

- [ ] **Step 3: Add the schema definitions**

In `src/db/schema.ts`, add `disabledAt` to the `users` table (just below `role`):

```ts
  role: text('role').notNull().default('owner'),
  // A6: a disabled user keeps all rows but can never authenticate. null = active.
  // Enforced server-side in getUserByToken/authenticateRequest (defense in depth).
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
```

Then add two new tables (place after `documents`, before `auditLog`):

```ts
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
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm drizzle-kit generate` (writes `src/db/migrations/0022_*.sql` and updates `meta/`).
If drizzle-kit is unavailable in the sandbox, hand-write `src/db/migrations/0022_multi_user.sql` (match `0019`'s style) and append the journal entry:

```sql
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "document_permissions" (
	"doc_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_permissions_doc_id_user_id_pk" PRIMARY KEY("doc_id","user_id")
);--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'editor' NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);--> statement-breakpoint
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_permissions_user_idx" ON "document_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invites_email_idx" ON "invites" USING btree ("email");
```

Append to `src/db/migrations/meta/_journal.json` entries array:

```json
    {
      "idx": 22,
      "version": "7",
      "when": 1782000000000,
      "tag": "0022_multi_user",
      "breakpoints": true
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/migration.test.ts -t "0022 adds"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0022_multi_user.sql src/db/migrations/meta tests/integration/migration.test.ts
git commit -m "feat(db): add disabled_at, document_permissions, invites (A1/A4/A5/A6)"
```

---

## Task 1b: Verify audit verb availability and import path (A does NOT extend the union)

> **Reconciliation §1d (source of truth):** The `AuditAction` union is built ONCE in Phase 0 (`src/lib/audit/index.ts`) and is FROZEN before A runs. The Phase-0 union already includes ALL of A's verbs: `user.create`, `user.disable`, `user.delete`, `user.role`, `ownership.transfer`, `doc.share`, `doc.unshare` (plus `user.invite`, `user.enable` if Phase 0 incorporates them; otherwise A must coordinate with the Phase-0 author to add those two before shipping). **A does NOT modify `src/lib/audit/index.ts`, does NOT append to the union, and does NOT define a local `AuditAction` type extension.** A only calls `logAudit(verb, opts)` from `@/lib/audit`, passing the exact dotted strings already in the union.

**Files:**
- No changes to `src/lib/audit/index.ts` — Phase-0 owns it.
- Test: `tests/unit/audit-actions.test.ts` (create) — verifies the Phase-0 union already contains A's verbs, catching a missing Phase-0 verb before the integration phase.

**Interfaces:**
- Consumes: `AuditAction` union from `@/lib/audit` (Phase-0 built).
- Produces: confirmation that `logAudit` call-sites in Tasks 7/9/10 use ONLY canonical dotted strings.

- [ ] **Step 1: Write the compile-time verification test**

```ts
// tests/unit/audit-actions.test.ts
import { describe, expect, it } from 'vitest'
import type { AuditAction } from '@/lib/audit'

describe('A audit verbs — Phase-0 union already includes these (compile-time check)', () => {
  it('Phase-0 union contains all verbs A emits', () => {
    // This test is a compile-time assertion: if any of these literals is NOT in the
    // Phase-0 AuditAction union, TypeScript will error here — catching a missing
    // Phase-0 verb before the integration runs.
    // A does NOT extend the union; these strings must already exist in @/lib/audit.
    const verbs: AuditAction[] = [
      'user.create',
      'user.invite',   // coordinate with Phase-0 author if this errors
      'user.disable',
      'user.enable',   // coordinate with Phase-0 author if this errors
      'user.delete',
      'user.role',
      'ownership.transfer',
      'doc.share',
      'doc.unshare',
    ]
    expect(verbs.length).toBe(9)
  })
})
```

- [ ] **Step 2: Run test — expect PASS (Phase-0 must have shipped these verbs)**

Run: `pnpm vitest run tests/unit/audit-actions.test.ts`
Expected: PASS. If it fails with a TS error, the Phase-0 union is missing one or more of A's verbs — **do NOT add the missing verb to `src/lib/audit/index.ts` yourself**; coordinate with the Phase-0 author to add it there, then re-run.

- [ ] **Step 3: Confirm A's call-sites use EXACTLY the canonical dotted strings**

Verify each `logAudit(...)` call in A's code uses only the exact verb strings listed above (all dotted — never underscored, never `_change`/`_grant` variants). The call-sites in this plan are:

| File | Verb used | Canonical? |
|---|---|---|
| `src/app/(auth)/accept/[token]/actions.ts` | `'user.create'` | ✓ |
| `src/app/(app)/settings/users/actions.ts` | `'user.create'` | ✓ |
| `src/app/(app)/settings/users/actions.ts` | `'user.invite'` | ✓ (coordinate if Phase-0 is missing it) |
| `src/app/(app)/settings/users/actions.ts` | `'user.role'` | ✓ |
| `src/app/(app)/settings/users/actions.ts` | `'user.disable'` | ✓ |
| `src/app/(app)/settings/users/actions.ts` | `'user.enable'` | ✓ (coordinate if Phase-0 is missing it) |
| `src/app/(app)/settings/users/actions.ts` | `'user.delete'` | ✓ |
| `src/app/(app)/settings/users/actions.ts` | `'ownership.transfer'` | ✓ |
| `src/app/api/docs/[id]/permissions/route.ts` | `'doc.share'` | ✓ |
| `src/app/api/docs/[id]/permissions/route.ts` | `'doc.unshare'` | ✓ |

There are NO underscored variants (`user.role_change`, `doc.permission_grant`, etc.) in A's call-sites. **If any new `logAudit` call is added during implementation, it MUST use a verb already in the Phase-0 union — never invent a new string.**

- [ ] **Step 4: Confirm no local `AuditAction` extension**

Grep to ensure A introduces no parallel type:

```bash
grep -rn "AuditAction\s*=" src/app/\(app\)/settings/users src/app/\(auth\)/accept src/app/api/docs/\[id\]/permissions src/lib/auth src/lib/docs
```

Expected: zero results. The only definition of `AuditAction` lives in `src/lib/audit/index.ts` (Phase-0).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/audit-actions.test.ts
git commit -m "test(audit): compile-time check that Phase-0 union includes A's logAudit verbs"
```

---

## Task 2: Role lattice (`roles.ts`) — pure RBAC primitives

**Files:**
- Create: `src/lib/auth/roles.ts`
- Test: `tests/unit/roles.test.ts`

**Interfaces:**
- Produces: `Role`, `ROLE_RANK`, `roleRank`, `hasRoleAtLeast`, `isAdmin`, `canAssignRole`, `WORKSPACE_ROLES`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/roles.test.ts
import { describe, expect, it } from 'vitest'
import {
  canAssignRole, hasRoleAtLeast, isAdmin, ROLE_RANK, roleRank,
} from '@/lib/auth/roles'

describe('A2 role lattice', () => {
  it('ranks owner > admin > editor > viewer', () => {
    expect(ROLE_RANK.owner).toBeGreaterThan(ROLE_RANK.admin)
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.editor)
    expect(ROLE_RANK.editor).toBeGreaterThan(ROLE_RANK.viewer)
  })
  it('unknown role ranks below viewer', () => {
    expect(roleRank('banana')).toBe(-1)
  })
  it('hasRoleAtLeast is inclusive of equal rank', () => {
    expect(hasRoleAtLeast({ role: 'admin' }, 'admin')).toBe(true)
    expect(hasRoleAtLeast({ role: 'editor' }, 'admin')).toBe(false)
    expect(hasRoleAtLeast({ role: 'owner' }, 'viewer')).toBe(true)
  })
  it('isAdmin is owner or admin only', () => {
    expect(isAdmin({ role: 'owner' })).toBe(true)
    expect(isAdmin({ role: 'admin' })).toBe(true)
    expect(isAdmin({ role: 'editor' })).toBe(false)
    expect(isAdmin({ role: 'viewer' })).toBe(false)
  })
  it('canAssignRole blocks privilege escalation: actor cannot grant at or above own rank (except owner)', () => {
    // an admin may create/assign up to editor, never admin or owner
    expect(canAssignRole({ role: 'admin' }, 'editor')).toBe(true)
    expect(canAssignRole({ role: 'admin' }, 'viewer')).toBe(true)
    expect(canAssignRole({ role: 'admin' }, 'admin')).toBe(false)
    expect(canAssignRole({ role: 'admin' }, 'owner')).toBe(false)
    // owner may assign any non-owner role; 'owner' itself only via transferOwnership
    expect(canAssignRole({ role: 'owner' }, 'admin')).toBe(true)
    expect(canAssignRole({ role: 'owner' }, 'owner')).toBe(false)
    // editor/viewer may assign nothing
    expect(canAssignRole({ role: 'editor' }, 'viewer')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/roles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/auth/roles.ts
// A2: workspace RBAC. owner > admin > editor > viewer. Pure, dependency-free so
// it is trivially unit-testable AND importable from both server and client code
// (it touches no db). All authorization *decisions* funnel through these helpers
// so the lattice has one source of truth.

export type Role = 'owner' | 'admin' | 'editor' | 'viewer'

export const WORKSPACE_ROLES: readonly Role[] = ['owner', 'admin', 'editor', 'viewer']

export const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  editor: 1,
  viewer: 0,
}

// Rank of an arbitrary string. An unrecognized role ranks BELOW viewer (-1) so a
// corrupt/legacy value can never accidentally satisfy a privilege check.
export function roleRank(role: string): number {
  return role in ROLE_RANK ? ROLE_RANK[role as Role] : -1
}

// True when the user's role is >= the minimum required role (inclusive).
export function hasRoleAtLeast(user: { role: string }, min: Role): boolean {
  return roleRank(user.role) >= ROLE_RANK[min]
}

// Admin-level = owner or admin. The single definition; guard.ts re-exports this.
export function isAdmin(user: { role: string }): boolean {
  return hasRoleAtLeast(user, 'admin')
}

// Anti-escalation: an actor may only assign a role STRICTLY BELOW their own rank,
// and never the 'owner' role (ownership changes hands only via transferOwnership).
// This blocks an admin from minting another admin/owner and blocks any non-admin
// from assigning roles at all.
export function canAssignRole(actor: { role: string }, target: Role): boolean {
  if (target === 'owner') return false
  return roleRank(actor.role) > ROLE_RANK[target]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/roles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Re-home `isAdmin` in `guard.ts` (no behavior change)**

In `src/lib/auth/guard.ts`, replace the local `ADMIN_ROLES`/`isAdmin` with a re-export and add `requireRole`:

```ts
import { hasRoleAtLeast, isAdmin, type Role } from '@/lib/auth/roles'
export { isAdmin }

// For Server Components / Server Actions requiring a minimum role. Redirects
// unauthenticated → /login and under-privileged → '/'. Returns the live user row.
export async function requireRole(min: Role): Promise<SessionUser> {
  const user = await requireUser()
  if (!hasRoleAtLeast(user, min)) redirect('/')
  return user
}
```

Keep `requireAdmin` but implement it via `requireRole('admin')`. Run the full unit suite to confirm nothing regressed:

Run: `pnpm vitest run tests/unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/guard.ts tests/unit/roles.test.ts
git commit -m "feat(auth): role lattice owner>admin>editor>viewer + requireRole (A2)"
```

---

## Task 3: Disabled-user enforcement at the auth chokepoints

**Files:**
- Modify: `src/lib/auth/session.ts` (`getUserByToken`)
- Modify: `src/lib/auth/guard.ts` (`authenticateRequest`)
- Test: `tests/integration/users.test.ts` (create; first test)

**Interfaces:**
- Consumes: `users.disabledAt` (Task 1).
- Produces: the guarantee that `getCurrentUser()` / `authenticateRequest()` return `null` for a disabled user.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/users.test.ts` with the Testcontainers boilerplate copied from `tests/integration/shares.test.ts` (start `pgvector/pgvector:pg18`, replay migrations, set `process.env.DATABASE_URL`). Then:

```ts
it('a disabled user cannot be resolved from a valid session token', async () => {
  const { db, schema } = await import('@/db')
  const { createSession, getUserByToken } = await import('@/lib/auth/session')

  // create an active user + a session row directly (bypass cookie helpers)
  const [u] = await db.insert(schema.users)
    .values({ email: 'dis@p.local', name: 'Dis', role: 'editor' })
    .returning({ id: schema.users.id })
  const token = 'rawtoken-disabled-test'
  const { createHash } = await import('node:crypto')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await db.insert(schema.sessions).values({
    userId: u!.id, tokenHash, expiresAt: new Date(Date.now() + 3_600_000),
  })

  expect(await getUserByToken(token)).not.toBeNull() // active → resolves

  await db.update(schema.users)
    .set({ disabledAt: new Date() })
    .where(eq(schema.users.id, u!.id))

  expect(await getUserByToken(token)).toBeNull()     // disabled → null
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/users.test.ts -t "disabled user cannot be resolved"`
Expected: FAIL — disabled user still resolves.

- [ ] **Step 3: Enforce in `getUserByToken`**

In `src/lib/auth/session.ts`, the second query in `getUserByToken` must exclude disabled users. Add `isNull` to the drizzle import and gate:

```ts
import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm'
// ...
  const [user] = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.id, session.userId), isNull(schema.users.disabledAt)))
    .limit(1)

  return user ?? null
```

In `src/lib/auth/guard.ts`, `authenticateRequest` resolves PATs via `verifyPat` and cookies via `getUserByToken`. The cookie path is now covered. Add a disabled check after the PAT branch resolves a user:

```ts
    const user = await verifyPat(token)
    if (user && user.disabledAt === null) return user
```

(Verified: `verifyPat` returns `PatUser = typeof schema.users.$inferSelect` via a full `.select().from(schema.users)`, so `disabledAt` is already present on the returned row after Task 1 — no change to `verifyPat`'s select is needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/users.test.ts -t "disabled user cannot be resolved"`
Expected: PASS.

- [ ] **Step 5: Add the login-path test + fix**

Add to `tests/integration/users.test.ts`:

```ts
it('login server action rejects a disabled user with the generic error', async () => {
  const { db, schema } = await import('@/db')
  const { hashPassword } = await import('@/lib/auth/password')
  const { login } = await import('@/app/(auth)/login/actions')
  await db.insert(schema.users).values({
    email: 'login-dis@p.local', name: 'LD', role: 'editor',
    passwordHash: await hashPassword('correct-horse'), disabledAt: new Date(),
  })
  const fd = new FormData()
  fd.set('email', 'login-dis@p.local'); fd.set('password', 'correct-horse')
  const res = await login(null, fd)
  expect(res).toEqual({ error: 'Invalid email or password.' }) // no oracle
})
```

In `src/app/(auth)/login/actions.ts`, after fetching `user`, treat a disabled user exactly like a bad credential (no separate message — avoid an account-status oracle):

```ts
  const ok =
    user && user.disabledAt === null && user.passwordHash
      ? await verifyPassword(user.passwordHash, password)
      : false

  if (!user || user.disabledAt !== null || !ok) {
    return { error: 'Invalid email or password.' }
  }
```

- [ ] **Step 6: Run + commit**

Run: `pnpm vitest run tests/integration/users.test.ts`
Expected: PASS (2 tests).

```bash
git add src/lib/auth/session.ts src/lib/auth/guard.ts src/app/\(auth\)/login/actions.ts tests/integration/users.test.ts
git commit -m "feat(auth): disabled users cannot authenticate (cookie, PAT, login) (A6)"
```

---

## Task 4: `getCurrentUser()` stable export + `current-user.ts`

**Files:**
- Create: `src/lib/auth/current-user.ts`
- Test: `tests/unit/current-user-export.test.ts`

**Interfaces:**
- Produces: the cross-group stable `getCurrentUser`, `requireUser`, `SessionUser` import surface.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/current-user-export.test.ts
import { describe, expect, it } from 'vitest'

describe('getCurrentUser stable export', () => {
  it('re-exports getCurrentUser and requireUser', async () => {
    const mod = await import('@/lib/auth/current-user')
    expect(typeof mod.getCurrentUser).toBe('function')
    expect(typeof mod.requireUser).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/current-user-export.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the re-export module**

```ts
// src/lib/auth/current-user.ts
// Stable public surface for "who is the current user" — the single import path
// other groups (B/G/H/I/J) should use. Today getCurrentUser lives in session.ts
// and requireUser in guard.ts; this module fixes the import path so internal
// refactors don't churn every consumer. getCurrentUser already returns null for
// missing/expired/pending AND (Task 3) disabled sessions.
import 'server-only'
export type { SessionUser } from '@/lib/auth/session'
export { getCurrentUser } from '@/lib/auth/session'
export { requireUser, requireRole, requireAdmin } from '@/lib/auth/guard'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/current-user-export.test.ts`
Expected: PASS. (Note: this test imports a `server-only` module under vitest's `node` env — `server-only` is a no-op outside a real RSC bundle, so the import resolves; if the harness throws on `server-only`, drop the `import 'server-only'` line — the consumers are all server modules regardless.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/current-user.ts tests/unit/current-user-export.test.ts
git commit -m "feat(auth): stable getCurrentUser/requireUser export surface"
```

---

## Task 5: Document-access decision engine (`doc-access.ts`)

**Files:**
- Create: `src/lib/authz/doc-access.ts`
- Modify: `src/lib/docs/doc-permissions-repo.ts` (created in Task 7 — this task creates a minimal `getDocPermission` first, expanded in Task 7)
- Test: `tests/unit/doc-access.test.ts`

**Interfaces:**
- Consumes: `Role`/`hasRoleAtLeast` (Task 2), `documents`/`documentPermissions` schema (Task 1).
- Produces: `DocAction`, `DocPermRole`, `canAccessDoc`, `resolveDocAccess`, `authorizeDocRoute`.

- [ ] **Step 1: Write the failing test (pure decision function)**

```ts
// tests/unit/doc-access.test.ts
import { describe, expect, it } from 'vitest'
import { canAccessDoc } from '@/lib/authz/doc-access'

const owner = { id: 'u-owner', role: 'editor' }   // owner of the doc, any workspace role
const doc = { ownerId: 'u-owner' }
const stranger = { id: 'u-stranger', role: 'editor' }
const wsAdmin = { id: 'u-admin', role: 'admin' }

describe('A4 canAccessDoc', () => {
  it('the doc owner can do everything', () => {
    for (const a of ['view', 'comment', 'edit', 'manage'] as const)
      expect(canAccessDoc(owner, doc, a, null)).toBe(true)
  })
  it('a workspace admin can manage any doc (oversight)', () => {
    expect(canAccessDoc(wsAdmin, doc, 'manage', null)).toBe(true)
    expect(canAccessDoc(wsAdmin, doc, 'edit', null)).toBe(true)
  })
  it('a stranger with NO permission row is denied every action', () => {
    for (const a of ['view', 'comment', 'edit', 'manage'] as const)
      expect(canAccessDoc(stranger, doc, a, null)).toBe(false)
  })
  it('a viewer grant allows view only, never comment/edit/manage', () => {
    const perm = { role: 'viewer' as const }
    expect(canAccessDoc(stranger, doc, 'view', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'comment', perm)).toBe(false)
    expect(canAccessDoc(stranger, doc, 'edit', perm)).toBe(false)
    expect(canAccessDoc(stranger, doc, 'manage', perm)).toBe(false)
  })
  it('a commenter grant allows view+comment, never edit/manage', () => {
    const perm = { role: 'commenter' as const }
    expect(canAccessDoc(stranger, doc, 'view', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'comment', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'edit', perm)).toBe(false)
    expect(canAccessDoc(stranger, doc, 'manage', perm)).toBe(false)
  })
  it('an editor grant allows view+comment+edit, but NOT manage (sharing stays owner/admin)', () => {
    const perm = { role: 'editor' as const }
    expect(canAccessDoc(stranger, doc, 'edit', perm)).toBe(true)
    expect(canAccessDoc(stranger, doc, 'manage', perm)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/doc-access.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the decision engine**

```ts
// src/lib/authz/doc-access.ts
// A4: the SINGLE authority on "may this user perform this action on this doc".
// Two layers:
//   1) canAccessDoc — a PURE function (unit-tested) given the user, the doc's
//      ownerId, the action, and the user's document_permissions row (or null).
//   2) resolveDocAccess / authorizeDocRoute — async wrappers that fetch the doc +
//      the permission row and apply (1). Used by every server route/action that
//      touches a doc. They NEVER leak existence: a denied access is indistinguish-
//      able from a missing doc (both → null / 404).
//
// This is access control. Read the whole file before changing it.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { isAdmin } from '@/lib/auth/roles'
import type { SessionUser } from '@/lib/auth/session'

export type DocAction = 'view' | 'comment' | 'edit' | 'manage'
export type DocPermRole = 'viewer' | 'commenter' | 'editor'

export type Doc = typeof schema.documents.$inferSelect

// The set of actions each doc-permission role unlocks (in addition to the always-
// implied lower ones). 'manage' (share/delete/rename) is intentionally reserved
// for the doc owner and workspace admins — an 'editor' grant can edit content but
// cannot re-share or delete someone else's doc.
const PERM_ALLOWS: Record<DocPermRole, ReadonlySet<DocAction>> = {
  viewer: new Set<DocAction>(['view']),
  commenter: new Set<DocAction>(['view', 'comment']),
  editor: new Set<DocAction>(['view', 'comment', 'edit']),
}

export function canAccessDoc(
  user: { id: string; role: string },
  doc: { ownerId: string },
  action: DocAction,
  perm: { role: DocPermRole } | null,
): boolean {
  // 1) The doc owner has full control.
  if (doc.ownerId === user.id) return true
  // 2) Workspace owner/admin get oversight over every doc (manage included).
  if (isAdmin(user)) return true
  // 3) Otherwise the explicit document_permissions grant decides. No row = no access.
  if (!perm) return false
  return PERM_ALLOWS[perm.role].has(action)
}

// Fetch the doc + the caller's permission row, then decide. Returns the doc when
// allowed, else null. A missing doc and a denied doc both return null.
export async function resolveDocAccess(
  user: SessionUser,
  docId: string,
  action: DocAction,
): Promise<Doc | null> {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, docId))
    .limit(1)
  if (!doc) return null

  // Owner / admin short-circuit avoids the perm lookup entirely.
  if (doc.ownerId === user.id || isAdmin(user)) {
    return canAccessDoc(user, doc, action, null) ? doc : null
  }

  const [perm] = await db
    .select({ role: schema.documentPermissions.role })
    .from(schema.documentPermissions)
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, user.id),
      ),
    )
    .limit(1)

  const permRow = perm ? { role: perm.role as DocPermRole } : null
  return canAccessDoc(user, doc, action, permRow) ? doc : null
}

// Route helper. 401 when unauthenticated; 404 when the doc is missing OR access is
// denied (no existence oracle). On success returns the resolved doc.
export async function authorizeDocRoute(
  user: SessionUser | null,
  docId: string,
  action: DocAction,
): Promise<{ ok: true; doc: Doc } | { ok: false; status: 401 | 404 }> {
  if (!user) return { ok: false, status: 401 }
  const doc = await resolveDocAccess(user, docId, action)
  if (!doc) return { ok: false, status: 404 }
  return { ok: true, doc }
}

// Capability-set: H imports this to check all four capabilities in one call,
// folding together the session user AND an optional share-token grant.
// At least one of user/shareGrant must be non-null.
// H MUST import this from '@/lib/authz/doc-access' — never create a fork.
export async function getDocAccess(
  principals: { user?: SessionUser | null; shareGrant?: { role: DocPermRole } | null },
  docId: string,
): Promise<{ canView: boolean; canComment: boolean; canEdit: boolean; canManage: boolean }> {
  const { user, shareGrant } = principals
  const deny = { canView: false, canComment: false, canEdit: false, canManage: false }

  // Fetch doc once
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.id, docId))
    .limit(1)
  if (!doc) return deny

  // Compute best permission row from session user (if present)
  let bestPerm: { role: DocPermRole } | null = shareGrant ?? null
  if (user) {
    // owner / admin short-circuit: full access
    if (doc.ownerId === user.id || isAdmin(user)) {
      return { canView: true, canComment: true, canEdit: true, canManage: true }
    }
    // look up explicit document_permissions row
    const [row] = await db
      .select({ role: schema.documentPermissions.role })
      .from(schema.documentPermissions)
      .where(
        and(
          eq(schema.documentPermissions.docId, docId),
          eq(schema.documentPermissions.userId, user.id),
        ),
      )
      .limit(1)
    if (row) {
      // take the more permissive of session perm vs share grant
      const sessionPerm = { role: row.role as DocPermRole }
      bestPerm = (bestPerm && PERM_ALLOWS[bestPerm.role].size >= PERM_ALLOWS[sessionPerm.role].size)
        ? bestPerm
        : sessionPerm
    }
  }

  if (!bestPerm) return deny
  const allowed = PERM_ALLOWS[bestPerm.role]
  return {
    canView: allowed.has('view'),
    canComment: allowed.has('comment'),
    canEdit: allowed.has('edit'),
    canManage: false, // share-grant or doc-perm never grants manage; only owner/admin does
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/doc-access.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

> **Freeze point:** Both `authorizeDocRoute` and `getDocAccess` signatures are now locked. H will import them. Do NOT change these signatures after this commit without coordinating with H.

```bash
git add src/lib/authz/doc-access.ts tests/unit/doc-access.test.ts
git commit -m "feat(authz): canAccessDoc + resolveDocAccess + authorizeDocRoute + getDocAccess capability-set (A4)"
```

---

## Task 6: Wire `authorizeDocRoute` into the document API route (defense in depth)

**Files:**
- Modify: `src/app/api/docs/[id]/route.ts`
- Test: `tests/integration/authz-routes.test.ts` (create)

**Interfaces:**
- Consumes: `authorizeDocRoute` (Task 5).
- Produces: an ACL-enforced `/api/docs/[id]` GET/PUT.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/authz-routes.test.ts` (Testcontainers boilerplate as before; seed an `owner`, a `viewer` user with a `viewer` doc-permission, a `stranger` with none). Build a real `NextRequest` with a Bearer PAT for each actor (use `createPat` from `src/lib/auth/pat.ts` to mint a token, then set `Authorization: Bearer <token>`):

```ts
import { NextRequest } from 'next/server'

it('GET /api/docs/:id — viewer-with-grant can read, stranger gets 404', async () => {
  const { GET } = await import('@/app/api/docs/[id]/route')
  const ctx = { params: Promise.resolve({ id: docId }) }

  const okRes = await GET(bearer(viewerToken), ctx)        // viewer has a viewer grant
  expect(okRes.status).toBe(200)

  const denyRes = await GET(bearer(strangerToken), ctx)    // no grant
  expect(denyRes.status).toBe(404)                          // no existence leak
})

it('PUT /api/docs/:id — a VIEWER grant cannot write (404), an EDITOR grant can (204)', async () => {
  const { PUT } = await import('@/app/api/docs/[id]/route')
  const ctx = { params: Promise.resolve({ id: docId }) }
  const body = JSON.stringify({ contentJson: {}, markdown: 'x' })

  const viewerPut = await PUT(bearerJson(viewerToken, body), ctx)
  expect(viewerPut.status).toBe(404)                        // view grant ≠ edit

  const editorPut = await PUT(bearerJson(editorToken, body), ctx)
  expect(editorPut.status).toBe(204)
})
```

(Provide `bearer`/`bearerJson` helpers building `new NextRequest('http://x/api/docs/'+docId, { headers, method, body })`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/authz-routes.test.ts`
Expected: FAIL — current route only allows `doc.ownerId === user.id`, so the viewer/editor grants 404 even for reads, and PUT does not distinguish view vs edit.

- [ ] **Step 3: Rewrite the route to use `authorizeDocRoute`**

```ts
// src/app/api/docs/[id]/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { authorizeDocRoute } from '@/lib/authz/doc-access'
import { saveDocument } from '@/lib/docs/repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'view')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })
  return NextResponse.json(gate.doc)
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'edit')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })

  const body = (await req.json()) as { contentJson?: unknown; markdown?: string; title?: string }
  await saveDocument(id, {
    contentJson: body.contentJson ?? {},
    markdown: String(body.markdown ?? ''),
    ...(body.title ? { title: body.title } : {}),
  })
  return new NextResponse(null, { status: 204 })
}
```

Note: a 401 (no user) now returns `{status:401}` from the gate; a missing/denied doc returns 404 — matching prior `not_found` behavior while adding ACL support.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/authz-routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Audit the other doc-touching routes (security sweep — no code change unless a hole is found)**

Run a sweep and confirm each route that reads/writes a doc by id goes through an owner/ACL check. For each, the check is `eq(ownerId, user.id)` (owner-only is acceptable for owner-private operations) OR `authorizeDocRoute`/`resolveDocAccess` (when sharing should apply). Document the decision per route in the commit body.

```bash
grep -rn "params: Promise<{ id\|docId\|\[id\]\|\[docId\]" src/app/api/docs src/app/api/export src/app/api/shares src/app/api/templates 2>/dev/null
```

Routes to verify go through a guard (list, do NOT silently skip):
- `src/app/api/docs/[id]/route.ts` (done above)
- `src/app/api/docs/bulk/route.ts`, `src/app/api/docs/[id]/*` subroutes (versions, comments, watermark, custom-css) — each must call `resolveDocAccess` with the right action (`edit` for mutations, `view` for reads, `manage` for share/delete). Where a subroute today does `eq(ownerId)`, decide per feature whether sharing should apply; if yes, switch to `resolveDocAccess`. If a subroute is genuinely owner-only (e.g. watermark/custom-css are owner-author features), leave the `ownerId` scope AND add a one-line comment asserting that intent.
- `src/app/api/export/**` — exporting a doc must require at least `view` access.
- `src/app/api/share/[token]/route.ts` — unchanged (anonymous capability link; already server-gated by `resolveShare`/`verifySharePassword`).

Add tests in `tests/integration/authz-routes.test.ts` for any subroute you switch to `resolveDocAccess` (e.g. "stranger cannot read versions → 404", "viewer cannot post a comment when comment is gated"). If a subroute stays owner-only, add a test that a workspace admin still passes (admin oversight) ONLY if you routed it through `resolveDocAccess`; owner-only routes keep their existing tests.

- [ ] **Step 6: Run + commit**

Run: `pnpm vitest run tests/integration/authz-routes.test.ts`
Expected: PASS.

```bash
git add src/app/api/docs tests/integration/authz-routes.test.ts
git commit -m "feat(authz): enforce canAccessDoc on doc routes; sweep doc subroutes (A4)"
```

---

## Task 7: Document-permissions repo + ACL REST endpoint

**Files:**
- Create: `src/lib/docs/doc-permissions-repo.ts`
- Create: `src/app/api/docs/[id]/permissions/route.ts`
- Test: `tests/integration/doc-permissions.test.ts`

**Interfaces:**
- Consumes: `documentPermissions` schema (Task 1), `authorizeDocRoute` (Task 5), `canAssignRole`-style guard (this task gates by `manage`), `logAudit` (Task 1b).
- Produces: `grantDocPermission`, `setDocPermission`, `revokeDocPermission`, `listDocPermissions`, `getDocPermission`.

- [ ] **Step 1: Write the failing repo test**

```ts
// tests/integration/doc-permissions.test.ts  (Testcontainers boilerplate as before)
it('grant → list → setRole → revoke round-trips and is doc-scoped', async () => {
  const repo = await import('@/lib/docs/doc-permissions-repo')

  await repo.grantDocPermission({ docId, userId: viewerId, role: 'viewer', grantedBy: ownerId })
  let perms = await repo.listDocPermissions(docId)
  expect(perms.map((p) => p.userId)).toContain(viewerId)
  expect(perms.find((p) => p.userId === viewerId)?.role).toBe('viewer')

  await repo.setDocPermission(docId, viewerId, 'editor')
  expect((await repo.getDocPermission(docId, viewerId))?.role).toBe('editor')

  // grant on a DIFFERENT doc does not leak into this doc's list
  await repo.grantDocPermission({ docId: otherDocId, userId: viewerId, role: 'viewer', grantedBy: ownerId })
  perms = await repo.listDocPermissions(docId)
  expect(perms.length).toBe(1)

  await repo.revokeDocPermission(docId, viewerId)
  expect(await repo.getDocPermission(docId, viewerId)).toBeNull()
})

it('granting an existing (doc,user) updates the role (upsert), not a duplicate', async () => {
  const repo = await import('@/lib/docs/doc-permissions-repo')
  await repo.grantDocPermission({ docId, userId: editorId, role: 'viewer', grantedBy: ownerId })
  await repo.grantDocPermission({ docId, userId: editorId, role: 'editor', grantedBy: ownerId })
  const list = await repo.listDocPermissions(docId)
  expect(list.filter((p) => p.userId === editorId).length).toBe(1)
  expect((await repo.getDocPermission(docId, editorId))?.role).toBe('editor')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/doc-permissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the repo**

```ts
// src/lib/docs/doc-permissions-repo.ts
// A4 ACL store. No 'server-only' guard so it is integration-testable (mirrors
// shares-repo). Only server routes/actions import it. Enrolment of who-may-grant
// is enforced at the route/action layer (manage access); this repo is pure CRUD.
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { DocPermRole } from '@/lib/authz/doc-access'

export type DocPermission = typeof schema.documentPermissions.$inferSelect

export async function grantDocPermission(input: {
  docId: string
  userId: string
  role: DocPermRole
  grantedBy: string
}): Promise<void> {
  // Upsert: one role per (doc,user). A repeat grant updates the role in place.
  await db
    .insert(schema.documentPermissions)
    .values({
      docId: input.docId,
      userId: input.userId,
      role: input.role,
      grantedBy: input.grantedBy,
    })
    .onConflictDoUpdate({
      target: [schema.documentPermissions.docId, schema.documentPermissions.userId],
      set: { role: input.role, grantedBy: input.grantedBy },
    })
}

export async function setDocPermission(
  docId: string,
  userId: string,
  role: DocPermRole,
): Promise<void> {
  await db
    .update(schema.documentPermissions)
    .set({ role })
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, userId),
      ),
    )
}

export async function revokeDocPermission(docId: string, userId: string): Promise<void> {
  await db
    .delete(schema.documentPermissions)
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, userId),
      ),
    )
}

export async function getDocPermission(
  docId: string,
  userId: string,
): Promise<DocPermission | null> {
  const [row] = await db
    .select()
    .from(schema.documentPermissions)
    .where(
      and(
        eq(schema.documentPermissions.docId, docId),
        eq(schema.documentPermissions.userId, userId),
      ),
    )
    .limit(1)
  return row ?? null
}

// Joined with users so the share UI can show name/email per grant. Never returns
// password/token fields — only id/name/email/role.
export async function listDocPermissions(docId: string): Promise<
  Array<{ userId: string; name: string; email: string; role: DocPermRole }>
> {
  const rows = await db
    .select({
      userId: schema.documentPermissions.userId,
      role: schema.documentPermissions.role,
      name: schema.users.name,
      email: schema.users.email,
    })
    .from(schema.documentPermissions)
    .innerJoin(schema.users, eq(schema.users.id, schema.documentPermissions.userId))
    .where(eq(schema.documentPermissions.docId, docId))
  return rows.map((r) => ({ ...r, role: r.role as DocPermRole }))
}
```

- [ ] **Step 4: Run repo test to verify it passes**

Run: `pnpm vitest run tests/integration/doc-permissions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing ACL-route test**

Append to `tests/integration/doc-permissions.test.ts`:

```ts
it('ACL route requires manage: owner can grant, editor-grant user gets 404, viewer-grant 404', async () => {
  const { POST, GET, DELETE } = await import('@/app/api/docs/[id]/permissions/route')
  const ctx = { params: Promise.resolve({ id: docId }) }

  // owner grants stranger a viewer role
  const grant = await POST(
    bearerJson(ownerToken, JSON.stringify({ userId: strangerId, role: 'viewer' })),
    ctx,
  )
  expect(grant.status).toBe(201)

  // a user with only an EDITOR doc-grant cannot manage sharing
  const denied = await POST(
    bearerJson(editorToken, JSON.stringify({ userId: strangerId, role: 'editor' })),
    ctx,
  )
  expect(denied.status).toBe(404) // manage denied → 404, no existence leak

  // list (manage) by owner returns the grant
  const list = await GET(bearer(ownerToken), ctx)
  expect(list.status).toBe(200)
  const body = await list.json()
  expect(body.permissions.some((p: { userId: string }) => p.userId === strangerId)).toBe(true)

  // cannot grant a doc-role above 'editor' (no 'admin'/'owner' doc-roles exist)
  const bad = await POST(
    bearerJson(ownerToken, JSON.stringify({ userId: strangerId, role: 'owner' })),
    ctx,
  )
  expect(bad.status).toBe(400)

  // owner revokes
  const del = await DELETE(
    bearerJson(ownerToken, JSON.stringify({ userId: strangerId })),
    ctx,
  )
  expect(del.status).toBe(204)
})
```

- [ ] **Step 6: Write the ACL route**

```ts
// src/app/api/docs/[id]/permissions/route.ts
// A4: manage a doc's ACL. ALL methods require 'manage' access on the doc (owner or
// workspace admin) via authorizeDocRoute — sharing is never something an 'editor'
// doc-grant can do. The doc-role body value is validated against DOC_PERM_ROLES;
// 'owner'/'admin' are NOT doc-roles and are rejected 400.
import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { authorizeDocRoute } from '@/lib/authz/doc-access'
import { logAudit } from '@/lib/audit'
import {
  grantDocPermission,
  listDocPermissions,
  revokeDocPermission,
} from '@/lib/docs/doc-permissions-repo'

export const dynamic = 'force-dynamic'

const DOC_PERM_ROLES = new Set(['viewer', 'commenter', 'editor'])

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })
  return NextResponse.json({ permissions: await listDocPermissions(id) })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })

  const body = (await req.json()) as { userId?: string; role?: string }
  if (!body.userId || !body.role || !DOC_PERM_ROLES.has(body.role))
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  // IDOR guard: never let the owner grant to themselves or grant the doc owner a
  // (lesser) role on their own doc — the owner is implicit and full-control.
  if (body.userId === gate.doc.ownerId)
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  // user must exist (handled by FK; a non-existent userId 23503-errors → map to 400)
  try {
    await grantDocPermission({
      docId: id,
      userId: body.userId,
      role: body.role as 'viewer' | 'commenter' | 'editor',
      grantedBy: user!.id,
    })
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }
  await logAudit('doc.share', {
    actorId: user!.id,
    targetType: 'document',
    targetId: id,
    meta: { userId: body.userId, role: body.role },
  })
  return new NextResponse(null, { status: 201 })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(req)
  const { id } = await ctx.params
  const gate = await authorizeDocRoute(user, id, 'manage')
  if (!gate.ok) return NextResponse.json({ error: 'not_found' }, { status: gate.status })

  const body = (await req.json()) as { userId?: string }
  if (!body.userId) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  await revokeDocPermission(id, body.userId)
  await logAudit('doc.unshare', {
    actorId: user!.id,
    targetType: 'document',
    targetId: id,
    meta: { userId: body.userId },
  })
  return new NextResponse(null, { status: 204 })
}
```

(A PATCH to change a role can reuse `grantDocPermission`'s upsert via POST — keep the surface to GET/POST/DELETE; the UI changes a role by re-POSTing.)

- [ ] **Step 7: Run + commit**

Run: `pnpm vitest run tests/integration/doc-permissions.test.ts`
Expected: PASS (3 tests).

```bash
git add src/lib/docs/doc-permissions-repo.ts src/app/api/docs/\[id\]/permissions tests/integration/doc-permissions.test.ts
git commit -m "feat(authz): document_permissions repo + manage-gated ACL REST (A4)"
```

---

## Task 8: User CRUD repo (create/role/disable/delete/transfer) — owner-never-locked-out

**Files:**
- Create: `src/lib/auth/users-repo.ts`
- Test: `tests/integration/users.test.ts` (extend)

**Interfaces:**
- Consumes: `users` schema (+ `disabledAt`), `canAssignRole` (Task 2), `logAudit` (Task 1b), `revokeOtherSessions`-style session cleanup.
- Produces: `listUsers`, `getUser`, `getUserByEmail`, `createUser`, `setUserRole`, `setUserDisabled`, `deleteUser`, `transferOwnership`, `countOwners`.

- [ ] **Step 1: Write the failing tests (the lock-out invariants)**

Append to `tests/integration/users.test.ts`:

```ts
it('countOwners reflects owner rows; the last owner cannot be deleted or demoted or disabled', async () => {
  const repo = await import('@/lib/auth/users-repo')
  const { db, schema } = await import('@/db')

  // ensure exactly one owner exists for this assertion block
  const owners = await repo.listUsers()
  const ownerRows = owners.filter((u) => u.role === 'owner')
  expect(ownerRows.length).toBeGreaterThanOrEqual(1)

  if (ownerRows.length === 1) {
    const onlyOwner = ownerRows[0]!
    await expect(repo.deleteUser(onlyOwner.id)).rejects.toThrow(/last owner/i)
    await expect(repo.setUserRole(onlyOwner.id, 'admin')).rejects.toThrow(/last owner/i)
    await expect(repo.setUserDisabled(onlyOwner.id, true)).rejects.toThrow(/last owner/i)
  }
})

it('transferOwnership is atomic: old owner becomes admin, new owner becomes owner', async () => {
  const repo = await import('@/lib/auth/users-repo')
  const oldOwner = (await repo.listUsers()).find((u) => u.role === 'owner')!
  const newUser = await repo.createUser({
    email: `xfer-${Date.now()}@p.local`, name: 'Heir', role: 'admin',
  })
  await repo.transferOwnership(oldOwner.id, newUser.id)
  expect((await repo.getUser(newUser.id))?.role).toBe('owner')
  expect((await repo.getUser(oldOwner.id))?.role).toBe('admin')
  expect(await repo.countOwners()).toBe(1) // still exactly one owner
  // restore for later tests
  await repo.transferOwnership(newUser.id, oldOwner.id)
})

it('disabling a user revokes their live sessions', async () => {
  const repo = await import('@/lib/auth/users-repo')
  const { db, schema } = await import('@/db')
  const u = await repo.createUser({ email: `kill-${Date.now()}@p.local`, name: 'K', role: 'editor' })
  await db.insert(schema.sessions).values({
    userId: u.id, tokenHash: `h-${u.id}`, expiresAt: new Date(Date.now() + 3_600_000),
  })
  await repo.setUserDisabled(u.id, true)
  const left = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, u.id))
  expect(left.length).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/users.test.ts -t "owner"`
Expected: FAIL — module not found / functions undefined.

- [ ] **Step 3: Write the repo**

```ts
// src/lib/auth/users-repo.ts
// A1/A6: user CRUD + lifecycle. No 'server-only' guard so it is integration-
// testable (mirrors shares-repo). Authorization (who may call these) is enforced
// at the action/route layer; these functions enforce the DATA invariants only —
// chiefly: there is ALWAYS at least one owner. Every owner-affecting mutation
// re-counts owners inside a transaction so two concurrent demotions cannot both
// pass the check.
import { and, eq, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { Role } from '@/lib/auth/roles'

export type User = typeof schema.users.$inferSelect
export type UserListItem = {
  id: string
  email: string
  name: string
  role: string
  disabledAt: Date | null
  createdAt: Date
}

// NEVER selects passwordHash — the list/detail surfaces must not carry the hash.
export async function listUsers(): Promise<UserListItem[]> {
  return db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      disabledAt: schema.users.disabledAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(schema.users.createdAt)
}

export async function getUser(id: string): Promise<UserListItem | null> {
  const [u] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      disabledAt: schema.users.disabledAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)
  return u ?? null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1)
  return u ?? null
}

export async function countOwners(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(eq(schema.users.role, 'owner'))
  return row?.count ?? 0
}

// Create a user. passwordHash is optional: an invited user is created with a null
// hash (disabled until they accept + set a password); a directly-created user may
// be given a hash. Email is lowercased + unique (DB constraint).
export async function createUser(input: {
  email: string
  name: string
  role: Role
  passwordHash?: string | null
  disabled?: boolean
}): Promise<UserListItem> {
  const [row] = await db
    .insert(schema.users)
    .values({
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      passwordHash: input.passwordHash ?? null,
      disabledAt: input.disabled ? new Date() : null,
    })
    .returning({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      disabledAt: schema.users.disabledAt,
      createdAt: schema.users.createdAt,
    })
  if (!row) throw new Error('createUser: insert returned no row')
  return row
}

// Change a user's workspace role. Demoting the LAST owner is rejected. Runs in a
// transaction that re-counts owners after the update and rolls back if it would
// leave zero owners.
export async function setUserRole(id: string, role: Role): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1)
    if (!current) throw new Error('user not found')
    if (current.role === 'owner' && role !== 'owner') {
      const [{ c }] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(eq(schema.users.role, 'owner'))
      if ((c ?? 0) <= 1) throw new Error('cannot demote the last owner')
    }
    await tx.update(schema.users).set({ role }).where(eq(schema.users.id, id))
  })
}

// Disable/enable a user. Disabling the LAST owner is rejected. Disabling also
// deletes the user's sessions so any live device is logged out immediately.
export async function setUserDisabled(id: string, disabled: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    if (disabled) {
      const [current] = await tx
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1)
      if (!current) throw new Error('user not found')
      if (current.role === 'owner') {
        const [{ c }] = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(schema.users)
          .where(eq(schema.users.role, 'owner'))
        if ((c ?? 0) <= 1) throw new Error('cannot disable the last owner')
      }
    }
    await tx
      .update(schema.users)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(eq(schema.users.id, id))
    if (disabled) {
      await tx.delete(schema.sessions).where(eq(schema.sessions.userId, id))
    }
  })
}

// Hard-delete a user. Deleting the LAST owner is rejected. FK cascades remove the
// user's docs/folders/sessions/etc. (see schema onDelete: 'cascade'). Caller is
// responsible for re-assigning docs first if retention is desired (the UI offers
// "transfer their docs" — out of A scope here; documented for J/H).
export async function deleteUser(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1)
    if (!current) return // already gone — idempotent
    if (current.role === 'owner') {
      const [{ c }] = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(schema.users)
        .where(eq(schema.users.role, 'owner'))
      if ((c ?? 0) <= 1) throw new Error('cannot delete the last owner')
    }
    await tx.delete(schema.users).where(eq(schema.users.id, id))
  })
}

// Atomic ownership transfer: the current owner becomes 'admin', the target becomes
// 'owner'. Both in one transaction so there is never zero or two owners mid-flight.
// Rejects if `fromId` is not currently an owner or `toId` does not exist / is
// disabled (you cannot hand the keys to a disabled account).
export async function transferOwnership(fromId: string, toId: string): Promise<void> {
  if (fromId === toId) throw new Error('cannot transfer ownership to self')
  await db.transaction(async (tx) => {
    const [from] = await tx
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, fromId))
      .limit(1)
    if (!from || from.role !== 'owner') throw new Error('source is not the owner')
    const [to] = await tx
      .select({ id: schema.users.id, disabledAt: schema.users.disabledAt })
      .from(schema.users)
      .where(eq(schema.users.id, toId))
      .limit(1)
    if (!to) throw new Error('target user not found')
    if (to.disabledAt !== null) throw new Error('cannot transfer ownership to a disabled user')
    await tx.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, fromId))
    await tx.update(schema.users).set({ role: 'owner' }).where(eq(schema.users.id, toId))
  })
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm vitest run tests/integration/users.test.ts`
Expected: PASS (owner-invariant, transfer, disable-revokes-sessions, plus the Task-3 tests).

```bash
git add src/lib/auth/users-repo.ts tests/integration/users.test.ts
git commit -m "feat(auth): user CRUD + lifecycle repo, owner-never-locked-out (A1/A6)"
```

---

## Task 9: Invites repo + accept→set-password flow

**Files:**
- Create: `src/lib/auth/invites-repo.ts`
- Create: `src/lib/auth/email.ts`
- Create: `src/app/(auth)/accept/[token]/page.tsx`
- Create: `src/app/(auth)/accept/[token]/actions.ts`
- Test: `tests/integration/invites.test.ts`

**Interfaces:**
- Consumes: `invites` schema (Task 1), `createUser`/`getUserByEmail` (Task 8), `hashPassword` (`src/lib/auth/password.ts`), `createSession` (`session.ts`), `logAudit`, `env.publicUrl`.
- Produces: `createInvite`, `getInviteByToken`, `acceptInvite`, `revokeInvite`, `listInvites`, `expireInvites`; `sendInviteEmail`; `acceptInviteAction`.

- [ ] **Step 1: Write the failing repo test**

```ts
// tests/integration/invites.test.ts  (Testcontainers boilerplate as before)
it('createInvite returns a single-use token; only its sha256 is stored', async () => {
  const repo = await import('@/lib/auth/invites-repo')
  const { db, schema } = await import('@/db')
  const { token, id } = await repo.createInvite({
    email: 'invitee@p.local', role: 'editor', invitedBy: ownerId, ttlHours: 72,
  })
  expect(token).toMatch(/^[A-Za-z0-9_-]{30,}$/)
  const [row] = await db.select().from(schema.invites).where(eq(schema.invites.id, id))
  expect(row?.tokenHash).not.toEqual(token)            // hash stored, not plaintext
  const { createHash } = await import('node:crypto')
  expect(row?.tokenHash).toEqual(createHash('sha256').update(token).digest('hex'))
})

it('acceptInvite creates the user with the invited role + password, consumes the invite', async () => {
  const repo = await import('@/lib/auth/invites-repo')
  const usersRepo = await import('@/lib/auth/users-repo')
  const { verifyPassword } = await import('@/lib/auth/password')
  const { token } = await repo.createInvite({
    email: 'newbie@p.local', role: 'viewer', invitedBy: ownerId, ttlHours: 72,
  })
  const result = await repo.acceptInvite(token, { name: 'Newbie', password: 'sup3r-secret' })
  expect(result.ok).toBe(true)
  const u = await usersRepo.getUserByEmail('newbie@p.local')
  expect(u?.role).toBe('viewer')
  expect(u?.disabledAt).toBeNull()
  expect(await verifyPassword(u!.passwordHash!, 'sup3r-secret')).toBe(true)
  // invite consumed → cannot be reused
  const replay = await repo.acceptInvite(token, { name: 'X', password: 'whatever-1234' })
  expect(replay.ok).toBe(false)
})

it('an expired invite cannot be accepted', async () => {
  const repo = await import('@/lib/auth/invites-repo')
  const { token } = await repo.createInvite({
    email: 'stale@p.local', role: 'viewer', invitedBy: ownerId, ttlHours: -1, // already expired
  })
  const res = await repo.acceptInvite(token, { name: 'S', password: 'sup3r-secret' })
  expect(res.ok).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/invites.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the email interface (Group B seam)**

```ts
// src/lib/auth/email.ts
// B seam. Group B owns the real transport (SMTP) at src/lib/email/send.ts and
// exports EmailPayload + inviteEmailPayload. A imports those types/helpers via a
// dynamic import with a no-op fallback so A builds and runs BEFORE B is merged.
// The local OutboundEmail type is DELETED — use B's EmailPayload instead.
// The invite link is ALSO surfaced in the admin UI (copy button) so an
// unconfigured SMTP never blocks onboarding.
import 'server-only'
import { env } from '@/lib/env'

// B's types — dynamically imported at runtime; type-only import for TS.
// When B is merged, replace the `type` import below with a static import.
type EmailPayload = { to: string; subject: string; text: string; html?: string; replyTo?: string }

// Dynamic lookup so A does not hard-depend on B at build time.
// When B ships src/lib/email/send.ts this resolves automatically.
async function deliver(msg: EmailPayload): Promise<void> {
  try {
    const mod = (await import('@/lib/email/send').catch(() => null)) as
      | { sendEmail?: (m: EmailPayload) => Promise<unknown> }
      | null
    if (mod?.sendEmail) {
      await mod.sendEmail(msg)
      return
    }
  } catch {
    // fall through to no-op
  }
  if (env.nodeEnv !== 'production') {
    console.info('[email:noop] would send', { to: msg.to, subject: msg.subject })
  }
}

// Uses B's inviteEmailPayload if available; falls back to an inline payload.
// When B is merged, replace the inline fallback with:
//   import { inviteEmailPayload } from '@/lib/email/send'
export async function sendInviteEmail(to: string, acceptUrl: string): Promise<void> {
  let payload: EmailPayload
  try {
    const mod = (await import('@/lib/email/send').catch(() => null)) as
      | { inviteEmailPayload?: (to: string, url: string) => EmailPayload }
      | null
    payload = mod?.inviteEmailPayload?.(to, acceptUrl) ?? {
      to,
      subject: 'You have been invited to Parchment',
      text: `You've been invited to a Parchment workspace. Set your password to get started:\n\n${acceptUrl}\n\nThis link expires soon.`,
      html: `<p>You've been invited to a Parchment workspace.</p><p><a href="${acceptUrl}">Set your password to get started</a></p><p>This link expires soon.</p>`,
    }
  } catch {
    payload = {
      to,
      subject: 'You have been invited to Parchment',
      text: `You've been invited to a Parchment workspace. Set your password to get started:\n\n${acceptUrl}\n\nThis link expires soon.`,
    }
  }
  await deliver(payload)
}
```

- [ ] **Step 4: Write the invites repo**

```ts
// src/lib/auth/invites-repo.ts
// A5: invitations. The accept token is 32 random bytes (base64url) shown/sent ONCE;
// only its sha256 is persisted (mirrors sessions/pats/shares discipline). Accepting
// within expiresAt creates the user (role from the invite) with the chosen password
// and marks the invite consumed in one transaction. No 'server-only' guard so it is
// integration-testable.
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { hashPassword } from '@/lib/auth/password'
import type { Role } from '@/lib/auth/roles'

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export type InviteListItem = {
  id: string
  email: string
  role: string
  invitedBy: string | null
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

export async function createInvite(input: {
  email: string
  role: Role
  invitedBy: string
  ttlHours?: number
}): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = sha256(token)
  const ttl = input.ttlHours ?? 72
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000)
  const [row] = await db
    .insert(schema.invites)
    .values({ email: input.email.toLowerCase(), role: input.role, tokenHash, invitedBy: input.invitedBy, expiresAt })
    .returning({ id: schema.invites.id })
  if (!row) throw new Error('createInvite: insert returned no row')
  return { id: row.id, token }
}

// Public-safe view of a token: returns the email+role for the accept page WITHOUT
// the hash, and only when the invite is live (unexpired, unconsumed). Null otherwise.
export async function getInviteByToken(
  token: string,
): Promise<{ email: string; role: string } | null> {
  if (!token) return null
  const [row] = await db
    .select({ email: schema.invites.email, role: schema.invites.role })
    .from(schema.invites)
    .where(
      and(
        eq(schema.invites.tokenHash, sha256(token)),
        gt(schema.invites.expiresAt, new Date()),
        isNull(schema.invites.acceptedAt),
      ),
    )
    .limit(1)
  return row ?? null
}

// Accept: validate the live token, create the user (or set the password on a
// pre-created disabled placeholder with this email), consume the invite. Atomic.
// Returns { ok, userId } on success; { ok:false } for an invalid/expired/used token
// or a now-duplicate email.
export async function acceptInvite(
  token: string,
  profile: { name: string; password: string },
): Promise<{ ok: true; userId: string } | { ok: false }> {
  if (profile.password.length < 8) return { ok: false }
  const passwordHash = await hashPassword(profile.password)
  const tokenHash = sha256(token)

  return db.transaction(async (tx) => {
    // Claim the invite by stamping acceptedAt only if still live — this row update
    // is the concurrency gate (a second accept matches no live row).
    const claimed = await tx
      .update(schema.invites)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(schema.invites.tokenHash, tokenHash),
          gt(schema.invites.expiresAt, new Date()),
          isNull(schema.invites.acceptedAt),
        ),
      )
      .returning({ email: schema.invites.email, role: schema.invites.role })
    const invite = claimed[0]
    if (!invite) return { ok: false as const }

    // If a disabled placeholder user already exists for this email, activate it;
    // otherwise create a fresh user. The invited role wins.
    const [existing] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, invite.email))
      .limit(1)

    if (existing) {
      await tx
        .update(schema.users)
        .set({ name: profile.name, passwordHash, role: invite.role, disabledAt: null })
        .where(eq(schema.users.id, existing.id))
      return { ok: true as const, userId: existing.id }
    }

    const [created] = await tx
      .insert(schema.users)
      .values({ email: invite.email, name: profile.name, passwordHash, role: invite.role })
      .returning({ id: schema.users.id })
    if (!created) return { ok: false as const }
    return { ok: true as const, userId: created.id }
  })
}

export async function revokeInvite(id: string): Promise<void> {
  await db.delete(schema.invites).where(eq(schema.invites.id, id))
}

export async function listInvites(): Promise<InviteListItem[]> {
  return db
    .select({
      id: schema.invites.id,
      email: schema.invites.email,
      role: schema.invites.role,
      invitedBy: schema.invites.invitedBy,
      expiresAt: schema.invites.expiresAt,
      acceptedAt: schema.invites.acceptedAt,
      createdAt: schema.invites.createdAt,
    })
    .from(schema.invites)
    .where(isNull(schema.invites.acceptedAt))
    .orderBy(schema.invites.createdAt)
}

export async function expireInvites(): Promise<number> {
  const res = await db
    .delete(schema.invites)
    .where(and(isNull(schema.invites.acceptedAt), sql`${schema.invites.expiresAt} < now()`))
  return res.rowCount ?? 0
}
```

- [ ] **Step 5: Run repo test to verify it passes**

Run: `pnpm vitest run tests/integration/invites.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the accept page + action**

`src/app/(auth)/accept/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getInviteByToken } from '@/lib/auth/invites-repo'
import { AcceptForm } from './accept-form' // a small client form mirroring login-form.tsx

export const dynamic = 'force-dynamic'

export default async function AcceptInvitePage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invite = await getInviteByToken(token)
  if (!invite) notFound() // expired / used / unknown → 404, no detail leak
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="font-semibold text-2xl">Set up your account</h1>
      <p className="mt-2 text-[var(--muted)]">
        You were invited as <strong>{invite.email}</strong>.
      </p>
      <AcceptForm token={token} email={invite.email} />
    </main>
  )
}
```

`src/app/(auth)/accept/[token]/actions.ts`:

```ts
'use server'
import { redirect } from 'next/navigation'
import { logAudit } from '@/lib/audit'
import { acceptInvite } from '@/lib/auth/invites-repo'
import { validateNewPassword } from '@/lib/auth/password-policy'
import { createSession } from '@/lib/auth/session'

export type AcceptState = { error: string } | null

export async function acceptInviteAction(
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const token = String(formData.get('token') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!name) return { error: 'Name is required.' }
  // validateNewPassword returns an error CODE ('password_too_short' | null), not a
  // display string — map it to a user-facing message (mirrors /setup's 8-char rule).
  const pwCode = validateNewPassword(password)
  if (pwCode === 'password_too_short') return { error: 'Password must be at least 8 characters.' }

  const res = await acceptInvite(token, { name, password })
  if (!res.ok) return { error: 'This invitation is no longer valid.' }

  await logAudit('user.create', { actorId: res.userId, targetType: 'user', targetId: res.userId, meta: { via: 'invite' } })
  await createSession(res.userId) // log the new user straight in
  redirect('/')
}
```

(`accept-form.tsx` is a thin `'use client'` form using `useActionState(acceptInviteAction, null)` — copy the shape of `src/app/(auth)/login/login-form.tsx`, with a hidden `token` input and `name` + `password` fields. `validateNewPassword` already exists in `src/lib/auth/password-policy.ts`; confirm its return shape (string error | null) and adapt the call if it differs.)

- [ ] **Step 7: Write the accept-action test**

Append to `tests/integration/invites.test.ts`:

```ts
it('acceptInviteAction rejects an invalid token and accepts a valid one', async () => {
  const { acceptInviteAction } = await import('@/app/(auth)/accept/[token]/actions')
  const repo = await import('@/lib/auth/invites-repo')
  const bad = new FormData()
  bad.set('token', 'nope'); bad.set('name', 'X'); bad.set('password', 'sup3r-secret')
  expect(await acceptInviteAction(null, bad)).toEqual({ error: 'This invitation is no longer valid.' })
  // valid path throws Next redirect — assert it does not return an error object
  const { token } = await repo.createInvite({ email: 'flow@p.local', role: 'viewer', invitedBy: ownerId, ttlHours: 72 })
  const ok = new FormData()
  ok.set('token', token); ok.set('name', 'Flow'); ok.set('password', 'sup3r-secret')
  await expect(acceptInviteAction(null, ok)).rejects.toMatchObject({ digest: expect.stringContaining('NEXT_REDIRECT') })
})
```

- [ ] **Step 8: Run + commit**

Run: `pnpm vitest run tests/integration/invites.test.ts`
Expected: PASS.

```bash
git add src/lib/auth/invites-repo.ts src/lib/auth/email.ts "src/app/(auth)/accept" tests/integration/invites.test.ts
git commit -m "feat(auth): invites repo + accept→set-password flow + email seam (A5)"
```

---

## Task 10: User-management Server Actions (authorization-enforced)

**Files:**
- Create: `src/app/(app)/settings/users/actions.ts`
- Test: `tests/integration/users-actions.test.ts`

**Interfaces:**
- Consumes: `requireRole`/`requireAdmin` (Task 2), `users-repo` (Task 8), `invites-repo` + `sendInviteEmail` (Task 9), `canAssignRole` (Task 2), `logAudit`, `env.publicUrl`, `getCurrentUser`.
- Produces: `createUserAction`, `inviteUserAction`, `setUserRoleAction`, `setUserDisabledAction`, `deleteUserAction`, `transferOwnershipAction`.

> These actions are the AUTHORIZATION boundary for user management. Each one: (1) `requireRole('admin')` first (redirects non-admins); (2) re-checks `canAssignRole(actor, targetRole)` for any role grant — a server-side anti-escalation gate independent of the UI; (3) blocks self-targeting destructive ops where it would break the workspace (an admin disabling/deleting themselves is allowed only if not the last owner — the repo enforces the owner invariant; the action additionally prevents an admin from deleting their OWN account to avoid surprise self-lockout, returning an error).

- [ ] **Step 1: Write the failing tests**

Because Server Actions read the session cookie via `requireRole`, test them by stubbing the current user. The cleanest seam: these actions call `requireRole` from `@/lib/auth/guard`; in the integration test, mock that module per-case with `vi.mock`. Create `tests/integration/users-actions.test.ts` (Testcontainers boilerplate + the mock):

```ts
import { vi } from 'vitest'
let CURRENT: { id: string; role: string }
vi.mock('@/lib/auth/guard', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guard')>()
  return {
    ...actual,
    requireRole: async () => CURRENT,
    requireAdmin: async () => CURRENT,
    requireUser: async () => CURRENT,
  }
})

it('an admin cannot create or promote a user to admin/owner (anti-escalation)', async () => {
  const { createUserAction, setUserRoleAction } = await import('@/app/(app)/settings/users/actions')
  CURRENT = { id: adminId, role: 'admin' }

  const fd = new FormData()
  fd.set('email', `esc-${Date.now()}@p.local`); fd.set('name', 'Esc'); fd.set('role', 'admin')
  expect(await createUserAction(null, fd)).toEqual({ error: expect.stringMatching(/permission|role/i) })

  const fd2 = new FormData()
  fd2.set('userId', editorId); fd2.set('role', 'owner')
  expect(await setUserRoleAction(null, fd2)).toEqual({ error: expect.stringMatching(/permission|role|owner/i) })
})

it('the owner can promote a user to admin', async () => {
  const { setUserRoleAction } = await import('@/app/(app)/settings/users/actions')
  const usersRepo = await import('@/lib/auth/users-repo')
  CURRENT = { id: ownerId, role: 'owner' }
  const fd = new FormData(); fd.set('userId', editorId); fd.set('role', 'admin')
  expect(await setUserRoleAction(null, fd)).toBeNull()
  expect((await usersRepo.getUser(editorId))?.role).toBe('admin')
})

it('an admin cannot delete their own account (self-lockout guard)', async () => {
  const { deleteUserAction } = await import('@/app/(app)/settings/users/actions')
  CURRENT = { id: adminId, role: 'admin' }
  const fd = new FormData(); fd.set('userId', adminId)
  expect(await deleteUserAction(null, fd)).toEqual({ error: expect.stringMatching(/yourself|own account/i) })
})

it('inviteUserAction creates a live invite and returns its accept URL', async () => {
  const { inviteUserAction } = await import('@/app/(app)/settings/users/actions')
  CURRENT = { id: ownerId, role: 'owner' }
  const fd = new FormData(); fd.set('email', `inv-${Date.now()}@p.local`); fd.set('role', 'editor')
  const res = await inviteUserAction(null, fd)
  expect(res).toMatchObject({ acceptUrl: expect.stringContaining('/accept/') })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/users-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the actions**

```ts
// src/app/(app)/settings/users/actions.ts
'use server'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/audit'
import { sendInviteEmail } from '@/lib/auth/email'
import { requireAdmin } from '@/lib/auth/guard'
import { createInvite } from '@/lib/auth/invites-repo'
import { canAssignRole, type Role, WORKSPACE_ROLES } from '@/lib/auth/roles'
import {
  createUser, deleteUser, setUserDisabled, setUserRole, transferOwnership,
} from '@/lib/auth/users-repo'
import { env } from '@/lib/env'

export type ActionState = { error: string } | null
export type InviteState = { error: string } | { acceptUrl: string } | null

function parseRole(v: FormDataEntryValue | null): Role | null {
  const s = typeof v === 'string' ? v : ''
  return (WORKSPACE_ROLES as readonly string[]).includes(s) ? (s as Role) : null
}

// CREATE a user directly (admin sets no password → disabled placeholder, OR a
// password). Anti-escalation: the actor may only assign a role strictly below
// their own (canAssignRole), enforced HERE, server-side.
export async function createUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const name = String(fd.get('name') ?? '').trim()
  const role = parseRole(fd.get('role'))
  if (!email.includes('@')) return { error: 'A valid email is required.' }
  if (!name) return { error: 'Name is required.' }
  if (!role) return { error: 'Choose a role.' }
  if (!canAssignRole(actor, role)) return { error: 'You do not have permission to assign that role.' }
  try {
    const u = await createUser({ email, name, role, disabled: true }) // no password yet → must be invited/reset
    await logAudit('user.create', { actorId: actor.id, targetType: 'user', targetId: u.id, meta: { role } })
  } catch {
    return { error: 'Could not create the user (email may already exist).' }
  }
  revalidatePath('/settings/users')
  return null
}

// INVITE a user by email. Creates the invite and returns the accept URL (always
// shown in the UI as a copyable link) AND best-effort emails it (Group B).
export async function inviteUserAction(_p: InviteState, fd: FormData): Promise<InviteState> {
  const actor = await requireAdmin()
  const email = String(fd.get('email') ?? '').trim().toLowerCase()
  const role = parseRole(fd.get('role'))
  if (!email.includes('@')) return { error: 'A valid email is required.' }
  if (!role) return { error: 'Choose a role.' }
  if (!canAssignRole(actor, role)) return { error: 'You do not have permission to assign that role.' }

  const { token } = await createInvite({ email, role, invitedBy: actor.id, ttlHours: 72 })
  const acceptUrl = `${env.publicUrl.replace(/\/$/, '')}/accept/${token}`
  await sendInviteEmail(email, acceptUrl) // never throws / never blocks
  await logAudit('user.invite', { actorId: actor.id, targetType: 'user', meta: { email, role } })
  revalidatePath('/settings/users')
  return { acceptUrl }
}

export async function setUserRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = String(fd.get('userId') ?? '')
  const role = parseRole(fd.get('role'))
  if (!userId || !role) return { error: 'Invalid request.' }
  if (!canAssignRole(actor, role)) return { error: 'You do not have permission to assign that role.' }
  try {
    await setUserRole(userId, role)
    await logAudit('user.role', { actorId: actor.id, targetType: 'user', targetId: userId, meta: { role } })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not change the role.' }
  }
  revalidatePath('/settings/users')
  return null
}

export async function setUserDisabledAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = String(fd.get('userId') ?? '')
  const disabled = String(fd.get('disabled') ?? '') === 'true'
  if (!userId) return { error: 'Invalid request.' }
  // Disabling yourself is allowed only if it doesn't break the owner invariant
  // (the repo enforces that); but warn against the obvious self-lockout.
  if (userId === actor.id && disabled) return { error: 'You cannot disable your own account.' }
  try {
    await setUserDisabled(userId, disabled)
    await logAudit(disabled ? 'user.disable' : 'user.enable', { actorId: actor.id, targetType: 'user', targetId: userId })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not update the account.' }
  }
  revalidatePath('/settings/users')
  return null
}

export async function deleteUserAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  const userId = String(fd.get('userId') ?? '')
  if (!userId) return { error: 'Invalid request.' }
  if (userId === actor.id) return { error: 'You cannot delete your own account.' }
  try {
    await deleteUser(userId)
    await logAudit('user.delete', { actorId: actor.id, targetType: 'user', targetId: userId })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not delete the user.' }
  }
  revalidatePath('/settings/users')
  return null
}

// TRANSFER OWNERSHIP — owner-only (not merely admin). The actor MUST currently be
// the owner; the repo performs the atomic swap and refuses non-owner sources.
export async function transferOwnershipAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireAdmin()
  if (actor.role !== 'owner') return { error: 'Only the owner can transfer ownership.' }
  const toId = String(fd.get('toUserId') ?? '')
  if (!toId) return { error: 'Choose a user to transfer ownership to.' }
  try {
    await transferOwnership(actor.id, toId)
    await logAudit('ownership.transfer', { actorId: actor.id, targetType: 'user', targetId: toId })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not transfer ownership.' }
  }
  revalidatePath('/settings/users')
  return null
}
```

- [ ] **Step 4: Run + commit**

Run: `pnpm vitest run tests/integration/users-actions.test.ts`
Expected: PASS (4 tests).

```bash
git add "src/app/(app)/settings/users/actions.ts" tests/integration/users-actions.test.ts
git commit -m "feat(users): user-management server actions, anti-escalation enforced (A1/A2/A6)"
```

---

## Task 11: User-management UI (admin-only page)

**Files:**
- Create: `src/app/(app)/settings/users/page.tsx`
- Create: `src/app/(app)/settings/users/_user-row.tsx`
- Create: `src/app/(app)/settings/users/_create-invite-forms.tsx`
- Modify: `src/app/(app)/settings/_nav.tsx` (add Users link, admin-only)
- Modify: `src/app/(app)/settings/admin/page.tsx` (link Users under a "People" section)
- Test: `tests/e2e/users.authed.spec.ts`

**Interfaces:**
- Consumes: `requireAdmin` (page guard), `listUsers`/`listInvites`, the Task-10 actions.

- [ ] **Step 1: Write the failing e2e test (DOM/computed probes, not screenshots)**

The repo already has an authed Playwright project (`tests/e2e/*.authed.spec.ts`, storage state in `tests/e2e/.auth`). The seeded e2e user is the owner. Create `tests/e2e/users.authed.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('owner sees the Users admin page and can open the invite form', async ({ page }) => {
  await page.goto('/settings/users')
  // page renders (not redirected to / or /login)
  await expect(page).toHaveURL(/\/settings\/users$/)
  await expect(page.getByRole('heading', { name: /users|people/i })).toBeVisible()
  // the current owner row is present and marked owner
  const ownerRow = page.getByTestId('user-row').filter({ hasText: '@' }).first()
  await expect(ownerRow).toBeVisible()
  // invite form is reachable
  await page.getByRole('button', { name: /invite/i }).first().click()
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByLabel(/role/i)).toBeVisible()
})

test('the owner row exposes no destructive control that would remove the last owner', async ({ page }) => {
  await page.goto('/settings/users')
  const ownerRow = page.getByTestId('user-row').filter({ hasText: /owner/i }).first()
  // delete/disable for the sole owner must be absent or disabled (UI mirror of the
  // server invariant; the server is the real gate, tested in Task 8/10).
  const del = ownerRow.getByRole('button', { name: /delete/i })
  if (await del.count()) await expect(del).toBeDisabled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm playwright test tests/e2e/users.authed.spec.ts`
Expected: FAIL — `/settings/users` 404s (page does not exist).

- [ ] **Step 3: Build the page (Server Component, admin-gated)**

```tsx
// src/app/(app)/settings/users/page.tsx
import { getCurrentUser } from '@/lib/auth/current-user'
import { requireAdmin } from '@/lib/auth/guard'
import { listInvites } from '@/lib/auth/invites-repo'
import { listUsers } from '@/lib/auth/users-repo'
import { CreateInviteForms } from './_create-invite-forms'
import { UserRow } from './_user-row'

export const dynamic = 'force-dynamic'

export default async function UsersSettingsPage() {
  const me = await requireAdmin() // non-admins redirected to '/'
  const [users, invites] = await Promise.all([listUsers(), listInvites()])
  const ownerCount = users.filter((u) => u.role === 'owner').length

  return (
    <section className="max-w-3xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Users</h1>
      <p className="mt-2 text-[var(--muted)]">
        Invite people, manage roles, and control account access.
      </p>

      <CreateInviteForms actorRole={me.role} />

      <h2 className="mt-10 font-medium text-lg">People</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            actorRole={me.role}
            isSelf={u.id === me.id}
            isLastOwner={u.role === 'owner' && ownerCount === 1}
          />
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-lg">Pending invites</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {invites.map((inv) => (
              <li key={inv.id} data-testid="invite-row" className="rounded-md border border-[var(--border)] px-4 py-3 text-sm">
                {inv.email} — {inv.role} — expires {inv.expiresAt.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
```

`_user-row.tsx` (`'use client'`): renders the user's name/email/role, a role `<select>` wired to `setUserRoleAction` (options limited to roles the actor `canAssignRole`), a disable/enable toggle (`setUserDisabledAction`), and a delete button (`deleteUserAction`). The delete and disable controls are `disabled` when `isLastOwner` or `isSelf` (for delete). Each `<li data-testid="user-row">`. Use `useActionState` + `useTransition` for optimistic feedback (copy patterns from existing settings client forms, e.g. `src/app/(app)/settings/security/mfa-section.tsx`).

`_create-invite-forms.tsx` (`'use client'`): two forms — "Invite by email" (email + role select → `inviteUserAction`, then renders the returned `acceptUrl` with a copy button) and "Create directly" (email + name + role → `createUserAction`). Role options limited to those `canAssignRole(actorRole, r)` allows.

- [ ] **Step 4: Link the page (admin-only) in settings nav + admin index**

In `src/app/(app)/settings/_nav.tsx` (the exported component is `SettingsNav`; links live in the `groups` array of `{ href, label }`), add `{ href: '/settings/users', label: 'Users' }` to `groups`. `SettingsNav` is a `'use client'` component with NO admin gating today and takes no props, so the simplest correct approach is: add the link unconditionally and rely on the page's own `requireAdmin` redirect for security (the link is purely cosmetic — a non-admin who clicks it is redirected to `/`). If hiding it for non-admins is desired, thread an `isAdmin` prop from the settings layout into `SettingsNav` and filter `groups`, but DO NOT treat that visibility as the security boundary. In `src/app/(app)/settings/admin/page.tsx`, add a "People" `<section>` with a card linking `/settings/users` (mirror the existing Observability/Maintenance card markup).

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm playwright test tests/e2e/users.authed.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/settings/users" "src/app/(app)/settings/_nav.tsx" "src/app/(app)/settings/admin/page.tsx" tests/e2e/users.authed.spec.ts
git commit -m "feat(users): admin user-management UI (list/create/invite/role/disable/delete) (A1)"
```

---

## Task 12: Sharing ACL UI (people-based share panel + enforcement wiring)

**Files:**
- Create: `src/components/share/DocPermissionsPanel.tsx`
- Modify: the existing doc share dialog/menu to mount `DocPermissionsPanel` alongside the public/password-link UI (locate via `grep -rl "createShare\|shares\|Share link" src/components`)
- Test: `tests/e2e/sharing.authed.spec.ts`

**Interfaces:**
- Consumes: the `/api/docs/[id]/permissions` REST (Task 7), `listUsers` (for the people picker — admin/owner only; for a non-admin owner of a doc, a `/api/users/pickable` minimal endpoint returns id+name+email of users they may share with — see Step 3).

- [ ] **Step 1: Write the failing e2e test (DOM probes)**

```ts
// tests/e2e/sharing.authed.spec.ts
import { expect, test } from '@playwright/test'

test('doc owner can grant another user a role and see it listed', async ({ page }) => {
  // open a doc the seeded owner owns (the seed guide doc), open Share
  await page.goto('/files')
  await page.getByTestId('doc-row').first().click()
  await page.getByRole('button', { name: /share/i }).click()
  // the people-ACL panel is present
  const panel = page.getByTestId('doc-permissions-panel')
  await expect(panel).toBeVisible()
  // a role select + people input exist (we don't submit against a second real user
  // in this smoke test; the grant/enforce logic is covered by integration Task 7)
  await expect(panel.getByLabel(/role/i)).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm playwright test tests/e2e/sharing.authed.spec.ts`
Expected: FAIL — no `doc-permissions-panel`.

- [ ] **Step 3: Add a minimal pickable-users endpoint (for the people picker)**

`src/app/api/users/pickable/route.ts` — GET returns `{ users: [{id,name,email}] }` of users the caller may share a doc with. Gated by `requireUser` (any signed-in user); returns all OTHER active users' id/name/email (no roles, no hashes). This is intentionally a low-sensitivity directory needed for sharing; document that. Add a unit/integration test asserting it never returns `passwordHash`/`disabledAt` and excludes the caller.

```ts
// src/app/api/users/pickable/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { ne, isNull, and } from 'drizzle-orm'
import { db, schema } from '@/db'
import { authenticateRequest } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await authenticateRequest(req)
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(and(ne(schema.users.id, me.id), isNull(schema.users.disabledAt)))
  return NextResponse.json({ users })
}
```

- [ ] **Step 4: Build `DocPermissionsPanel.tsx`**

`'use client'` component taking `docId`. On mount it `GET`s `/api/docs/${docId}/permissions` (current grants) and `/api/users/pickable` (people). Renders:
- the current grants list (name/email + a role `<select>` of viewer/commenter/editor that re-`POST`s on change, and a "Remove" button that `DELETE`s);
- an "Add people" row (pick a user + role → `POST`).
Root element `data-testid="doc-permissions-panel"`. All four operations hit the manage-gated REST from Task 7, so the server is the enforcement point; a non-manage user simply gets 404s from the API and the panel shows an error.

Mount it inside the existing share UI next to the link/password controls.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm playwright test tests/e2e/sharing.authed.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/share/DocPermissionsPanel.tsx "src/app/api/users/pickable" tests/e2e/sharing.authed.spec.ts
git commit -m "feat(share): per-user document ACL panel + pickable-users endpoint (A4)"
```

---

## Task 13: ACL-aware document listing (Shared-with-me) + repo reads

**Files:**
- Modify: `src/lib/docs/repo.ts` (add `listAccessibleDocuments` / `getAccessibleDocument`)
- Modify: the "Shared" view data source (`grep -rl "view=shared\|listShared\|Shared" src/app "src/app/(app)"`)
- Test: `tests/integration/docs-shared.test.ts`

**Interfaces:**
- Consumes: `documentPermissions` (Task 1).
- Produces: `listSharedWithMe(userId)` — docs not owned by the user but granted via `document_permissions`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/docs-shared.test.ts (Testcontainers boilerplate)
it('listSharedWithMe returns docs granted to the user, never their own, never ungranted', async () => {
  const repo = await import('@/lib/docs/repo')
  const permRepo = await import('@/lib/docs/doc-permissions-repo')
  // ownerDoc owned by ownerId; grant viewerId a viewer role
  await permRepo.grantDocPermission({ docId, userId: viewerId, role: 'viewer', grantedBy: ownerId })
  const shared = await repo.listSharedWithMe(viewerId)
  expect(shared.map((d) => d.id)).toContain(docId)
  // owner does not see their own doc in "shared with me"
  const ownerShared = await repo.listSharedWithMe(ownerId)
  expect(ownerShared.map((d) => d.id)).not.toContain(docId)
  // a stranger sees nothing
  expect((await repo.listSharedWithMe(strangerId)).length).toBe(0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/docs-shared.test.ts`
Expected: FAIL — `listSharedWithMe` undefined.

- [ ] **Step 3: Add the repo function**

```ts
// append to src/lib/docs/repo.ts
import { documentPermissions } from ... // (already covered by schema import; use schema.documentPermissions)

/** A4: docs shared WITH this user via document_permissions (not owned by them),
 *  newest-first, excludes trashed. The "Shared with me" view. */
export async function listSharedWithMe(userId: string): Promise<DocSummary[]> {
  return db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      updatedAt: schema.documents.updatedAt,
      folderId: schema.documents.folderId,
    })
    .from(schema.documents)
    .innerJoin(
      schema.documentPermissions,
      eq(schema.documentPermissions.docId, schema.documents.id),
    )
    .where(
      and(
        eq(schema.documentPermissions.userId, userId),
        isNull(schema.documents.trashedAt),
      ),
    )
    .orderBy(desc(schema.documents.updatedAt))
}
```

- [ ] **Step 4: Wire the "Shared" view**

Find where the sidebar `?view=shared` view sources its docs (it likely currently shows shares/empty). Switch it to call `listSharedWithMe(user.id)` so granted docs appear. Add a guard: opening a shared doc page (`/doc/[id]` or wherever the editor route lives) must call `resolveDocAccess(user, id, 'view')` and `notFound()` on null — locate the editor page server component (`grep -rl "getDocument\|params.*id" "src/app/(app)"`) and replace any bare owner check with `resolveDocAccess`. Add an integration/e2e probe that a viewer-granted user can open the doc and a stranger gets 404.

- [ ] **Step 5: Run + commit**

Run: `pnpm vitest run tests/integration/docs-shared.test.ts`
Expected: PASS.

```bash
git add src/lib/docs/repo.ts "src/app/(app)" tests/integration/docs-shared.test.ts
git commit -m "feat(docs): Shared-with-me listing + editor route ACL gate (A4)"
```

---

## Task 14: Security review sweep (per-route) + full regression

**Files:**
- Modify: any holes found by the sweep
- Test: `tests/integration/authz-routes.test.ts` (extend with any gap regressions)

**This task is the explicit SECURITY review step. No feature work — only verification and patching of authorization holes.**

- [ ] **Step 1: Enumerate every route/action that touches a doc, folder, user, share, or setting**

```bash
grep -rln "schema.documents\|schema.folders\|schema.users\|schema.shares\|schema.documentPermissions\|getDocument\|resolveDocAccess\|requireUser\|requireAdmin\|requireRole\|authenticateRequest" src/app/api "src/app/(app)" | sort
```

For EACH file, confirm in writing (commit body) one of:
- (a) it calls `requireUser`/`requireAdmin`/`requireRole` (page/action) or `authenticateRequest` (route) AND scopes every query by the current user (`ownerId` or `resolveDocAccess`/`authorizeDocRoute`); OR
- (b) it is an intentional anonymous endpoint (`/api/share/[token]`, `/setup`, `/login`, `/accept/[token]`) whose access is gated by a capability/first-run check, NOT by a session.

- [ ] **Step 2: IDOR / ownership checks**

Confirm NO route trusts a client-supplied `ownerId`, `userId`, or `role` to scope a query. The owner/actor id always comes from the resolved session/PAT (`user.id`), never the request body. The doc ACL POST must reject granting the doc owner a role (Task 7 IDOR guard) and reject `role` values outside the doc-perm set. The user actions must reject `role` outside `WORKSPACE_ROLES` and enforce `canAssignRole`. Add a regression test for any route where this was previously loose.

- [ ] **Step 3: Existence-leak check**

Confirm denied access returns the SAME status/shape as "not found" (404) on doc routes — no 403-vs-404 oracle that reveals a doc exists. (The ACL-management route may 404 for non-managers; the doc-content route 404s for non-viewers.)

- [ ] **Step 4: Secret-leak check**

Confirm no route returns `passwordHash`, `tokenHash`, share `passwordHash`, invite `tokenHash`, or `users.disabledAt` to a client where not intended. `listUsers`/`getUser`/`listDocPermissions`/`pickable` all project explicit safe columns (verified by tests). Grep for raw `select().from(schema.users)` in routes and confirm each maps to a safe shape.

```bash
grep -rn "select().from(schema.users)\|\.from(schema.invites)\|\.from(schema.shares)" src/app/api
```

- [ ] **Step 5: Owner-lockout invariant — end-to-end**

Add a final integration test asserting the COMPOSED guarantee: in a workspace with one owner + one admin, the admin cannot (via the actions) delete/disable/demote the owner, and the owner can transfer to the admin (after which the new admin→owner can manage the old owner). This exercises actions + repo together.

```ts
it('A6 composed: owner is never lockable-out across the action layer', async () => {
  // CURRENT=admin: every owner-targeting destructive action errors
  // CURRENT=owner: transferOwnership(adminId) succeeds; counts stay 1 owner
  // (assert via users-repo countOwners + getUser roles)
})
```

- [ ] **Step 6: Full suite green**

Run: `pnpm vitest run`
Expected: PASS (all unit + integration).

Run: `pnpm playwright test`
Expected: PASS (a11y + users + sharing DOM probes).

Run: `pnpm tsc --noEmit` (or the project's typecheck script) and `pnpm biome check .`
Expected: no type errors, lint clean. (Recall: biome runs repo-wide; ensure no stray worktree `biome.json` remains.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(authz): per-route security sweep + owner-lockout composed regression (A)"
```

---

## Self-Review (run after writing the plan)

**Spec coverage (Group A):**
- A1 User CRUD UI (create/invite/disable/delete) → Tasks 8 (repo), 10 (actions), 11 (UI). ✓
- A2 Roles & permissions (owner·admin·editor·viewer) → Task 2 (lattice), used everywhere. ✓
- A3 Multi-user auth + per-user sessions → sessions are already per-`userId`; Tasks 3 (disabled-user gate), 4 (stable `getCurrentUser`), and the unchanged login flow now serve N users. The single owner is preserved (role defaults to owner; setup still creates the first owner only — Task 1 comment + Task 10 adds the second-user path via UI). ✓
- A4 Per-document sharing ACLs → Tasks 1 (table), 5 (decision engine), 6 (route enforcement), 7 (repo + REST), 12 (UI), 13 (Shared-with-me + editor gate). ✓
- A5 Invite flow (email → accept → set password) → Task 9 (repo + accept page/action + email seam), Task 10 (`inviteUserAction`). ✓
- A6 Account lifecycle (deactivate/reset/transfer ownership) → Task 8 (`setUserDisabled`/`transferOwnership`/owner invariant), Task 10 (actions). **Reset:** an admin "reset password" = re-invite (Task 9/10 invite path issues a fresh set-password link) OR disable+re-invite; the existing self-service `/api/auth/password` covers a user resetting their own. If a dedicated admin-initiated "send reset link" is desired distinct from invite, it reuses `createInvite` against the existing email — note this in the commit and add a thin `resetPasswordAction` wrapper if the user wants it surfaced separately (currently folded into invite to avoid a second token type).

**Verification-bar coverage (NO BUGS):**
- viewer cannot edit → Task 6 PUT test (viewer grant → 404), Task 5 unit. ✓
- non-shared user gets 403/404 → Task 6 GET test (stranger → 404, no leak). ✓
- disabled user can't log in → Task 3 (cookie, PAT, login-action). ✓
- role escalation blocked → Task 2 `canAssignRole` unit + Task 10 action tests (admin cannot mint admin/owner). ✓
- owner never lockable-out → Task 8 repo invariants + Task 14 composed e2e. ✓
- UI verified by DOM/computed probes, not screenshots → Tasks 11, 12 (Playwright `getByRole`/`getByTestId`/`toBeDisabled`). ✓
- explicit per-route security review → Task 14. ✓

**Placeholder scan:** every code step ships real code; no "TBD"/"add validation"/"handle edge cases". The two UI client components (Task 11 `_user-row`/`_create-invite-forms`, Task 12 panel) are described structurally with the exact actions/endpoints they call and the testids they expose — the e2e tests pin their observable contract. ✓

**Type consistency:** `Role` (`owner|admin|editor|viewer`) is the workspace role; `DocPermRole` (`viewer|commenter|editor`) is the doc-scoped role — deliberately distinct, used consistently (`canAssignRole` takes `Role`; `grantDocPermission`/`canAccessDoc` take `DocPermRole`). `getCurrentUser`/`requireUser`/`SessionUser` names match across `session.ts`/`guard.ts`/`current-user.ts`. `authorizeDocRoute` return shape (`{ok:true;doc}|{ok:false;status}`) is used identically in Tasks 6 and 7. ✓

---

## Open questions / coordination

1. **Current single-user auth structure (answered by investigation):** sessions are ALREADY per-user (`sessions.userId` FK, opaque sha256-hashed cookie tokens, 30-day TTL, MFA-pending two-phase). `role` already exists (default `'owner'`) and `guard.ts` already recognizes an `admin` role. There is **no `middleware.ts`** — authz is per-route via `requireUser`/`requireAdmin`/`authenticateRequest` + uniform `ownerId`-scoped repo queries. **Safest migration:** additive only — keep every owner-only repo path; layer ACLs via `document_permissions` + `canAccessDoc`; gate disabled users at the two existing resolution chokepoints (`getUserByToken`, `authenticateRequest`); leave `/setup` as first-owner-only and add subsequent users through the new admin UI. The owner is never touched: role stays `owner`, the owner satisfies every `canAccessDoc`, and the last-owner invariant is enforced in the repo transactions. No data migration of existing rows is required (the single owner's docs remain owner-scoped and fully accessible).
2. **Group B `sendEmail` / `inviteEmailPayload`:** Per reconciliation §1e, B owns `src/lib/email/send.ts` and exports `sendEmail(p: EmailPayload)`, `EmailPayload = {to, subject, text, html?, replyTo?}`, and `inviteEmailPayload(to, acceptUrl)`. A's local `OutboundEmail` type is **deleted**; A uses B's `EmailPayload` (type-only via dynamic import until B merges). A's `email.ts` already dynamically imports `inviteEmailPayload` from B with an inline fallback payload — no seam change needed when B ships, just confirm B exports `inviteEmailPayload`.
3. **Admin "reset password" surface:** folded into the invite/set-password token to avoid a second token type (an admin reset = issue a fresh accept link for the existing email). If the user wants a visibly separate "Send password reset" button distinct from "Invite", add a thin `resetPasswordAction` reusing `createInvite` — flagged in Task 14 / A6 self-review. **Confirm desired UX.**
4. **Workspace-wide vs per-owner data model:** today many repos are `ownerId`-scoped (folders, tags, templates, settings, smart-folders are per-user). This plan makes DOCUMENTS shareable across users but leaves folders/tags/templates per-owner (a shared doc appears in the recipient's "Shared with me", not inside the owner's folders). If the user wants shared docs to also carry their folder/tag context to recipients, that is a larger model change — out of Group A scope; **flag for a follow-up decision** (likely H — collaboration).
5. **`verifyPat` disabled-user coverage:** Task 3 assumes `verifyPat` returns the full user row (so `disabledAt` is present). If it projects a subset, Task 3 Step 3 adds `disabledAt` to its select — verify when implementing.
