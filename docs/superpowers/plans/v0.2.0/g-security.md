# v0.2.0 — Group G: Security — implementation plan

Branch: `release/v0.2.0` (single release tag; build order C → A → B → **G** → …).
Test runner: `pnpm test` (`vitest run`). Unit tests live in `tests/unit/*.test.ts`
(`environment: node`); DB-backed tests in `tests/integration/*.test.ts` using a
real Postgres 18 via `@testcontainers/postgresql` (`pgvector/pgvector:pg18`),
migrations replayed from `src/db/migrations`, `DATABASE_URL` set **before** any
dynamic `import('@/db')`, `closeDb()` in `afterAll`. Migrations generated with
`pnpm db:generate` (out dir `src/db/migrations`, dialect postgres). Lint/type:
`pnpm biome check .` + `pnpm typecheck` (TS6 strict). Every task is TDD: write the
failing test first, then the minimum code to pass. **No placeholders, no
`notImplemented` left in any shipped path.**

---

## 0. Context — what already exists (read before building)

Group G is **mostly built already**; this plan fills the real gaps and does NOT
rewrite working code. Confirmed present and working:

- **G1 MFA (TOTP)** — DONE. `src/lib/auth/mfa.ts` (pure RFC-6238 via `otpauth`,
  ±1 window, `verifyTotpStep` returns absolute step), `src/lib/auth/mfa-repo.ts`
  (provisional secret, `enableTotp`, `recordTotpStep` replay watermark,
  recovery codes as argon2-hashed jsonb, single-use `consumeRecoveryCode`),
  routes `src/app/api/auth/mfa/totp/{init,enable,disable}` + `mfa/verify`,
  UI `src/app/(app)/settings/security/mfa-section.tsx`. Schema: `userMfa` table
  (`totpSecret`, `totpEnabledAt`, `recoveryCodes`, `lastTotpStep`). Recovery
  codes carry 80-bit entropy. **Tests already exist** in `tests/unit/mfa.test.ts`
  + `tests/unit/recovery-search.test.ts`. → G1 is complete; this plan only adds
  the **secret-encryption-at-rest** requirement it currently lacks (§2).
- **G5 sessions** — list DONE, **revoke NOT wired**. `src/lib/auth/sessions-repo.ts`
  (`listUserSessions`, drops `tokenHash`), GET `src/app/api/auth/sessions/route.ts`,
  UI `src/components/settings/SessionsList.tsx` (read-only; comment says "Revoking
  other sessions is a named follow-up"). `revokeOtherSessions(userId)` exists in
  `session.ts` (used post-password-change) but there is **no per-session DELETE
  route** and the UI has no revoke button. → §6 builds revoke.
- **G3 audit log** — partial. `auditLog` table (`actorId uuid`, `action text`,
  `targetType text`, `targetId uuid`, `meta jsonb`, `createdAt`), helper
  `src/lib/audit/index.ts` (`logAudit`, never-throws), viewer
  `src/components/audit/AuditLogView.tsx`, page
  `src/app/(app)/settings/admin/audit/page.tsx`. **Gaps:** (a) the page is NOT
  guarded by `requireAdmin` — there is no admin `layout.tsx`; (b) there is **no
  `ip` column** (spec requires actor/action/target/**ip**/ts) and no tamper-
  evidence; (c) `targetId` is `uuid` so OIDC/string targets can't be logged;
  (d) the `logAudit` helper is **never called** — all four write-sites
  (`setup/actions.ts`, `(auth)/login/actions.ts`, `mfa/verify/route.ts`,
  `passkey/auth/verify/route.ts`) do raw `db.insert(schema.auditLog)`, bypassing
  it. → §5 closes all four.
- **G4 rate-limit** — partial. `src/lib/auth/rate-limit.ts` (in-process fixed-
  window, `clientIp()` from XFF) + per-pending-session attempt cap
  (`consumePendingFailure`, `MFA_MAX_ATTEMPTS=5`) + TOTP replay. `mfa/verify`
  IS rate-limited. **Gap:** `(auth)/login/actions.ts` (the **password** step) is
  NOT rate-limited and has no lockout — the primary brute-force surface is open.
  → §4.
- **G2 OIDC SSO** — **STUBBED**. `src/app/api/auth/sso/route.ts` and
  `src/app/api/auth/oauth/route.ts` both return 501. No OIDC client lib installed.
  This is the largest build. → §3.
- **Encryption-at-rest** — **DOES NOT EXIST in G**. Zero cipher usage anywhere in
  `src` (webhook secrets are stored plaintext). The locked decision requires the
  OIDC client secret encrypted at rest. `src/lib/crypto/secret-box.ts` is the
  **Phase-0 canonical module** — G imports it from `@/lib/crypto/secret-box`
  (§2). G does not build its own cipher; §2 is a verification + consumption task.

Auth shape (informs G2): **custom**, not Auth.js/NextAuth. Opaque session tokens
(`randomBytes(32)` base64url, sha256-hashed in `sessions` table), httpOnly cookie
`parchment_session`, 30-day TTL, pending-session 2FA gate. Single workspace,
`users.role` ∈ {owner, admin, editor, viewer} (A's canonical lattice — the string
`'member'` is banned). Password = argon2id (`@node-rs/argon2`).
→ Because auth is custom, **use `openid-client` directly** (the maintained,
spec-complete OIDC RP lib) rather than dragging in NextAuth. Decision: locked.

**Coordination with Group A (multi-user/auth):** G builds on A's session/role
model but its tables are already in place. Two ordering constraints:
1. G2 JIT-provisions users → must use A's user-creation path once A lands. Until
   A's `createUser` helper exists, G2 inserts into `schema.users` directly with
   `role: 'editor'` (canonical default for JIT-provisioned OIDC users per §1i of
   the reconciliation — `'member'` is banned) and a null `passwordHash`
   (SSO-only users have no local password). Add a code comment pointing at the A
   helper to swap in.
2. G2 account-linking keys on `users.email` (unique). A4 per-doc ACLs and A2
   roles are unaffected by G. No schema conflict: G adds only `oidc_identities`
   and columns to existing tables.

---

## 1. Dependencies & migration scaffolding

### Task 1.1 — Install `openid-client`
- `pnpm add openid-client` (latest stable; spec-complete OIDC RP, supports
  discovery + PKCE + state + nonce). Pin newest per the repo's version policy.
- Verify it bundles cleanly in a Next 16 **node-runtime** route (it uses
  `node:crypto`; all auth routes already run nodejs runtime, not edge).
- No test; the install is validated by §3's integration test compiling.

### Task 1.2 — Schema additions (migration **0023**)
G's migration is **0023** (allocated in the canonical reconciliation §2). Write
the Drizzle schema changes in `src/db/schema.ts` and hand-number the migration
file `0023_g_oidc_lockouts.sql` against the integrated branch journal.

> **Do NOT touch `audit_log`** — its `ip`, `prev_hash`, `entry_hash`,
> `target_id` (uuid→text), and the `BEFORE UPDATE OR DELETE` append-only trigger
> are all in Phase-0 migration **0021**. G inherits those columns; G's migration
> must not duplicate or conflict with them.

G's migration adds exactly three tables:

1. **`oidc_identities`** (§3) — new table:
   ```
   id          uuid pk default random
   userId      uuid not null → users.id on delete cascade
   issuer      text not null          -- the IdP `iss`
   subject     text not null          -- the IdP `sub` (stable per-user id)
   email       text                   -- email at link time (audit/debug only)
   createdAt   timestamptz not null default now
   lastLoginAt timestamptz
   UNIQUE (issuer, subject)           -- one identity per IdP user
   index on (userId)
   ```
   Keying on (issuer, subject) — NOT email — is the security-correct link anchor:
   email is mutable at the IdP and an attacker controlling an email at a second
   IdP must not hijack an account. Email is stored for display only.
2. **`oidc_login_flows`** (§3) — short-lived server-side flow state so PKCE
   `code_verifier`, `state`, and `nonce` are **never** trusted from the client:
   ```
   state        text pk                -- CSPRNG, also the lookup key
   codeVerifier text not null          -- PKCE; never leaves the server
   nonce        text not null          -- bound into the ID-token check
   redirectTo   text                   -- post-login landing (validated, app-relative only)
   createdAt    timestamptz not null default now
   expiresAt    timestamptz not null   -- ~10 min; expired rows rejected + swept
   ```
   (A DB table, not a cookie, so the verifier/nonce are unforgeable and single-
   use — the row is DELETED on callback consumption.)
3. **`login_lockouts`** (§4) — per-account brute-force lockout:
   ```
   emailHash    text pk         -- sha256 of the normalised email; never raw email
   failedCount  int not null default 0
   lockedUntil  timestamptz
   updatedAt    timestamptz not null default now
   ```

- Drizzle types `jsonb`/`bigint` already in use; mirror existing column helpers.
- **Test (integration, `tests/integration/migration-g.test.ts`):** replay all
  migrations (0001–0023) into a fresh Testcontainer; assert:
  - `oidc_identities` and `oidc_login_flows` exist with the expected unique
    constraints; `login_lockouts` exists.
  - `audit_log` already has `ip`, `prev_hash`, `entry_hash` columns and
    `target_id` is type `text` (from Phase-0 migration 0021 — verify these as
    prerequisites, not as things G created).
  - An `UPDATE audit_log …` and `DELETE FROM audit_log …` both **raise** (the
    Phase-0 trigger is in force — assert G's migration did not accidentally
    override or drop it).
  - G's migration rolls back cleanly (no orphaned constraints).

### Task 1.3 — Env config (`src/lib/env.ts`)
Add (all `process.env`-driven, server-only, never client-bundled):
- `PARCHMENT_SECRET_KEY` — base64 32-byte master key for encryption. Document:
  required iff any encrypted secret is stored (OIDC). Phase 0 validates this at
  boot in `src/lib/env.ts`; G should confirm the validation is present and test
  that absence causes a clear error, not a silent plaintext fallback.
- `PARCHMENT_PUBLIC_URL` — the canonical base URL of the instance (e.g.
  `https://parchment.example.com`). **Required** (boot-fail if absent); added to
  the §4 env-var registry per reconciliation §7a. G's `env.ts` must validate it
  is set and export it as `env.publicUrl`. Used exclusively for the OIDC
  `redirect_uri` (§3.2) and A's invite-accept links — never for auth origin checks
  derived from the live request. G confirms the validation in `src/lib/env.ts`;
  Phase 0 or A may have added it first; do NOT duplicate the definition.
- OIDC config is stored in the DB (`app_config` table, key `'oidc'`, encrypted
  via `@/lib/crypto/secret-box`) — NOT env — so admins configure it in the UI
  (§3.1). Env only holds the master key. (Mirrors B1 SMTP / backup-sync S3:
  "secret encrypted at rest, never echoed".)
- No test for env shape itself; consumed by §2/§3 tests.

---

## 2. Encryption-at-rest — consume the Phase-0 canonical module

`src/lib/crypto/secret-box.ts` is **built by Phase 0**, not by G. G is a
consumer. Do NOT create a duplicate crypto module or a separate `redact.ts`.

### Task 2.1 — Import and verify the canonical module
- Import `encryptSecret`, `decryptSecret`, `SECRET_MASK`, `isMasked`, and
  `redactSecret` from `@/lib/crypto/secret-box` everywhere G needs them (OIDC
  config store §3.1, display redaction, any secret display path).
- `redactSecret` is exported directly from the canonical module (the reconciliation
  folded the redaction concern into `secret-box`). Do **not** create
  `src/lib/crypto/redact.ts`.
- **Verification task (not a build task):** before writing any G code that touches
  crypto, confirm that `src/lib/crypto/secret-box.ts` exists and exports the
  expected surface (`encryptSecret`, `decryptSecret`, `SECRET_MASK`, `isMasked`,
  `redactSecret`). If Phase 0 has not landed yet, stub the import with a
  `// TODO: Phase 0 prerequisite` comment and block merging G until Phase 0
  is merged.
- **Threat model (document in G's oidc-config.ts header):** the encrypted OIDC
  client secret is protected at rest against a DB-only dump. An attacker who
  controls the running app's env also holds `PARCHMENT_SECRET_KEY` — that threat
  is out of scope for at-rest encryption. The key lives only in env, never in the
  DB. The Phase-0 module provides the full threat-model prose; G references it.

> **Note on tests:** `tests/unit/secret-box.test.ts` is Phase 0's responsibility.
> G's tests for OIDC config (§3.1) implicitly exercise the crypto path (assert the
> stored value ≠ plaintext and decrypts back). No separate G-owned crypto unit
> tests are needed.

---

## 3. G2 — OIDC SSO (generic OIDC: Google / GitHub / Authentik / Keycloak)

One integration, configured by a discovery URL + client id + client secret.
Library: `openid-client`. All routes node-runtime.

### Task 3.1 — OIDC provider config (store + admin UI)
- Repo `src/lib/auth/oidc-config.ts` (`'server-only'`): read/write the single
  workspace OIDC config in the **`app_config` table** (Phase-0 canonical store,
  key `'oidc'`). The `app_config` table has the shape
  `(key text pk, value text, updated_at timestamptz)` and is created in Phase-0
  migration **0020** — do NOT create it here.
  Config shape (serialised as JSON in `value`):
  `{ enabled, issuerUrl, clientId, clientSecretEnc, scopes }`.
  Persist via `setAppConfigJson('oidc', config)` / `getAppConfigJson<OidcConfig>('oidc')`
  imported from `@/lib/config/repo` (Phase-0 canonical store — do NOT write
  raw SQL or a separate repo file). The `config/repo` module encrypts/decrypts
  via `@/lib/crypto/secret-box` internally; G still imports
  `encryptSecret`/`decryptSecret` from `@/lib/crypto/secret-box` directly only
  when it needs to wrap the client secret before handing it to `setAppConfigJson`
  (i.e. store `clientSecretEnc = encryptSecret(clientSecret)` in the JSON object).
  `getOidcConfig()` calls `getAppConfigJson('oidc')` and decrypts
  `clientSecretEnc` only when actually performing a flow, **never** for display.
  `getOidcConfigForDisplay()` returns the config with the secret replaced by
  `redactSecret(clientSecretEnc)` (from `@/lib/crypto/secret-box`) and never
  decrypts.
- Server Action / route to save config: **admin-only** (`requireAdmin` —
  already exported from `src/lib/auth/guard.ts`; import from there, do NOT
  re-export or re-implement it).
  On save, validate the issuer by running discovery once (`openid-client`
  discovery) and return a clear error if it fails — analogous to B2 "test before
  save". Audit the change (§5) with `action:'oidc.config'`, no secret in `meta`.
- Admin UI section under `src/app/(app)/settings/admin/` (e.g. a new
  `sso/page.tsx`): issuer URL, client id, client secret (password input, shows
  `••••` when set, blank = unchanged), enable toggle, "Test discovery" button.
  Secret is **write-only** in the form (never sent back to the client).
- **Tests (integration, `tests/integration/oidc-config.test.ts`):**
  - saving a config persists `clientSecretEnc` that is **not** the plaintext
    (decrypts back to it).
  - `getOidcConfigForDisplay()` returns the redaction mask, never the plaintext,
    and the secret string never appears in the serialized response.
  - a non-admin save is rejected (401/redirect) — gate test.

### Task 3.2 — Authorization-code start (`GET /api/auth/sso/start`)
Replace the 501 stub. Flow:
- If OIDC disabled/unconfigured → 404/redirect to login with a benign message.
- Run discovery (cache the discovered metadata in-process for the request).
- Generate PKCE `code_verifier` + S256 `code_challenge`, a CSPRNG `state`, and a
  CSPRNG `nonce` via `openid-client`'s helpers.
- **Persist** `{state, codeVerifier, nonce, redirectTo, expiresAt}` in
  `oidc_login_flows` (server-side; the client gets only `state` via the redirect
  URL). `redirectTo` defaults to `/` and is validated app-relative (reject
  absolute/`//` → open-redirect guard).
- Build the IdP authorization URL with `code_challenge`, `state`, `nonce`,
  `scope` (default `openid email profile`), `redirect_uri` =
  `env.publicUrl` + `/api/auth/sso/callback`, where `env.publicUrl` is sourced
  from `PARCHMENT_PUBLIC_URL` (the new required env var added to the §4 registry
  by reconciliation §7a, validated at boot in `src/lib/env.ts`). This is a
  **fixed server config value — NEVER derived from request headers** (`Host`,
  `Origin`, `X-Forwarded-Host`, etc.); same anti-spoof rule the WebAuthn RP
  origin already follows. If `PARCHMENT_PUBLIC_URL` is unset, `env.ts` must boot-
  fail with a clear error rather than falling back to the request origin.
- 302 to the IdP.
- **Tests (integration, `tests/integration/oidc-flow.test.ts` with a stub IdP —
  see 3.4):**
  - start with OIDC disabled → no redirect to IdP (404/redirect-to-login).
  - start writes exactly one `oidc_login_flows` row; the authorization URL it
    redirects to contains `state`, `code_challenge`, `code_challenge_method=S256`,
    `nonce`, and the **fixed** `redirect_uri` (asserts it equals
    `process.env.PARCHMENT_PUBLIC_URL + '/api/auth/sso/callback'`, NOT the
    request's `Host` header).

### Task 3.3 — Callback (`GET /api/auth/sso/callback`) — the security core
Replace the 501 stub. This is the highest-risk surface; TDD every rejection.
- Read `state` + `code` from query.
- **Look up the flow row by `state`**; if absent/expired → reject (401, generic).
  DELETE the row immediately on read (single-use; a replayed callback finds
  nothing). This is the CSRF/state defense — the verifier/nonce come from the DB
  row, never from the client.
- Hand `code`, the stored `code_verifier`, expected `state`, and expected `nonce`
  to `openid-client`'s callback/`authorizationCodeGrant`. It validates:
  - the `state` matches,
  - the PKCE `code_verifier` ↔ `code_challenge`,
  - the ID token signature (against the IdP JWKS from discovery),
  - `iss`, `aud` (== our clientId), `exp`, and the **`nonce`** claim equals the
    stored nonce.
  Any failure → reject with a generic error; **never** create a session.
- Require a verified subject: `sub` present. Require `email_verified === true`
  when the IdP supplies `email` and the config links by email (configurable; default
  require verified email for linking — an unverified email must not link to an
  existing local account).
- **Account resolution / linking:**
  1. If an `oidc_identities` row matches (issuer, subject) → that user. Update
     `lastLoginAt`.
  2. Else if a `users` row matches the verified `email` → **link**: insert an
     `oidc_identities` row binding it. (Linking an existing local account to an
     IdP identity. Gated on `email_verified` to prevent takeover.)
  3. Else **JIT-provision** a new user: insert `users` with the email, name from
     the `name`/`preferred_username` claim, `role:'editor'` (canonical JIT role
     per reconciliation §1i — `'member'` is banned), null `passwordHash`
     (SSO-only users have no local password), then the `oidc_identities` row.
     (Comment: swap to Group A's `createUser` helper when it lands; ensure it
     accepts an explicit role so the `editor` default is passed in.)

  **`disabledAt` gate (reconciliation §7j — binding):** In ALL three resolution
  paths above, after resolving a user row, check `users.disabledAt IS NOT NULL`.
  If the user is disabled, reject immediately (generic 401 — do NOT create a
  session, do NOT update `lastLoginAt`, do NOT insert an `oidc_identities` row
  for a newly-linked account). A disabled user's email must never produce a
  session via OIDC even if the IdP returns a valid token. This applies equally to
  the identity-match path, the email-link path, and JIT-provisioning (a just-
  provisioned row will never have `disabledAt` set, but the check must be uniform
  across all three branches).

- Issue a **full** session via `createSession(user.id)` (the existing helper —
  same opaque-token, httpOnly-cookie path as password login). OIDC users with no
  local second factor get a full session directly (the IdP performed the auth);
  this is the documented design — MFA enforcement for OIDC is the IdP's job.
- Audit `action:'login'`, `meta:{ method:'oidc', issuer }`, `ip` (§5).
- 302 to the validated `redirectTo`.
- **Tests (integration, `tests/integration/oidc-flow.test.ts`):**
  - **happy path**: full start→callback with the stub IdP creates a session
    cookie and a `users` + `oidc_identities` row.
  - **forged callback rejected — no flow row**: callback with a `state` that has
    no DB row → 401, no session, no user created.
  - **state replay rejected**: run a valid callback, then replay the same
    `state`+`code` → second attempt finds no row → rejected (proves single-use
    DELETE).
  - **nonce mismatch rejected**: stub IdP returns an ID token whose `nonce` ≠ the
    stored nonce → rejected (tamper the stub token).
  - **bad audience rejected**: ID token `aud` ≠ clientId → rejected.
  - **expired ID token rejected**: `exp` in the past → rejected.
  - **PKCE mismatch rejected**: present a `code` for a different
    `code_verifier`/challenge → `openid-client` rejects.
  - **unverified-email no-link**: existing local user with `email=x`; IdP returns
    `email=x, email_verified=false` → does NOT link/log-in to that account
    (either rejects or provisions separately per policy — assert the existing
    user's account is not hijacked).
  - **linking**: existing local user `x` (verified) → callback links and the
    SAME user row is used (no duplicate user).
  - **JIT**: brand-new email → exactly one new user + one identity.
  - **disabled user — identity match (§7j)**: a user whose `oidc_identities` row
    already exists but who has `disabledAt IS NOT NULL` → callback rejected with
    401, no session created, `lastLoginAt` NOT updated (query the row after to
    confirm it is unchanged).
  - **disabled user — email link (§7j)**: existing local user with matching
    verified email and `disabledAt IS NOT NULL` → callback rejected, no
    `oidc_identities` row inserted for that user.
  - **secrets never logged**: capture `console.error/log` during a failing
    callback; assert neither the client secret nor any token appears.
- **Threat-model note (route header):** enumerate the defended attacks — CSRF
  (state, server-side single-use), authz-code injection (PKCE), ID-token forgery
  (JWKS sig + iss/aud/exp), replay (nonce + single-use state), open redirect
  (app-relative `redirectTo` validation), account takeover via email (verified-
  email gate + (issuer,subject) primary key), disabled-account bypass (§7j
  `disabledAt` check before session issue), client-secret exposure (encrypted
  at rest via `@/lib/crypto/secret-box`, redacted in UI via `redactSecret`,
  fixed `redirect_uri` from `PARCHMENT_PUBLIC_URL` prevents authorization-code
  exfiltration to an attacker-controlled host).

### Task 3.4 — Stub IdP test harness
- `tests/integration/helpers/stub-oidc.ts`: a **real local OIDC stub provider**
  that listens on a random free port (use `net.createServer({port:0})` to pick the
  port, then close and reuse it, or bind to `0` and read the assigned port from
  `server.address().port`). It must serve real OIDC discovery + JWKS + token
  endpoints so that `openid-client` can run a full discovery → authorize →
  token-exchange round-trip without any mocking of the library itself.

  **Required endpoints:**
  - `GET /.well-known/openid-configuration` — returns a JSON discovery document
    with `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`,
    `response_types_supported: ['code']`, `subject_types_supported: ['public']`,
    `id_token_signing_alg_values_supported: ['RS256']`.
  - `GET /jwks` — returns the stub's RSA public key in JWK set format.
  - `POST /token` — exchanges a `code` (the stub issued it in-memory during the
    `start` call) for an ID token signed with the stub's private RS256 key. Accepts
    `grant_type=authorization_code`, validates `redirect_uri` + `client_id`. Returns
    `{access_token, token_type:'Bearer', id_token, expires_in}`.

  **Key management:** generate an RSA-2048 keypair once in `beforeAll` using
  `node:crypto` (`generateKeyPairSync('rsa', {modulusLength:2048})`). Sign ID tokens
  with `node:crypto.createSign('SHA256')` or via `jose`'s `SignJWT` if it is already
  a transitive dependency of `openid-client` (check `node_modules/.pnpm` before
  choosing).

  **Minting helpers exposed to tests:**
  - `stub.issueCode(claims: Partial<IdTokenClaims>): string` — stores a one-time
    authorization code mapped to the given claims; the `/token` endpoint consumes it
    (single-use: delete on exchange to prevent code-replay).
  - `stub.mintIdToken(claims)` — signs and returns an ID token directly (for
    tampered-token rejection tests that bypass the code-exchange path and hand-inject
    into the `openid-client` callback validator).
  - `stub.tamperToken(idToken, field, value)` — re-serializes a signed token with
    `field` replaced by `value` in the payload (breaks the signature — tests that the
    library rejects it).

  **Lifecycle:** `stub.start()` in `beforeAll` returns `{issuer, port}`;
  `stub.stop()` in `afterAll` closes the HTTP server. Tests configure the OIDC
  config (`issuerUrl`) to point at the stub's `issuer`.

  **State/nonce race-condition handling (atomic single-use consumption):**
  The callback handler in `src/app/api/auth/sso/callback/route.ts` MUST consume the
  `oidc_login_flows` row atomically — use a single `DELETE … WHERE state = $1 AND
  expiresAt > now() RETURNING *` query (not a `SELECT` followed by a separate
  `DELETE`). If the `RETURNING` set is empty the flow was already consumed or expired;
  reject immediately. This makes concurrent callbacks for the same `state` safe: only
  one will get a row back; the other gets nothing and is rejected. Test this explicitly:
  - `state.race`: fire two concurrent callback requests for the same valid `state` via
    `Promise.all`; assert exactly one creates a session and the other is rejected with
    no second session or user row created.
  - `state.expired`: insert an `oidc_login_flows` row with `expiresAt` in the past;
    callback is rejected (the `AND expiresAt > now()` condition excludes it).

- Not a product file — lives under `tests/`.

### Task 3.5 — Login page "Sign in with SSO" button
- `src/app/(auth)/login/login-form.tsx` + `page.tsx`: when OIDC is enabled, show
  a "Sign in with SSO" button linking to `/api/auth/sso/start`. Hidden when
  disabled (read `getOidcConfigForDisplay().enabled` server-side in `page.tsx`,
  pass a boolean prop — never expose config to the client).
- **Test:** unit/render test that the button renders iff the `ssoEnabled` prop is
  true and points at `/api/auth/sso/start`. (Browser-verify in §7.)
- Retire `src/app/api/auth/oauth/route.ts` (the second 501 stub): either delete it
  or make it 308-redirect to `/api/auth/sso/start` so no dangling "v0.2" stub
  ships. Decision: delete (no caller references it).

---

## 4. G4 — login rate-limit + brute-force lockout

### Task 4.1 — Throttle the password step
- `src/app/(auth)/login/actions.ts`: before the password verify, apply
  `rateLimit('login:'+ip, LIMIT, WINDOW)` (reuse `src/lib/auth/rate-limit.ts`).
  On `!ok`, return a generic `{ error }` (don't reveal lockout specifics beyond a
  "too many attempts, try again later" message) and **do not** run the argon2
  verify (saves CPU under flood + removes a timing oracle). Choose conservative
  defaults (e.g. 10 attempts / 5 min per IP) as named constants.
- Keep the existing generic "Invalid email or password" for credential failures
  (already in place — preserves user-enumeration resistance).
- **Per-account lockout (defense beyond per-IP, which XFF can spoof):** use the
  `login_lockouts` table defined in G's migration **0023** (§1.2). The table
  stores `emailHash text pk` — a hash of the normalised email, never the raw
  email — plus `failedCount`, `lockedUntil`, `updatedAt`. After N consecutive
  failures, reject for a cooldown regardless of IP. Reset on a successful login.
  Rationale: per-IP alone is bypassable behind a botnet/spoofed XFF; per-account
  makes credential-stuffing a single account cost real time.
- Audit lockout trips: `action:'login.locked'`, `meta:{}` (no email), `ip`.
- **Tests:**
  - **unit (`tests/unit/rate-limit.test.ts`, extend existing if present):** the
    fixed-window limiter blocks the (N+1)th hit and resets after the window
    (the limiter is pure — already testable without `server-only`).
  - **integration (`tests/integration/login-lockout.test.ts`):** N wrong
    passwords for one email → the (N+1)th is **rejected even with the correct
    password** until `lockedUntil`; a correct password before the cap **resets**
    the counter; the lockout is **per-account** (a different email is unaffected
    by another's lockout). Asserts the table state directly.
  - **timing/enumeration:** a rate-limited request returns before doing argon2
    work (assert no verify call / fast path) and the error is identical for
    unknown-user vs wrong-password vs rate-limited beyond status semantics.
- **Threat-model note:** documents the two independent bounds (per-IP throttle,
  spoofable; per-account lockout, authoritative) — mirrors the existing two-bound
  design on the MFA verify route.

---

## 5. G3 — audit log: verb extension + admin gate + write-sites

> **Phase-0 scope boundary:** the `audit_log` schema hardening (`ip`, `prev_hash`,
> `entry_hash`, `target_id` uuid→text, `BEFORE UPDATE OR DELETE` trigger), the
> `logAudit` helper with its hash-chain logic, and the full `AuditAction` union
> (including G's canonical verbs) are all built in **Phase 0** (migration 0021 +
> `src/lib/audit/index.ts`). G does NOT re-implement, re-migrate, or extend any of
> that. G's sole audit responsibility is: (a) **emit** G's verbs at write-sites via
> `logAudit` (Phase 0 already added them to the union), (b) wire all G write-sites to
> call `logAudit`, and (c) gate the admin UI.

### Task 5.1 — Emit G's audit verbs (DO NOT re-add to the union)
- The canonical dotted strings for G's features —
  `'session.revoke'`, `'mfa.enable'`, `'mfa.disable'`, `'oidc.config'`, `'login.locked'` —
  are already present in the Phase-0 `AuditAction` union (reconciliation §1d).
  G does **NOT** edit `src/lib/audit/index.ts` to add these verbs; Phase 0 shipped
  them. G's only job here is to **EMIT** them at write-sites via
  `import { logAudit } from '@/lib/audit'`.
  The underscored forms (`session_revoke`, `mfa_enable`, `mfa_disable`,
  `oidc_config`, `login_locked`) are **BANNED** — never use them anywhere in G.
- Do NOT replace the existing union, do NOT add new columns, do NOT change the
  `logAudit` signature or the hash-chain logic — Phase 0 owns all of that.
- `logAuditRequest(action, req, opts)` (a thin wrapper that calls `clientIp()`
  and passes `ip` to `logAudit`) may be added here as a G convenience if Phase 0
  did not already provide it. Still **never throws**.
- **Tests (extend `tests/integration/audit.test.ts`):** each new G verb can be
  passed to `logAudit` without a TypeScript error and the row lands with the
  expected `action` value. An `ip` value written via `logAuditRequest` reads back
  from the `ip` column; null ip writes null (not the string "unknown"). The chain
  stays valid after each new write.

### Task 5.2 — Verify Phase-0 audit invariants (adversarial gate, not a build task)
- Before writing any G audit rows in integration tests, assert that the Phase-0
  audit foundation is present and correct:
  - `audit_log` has columns `ip`, `prev_hash`, `entry_hash`, and `target_id` is
    type `text` (verify via `information_schema.columns` or Drizzle introspection).
  - `UPDATE audit_log …` and `DELETE FROM audit_log …` both raise (the trigger is
    in force).
  - `verifyAuditChain()` imported from `@/lib/audit` returns `{ ok: true }` on a
    fresh log (the Phase-0 canonical return type is
    `Promise<{ ok: boolean; brokenAt?: string }>` — do NOT re-define or shadow it).
- If any assertion fails, halt and raise — G must not merge against a broken
  foundation. These checks live in `tests/integration/migration-g.test.ts` (§1.2)
  and are NOT G-authored tests of G-authored code; they are prerequisite guards.
- **Threat-model note:** the Phase-0 chain defends against a DB-level attacker
  erasing tracks; the trigger blocks UPDATE/DELETE at the SQL layer. G's audit
  rows participate in the same chain automatically. Neither the chain nor the
  trigger is G's to maintain — document the dependency explicitly in G's audit
  write-sites so future developers don't accidentally bypass Phase 0.

### Task 5.3 — Route all write-sites through the helper
- Replace the four raw `db.insert(schema.auditLog)` sites with `logAudit` /
  `logAuditRequest`:
  `src/app/setup/actions.ts`, `src/app/(auth)/login/actions.ts`,
  `src/app/api/auth/mfa/verify/route.ts`,
  `src/app/api/auth/passkey/auth/verify/route.ts`. Pass `ip` to each (login,
  mfa-verify, passkey-verify have a request; setup runs at first-boot — ip
  optional/null).
- Add new write-sites for G's own features: OIDC config save (emit
  `action:'oidc.config'`) + OIDC login (§3), login lockout (emit
  `action:'login.locked'`) (§4), MFA enable (emit `action:'mfa.enable'`) +
  MFA disable (emit `action:'mfa.disable'`) via the `mfa/totp/enable` +
  `disable` routes, session revoke (emit `action:'session.revoke'`) (§6). Each
  with the correct `actorId`/`targetType`/`ip`. The underscored variants of these
  verbs (`session_revoke`, `mfa_enable`, `mfa_disable`, `oidc_config`,
  `login_locked`) must NEVER appear in any `logAudit` call-site.
- **Tests:** an integration test per new emitter asserting the row lands with the
  expected action + that `verifyAuditChain()` (imported from `@/lib/audit`)
  returns `{ ok: true }` after each new write (chain integrity).

### Task 5.4 — Gate the admin audit viewer (security fix)
- The audit page (and the whole `settings/admin/*` subtree) is currently
  **unguarded**. Add `src/app/(app)/settings/admin/layout.tsx` that calls
  `requireAdmin()` imported from `src/lib/auth/guard.ts` (which already exports
  it — G does NOT create a new export; it only creates the `layout.tsx` file).
  This single layout redirects non-admins and protects audit, backup, health,
  schedules, and the new SSO config page.
- The audit page already loads server-side via `db` (fine); ensure it shows the
  `ip` column and a "Verify integrity" affordance calling
  `verifyAuditChain()` imported from `@/lib/audit` (Phase-0 canonical export —
  do NOT redefine it in G; return type is `Promise<{ ok: boolean; brokenAt?: string }>`).
  Update `AuditLogView.tsx` to render `ip` and surface a chain-OK/broken banner
  (show `brokenAt` when `ok` is false).
- **Tests:**
  - **gate (integration/route):** a non-admin user (`viewer` or `editor` role)
    hitting `/settings/admin/audit` is redirected; an `admin`/`owner` is not.
    (Assert `requireAdmin` from `src/lib/auth/guard.ts` is invoked — the string
    `'member'` must not appear in the gate check; use A's role lattice:
    `owner > admin > editor > viewer`.)
  - viewer renders the `ip` column and the integrity banner; mock `verifyAuditChain`
    returning `{ ok: true }` → banner shows OK; `{ ok: false, brokenAt: '...' }` →
    banner shows broken + the `brokenAt` value (render test).
- **Threat-model note:** before this fix any logged-in user could read the full
  audit trail (actor ids, IPs, actions) — an info-leak / privacy hole. Document
  it as the reason the layout guard exists.

---

## 6. G5 — session list + **revoke** UI

### Task 6.1 — Per-session revoke (server)
- `src/lib/auth/sessions-repo.ts`: add `revokeSession(userId, sessionId)` that
  deletes the row **scoped to `userId`** (so a user can only kill their own
  sessions) and returns whether a row was deleted. Revoking the **current**
  session is allowed (acts as logout); the UI marks it.
- New route `DELETE /api/auth/sessions/[id]/route.ts`: session-only (no PAT, like
  the GET), `requireSessionUser`, calls `revokeSession(user.id, id)`, audits
  `action:'session.revoke'`, `targetType:'session'`, `targetId:id`, `ip`.
- Keep `revokeOtherSessions` (used by password-change) untouched; optionally add a
  "Sign out all other sessions" button wired to a small route using it.
- **Security property — revoked session is dead immediately:** because
  `getUserByToken`/`getCurrentUser` look the session up in the DB on **every**
  request (no in-memory session cache), deleting the row makes the next request
  with that cookie return null. No token blacklist needed — the DB row IS the
  authority. Document this.
- **Tests (integration, `tests/integration/session-revoke.test.ts`):**
  - create two sessions for a user; revoke one by id → `getUserByToken(otherToken)`
    still resolves, `getUserByToken(revokedToken)` returns **null**.
  - revoking a session id that belongs to **another** user does nothing (scoped
    delete) — cross-user revoke is impossible.
  - revoking the current session logs the caller out (next lookup null).
  - a revoke writes one audit row (`session.revoke`) and the chain stays valid.
  - revoking a non-existent id is a no-op (returns false, no throw).

### Task 6.2 — Revoke in the Sessions UI
- `src/components/settings/SessionsList.tsx`: add a "Revoke"/"Sign out" button per
  row (label "Sign out" on the current row). On click → `DELETE
  /api/auth/sessions/[id]`, optimistic remove on 200, refetch on error. Confirm
  dialog for the current session (it logs you out). Accessible button + busy state.
- **Tests:** render test — each non-current row shows "Revoke", current shows
  "Sign out"; clicking issues the DELETE (mock fetch) and removes the row. Browser
  verify in §7.

---

## 7. Browser verification (DOM probes — no bugs ship unverified)

Use the project's Playwright/preview harness (the repo already has
`tests/e2e/*.authed.spec.ts` with a stored auth state). Add `tests/e2e/`
specs that drive real DOM and assert via probes (NOT screenshots-only):

### Task 7.1 — TOTP enroll + login (regression-guard the existing feature)
- Enroll: settings → security → start TOTP → assert a QR (`<img>`/canvas) +
  the secret render; submit a code computed in-test via `otpauth` → assert
  "enabled" state + recovery codes shown once. Disable → assert back to off.
- Login with 2FA: log out, log in with password → assert the form advances to the
  second-factor step (DOM probe for the code input, not a guess) → submit a
  computed TOTP → assert landed on `/`. Submit a **wrong** code → assert the error
  and that after `MFA_MAX_ATTEMPTS` the pending session is burned (back to
  password step).

### Task 7.2 — OIDC login flow (against the stub IdP or a disposable Keycloak)
- Point the test config at the §3.4 stub (or a Testcontainers Keycloak if the
  harness supports it). Click "Sign in with SSO" → follow the IdP redirect →
  consent → assert callback lands a session cookie and `/` renders the user.
- Probe: assert the `oidc_login_flows` row is gone post-callback (single-use) and
  a forged callback (hand-built URL with a random `state`) is rejected (stays on
  login / shows error), via a direct navigation probe.

### Task 7.3 — Session revoke
- With two browser contexts (two sessions for one user): in context A, open
  settings → security → Sessions, assert both rows; click Revoke on context B's
  row; then in context B make a navigation and assert it bounces to `/login`
  (revoked session dead immediately).

### Task 7.4 — Rate-limit / lockout
- Submit N+1 wrong passwords for one account via the login form; assert the
  lockout message appears and that the **correct** password is then also rejected
  until cooldown (DOM probe on the error region).

### Task 7.5 — Secrets never echoed (DOM probe)
- Save an OIDC client secret in admin → reload the page → assert the secret input
  renders the mask (`••••`), and that the page HTML / network response for the
  config GET contains **neither** the plaintext secret nor a decrypted value
  (inspect the response body + DOM).

---

## 8. Final gates (definition of done)

- `pnpm test` green (all new unit + integration + e2e specs).
- `pnpm biome check .` clean (repo-wide; remove any nested worktree `biome.json`
  if subagents leave one).
- `pnpm typecheck` clean (TS6 strict).
- No `notImplemented`/501 left in `api/auth/sso` or `api/auth/oauth` (oauth
  deleted).
- The admin subtree is `requireAdmin`-gated: `layout.tsx` imports `requireAdmin`
  from `src/lib/auth/guard.ts` (already exists there — G adds only the layout
  file, not the export). No unguarded audit/backup/etc.
- The string `'member'` does not appear as a role value in any G-authored code
  path (search: `grep -r "'member'" src/` for G's files before merging).
- No own crypto module: `src/lib/crypto/secret-box.ts` is owned by Phase 0 and
  imported by G; no `src/lib/crypto/redact.ts` file exists.
- No own audit migration: G's migration is **0023** containing only
  `oidc_identities`, `oidc_login_flows`, `login_lockouts`. No `audit_log` DDL
  in 0023.
- Adversarial security review (a final reviewer subagent) against the per-feature
  threat-model notes: TOTP window/replay, recovery single-use, OIDC
  state/nonce/PKCE/aud/exp/sig + linking takeover (verified-email gate +
  issuer/subject primary key) + disabled-account bypass (`disabledAt` check
  before any session issue, all three resolution paths) + fixed `redirect_uri`
  from `PARCHMENT_PUBLIC_URL` (never from request headers), per-IP + per-account
  lockout, immediate session death, audit append-only (Phase-0 trigger + chain;
  G extends, not owns) + admin gate (`requireAdmin` from `src/lib/auth/guard.ts`,
  G adds layout only), secrets encrypted-at-rest via Phase-0 `secret-box` +
  redacted via `redactSecret` + never logged. Ship only on a clean pass.

---

## Task count

**~26 TDD tasks** across 8 sections:
§1 (3), §2 (1 verification), §3 (5), §4 (1 multi-part), §5 (4), §6 (2), §7 (5), §8 (1 review) —
plus the embedded sub-asserts. Largest build is §3 (OIDC); the rest are
gap-fills on already-working code.

## Coordination / sequencing

- **Phase 0 must land before G** — G imports `@/lib/crypto/secret-box` (§2) and
  the Phase-0 `logAudit` / `AuditAction` from `src/lib/audit/index.ts` (§5). If
  Phase 0 is not merged, stub the imports with `// TODO: Phase 0 prerequisite`
  and block G's merge.
- **Migration (§1.2 / 0023) first within G** — every later G section reads the
  new tables (`oidc_identities`, `oidc_login_flows`, `login_lockouts`).
- **Group A:** G2 JIT-provisioning should call A's `createUser` once it exists
  (interim: direct insert, `role:'editor'`, commented — never `'member'`). No
  schema collision. The admin gate (§5.4) imports `requireAdmin` from
  `src/lib/auth/guard.ts` (already exists; G adds only the `layout.tsx`) and
  uses A's role lattice (`owner > admin > editor > viewer`).
- Within G, §4/§5/§6 are independent of §3 and can be built in parallel by
  separate worktree subagents; §5.1 (confirm Phase-0 verbs are present) must land
  before §5.3 write-site wiring and before §3/§4/§6 emit their audit rows.
