import 'server-only'
// G2 — server-side OIDC login-flow state (oidc_login_flows). The PKCE codeVerifier,
// state, and nonce live here (a DB row, not a cookie) so they are unforgeable and
// single-use. The callback consumes the row ATOMICALLY via a single
// DELETE … WHERE state=$1 AND expiresAt>now() RETURNING * — so a replayed or
// concurrent callback for the same state finds nothing and is rejected (only ONE
// caller can win the delete). Expired rows are excluded by the same predicate.
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { db, schema } from '@/db'

// ~10 minutes to complete the round-trip at the IdP.
const FLOW_TTL_MS = 10 * 60 * 1000

export type OidcFlowRow = {
  state: string
  codeVerifier: string
  nonce: string
  redirectTo: string | null
}

// Persist a new flow. `redirectTo` is the validated app-relative landing path.
export async function createOidcFlow(input: {
  state: string
  codeVerifier: string
  nonce: string
  redirectTo: string
}): Promise<void> {
  await db.insert(schema.oidcLoginFlows).values({
    state: input.state,
    codeVerifier: input.codeVerifier,
    nonce: input.nonce,
    redirectTo: input.redirectTo,
    expiresAt: new Date(Date.now() + FLOW_TTL_MS),
  })
}

// Atomically consume the flow for `state`: deletes it and returns the row ONLY if it
// existed AND is unexpired. A second/concurrent call for the same state gets null
// (single-use). Opportunistically sweeps expired rows.
export async function consumeOidcFlow(state: string): Promise<OidcFlowRow | null> {
  const deleted = await db
    .delete(schema.oidcLoginFlows)
    .where(
      and(eq(schema.oidcLoginFlows.state, state), gt(schema.oidcLoginFlows.expiresAt, new Date())),
    )
    .returning({
      state: schema.oidcLoginFlows.state,
      codeVerifier: schema.oidcLoginFlows.codeVerifier,
      nonce: schema.oidcLoginFlows.nonce,
      redirectTo: schema.oidcLoginFlows.redirectTo,
    })
  // Best-effort GC of expired rows (does not affect the result above).
  await db
    .delete(schema.oidcLoginFlows)
    .where(lt(schema.oidcLoginFlows.expiresAt, new Date()))
    .catch(() => {})
  return deleted[0] ?? null
}

// Count for tests / sanity (how many live flow rows exist).
export async function countOidcFlows(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.oidcLoginFlows)
  return row?.n ?? 0
}
