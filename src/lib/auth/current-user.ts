// Stable public surface for "who is the current user" — the single import path
// other groups (B/G/H/I/J) should use. Today getCurrentUser lives in session.ts
// and requireUser in guard.ts; this module fixes the import path so internal
// refactors don't churn every consumer. getCurrentUser already returns null for
// missing/expired/pending AND (Task 3) disabled sessions.
import 'server-only'

export { requireAdmin, requireRole, requireUser } from '@/lib/auth/guard'
export type { SessionUser } from '@/lib/auth/session'
export { getCurrentUser } from '@/lib/auth/session'
