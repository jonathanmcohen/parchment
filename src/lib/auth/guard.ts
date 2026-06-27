import 'server-only'
import { redirect } from 'next/navigation'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyPat } from '@/lib/auth/pat'
import { hasRoleAtLeast, isAdmin, type Role } from '@/lib/auth/roles'
import { hasScope, type Scope } from '@/lib/auth/scopes'
import type { SessionUser } from '@/lib/auth/session'
import { getCurrentUser, getUserByToken, SESSION_COOKIE } from '@/lib/auth/session'

// A2: the single definition of isAdmin/the role lattice lives in roles.ts; re-home
// the export here so existing importers (`@/lib/auth/guard`) keep working.
export { isAdmin }

// For Server Components and Server Actions. Redirects to /login when there is no
// authenticated user; otherwise returns the live user row.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

// For Server Components / Server Actions requiring a minimum role. Redirects
// unauthenticated → /login and under-privileged → '/'. Returns the live user row.
export async function requireRole(min: Role): Promise<SessionUser> {
  const user = await requireUser()
  if (!hasRoleAtLeast(user, min)) redirect('/')
  return user
}

// For Server Components / Server Actions that require admin. Redirects
// unauthenticated visitors to /login, and authenticated-but-non-admin users to
// the app root. Returns the live admin user row.
export async function requireAdmin(): Promise<SessionUser> {
  return requireRole('admin')
}

// J8: result of a scoped API auth — distinguishes 401 (no/invalid principal) from
// 403 (a KNOWN Bearer principal that lacks the required scope; distinct from a 404
// IDOR oracle which is authz of a resource, not of the principal).
export type ApiAuthResult = { ok: true; user: SessionUser } | { ok: false; status: 401 | 403 }

// For Route Handlers / API routes. Accepts either the session cookie or an
// 'Authorization: Bearer pat_...' header.
//
// Two call shapes (overloaded):
//   authenticateRequest(req)               → SessionUser | null   (legacy; caller maps null→401)
//   authenticateRequest(req, { require })  → ApiAuthResult        (scoped; 401 vs 403)
//
// Cookie sessions are FULL-ACCESS and bypass the scope check entirely (an interactive
// user is never scope-limited). A Bearer PAT must carry a scope that satisfies
// `require` (docs:write implies docs:read) — otherwise the principal is known but
// unauthorized → 403.
export async function authenticateRequest(req: NextRequest): Promise<SessionUser | null>
export async function authenticateRequest(
  req: NextRequest,
  opts: { require: Scope },
): Promise<ApiAuthResult>
export async function authenticateRequest(
  req: NextRequest,
  opts?: { require: Scope },
): Promise<SessionUser | null | ApiAuthResult> {
  const required = opts?.require
  const auth = req.headers.get('authorization')

  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    // A6: a disabled user cannot authenticate via PAT either. verifyPat returns the
    // full user row + the token's scopes (migration 0027).
    const verified = await verifyPat(token)
    if (verified && verified.user.disabledAt === null) {
      if (required && !hasScope(verified.scopes, required)) {
        // Known principal, insufficient scope → 403 (only meaningful in scoped mode).
        return required ? { ok: false, status: 403 } : null
      }
      return required ? { ok: true, user: verified.user } : verified.user
    }
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (cookie) {
    const user = await getUserByToken(cookie)
    // Cookie session = full access; scope checks do not apply to interactive users.
    if (user) return required ? { ok: true, user } : user
  }

  return required ? { ok: false, status: 401 } : null
}

// J8: standard failure response for a scoped API auth — 401 (no principal) or 403
// (known principal, insufficient scope). Keeps the body shape uniform across routes.
export function apiAuthFailure(status: 401 | 403): NextResponse {
  return NextResponse.json(
    { error: status === 403 ? 'insufficient_scope' : 'unauthorized' },
    { status },
  )
}
