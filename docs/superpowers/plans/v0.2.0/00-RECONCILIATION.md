# v0.2.0 — Canonical Reconciliation (SOURCE OF TRUTH)

The 9 group plans were authored in parallel and collided. This document is the **single source of truth** that resolves every cross-plan conflict the integration review found. Every group plan MUST conform to the decisions here. Where a plan disagrees with this doc, THIS doc wins.

---

## 1. Locked canonical modules (build ONCE, everyone imports)

### 1a. Encrypted config — `src/lib/crypto/secret-box.ts` (from G)
- The ONLY AES-256-GCM helper. Exports: `encryptSecret(plain): string`, `decryptSecret(envelope): string`, `SECRET_MASK = '••••••••'`, `isMasked(v): boolean`, `redactSecret(v): string`.
- Envelope format: `v1:<b64 iv>:<b64 ct>:<b64 tag>` (versioned for future algo migration).
- Master key env var: **`PARCHMENT_SECRET_KEY`**, **base64-encoded 32 bytes**. Validated at boot in `src/lib/env.ts`. If absent, secret WRITES 503 with a UI callout; reads of unencrypted/legacy config still work.
- KILL these duplicates: `src/lib/config/encrypt.ts` (B), `src/lib/config/crypto.ts` (backup-sync), the `APP_SECRET` env var, the hex-key variant, `G`'s separate `redact.ts` (fold into secret-box).
- B, G, backup-sync, J(if any secret) all import from `@/lib/crypto/secret-box`. NO other crypto module is created.

### 1b. Instance secret store — ONE `app_config` table + ONE config repo
- `app_config(key text primary key, value text not null, updated_at timestamptz not null default now())`.
- Created ONCE in migration **0020** (Phase 0). B and backup-sync must NOT each `CREATE TABLE app_config`.
- The ONLY config-access module is **`src/lib/config/repo.ts`** (built by Phase 0), exporting the ENCRYPTED surface that ALL consumers use: `setAppConfig(key, plaintext)`, `getAppConfig(key) → string|null`, `deleteAppConfig(key)`, `setAppConfigJson(key, obj)`, `getAppConfigJson<T>(key) → T|null` — each encrypts/decrypts via `secret-box`. B, backup-sync, and G ALL import from `@/lib/config/repo`. **B does NOT create its own `src/lib/config/app-config-repo.ts`** — that is removed; B uses `config/repo.ts`. (Resolves re-verify NEW-1.)
- All instance-level secrets (SMTP, S3, git-sync, instance-migrate token, OIDC client secret) live in `app_config` via this repo, encrypted via secret-box. (G's owner-scoped `settings` table is fine for non-secret owner JSON, but OIDC client secret goes in `app_config`.)

### 1c. Document authorization — `src/lib/authz/doc-access.ts` (from A, extended)
- The ONLY doc-authz authority. A builds it and MUST expose BOTH:
  - action gate: `authorizeDocRoute(user, docId, action) → {ok, status}` with `DocAction = 'view'|'comment'|'edit'|'manage'`.
  - capability set + share-grant union: `getDocAccess({user?, shareGrant?}, docId) → {canView, canComment, canEdit, canManage}` (folds in `document_permissions` + share-token grant + owner).
  - **CANONICAL `ShareGrant` shape (locked — resolves 5th-pass R2):** `shareGrant?: { role: DocPermRole } | null` where `DocPermRole = 'viewer'|'commenter'|'editor'`. A's `getDocAccess` maps that `role` to capabilities via `PERM_ALLOWS` (A's existing impl — unchanged). H's `resolveShareGrant` MUST return `{ role }` (derive the role from the share row's permission level), and J's asset call passes `{ role }`. NO `{ share, capabilities }` shape anywhere — H/J conform to A's `{ role }`.
- H MUST import these from `@/lib/authz/doc-access` and MUST NOT create `src/lib/docs/access.ts`. H's `getDocAccess` is deleted; the capability-set lives in A's module. A ships the capability-set surface up front so H can consume it. Freeze both signatures before A starts Task 6.

### 1d. Audit — `src/lib/audit/index.ts`, built in Phase 0 (merges A + G)
- ONE `logAudit(entry)` with ONE merged `AuditAction` union. Phase 0 ships the union = the EXISTING verbs already in `audit/index.ts` ∪ these **EXACT canonical NEW verbs (ALL DOTTED — never underscored, never `_change`/`_grant` variants):**
  `user.create`, `user.invite`, `user.disable`, `user.enable`, `user.delete`, `user.role`, `ownership.transfer`, `doc.share`, `doc.unshare`, `session.revoke`, `mfa.enable`, `mfa.disable`, `oidc.config`, `login.locked`.
- A (§1b) and G (§5.1) ADD ONLY verbs from this list that aren't already present, using THESE EXACT strings — no parallel spellings (`user.role_change`, `doc.permission_grant`, `session_revoke`, `mfa_enable` are BANNED). A emits `user.role`/`doc.share`/`doc.unshare`; G emits `session.revoke`/`mfa.enable`/`mfa.disable`/`oidc.config`/`login.locked`. (Resolves re-verify NEW-2.)
- Phase 0 also EXPORTS `verifyAuditChain(): Promise<{ ok: boolean; brokenAt?: string }>` (re-hash the chain + compare) — G's admin "Verify integrity" affordance + tests consume it. (Resolves re-verify NEW-3.)
- Signature includes the `ip` param + `prev_hash`/`entry_hash` sha256 chain. `audit_log.target_id` is `text` (uuid→text). Built in migration **0021** with the `BEFORE UPDATE/DELETE` append-only trigger.
- A and G both call this one helper; neither forks the union or re-edits the migration.

### 1e. Email — `src/lib/email/send.ts` (from B)
- B owns `sendEmail(p: EmailPayload): Promise<SendEmailResult>`, `EmailPayload = {to, subject, text, html?, replyTo?}`. B exports `EmailPayload` + `SendEmailResult` + `inviteEmailPayload`/template helpers from `src/lib/email/`.
- A imports `sendEmail` + `EmailPayload` from B; A DELETES its local `OutboundEmail` type and uses B's `inviteEmailPayload`. A keeps the dynamic-import + no-op fallback so A can build before B, but the type is B's.
- B also builds `src/lib/notifications/send.ts` (`sendNotification(...)` atop `sendEmail`) that H consumes for @mention notify. (Previously unassigned — assigned to B.)

### 1f. SMTP config is DB-only (B's design wins)
- No `SMTP_*` env vars. I's first-run wizard (I4) checks `isSmtpConfigured()` (DB), NOT `SMTP_HOST/PORT/...` env. Remove the SMTP env checklist from I4.

### 1g. `backup-verify` scheduler job — backup-sync OWNS it
- backup-sync registers the single `backup-verify` job (weekly, parse-not-restore, ON by default). I does NOT register a `backup-verify` job; I only adds the dashboard surface that reads the job state. Remove I's duplicate registration + its `BACKUP_VERIFY` env gate (job is on-by-default per backup-sync).

### 1h. README — ONE owner: F (F3)
- F3 is the sole README rewrite. C4 does NOT rewrite README; C provides the compose-quickstart CONTENT (a snippet) that F3 incorporates. One `README.md` task total.

### 1i. Roles — A's lattice is canonical
- Workspace roles: `owner > admin > editor > viewer` (A's `roles.ts`). Doc-permission roles: `viewer | commenter | editor`.
- The string `'member'` is BANNED. G's OIDC JIT-provision + I default new users to workspace role **`editor`**. `guard.ts` uses A's role set only.

### 1j. Telemetry — DROP the phone-home for v0.2.0
- No `https://telemetry.parchment.app/ping` exists; do NOT ship a failing fetch. I keeps structured logging + log levels; remove the network telemetry ping + `PARCHMENT_TELEMETRY` network behavior (keep only a local "anonymous usage logged locally" no-op, or drop entirely).

### 1k. `src/middleware.ts` — I owns it (maintenance + metrics ONLY)
- It must NOT perform auth gating (A's per-route authz stays authoritative). Add a note for the security reviewer that middleware does not shadow per-route auth.

---

## 2. Migration block (allocated centrally; hand-number against the integrated branch journal; last on disk = `0019`)

| # | Owner | Contents |
|---|---|---|
| **0020** | Phase 0 | `app_config` table (1b) |
| **0021** | Phase 0 | `audit_log` hardening: `ip`, `prev_hash`, `entry_hash`, `target_id` uuid→text, append-only trigger (1d) |
| **0022** | A | `users.disabled_at`, `document_permissions(doc_id,user_id,role)`, `invites` |
| **0023** | G | `oidc_identities`, `oidc_login_flows`, `login_lockouts` |
| **0024** | I | `users.quota_mb` |
| **0025** | H | `comments.anchor_start`, `comments.anchor_end`, `comments_doc_resolved_idx` |
| **0026** | backup-sync | only if a non-`app_config` table is needed (else none — git/S3/migrate config all live in `app_config`) |
| **0027** | J | `pats.scopes` (J8 token scopes), any J asset-layout column |

No plan runs `drizzle-kit generate` off a stale base; each hand-writes its assigned number + journal entry against the integrated branch. The `app_config` and `audit_log` migrations are written ONCE (Phase 0), never by B/G/backup-sync.

---

## 3. Build order (migration order ≈ build order)

1. **C** — infra (Dockerfile strip, compose, migrate.sh) — independent, can run in parallel with Phase 0.
2. **Phase 0** — `secret-box` + `app_config` (0020) + unified `audit_log`/`logAudit` (0021). Blocks B/G/backup-sync.
3. **A** — multi-user; owns `doc-access.ts` (action gate + capability set), `roles.ts`, `users-repo`. (0022)
4. **B** — SMTP (consumes secret-box + app_config), `sendEmail`/`EmailPayload`/`notifications/send`. (no migration)
5. **G** — security (consumes secret-box + merged audit); OIDC, MFA gap-fill, session-revoke, admin layout. (0023)
6. **I** — ops (health/ready/metrics, logging, maintenance, quota, GDPR export, Trivy); healthcheck appended AFTER C; dashboard for backup-verify. (0024)
7. **F** — hygiene (AGPL, README incl. C's compose snippet, templates, page-gap) — additive, parallel-safe.
8. **H** — collab (consumes A's doc-access + B's notifications). (0025)
9. **backup-sync** — F1/D/E/I3 (consumes secret-box + app_config; owns backup-verify). (0026 if needed)
10. **J** — content/editor gap-fill. (0027 if needed)

---

## 4. Env-var registry (C's `docker-compose.yml` + `.env.example` MUST document ALL of these)

`DATABASE_URL`, `COLLAB_URL`/`COLLAB_PORT`, `PARCHMENT_FILES_ROOT`, `PARCHMENT_VERSION`, `PORT`, `SECURE_COOKIES`, `POSTGRES_USER/PASSWORD/DB` (compose db service) — **plus the new**: `PARCHMENT_SECRET_KEY` (REQUIRED for all encrypted config), `PARCHMENT_PUBLIC_URL` (REQUIRED — external base URL for invite-accept links + OIDC `redirect_uri`; phase0 boot-fails if absent), `BACKUP_S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY` (optional, env-precedence over UI), `METRICS_TOKEN` (optional, gates `/metrics`), `LOG_LEVEL`/`LOG_FORMAT`, `PARCHMENT_DEFAULT_QUOTA_MB`, `PARCHMENT_LOCK_DIR`, `EMBEDDINGS_URL`/`EMBEDDINGS_API_KEY`/`EMBEDDINGS_MODEL` (optional, semantic search). BANNED: `APP_SECRET`, `SMTP_*`, `PARCHMENT_TELEMETRY` network ping, `BACKUP_VERIFY`. C owns updating compose + `.env.example`; the integrated build verifies every var here is present in both.

---

## 5. Per-plan amendment checklist

- **A:** authz module path = `src/lib/authz/doc-access.ts`, expose capability-set for H; import `sendEmail`+`EmailPayload` from B (delete `OutboundEmail`); audit verbs EXTEND the Phase-0 union (don't replace); migration → **0022**; `app_config`/audit migrations are NOT A's (Phase 0).
- **B:** delete `lib/config/encrypt.ts`; import `@/lib/crypto/secret-box`; do NOT create `app_config` (Phase 0 owns it); env var `PARCHMENT_SECRET_KEY` not `APP_SECRET`; add `src/lib/notifications/send.ts`; no migration of its own.
- **C:** do NOT rewrite README (give F a compose snippet); compose + `.env.example` document the full §4 registry incl. `PARCHMENT_SECRET_KEY`; healthcheck targets `/api/healthz` (exists only after I) → either C ships a minimal healthz or the healthcheck is added with I; `createdb`/target uses `$POSTGRES_DB`/DATABASE_URL host, not hardcoded `parchment`.
- **F:** F3 is the sole README rewrite, incorporating C's compose quickstart snippet.
- **G:** delete `secret-box` duplication claim (consume Phase-0 module); audit hardening is Phase 0 (0021), not G's migration; G migration (0023) = oidc/lockouts only; audit verbs EXTEND the union; JIT role = `editor` not `member`; admin `layout.tsx` uses A's `requireAdmin`.
- **H:** delete `src/lib/docs/access.ts`; import `getDocAccess`/`authorizeDocRoute` from `@/lib/authz/doc-access`; `sendNotification` from B's `notifications/send`; migration → **0025**.
- **I:** drop SMTP env checklist (use `isSmtpConfigured()`); drop the `backup-verify` job registration + `BACKUP_VERIFY` env (backup-sync owns it; I adds dashboard only); drop network telemetry ping; migration (quota) → **0024**; healthcheck edit sequenced after C; default new-user role `editor` not `member`.
- **backup-sync:** consume `@/lib/crypto/secret-box` + Phase-0 `app_config` (don't define crypto/table); env `PARCHMENT_SECRET_KEY`; owns `backup-verify`; migration → **0026** only if a non-app_config table is required.
- **J:** any migration → **0027**; consume A's authz for asset access; reuse S3 config (no new `ASSETS_S3_*` — reuse `BACKUP_S3_*` namespace or document the decision).

---

## 6. New foundation plan
A new `phase0-foundation.md` plan implements 1a/1b/1d (secret-box, app_config 0020, unified audit 0021 + merged logAudit) as the first build phase. It is the prerequisite for B, G, backup-sync, A(audit), and H.

---

## 7. 4th-pass fixes (LOCKED — security + internal-soundness + accuracy)

The 3-lens 4th pass found real defects. These are binding; affected plans must conform.

**Foundation (Phase 0):**
- 7a `PARCHMENT_PUBLIC_URL` is a NEW required env (base URL). Add to §4 registry + `src/lib/env.ts` (`publicUrl`). A's invite-accept links AND G's OIDC `redirect_uri` use it. (Was dangling in both.)
- 7b Audit union must INCLUDE `'setup'` (existing raw call-site in `src/app/setup/actions.ts`; G converts it to typed `logAudit` → must be in the union or typecheck fails). Add to the legacy-verb line.
- 7c Audit hash chain: compute `entry_hash` from the PERSISTED row's stored `created_at` (read-back or pass the DB value), NEVER `Date.now()` — else `verifyAuditChain` never re-verifies.

**Bootstrap / roles:**
- 7d The setup bootstrap OWNER stays `role:'owner'` (I only adds `quotaMb` there). The `editor` default applies ONLY to invited + OIDC-JIT users. I must NOT downgrade `setup/actions.ts`.

**Security — IDOR & authz (NEW, binding):**
- 7e Sub-resource routes (`/api/docs/[id]/comments/[commentId]`, `/versions/[versionId]`(+restore), `/assets/[file]`, threads, any `[childId]`) MUST verify `child.docId === [id]`. The repos (`comments-repo`, `versions-repo`) take + filter on `docId` (`and(eq(id), eq(docId))`). A's Task 6 + H's Task 9 both bind this.
- 7f A's doc-route authz sweep (Task 6) is a CLOSED ENUMERATION of every `/api/docs/[id]/*` + `bulk` + `export/bulk` route with a per-route verdict, backed by a CI-enforced `tests/integration/authz-routes.test.ts` (non-owner-non-shared → 404 read+write; `viewer` can't mutate; CI fails if a new doc route lacks an entry). No "decide per feature" prose.
- 7g `moveDocument(id, folderId)` (and any folderId-accepting write) verifies the target folder is owned by the same user.
- 7h Collab server (`collab/server.ts`) MUST add `onAuthenticate` — reject unless a session/PAT/share-grant matches `documentName` with the needed capability (reject expired / view-only for edit). H Task 15 is promoted from "stretch/deferrable" to **REQUIRED**. Also bind the collab port to `127.0.0.1` and document "never publish it".
- 7i PAT scopes (J8): canonical strings `docs:read`/`docs:write` (fix the `'read'` vs `'docs:read'` inconsistency); enforce over ALL mutating routes — `docs`, `folders`, `tags`, `smart-folders`, `templates`, `settings`, `webhooks`, `backup` — not just `/api/docs/*`. `/api/backup/export|restore` stay self-service but require `docs:read`/`docs:write` scope (a read-scoped PAT can't restore).
- 7j OIDC JIT must respect `disabledAt` — a disabled user's email cannot re-activate via OIDC.

**Single-owner collisions:**
- 7k `/api/healthz`: C owns it (liveness, `{status:'ok'}`) + its test. I does NOT rewrite it; I adds `/api/readyz` for the deep readiness checks. One test owner.
- 7l backup-verify dashboard: backup-sync owns BOTH the job AND the dashboard on `/settings/backup`. I builds NO verify block on `/settings/admin/backup` (which backup-sync turns into a redirect).
- 7m `src/middleware.ts`: ONE owner = I (maintenance + metrics, no auth). No second writer.

**Seams / correctness:**
- 7n `inviteEmailPayload`: B re-exports it from `@/lib/email/send` with the OBJECT arg `{to, inviterName, workspaceName, acceptUrl}`; A calls it with that object (not positional).
- 7o `migrate.sh`: EVERY `psql`/`pg_dump`/`createdb` uses `$POSTGRES_USER`/`$POSTGRES_DB` (incl. the schema-check + apply loop), never hardcoded `parchment`.
- 7p C: resolve the PGDG keep-vs-remove contradiction (keep `postgresql-client-18`, remove the server + s6 service); the CI compose-lint job sets `POSTGRES_PASSWORD`.
- 7q backup-sync: add explicit tasks for the NEW git helpers `gitDir()` + `ensureRepo()` (don't dangle). `parseWorkspaceBackup` ALREADY exists (`src/lib/backup/service.ts`) — import it.
- 7r H: Task 7's return type is mapped to Task 8's `getDocAccess` param (one shape); the concurrency harness (Task 13) is sequenced BEFORE the tasks that use it.
- 7s A: Task 14 Step 5 invariant test has REAL assertions (not comment-only); Task 11's `_user-row.tsx` + `_create-invite-forms.tsx` have actual code, not "similar to mfa-section". Test refs use `issuePat` (not `createPat`).
- 7t G: remove the Task 5.1 remnant that re-adds verbs Phase 0 already has; flesh out the OIDC stub-provider test + state-race handling; `requireAdmin` already exists at `src/lib/auth/guard.ts` (G only adds the admin `layout.tsx`).
- 7u D2 selective restore: ADD a real selective-restore task (pick docs/folders) to backup-sync.
- 7v `/metrics`: default-deny when `METRICS_TOKEN` is empty (admin-session-only), never open. i-ops cleanups: no `const user` shadow; `pg_database_size(current_database())` not hardcoded `'parchment'`; drop the phantom `sendBootPing` removal note.
