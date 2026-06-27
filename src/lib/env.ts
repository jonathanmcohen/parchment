// Central env access. Keep server-only secrets out of client bundles.

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined) throw new Error(`Missing required env var: ${name}`)
  return v
}

export const env = {
  databaseUrl: required('DATABASE_URL', 'postgres://parchment:parchment@localhost:5432/parchment'),
  collabUrl: process.env.COLLAB_URL ?? 'ws://localhost:1234',
  collabPort: Number(process.env.COLLAB_PORT ?? '1234'),
  // Disk-mirror root (Plan F). Configurable; defaults under the user's home.
  filesRoot: process.env.PARCHMENT_FILES_ROOT ?? `${process.env.HOME ?? '/data'}/parchment/files`,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // CF1: force `Secure` on the session cookie even when NODE_ENV is not
  // 'production'. Needed behind a TLS-terminating reverse proxy (Caddy/nginx)
  // where the container may run with the default NODE_ENV but the browser sees
  // https — a non-Secure cookie set over https is fine, but operators who run
  // the image without NODE_ENV=production were getting a non-Secure cookie that
  // some hardened proxies/clients drop. Opt-in only (`SECURE_COOKIES=true`) so
  // local http dev is never broken. The session helper ORs this with the
  // nodeEnv==='production' check.
  secureCookies: process.env.SECURE_COOKIES === 'true',
  // WebAuthn (I7). The Relying Party ID and origin are the anti-phishing anchor
  // WebAuthn validates every ceremony against, so they MUST be fixed server
  // config — they are NEVER derived from request headers (which a hostile proxy
  // could spoof). In production BOTH must be set or passkey routes fail closed;
  // in development they default to localhost:3000. RP_ID is a bare domain (no
  // scheme/port); RP_ORIGIN is the full scheme://host[:port].
  webauthnRpId: process.env.PARCHMENT_RP_ID,
  webauthnOrigin: process.env.PARCHMENT_RP_ORIGIN,
  // PARCHMENT_SECRET_KEY (Phase 0 §1a/§3c — required for encrypted config writes).
  // base64-encoded 32 bytes; the AES-256-GCM master key for src/lib/crypto/secret-box.ts.
  // If ABSENT, the module still loads — secret WRITES return 503 at the route level and
  // reads of unencrypted/legacy config still work (secretKeyConfigured === false).
  // If PRESENT but malformed (not valid base64, or not exactly 32 decoded bytes), the
  // process fails fast at boot — a half-configured key is worse than none. The error
  // NEVER echoes the key value (it could be a real secret in a misconfigured deploy).
  secretKey: (() => {
    const raw = process.env.PARCHMENT_SECRET_KEY
    if (!raw) return null
    const buf = Buffer.from(raw, 'base64')
    // Buffer.from(.,'base64') silently DROPS non-base64 chars instead of throwing,
    // so re-encode and compare (ignoring '=' padding differences) to reject garbage.
    const normalized = raw.replace(/=+$/, '')
    if (buf.toString('base64').replace(/=+$/, '') !== normalized) {
      throw new Error('PARCHMENT_SECRET_KEY is not valid base64')
    }
    if (buf.length !== 32) {
      throw new Error(`PARCHMENT_SECRET_KEY must decode to exactly 32 bytes, got ${buf.length}`)
    }
    return raw // keep as base64 string; secret-box re-decodes at call time
  })(),
  secretKeyConfigured: !!process.env.PARCHMENT_SECRET_KEY,

  // PARCHMENT_PUBLIC_URL (Phase 0 §7a — REQUIRED external base URL, e.g.
  // "https://notes.example.com"). No trailing slash. It MUST be fixed server config,
  // NEVER derived from request headers: behind a TLS-terminating reverse proxy (Caddy)
  // the app's `req.nextUrl.origin` is the internal `0.0.0.0:3000` bind, which would
  // leak into user-facing absolute links. Used by:
  //   • CF4 — copyable share-viewer links (`${publicUrl}/share/<token>`)
  //   • Group A — invite-accept links     (`${publicUrl}/invite/accept?token=...`)
  //   • Group G — OIDC redirect_uri        (`${publicUrl}/api/auth/oidc/callback`)
  // The process throws at boot if this is absent, because A and G produce broken URLs
  // without it (invite emails land on the wrong domain; OIDC callback registration
  // fails at the IdP). This REPLACES the old PUBLIC_URL/PARCHMENT_RP_ORIGIN fallback —
  // operators must set PARCHMENT_PUBLIC_URL explicitly.
  publicUrl: (() => {
    const raw = process.env.PARCHMENT_PUBLIC_URL
    if (!raw) {
      throw new Error('PARCHMENT_PUBLIC_URL is required (e.g. https://notes.example.com)')
    }
    return raw.replace(/\/$/, '') // strip trailing slash for safe URL concatenation
  })(),
}
