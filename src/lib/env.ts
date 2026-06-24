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
}
