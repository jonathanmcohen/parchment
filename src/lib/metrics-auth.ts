/**
 * Authorization helper for GET /api/metrics (I1/§7v).
 *
 * Default-deny when METRICS_TOKEN is empty:
 *   • Non-empty token + matching Bearer → authorized
 *   • Empty/unset token + admin session → authorized
 *   • Anything else → denied
 *
 * An empty METRICS_TOKEN NEVER opens the endpoint publicly.
 *
 * The session-lookup is injected so this module is testable without importing
 * 'next/server' types or DB modules.
 */

/**
 * Pure authorization check given the Bearer header value and the configured token.
 * Called first; if it returns true the caller can skip the session check.
 *
 * Rules (§7v):
 *   - `configuredToken` empty → always false (never match on empty)
 *   - `bearerValue` empty → always false
 *   - Otherwise: exact string equality required
 */
export function isBearerAuthorized(bearerValue: string, configuredToken: string): boolean {
  if (!configuredToken) return false // empty token → token auth disabled
  if (!bearerValue) return false // no bearer provided
  return bearerValue === configuredToken
}

/** The session-auth check for the full route. Lazily imported to avoid circular deps. */
async function getAdminFromSession(cookies: string | null): Promise<boolean> {
  if (!cookies) return false
  try {
    const { getUserByToken, SESSION_COOKIE } = await import('@/lib/auth/session')
    const { isAdmin } = await import('@/lib/auth/guard')
    // cookies here is the raw cookie header; parse out the session cookie.
    const match = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookies)
    const token = match?.[1]
    if (!token) return false
    const user = await getUserByToken(token)
    return !!user && isAdmin(user)
  } catch {
    return false
  }
}

/**
 * Full authorization check for an incoming metrics request.
 * Accepts raw header strings so it works in both Edge (NextRequest) and tests.
 *
 * @param authHeader   The 'Authorization' header value (or null).
 * @param cookieHeader The 'Cookie' header value (or null).
 * @param token        The configured METRICS_TOKEN. Pass '' when unset.
 */
export async function checkMetricsAuth(
  authHeader: string | null,
  cookieHeader: string | null,
  token: string,
): Promise<boolean> {
  const bearer = authHeader?.replace(/^Bearer\s+/, '') ?? ''
  if (isBearerAuthorized(bearer, token)) return true
  return getAdminFromSession(cookieHeader)
}
