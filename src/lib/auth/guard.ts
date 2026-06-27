import 'server-only'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { verifyPat } from '@/lib/auth/pat'
import { hasRoleAtLeast, isAdmin, type Role } from '@/lib/auth/roles'
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

// For Route Handlers / API routes. Accepts either the session cookie or an
// 'Authorization: Bearer pat_...' header. Returns the user or null (the caller
// decides the response shape / status code).
export async function authenticateRequest(req: NextRequest): Promise<SessionUser | null> {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    const user = await verifyPat(token)
    if (user) return user
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value
  if (cookie) {
    const user = await getUserByToken(cookie)
    if (user) return user
  }

  return null
}
