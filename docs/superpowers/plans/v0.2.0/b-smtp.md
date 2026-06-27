# Plan: Group B — SMTP / email (v0.2.0)

**Spec items:** B1 (SMTP config UI), B2 (test-email), B3 (sendEmail interface), B4 (unhide Notifications)  
**Internal build order:** implement in task order below; B3 is the shared interface A/G/H consume later.

---

## Context & Key Decisions

### Crypto module: Phase 0 canonical (`@/lib/crypto/secret-box`)
B does NOT define its own encryption helper. Phase 0 builds the one canonical AES-256-GCM module
at `src/lib/crypto/secret-box.ts`. B imports `encryptSecret`, `decryptSecret`, `SECRET_MASK`,
`isMasked` directly from `@/lib/crypto/secret-box`. The master key env var is
`PARCHMENT_SECRET_KEY` (base64-encoded 32 bytes), NOT `APP_SECRET`. If `PARCHMENT_SECRET_KEY` is
absent, encrypted-config writes return 503 with a UI callout; reads of unencrypted config still work.

### `app_config` table: Phase 0 owns it
B does NOT create the `app_config` table or its migration. Phase 0 creates it in migration **0020**.
B only reads and writes rows via the existing `app_config` table. B has no migration of its own.

### Mail library: nodemailer
nodemailer is the de-facto Node.js SMTP client (MIT, actively maintained, no native deps). It is
not yet in `package.json`. A dynamic import is used inside `sendEmail()` (same idiom as
`@aws-sdk/client-s3` in `src/lib/backup/s3.ts`) to keep it out of the default bundle. No
alternative considered — postmark/sendgrid SDKs are SaaS-only.

### Encrypted-secret pattern
A single `app_config` table (built by Phase 0) holds typed key-value rows. Sensitive values (SMTP
password) are stored AES-256-GCM encrypted using `encryptSecret` from `@/lib/crypto/secret-box`.
The password is never returned to the client: GET/read endpoints return `"••••••••"` as a
write-only mask. This exact pattern (table + helper + read/write/mask) is the canonical model for
S3 credentials (E2) and git-sync tokens (E3).

### SMTP config is DB-only
No `SMTP_*` env vars. All SMTP configuration is stored in the `app_config` table and admin-editable
at runtime. Callers use `isSmtpConfigured()` (DB check) to test availability.

### Placement: Admin settings, not Workspace
SMTP config is an instance-wide setting (one SMTP server per install). It belongs in
`/settings/admin`, alongside Backup, Audit, etc. The Notifications *user* settings page
(`/settings/notifications`) is unhidden in B4 and wired to the SMTP availability state.

### Off-unless-configured
`sendEmail()` resolves silently (no throw) when SMTP is unconfigured, logging a server-side warning.
Callers (A5 invite, G4 password-reset, H share notification) check `isSmtpConfigured()` before
calling if they need to surface an error to the user.

### Notifications helper: B also owns `src/lib/notifications/send.ts`
B builds `sendNotification(...)` in `src/lib/notifications/send.ts`, layered atop `sendEmail`. H
imports `sendNotification` from this module for @mention and share notifications.

---

## Environment Variables

B introduces no new env vars of its own. The relevant vars are owned by other phases:

```
PARCHMENT_SECRET_KEY  — base64-encoded 32 bytes; master AES-256-GCM key. Validated at boot
                        in src/lib/env.ts (Phase 0). If absent, encrypted-config writes return
                        503 with a UI callout. Owned by §4 registry (C documents in compose +
                        .env.example). NOT APP_SECRET.
```

No `SMTP_*` env vars — all SMTP config is DB-stored and admin-editable at runtime.

---

## Task List

### B0 — Verify Phase 0 prerequisites (no new crypto module; no new table; no new config repo)

**Files:** none new — this task is a verification gate only.

**What to confirm before B1b:**
- Phase 0 has landed: `src/lib/crypto/secret-box.ts` exports `encryptSecret`, `decryptSecret`,
  `SECRET_MASK`, `isMasked`, `redactSecret`.
- Phase 0 has landed: `src/lib/config/repo.ts` exports `setAppConfig`, `getAppConfig`,
  `deleteAppConfig`, `setAppConfigJson`, `getAppConfigJson` (all encrypt/decrypt via secret-box).
- Phase 0 has landed: `app_config` table exists (migration **0020** applied).
- `src/lib/env.ts` exports `secretKey` (validated from `PARCHMENT_SECRET_KEY`).

B imports all crypto primitives from `@/lib/crypto/secret-box`. B imports all config-persistence
primitives from `@/lib/config/repo`. B does NOT create `src/lib/config/encrypt.ts` and does NOT
create its own `src/lib/config/app-config-repo.ts` — the canonical repo is `@/lib/config/repo`
(Phase 0). B does NOT define `APP_SECRET` in env.ts.

If Phase 0 is not yet merged, B's tasks B1b, B3, B2, B1c must mock both `@/lib/crypto/secret-box`
and `@/lib/config/repo` in tests (same pattern as mocking any peer module). The production imports
are real once Phase 0 is on the integrated branch.

---

### B1b — `smtp-config-repo.ts` (typed SMTP config wrapper over the canonical config repo)

**Files:**
- `src/lib/config/smtp-config-repo.ts` *(new)*
- `tests/unit/smtp-config-repo.test.ts` *(new)*

**Shape:**
```ts
export type SmtpConfig = {
  host: string
  port: number           // validated 1-65535
  user: string
  fromAddress: string
  tls: 'none' | 'tls' | 'starttls'
  // password is NEVER in this type — separate read/write path
}

// Returns null when SMTP is not yet configured.
export async function getSmtpConfig(): Promise<SmtpConfig | null>

// Returns the masked password string, or null if no password is stored.
export async function getSmtpPasswordMasked(): Promise<string | null>
  // returns SECRET_MASK if a password is stored, null if not

// Saves all fields; `password` is encrypted if non-empty and non-masked.
// If `password` equals SECRET_MASK, the stored password is left unchanged.
export async function saveSmtpConfig(config: SmtpConfig & { password: string }): Promise<void>

// True when a complete SMTP config exists in DB.
export async function isSmtpConfigured(): Promise<boolean>

// Clears all SMTP config rows (used by tests or future "reset" action).
export async function clearSmtpConfig(): Promise<void>
```

Implementation stores two `app_config` entries via the canonical config repo (Phase 0):

- `smtp_config` — the non-secret fields (`host`, `port`, `user`, `fromAddress`, `tls`) persisted
  as an encrypted JSON blob via `setAppConfigJson('smtp_config', {...})` /
  `getAppConfigJson<SmtpConfig>('smtp_config')` from `@/lib/config/repo`. Because `repo.ts`
  encrypts every value via `secret-box`, these fields are encrypted at rest even though they are
  not individually sensitive.
- `smtp_password` — the plaintext password (before encryption) is passed to
  `setAppConfig('smtp_password', plaintextPassword)` from `@/lib/config/repo`; `repo.ts`
  encrypts it via `secret-box`. `getSmtpPasswordMasked()` reads via `getAppConfig('smtp_password')`
  (returns the decrypted plaintext for internal use only) then returns `SECRET_MASK` to callers.

`getSmtpConfig()` calls `getAppConfigJson<SmtpConfig>('smtp_config')` from `@/lib/config/repo`
and returns `null` when the key is absent.

`clearSmtpConfig()` calls `deleteAppConfig('smtp_config')` and `deleteAppConfig('smtp_password')`
from `@/lib/config/repo`.

`smtp-config-repo.ts` imports:
- `setAppConfig`, `getAppConfig`, `deleteAppConfig`, `setAppConfigJson`, `getAppConfigJson` from
  `@/lib/config/repo` (Phase 0 canonical repo — ALL persistence goes through here).
- `SECRET_MASK`, `isMasked` from `@/lib/crypto/secret-box` (for the mask guard and return value).

`smtp-config-repo.ts` does NOT call `encryptSecret`/`decryptSecret` directly — encryption is
handled inside `repo.ts`. No raw crypto code lives in this file.

**Tests (`tests/unit/smtp-config-repo.test.ts`):** mock `@/lib/config/repo` + mock `@/lib/crypto/secret-box`:
1. `isSmtpConfigured()` is false before any save.
2. `saveSmtpConfig(...)` then `getSmtpConfig()` round-trips all non-password fields.
3. `getSmtpPasswordMasked()` returns `SECRET_MASK` after a save with a password.
4. `getSmtpConfig()` does NOT return the password in any field.
5. Sending `password = SECRET_MASK` on a second save leaves the stored password unchanged.
6. `clearSmtpConfig()` removes all keys → `isSmtpConfigured()` false.
7. Port stored/retrieved as number (not string).

---

### B3 — `src/lib/email/send.ts` (the shared `sendEmail()` interface)

**Files:**
- `src/lib/email/send.ts` *(new)*
- `tests/unit/email-send.test.ts` *(new)*

**Interface:**
```ts
import 'server-only'

export type EmailPayload = {
  to: string | string[]
  subject: string
  text: string        // plain-text fallback (required)
  html?: string       // optional HTML body
  replyTo?: string
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string }

// Sends an email via the DB-configured SMTP transport.
// Returns { ok: false } (never throws) when unconfigured or on transport error.
// The SMTP password is decrypted inside this function and NEVER logged.
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult>

// Re-exported from @/lib/email/templates so A (and any caller) can import
// sendEmail + inviteEmailPayload from this single canonical path.
// A calls: inviteEmailPayload({ to, inviterName, workspaceName, acceptUrl })
export { inviteEmailPayload } from '@/lib/email/templates'
```

Implementation:
1. Calls `isSmtpConfigured()` → if false, return `{ ok: false, error: 'smtp_not_configured' }`.
2. Reads `getSmtpConfig()` for the non-secret fields; reads the decrypted SMTP password via
   `getAppConfig('smtp_password')` from `@/lib/config/repo` — `repo.ts` decrypts via
   `secret-box` internally. `send.ts` MUST NOT call `decryptSecret` directly; it only calls
   `getAppConfig('smtp_password')` and uses the returned plaintext string.
3. Dynamic imports `nodemailer` (`await import('nodemailer')`).
4. Creates a transporter with appropriate `secure`/`requireTLS`/`ignoreTLS` based on `tls` field:
   - `'tls'` → `secure: true, port: config.port`
   - `'starttls'` → `secure: false, requireTLS: true`
   - `'none'` → `secure: false, ignoreTLS: true`
5. Calls `transporter.sendMail(...)`.
6. On success: returns `{ ok: true, messageId }`.
7. On error: logs `[smtp] send failed: ${err.message}` (NOT the password, NOT the full error
   object which could contain credentials in some SMTP stacks) → return `{ ok: false, error }`.

**Tests (`tests/unit/email-send.test.ts`):** mock nodemailer + mock smtp-config-repo:
1. Returns `{ ok: false, error: 'smtp_not_configured' }` when `isSmtpConfigured()` is false.
2. Calls `transporter.sendMail` with correct `from`, `to`, `subject`, `text` when configured.
3. `tls: 'tls'` → `secure: true`.
4. `tls: 'starttls'` → `secure: false, requireTLS: true`.
5. `tls: 'none'` → `secure: false, ignoreTLS: true`.
6. Transport error → returns `{ ok: false, error: '...' }` (does NOT throw).
7. SMTP password is NOT present in any argument to `console.log` or `console.error` (spy on
   console methods; assert `.mock.calls` contain no occurrence of the mock password string).
8. `to` as array → `to` field is the joined string nodemailer expects.

---

### B2 — Test-email API endpoint

**Files:**
- `src/app/api/settings/smtp/test/route.ts` *(new)*
- `tests/unit/smtp-test-route.test.ts` *(new)*

**Route: `POST /api/settings/smtp/test`**

Request body:
```json
{
  "host": "...", "port": 587, "user": "...", "password": "...",
  "from": "...", "tls": "starttls", "to": "admin@example.com"
}
```

- `to` is the destination for the test email (defaults to the authenticated user's email).
- `password` may be `SECRET_MASK` → reads the stored password from DB for the test (so the user
  doesn't have to re-enter the password to test a saved config).
- Builds a one-shot transporter from the submitted fields (does NOT save to DB).
- Sends a test email with subject "Parchment SMTP test" and fixed text body.
- Returns `{ ok: true }` or `{ ok: false, error: string }`.
- Auth: `requireAdmin()` — only owners/admins may test SMTP.
- Never logs the password; never echoes it in the response.

**Tests (`tests/unit/smtp-test-route.test.ts`):** mock nodemailer + mock auth guard:
1. 401 when not authenticated.
2. 400 on missing required fields (`host`, `port`, `from`, `tls`).
3. 400 when `port` is out of range (0 or 65536).
4. Uses stored password when `password === SECRET_MASK` (mock repo returns a decrypted value).
5. `{ ok: true }` on transporter success.
6. `{ ok: false, error }` on transporter failure (no 500).
7. Password not present in logged output (same spy approach as B3 tests).

---

### B1c — SMTP config server action + form component

**Files:**
- `src/app/(app)/settings/admin/smtp/page.tsx` *(new — server component, fetches + passes config)*
- `src/components/settings/SmtpConfigForm.tsx` *(new — client component)*
- `src/app/api/settings/smtp/route.ts` *(new — GET + PUT)*
- `tests/unit/smtp-config-form.test.ts` *(new — DOM/jsdom)*

**API routes (`src/app/api/settings/smtp/route.ts`):**

`GET /api/settings/smtp` → returns current config (password masked):
```json
{ "host": "smtp.example.com", "port": 587, "user": "user@example.com",
  "from": "noreply@example.com", "tls": "starttls",
  "password": "••••••••" }
```
or `{ "configured": false }` if no config stored.
Auth: `requireAdmin()`.

`PUT /api/settings/smtp` → validates + saves:
```json
{ "host": "...", "port": 587, "user": "...", "password": "...",
  "from": "...", "tls": "none"|"tls"|"starttls" }
```
- `password === SECRET_MASK` → leave stored password unchanged.
- `password === ""` → clear the stored password (unauthenticated relay).
- Returns the same shape as GET (password masked).
- Auth: `requireAdmin()`.
- Validation: `host` non-empty, `port` 1-65535, `from` contains `@`, `tls` in enum.

**Page (`src/app/(app)/settings/admin/smtp/page.tsx`):**
- Server component with `export const dynamic = 'force-dynamic'`.
- Calls `requireAdmin()`.
- Reads current config via `getSmtpConfig()` + `getSmtpPasswordMasked()`.
- Renders heading + `<SmtpConfigForm initialConfig={...} />`.

**Component (`src/components/settings/SmtpConfigForm.tsx`):**
- `'use client'`
- Controlled form with fields: Host, Port, Username, Password (type="password"),
  From address, TLS mode (select: None / TLS / STARTTLS).
- Password field shows `SECRET_MASK` as placeholder when a password is stored (the `value`
  is the mask; on focus, clears to empty so the user can type a new one — or cancels to restore
  the mask). This prevents browsers from auto-filling the stored encrypted value.
- Save button: PUT `/api/settings/smtp`. Inline "Saved" or error feedback.
- "Send test email" button: POST `/api/settings/smtp/test` with current form values.
  Shows a success or error toast (inline `aria-live` region, no modal).
- Validation before save: port is numeric 1-65535; host non-empty; from contains `@`.

**TDD — RED step (required before implementation):**
Write `tests/unit/smtp-config-form.test.ts` first with all assertions below failing
(component does not exist yet). Confirm the test runner reports failures, then implement
`SmtpConfigForm.tsx` + the route until all tests pass (GREEN). This mirrors the RED→GREEN
pattern required by all other B tasks.

**DOM tests (`tests/unit/smtp-config-form.test.ts`):** using jsdom + `@testing-library/react`
or direct DOM queries (follow `account-theme-select.test.ts` pattern):
1. Renders all six fields.
2. Password field value is `SECRET_MASK` when `initialConfig.password === SECRET_MASK`.
3. Focusing the password field and typing replaces the mask.
4. Port field rejects non-numeric input (or shows error on submit).
5. "Save" calls PUT with correct body.
6. "Send test email" calls POST `/api/settings/smtp/test`.
7. Inline error message displayed on PUT failure.
8. Password field is `type="password"` (never `type="text"`).

---

### B4 — Unhide Notifications nav + wire SMTP availability

**Files:**
- `src/app/(app)/settings/_nav.tsx` *(edit — uncomment Notifications entry)*
- `src/app/(app)/settings/admin/page.tsx` *(edit — add SMTP link in admin nav)*
- `src/app/(app)/settings/notifications/page.tsx` *(edit — add SMTP status banner)*

**`_nav.tsx` change:**
Remove the comment-out block; restore the Notifications entry in its original position
between Workspace and Security (alphabetical: Account, Workspace, Admin, Developer, Notifications,
Security, About — or match existing order; keep Notifications after Developer).

```ts
// BEFORE (lines 11-12):
  // CF2: Notifications hidden from the nav — no SMTP/notification delivery
  // shipped yet. The route file stays in the tree but is not linked.

// AFTER: remove those two comment lines; add the entry:
  { href: '/settings/notifications', label: 'Notifications' },
```

**`/settings/admin/page.tsx` change:**
Add an "Email (SMTP)" link card in the admin page, alongside Audit / Backup / Health / Schedules.
Follow the existing `<Link>` card pattern:
```tsx
<Link href="/settings/admin/smtp" ...>
  <span className="font-medium text-sm">Email (SMTP)</span>
  <span className="mt-0.5 block text-[var(--muted)] text-sm">
    Configure outbound email for invites and notifications.
  </span>
</Link>
```

**`/settings/notifications/page.tsx` change:**
Add a server-rendered banner at the top that shows SMTP status. The page becomes a server
component (add `async` + `'use server'` context):
```tsx
const smtpReady = await isSmtpConfigured()

// render at the top of the section:
{!smtpReady && (
  <div role="alert" className="...rounded border ...">
    Email delivery is not configured.{' '}
    <Link href="/settings/admin/smtp">Set up SMTP</Link> to enable notifications.
  </div>
)}
```

---

### B3b — `sendEmail()` consumption stubs (for A, G, H)

**Files:**
- `src/lib/email/templates.ts` *(new — reusable plain-text + HTML template builders)*

This is a pure helper with no DB or crypto deps — pure functions that produce `EmailPayload`
objects. Templates defined here (no actual sending):

```ts
export function inviteEmailPayload(opts: {
  to: string; inviterName: string; workspaceName: string; acceptUrl: string
}): EmailPayload

export function passwordResetEmailPayload(opts: {
  to: string; resetUrl: string; expiresInMinutes: number
}): EmailPayload

export function shareNotificationEmailPayload(opts: {
  to: string; sharedByName: string; docTitle: string; shareUrl: string; permission: string
}): EmailPayload
```

Each returns `{ to, subject, text, html }`. HTML bodies are minimal inline-styled strings (no
template engine) to avoid a build-time dependency. Text bodies are plain-text equivalents.

**Tests (`tests/unit/email-templates.test.ts`):**
1. `inviteEmailPayload` — `to` matches input, `text` contains `acceptUrl`, `subject` contains
   workspace name.
2. `passwordResetEmailPayload` — `text` contains `resetUrl` and expiry.
3. `shareNotificationEmailPayload` — `text` contains doc title and share URL.
4. All three: `html` contains no `<script` tags (XSS guard — simple string assertion).
5. None of the payloads contain a raw password or secret (structural test: iterate all string
   values and assert no occurrence of words like "password", "secret", "token" in VALUES,
   only in template copy like "reset your password" is acceptable — check the URLs instead).

---

### B3c — `src/lib/notifications/send.ts` (notification helper for H)

**Files:**
- `src/lib/notifications/send.ts` *(new)*
- `tests/unit/notifications-send.test.ts` *(new)*

**Interface:**
```ts
import 'server-only'
import { sendEmail, type EmailPayload } from '@/lib/email/send'

export type NotificationPayload = {
  userId: string       // recipient user ID; resolved to email internally
  subject: string
  text: string
  html?: string
}

export type SendNotificationResult =
  | { ok: true }
  | { ok: false; error: string }

// Sends a notification email to a user by userId.
// Resolves the user's email from the DB; falls through to sendEmail.
// Returns { ok: false } silently when SMTP is unconfigured (same semantics as sendEmail).
export async function sendNotification(payload: NotificationPayload): Promise<SendNotificationResult>
```

H imports `sendNotification` from `@/lib/notifications/send` for @mention and share
notification emails. A can also use it for invite notifications if preferred over calling
`sendEmail` + `inviteEmailPayload` directly.

**Tests (`tests/unit/notifications-send.test.ts`):**
1. Resolves user email from DB; calls `sendEmail` with correct `to`, `subject`, `text`.
2. Returns `{ ok: true }` when `sendEmail` returns `{ ok: true, messageId }`.
3. Returns `{ ok: false, error }` when `sendEmail` returns `{ ok: false }` (propagates).
4. Returns `{ ok: false, error: 'user_not_found' }` when userId has no matching user.
5. Does not throw on any of the above paths.

---

## File Summary

| # | File | New/Edit |
|---|------|----------|
| B0 | *(verification gate only — no new files)* | — |
| B1b | `src/lib/config/smtp-config-repo.ts` | New |
| B1b | `tests/unit/smtp-config-repo.test.ts` | New |
| B3 | `src/lib/email/send.ts` | New |
| B3 | `tests/unit/email-send.test.ts` | New |
| B2 | `src/app/api/settings/smtp/test/route.ts` | New |
| B2 | `tests/unit/smtp-test-route.test.ts` | New |
| B1c | `src/app/(app)/settings/admin/smtp/page.tsx` | New |
| B1c | `src/components/settings/SmtpConfigForm.tsx` | New |
| B1c | `src/app/api/settings/smtp/route.ts` | New |
| B1c | `tests/unit/smtp-config-form.test.ts` | New |
| B3b | `src/lib/email/templates.ts` | New |
| B3b | `tests/unit/email-templates.test.ts` | New |
| B3c | `src/lib/notifications/send.ts` | New |
| B3c | `tests/unit/notifications-send.test.ts` | New |
| B4 | `src/app/(app)/settings/_nav.tsx` | Edit |
| B4 | `src/app/(app)/settings/admin/page.tsx` | Edit |
| B4 | `src/app/(app)/settings/notifications/page.tsx` | Edit |

**Total tasks: 7 (B0, B1b, B3, B2, B1c, B3b, B3c, B4)**  
**Total files: 17 (15 new, 3 edit)** *(B1a app-config-repo removed — canonical `@/lib/config/repo` is Phase 0's; also removed 5 Phase 0 files: encrypt.ts, env.ts edit, config-encrypt.test.ts, schema.ts edit, migration)*  
**Total new test files: 8**

---

## Security Review Checklist

These are non-negotiable invariants enforced by the tests:

- [ ] **Password never returned to client** — GET `/api/settings/smtp` returns `SECRET_MASK`, not the plaintext or ciphertext.
- [ ] **Password never logged** — `sendEmail()` and test-route tests spy on `console.*` and assert the mock password string is absent.
- [ ] **Wrong-key decrypt throws** — tested in Phase 0's `secret-box.test.ts`; any tamper throws, never silently succeeds. B's smtp-config-repo tests mock the module and assert throw propagation.
- [ ] **AES-GCM IV is random per encryption** — tested in Phase 0's `secret-box.test.ts`.
- [ ] **`isMasked` guard prevents double-encrypt** — if the client sends back `SECRET_MASK`, the stored ciphertext is left unchanged; a second `encryptSecret(SECRET_MASK)` would produce a garbage password. Tested in `smtp-config-repo.test.ts` case 5.
- [ ] **`PARCHMENT_SECRET_KEY` absent → encrypt fails loudly** — enforced in Phase 0's env validation and `secret-box.ts`; no silent fallback, no use of `APP_SECRET`.
- [ ] **Admin-only routes** — GET/PUT `/api/settings/smtp` and POST `.../test` all call `requireAdmin()`; 401 tests are mandatory.
- [ ] **Port range validation** — `port` is validated 1-65535 before any DB write or transport creation.
- [ ] **From address validation** — must contain `@` at minimum before saving.
- [ ] **No `nodemailer` in client bundle** — `send.ts` has `import 'server-only'` at line 1; dynamic import inside the function body.

---

## Verification Bar (browser)

After implementation, the browser-verify checklist (to be executed by the controller):

1. Navigate to `/settings/admin` → "Email (SMTP)" card is visible and links to `/settings/admin/smtp`.
2. `/settings/admin/smtp` renders all six fields.
3. Fill in valid SMTP credentials; click Save → fields retain values; password field shows mask.
4. "Send test email" with valid config → success message appears inline.
5. "Send test email" with invalid host → error message appears inline (no 500 page).
6. Navigate to `/settings/notifications` → page loads (was previously unlinked); SMTP banner
   disappears after configuring SMTP (requires page reload/nav).
7. Settings nav shows "Notifications" between Developer and Security.
8. Open DevTools → Network → inspect GET `/api/settings/smtp` response → `password` field
   is `"••••••••"`, not a plaintext or base64 blob.

---

## Unresolved Questions

None that block implementation. Notes for the record:

- **`PARCHMENT_SECRET_KEY` bootstrapping**: Phase 0 validates this at boot in `src/lib/env.ts`.
  B inherits that validation; B itself does not add env validation.
- **nodemailer version**: pin to the latest stable (currently `^6.9.x`). Add `@types/nodemailer`
  as a dev dependency.
- **SMTP auth = none**: some relays (local Postfix) need no auth. The form should allow empty
  username + empty password; the transporter omits `auth` entirely in that case (nodemailer
  behaviour when `auth.user` is falsy).
- **TLS certificate errors in self-hosted setups**: the transporter should set
  `tls: { rejectUnauthorized: false }` as a user-configurable option in a follow-up (not in v0.2.0
  scope — it would require an extra checkbox and a security warning).
- **Email queue / retry**: `sendEmail()` is fire-and-forget in v0.2.0. A durable queue
  (e.g. a `email_queue` table + scheduler job) is explicitly deferred to post-v0.2.0.
