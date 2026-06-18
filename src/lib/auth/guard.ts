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
