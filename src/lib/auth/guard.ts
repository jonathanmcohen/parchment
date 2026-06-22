import 'server-only'
import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import { verifyPat } from '@/lib/auth/pat'
import type { SessionUser } from '@/lib/auth/session'
import { getCurrentUser, getUserByToken, SESSION_COOKIE } from '@/lib/auth/session'

// For Server Components and Server Actions. Redirects to /login when there is no
// authenticated user; otherwise returns the live user row.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

// Admin roles. The owner of a workspace is always an admin; `admin` is the
// explicit elevated role for v0.2 multi-user. Everything else (e.g. a plain
// `member`) is NOT an admin. The `role` column defaults to 'owner'.
const ADMIN_ROLES = new Set(['owner', 'admin'])

// True if the user holds an admin-level role. Used to gate destructive,
// all-owners operations (e.g. firing the cross-tenant trash-purge job).
export function isAdmin(user: SessionUser): boolean {
  return ADMIN_ROLES.has(user.role)
}

// For Server Components / Server Actions that require admin. Redirects
// unauthenticated visitors to /login, and authenticated-but-non-admin users to
// the app root. Returns the live admin user row.
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (!isAdmin(user)) redirect('/')
  return user
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
