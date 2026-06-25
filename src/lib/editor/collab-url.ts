// V6: collab WebSocket URL, derived at RUNTIME from the page origin.
//
// NEXT_PUBLIC_* env vars are INLINED at build time, so a single prebuilt
// multi-arch image could only ever carry one frozen URL — self-hosters on a
// different origin got the wrong ws endpoint (it baked to the localhost
// fallback, which the browser cannot reach across origins). Deriving from
// window.location at mount makes ONE image work for any origin: the reverse
// proxy (Caddy) routes `/collab` on the app origin to the Hocuspocus server, so
// wss://<host>/collab reaches it.
//
// Precedence:
//   1. explicit NEXT_PUBLIC_COLLAB_URL — escape hatch / the local prod-standalone
//      harness (no reverse proxy) sets this to ws://localhost:1234.
//   2. dev (`pnpm dev`) — Next on :3000, Hocuspocus on its own :1234.
//   3. otherwise — derive from the current origin (the production path).
export function getCollabUrl(): string {
  const explicit = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_COLLAB_URL : undefined
  if (explicit) return explicit

  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
    return 'ws://localhost:1234'
  }

  // SSR guard — the Hocuspocus provider is client-only, so this is just a safe
  // default if ever called without a window.
  if (typeof window === 'undefined') return 'ws://localhost:1234'

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/collab`
}
